/**
 * mapreduce-batch: a small simulated cluster that runs one job's tasks, in whole ticks. The data side is `job.ts`
 * (the plan); this file owns time, workers, failures and retries. Durations are model numbers, not measurements:
 * a task needs `work` ticks at normal speed, a worker runs at a percent of that, and failures come from a schedule.
 *
 * Rules the stage states (the original MapReduce paper's, simplified):
 *  - reducers start only when every map task has finished with its output on a live worker (a barrier);
 *  - map output sits on the mapper's local disk, so when its worker dies even a finished map task is run again;
 *  - reduce output goes to a shared file system, so a finished reduce task is never redone;
 *  - a reducer reads all its input when it starts (the fetch is instant here).
 */
import { mulberry32, randInt } from '../../core/random';
import { createTickSim, type TickViolation } from '../../core/simTick';
import { partitionOf, reduceRecs, type Plan, type Rec } from './job';

export const WORKERS = 3;
export const NORMAL_SPEED = 100;
/** A slow machine runs at this percent of normal speed. */
export const SLOW_SPEED = 25;
export const MAP_FIXED = 3;
export const REDUCE_FIXED = 3;
/** Words a mapper (or records a reducer) works through per tick at normal speed. */
export const ITEMS_PER_TICK = 2;
/** A backup is started only for a task that has been running at least this many ticks. */
export const BACKUP_AFTER = 4;
/** No run is allowed past this many ticks (a stalled job is reported before it). */
export const HORIZON = 3000;
/** The seed behind the small per-task duration jitter every scene shares. */
export const DURATION_SEED = 7;
export const MAX_JITTER = 2;

export interface Kill {
  worker: number;
  tick: number;
}

export interface ClusterConfig {
  plan: Plan;
  /** Percent of normal speed for each worker. */
  speeds: readonly number[];
  speculate: boolean;
  kills: readonly Kill[];
  /** Re-run finished map tasks when their worker dies. `false` is the counterfactual the tests use: a scheduler that forgets. */
  redoLostMaps?: boolean;
}

export interface Attempt {
  id: number;
  task: string;
  kind: 'map' | 'reduce';
  index: number;
  worker: number;
  start: number;
  end: number | null;
  /** Percent-ticks of work done; the task needs `work * NORMAL_SPEED`. */
  progress: number;
  status: 'running' | 'done' | 'killed' | 'cancelled';
  backup: boolean;
  /** Started because an earlier attempt of the task was lost to a failure. */
  redo: boolean;
  /** Map attempts: how many of its words it has handled so far (a side effect leaks for each). */
  processed: number;
  /** Reduce attempts: the map outputs it read when it started. */
  reads: { map: number; attempt: number }[];
}

export interface TaskState {
  done: boolean;
  by: number | null;
  /** How many times a failure made this task run again. */
  lost: number;
}

export interface ClusterEvent {
  id: number;
  tick: number;
  text: string;
  kind: 'info' | 'fail';
}

export interface World {
  tick: number;
  alive: boolean[];
  busy: (number | null)[];
  tasks: Record<string, TaskState>;
  attempts: Attempt[];
  events: ClusterEvent[];
  done: boolean;
  finishedAt: number | null;
  stalled: boolean;
}

export const mapId = (i: number) => `map-${i}`;
export const reduceId = (r: number) => `reduce-${r}`;
/** 'map-0' as people say it: 'map 1'. */
export const taskName = (task: string): string => {
  const [kind, i] = task.split('-');
  return `${kind} ${Number(i) + 1}`;
};

/** Ticks of work for each map and reduce task: a fixed start-up, the items at ITEMS_PER_TICK, and a seeded 0 to MAX_JITTER. */
export function workOf(plan: Plan, seed: number = DURATION_SEED): { map: number[]; reduce: number[] } {
  const rnd = mulberry32(seed);
  const jitter = () => randInt(0, MAX_JITTER, rnd);
  return {
    map: plan.splits.map((s) => MAP_FIXED + Math.ceil(s.length / ITEMS_PER_TICK) + jitter()),
    reduce: plan.parts.map((p) => REDUCE_FIXED + Math.ceil(p.length / ITEMS_PER_TICK) + jitter()),
  };
}

export function initialWorld(plan: Plan): World {
  const tasks: Record<string, TaskState> = {};
  for (let i = 0; i < plan.mappers; i++) tasks[mapId(i)] = { done: false, by: null, lost: 0 };
  for (let r = 0; r < plan.reducers; r++) tasks[reduceId(r)] = { done: false, by: null, lost: 0 };
  return {
    tick: 0,
    alive: Array(WORKERS).fill(true),
    busy: Array(WORKERS).fill(null),
    tasks,
    attempts: [],
    events: [],
    done: false,
    finishedAt: null,
    stalled: false,
  };
}

const wordsIn = (plan: Plan, a: Pick<Attempt, 'kind' | 'index'>) => (a.kind === 'map' ? plan.splits[a.index].length : 0);

/** The parts of a world one tick edits, copied so the history keeps every earlier world as it was. */
interface Draft {
  alive: boolean[];
  busy: (number | null)[];
  tasks: Record<string, TaskState>;
  attempts: Attempt[];
  events: ClusterEvent[];
}

const draftOf = (w: World): Draft => ({
  alive: [...w.alive],
  busy: [...w.busy],
  tasks: Object.fromEntries(Object.entries(w.tasks).map(([k, v]) => [k, { ...v }])),
  attempts: w.attempts.map((a) => ({ ...a })),
  events: [...w.events],
});

/** Failures scheduled for `tick`, applied at that instant: the worker goes down, its running attempt is lost, and (by the rule) so are the map outputs on its disk. */
function failWorkers(d: Draft, cfg: ClusterConfig, tick: number): void {
  const log = (text: string) => d.events.push({ id: d.events.length, tick, text, kind: 'fail' });
  for (const k of cfg.kills.filter((x) => x.tick === tick)) {
    if (!d.alive[k.worker]) continue;
    d.alive[k.worker] = false;
    log(`worker ${k.worker + 1} fails`);
    const running = d.busy[k.worker];
    if (running !== null) {
      const a = d.attempts[running];
      a.status = 'killed';
      a.end = tick;
      d.busy[k.worker] = null;
      log(`${taskName(a.task)} loses its attempt on worker ${k.worker + 1}`);
    }
    if (cfg.redoLostMaps ?? true) {
      for (let i = 0; i < cfg.plan.mappers; i++) {
        const st = d.tasks[mapId(i)];
        if (st.done && d.attempts[st.by!].worker === k.worker) {
          st.done = false;
          st.by = null;
          st.lost++;
          log(`${taskName(mapId(i))} finished on worker ${k.worker + 1}, but its output was on that disk: it must run again`);
        }
      }
    }
  }
}

const worldFrom = (d: Draft, tick: number, plan: Plan): World => {
  const done = Array.from({ length: plan.reducers }, (_, r) => d.tasks[reduceId(r)].done).every(Boolean);
  const stalled = !done && d.alive.every((ok) => !ok);
  if (stalled && !d.events.some((e) => e.text.startsWith('no worker left'))) d.events.push({ id: d.events.length, tick, text: 'no worker left: the job cannot finish', kind: 'fail' });
  return { tick, alive: d.alive, busy: d.busy, tasks: d.tasks, attempts: d.attempts, events: d.events, done, finishedAt: done ? tick : null, stalled };
};

/** The world at tick 0, with any failure scheduled for tick 0 already applied. */
export function startWorld(cfg: ClusterConfig): World {
  const d = draftOf(initialWorld(cfg.plan));
  failWorkers(d, cfg, 0);
  return worldFrom(d, 0, cfg.plan);
}

/**
 * One tick, from time t to t + 1: assignments (and backups) at t, every running attempt works, finished tasks are recorded at
 * t + 1, and then failures scheduled for t + 1 happen (not if the job has just finished). So `history[k]` is the world at time k,
 * failures at k included, and a failure "at tick k" cuts a running bar at exactly k.
 */
export function stepWorld(prev: World, cfg: ClusterConfig, work: { map: number[]; reduce: number[] }): World {
  if (prev.done || prev.stalled) return { ...prev, tick: prev.tick + 1 };
  const { plan } = cfg;
  const t = prev.tick;
  const redo = cfg.redoLostMaps ?? true;
  const d = draftOf(prev);
  const { alive, busy, tasks } = d;
  let { attempts } = d;
  const log = (text: string) => d.events.push({ id: d.events.length, tick: t, text, kind: 'info' });
  const attemptById = (id: number) => attempts[id];
  const workOfTask = (a: { kind: 'map' | 'reduce'; index: number }) => (a.kind === 'map' ? work.map[a.index] : work.reduce[a.index]);

  // assignments
  const running = (task: string) => attempts.some((a) => a.task === task && a.status === 'running');
  const mapsReady = () =>
    Array.from({ length: plan.mappers }, (_, i) => tasks[mapId(i)]).every((st, i) => st.done && (!redo || alive[attemptById(tasks[mapId(i)].by!).worker]));
  const pendingMaps = () => Array.from({ length: plan.mappers }, (_, i) => i).filter((i) => !tasks[mapId(i)].done && !running(mapId(i)));
  const pendingReduces = () => (mapsReady() ? Array.from({ length: plan.reducers }, (_, r) => r).filter((r) => !tasks[reduceId(r)].done && !running(reduceId(r))) : []);
  const start = (kind: 'map' | 'reduce', index: number, worker: number, backup: boolean) => {
    const task = kind === 'map' ? mapId(index) : reduceId(index);
    const lost = tasks[task].lost > 0 || attempts.some((a) => a.task === task && a.status === 'killed');
    const reads =
      kind === 'reduce'
        ? Array.from({ length: plan.mappers }, (_, m) => ({ map: m, attempt: tasks[mapId(m)].by })).filter(
            (r): r is { map: number; attempt: number } => r.attempt !== null && alive[attemptById(r.attempt).worker],
          )
        : [];
    const a: Attempt = { id: attempts.length, task, kind, index, worker, start: t, end: null, progress: 0, status: 'running', backup, redo: lost && !backup, processed: 0, reads };
    attempts = [...attempts, a];
    busy[worker] = a.id;
    log(`${taskName(task)} ${backup ? 'gets a backup' : 'starts'} on worker ${worker + 1}`);
  };
  const idle = () => alive.map((ok, w) => (ok && busy[w] === null ? w : -1)).filter((w) => w >= 0);
  for (const w of idle()) {
    const m = pendingMaps();
    if (m.length > 0) start('map', m[0], w, false);
    else {
      const r = pendingReduces();
      if (r.length > 0) start('reduce', r[0], w, false);
    }
  }
  if (cfg.speculate && pendingMaps().length === 0 && pendingReduces().length === 0) {
    for (const w of idle()) {
      const candidates = attempts
        .filter((a) => a.status === 'running' && !a.backup && t - a.start >= BACKUP_AFTER && attempts.filter((o) => o.task === a.task && o.status === 'running').length === 1)
        .sort((a, b) => {
          const left = (x: Attempt) => (workOfTask(x) * NORMAL_SPEED - x.progress) / cfg.speeds[x.worker];
          return left(b) - left(a) || a.id - b.id;
        });
      if (candidates.length > 0) start(candidates[0].kind, candidates[0].index, w, true);
    }
  }

  // work, then finishes
  const finishing: Attempt[] = [];
  for (const a of attempts) {
    if (a.status !== 'running') continue;
    a.progress += cfg.speeds[a.worker];
    const need = workOfTask(a) * NORMAL_SPEED;
    a.processed = Math.floor((Math.min(a.progress, need) / need) * wordsIn(plan, a));
    if (a.progress >= need) finishing.push(a);
  }
  const next = t + 1;
  const stamp = (text: string) => d.events.push({ id: d.events.length, tick: next, text, kind: 'info' });
  for (const a of finishing.sort((x, y) => x.id - y.id)) {
    if (tasks[a.task].done) continue;
    a.status = 'done';
    a.end = next;
    busy[a.worker] = null;
    tasks[a.task].done = true;
    tasks[a.task].by = a.id;
    stamp(`${taskName(a.task)} finishes on worker ${a.worker + 1}`);
    for (const other of attempts) {
      if (other.task === a.task && other.status === 'running') {
        other.status = 'cancelled';
        other.end = next;
        busy[other.worker] = null;
        stamp(`${taskName(other.task)}'s ${other.backup ? 'backup' : 'first attempt'} on worker ${other.worker + 1} is cancelled`);
      }
    }
  }
  d.attempts = attempts;
  const finished = Array.from({ length: plan.reducers }, (_, r) => tasks[reduceId(r)].done).every(Boolean);
  if (finished) stamp('job finished');
  else failWorkers(d, cfg, next);
  return worldFrom(d, next, plan);
}

/** What `simulate` hands back: the last world, every world before it (`history[k]` is the state after k ticks), the work table and any failed check. */
export interface Simulated {
  world: World;
  history: readonly World[];
  work: { map: number[]; reduce: number[] };
  violation: TickViolation | null;
}

/** Run a whole job on the shared fixed-tick sim to its end, or to a stall, or to HORIZON. `check` is a safety property over a world. */
export function simulate(cfg: ClusterConfig, seed: number = DURATION_SEED, check?: (w: World) => string | null): Simulated {
  const work = workOf(cfg.plan, seed);
  const sim = createTickSim<World>({ seed, init: () => startWorld(cfg), step: (w) => stepWorld(w, cfg, work), check });
  while (!sim.state.done && !sim.state.stalled && sim.ticks < HORIZON && !sim.violation) sim.run(1);
  return { world: sim.state, history: sim.history, work, violation: sim.violation };
}

/** The final table the reducers wrote, built only from what each winning reduce attempt read, and the records it counted. */
export function outputOf(world: World, plan: Plan): { result: Map<string, number>; recordsReduced: number; complete: boolean } {
  const result = new Map<string, number>();
  let recordsReduced = 0;
  let complete = true;
  for (let r = 0; r < plan.reducers; r++) {
    const st = world.tasks[reduceId(r)];
    if (!st.done || st.by === null) {
      complete = false;
      continue;
    }
    const a = world.attempts[st.by];
    const recs: Rec[] = a.reads.flatMap((read) => plan.mapOut[read.map].filter((rec) => partitionOf(rec.key, plan.reducers) === r));
    recordsReduced += recs.reduce((n, rec) => n + rec.count, 0);
    for (const [k, v] of reduceRecs(plan.job, recs)) result.set(k, v);
  }
  return { result, recordsReduced, complete };
}

/** How many times the side effect fired: one for every word every map attempt got through, including ones that were then lost. */
export const sideEffectCount = (world: World): number => world.attempts.reduce((n, a) => n + (a.kind === 'map' ? a.processed : 0), 0);

export const inputRecords = (plan: Plan): number => plan.splits.reduce((n, s) => n + s.length, 0);

/** A seeded failure schedule: up to two kills, each of a random worker at a random tick up to `horizon` (so some come after the job is over). */
export function killSchedule(seed: number, horizon: number): Kill[] {
  const rnd = mulberry32(seed);
  const count = randInt(0, 2, rnd);
  return Array.from({ length: count }, () => ({ worker: randInt(0, WORKERS - 1, rnd), tick: randInt(0, horizon, rnd) }));
}

/** Speeds with every worker normal, or with the last one slow. */
export const evenSpeeds = (): number[] => Array(WORKERS).fill(NORMAL_SPEED);
export const slowLastSpeeds = (): number[] => evenSpeeds().map((s, w) => (w === WORKERS - 1 ? SLOW_SPEED : s));
