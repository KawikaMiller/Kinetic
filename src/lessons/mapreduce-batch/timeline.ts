/**
 * mapreduce-batch: a finished simulation as Gantt bars, and the facts the cluster scenes read off one run. Whole bars; the
 * stage clips them to the time cursor with `barsAt`, so scrubbing is a lookup.
 */
import type { GanttBar } from '../../components/GanttLanes';
import type { TickViolation } from '../../core/simTick';
import { WORKERS, evenSpeeds, inputRecords, mapId, outputOf, reduceId, sideEffectCount, simulate, taskName, type Attempt, type ClusterConfig, type Kill, type World } from './cluster';
import { plan as buildPlan, reference, sameResult, type CombinerId, type JobId, type Plan } from './job';

/** The cluster scenes run this many map tasks and reduce tasks on WORKERS workers (a real job has far more tasks than workers). */
export const SIM_MAPPERS = 4;
export const SIM_REDUCERS = 3;
/** A task is called a straggler when it runs at least this many times as long as the median of its kind. */
export const STRAGGLER_RATIO = 1.5;

export interface ClusterRun {
  plan: Plan;
  cfg: ClusterConfig;
  world: World;
  history: readonly World[];
  work: { map: number[]; reduce: number[] };
  /** The attempt the job waited for, when a task ran at least STRAGGLER_RATIO times as long as the median of its kind. */
  straggler: number | null;
  /** The reducers' table equals the plain single-process answer. */
  correct: boolean;
  /** The first check that failed, with its tick, when the run was asked to check the counter. */
  violation: TickViolation | null;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const length = (a: Attempt, now: number) => (a.end ?? now) - a.start;

/** The winning attempt that ran longest, if it is at least STRAGGLER_RATIO times its kind's median. */
export function stragglerOf(world: World): number | null {
  let pick: Attempt | null = null;
  for (const kind of ['map', 'reduce'] as const) {
    const winners = world.attempts.filter((a) => a.kind === kind && a.status === 'done');
    if (winners.length < 2) continue;
    const m = median(winners.map((a) => length(a, world.tick)));
    for (const a of winners) if (length(a, world.tick) >= STRAGGLER_RATIO * m && (pick === null || length(a, world.tick) > length(pick, world.tick))) pick = a;
  }
  return pick?.id ?? null;
}

export interface RunOptions {
  words: readonly string[];
  job?: JobId;
  combiner?: CombinerId;
  speeds?: readonly number[];
  speculate?: boolean;
  kills?: readonly Kill[];
  mappers?: number;
  reducers?: number;
  redoLostMaps?: boolean;
  /** Stop the sim, with a message, if the finished job's side-effect counter is not the input size (scene 5's invariant). */
  checkCounter?: boolean;
}

export const counterMessage = (counter: number, input: number): string => `the side-effect counter is ${counter} for ${input} records`;

export function runCluster(o: RunOptions): ClusterRun {
  const job = o.job ?? 'wordcount';
  const plan = buildPlan({ job, combiner: o.combiner ?? 'off', words: o.words, mappers: o.mappers ?? SIM_MAPPERS, reducers: o.reducers ?? SIM_REDUCERS });
  const cfg: ClusterConfig = { plan, speeds: o.speeds ?? evenSpeeds(), speculate: o.speculate ?? false, kills: o.kills ?? [], redoLostMaps: o.redoLostMaps };
  const { world, history, work, violation } = simulate(cfg, undefined, o.checkCounter ? (w) => (w.done && sideEffectCount(w) !== inputRecords(plan) ? counterMessage(sideEffectCount(w), inputRecords(plan)) : null) : undefined);
  const out = outputOf(world, plan);
  return { plan, cfg, world, history, work, straggler: stragglerOf(world), correct: out.complete && sameResult(out.result, reference(job, o.words)), violation };
}

export const workerLane = (w: number) => `w${w}`;
export const waitLane = (r: number) => `wait${r}`;

export function lanesOf(plan: Plan) {
  return [
    ...Array.from({ length: WORKERS }, (_, w) => ({ id: workerLane(w), label: `worker ${w + 1}` })),
    ...Array.from({ length: plan.reducers }, (_, r) => ({ id: waitLane(r), label: `reduce ${r + 1} waits` })),
  ];
}

/** The whole timeline as bars: one per attempt on its worker, and a hatched wait for each reducer until its first attempt. */
export function barsOf(run: ClusterRun): GanttBar[] {
  const { world, plan } = run;
  const bars: GanttBar[] = world.attempts.map((a) => {
    const name = taskName(a.task);
    const role = a.kind === 'map' ? ('info' as const) : ('violet' as const);
    const label = a.status === 'killed' ? `✕ ${name}` : a.redo ? `↻ ${name}` : a.backup ? `${name} (backup)` : name;
    const tone = a.status === 'killed' ? ('bad' as const) : a.status === 'cancelled' ? ('dim' as const) : run.straggler === a.id ? ('hi' as const) : role;
    return {
      id: `a${a.id}`,
      lane: workerLane(a.worker),
      start: a.start,
      end: Math.max(a.end ?? world.tick, a.start + 1),
      tone,
      label,
      ring: a.redo && a.status !== 'killed' ? ('bad' as const) : undefined,
    };
  });
  for (let r = 0; r < plan.reducers; r++) {
    const first = world.attempts.find((a) => a.task === reduceId(r));
    bars.push({ id: `wait${r}`, lane: waitLane(r), start: 0, end: first ? first.start : world.tick, tone: 'violet', kind: 'wait' });
  }
  return bars.filter((b) => b.end > b.start);
}

export const jobEnd = (run: ClusterRun): number => run.world.finishedAt ?? run.world.tick;

/** The world after `now` ticks (clamped to the last recorded). */
export const worldAt = (run: ClusterRun, now: number): World => run.history[Math.min(now, run.history.length - 1)];

/** Tasks of a kind finished in a world. */
export const doneCount = (w: World, kind: 'map' | 'reduce', count: number): number =>
  Array.from({ length: count }, (_, i) => w.tasks[kind === 'map' ? mapId(i) : reduceId(i)]).filter((t) => t.done).length;

/** Task runs that started because a failure had thrown away earlier work. */
export const rerunCount = (w: World): number => w.attempts.filter((a) => a.redo).length;

/** Each backup attempt, and whether it beat the attempt it was racing. */
export const backupOutcomes = (w: World): { task: string; worker: number; start: number; won: boolean }[] =>
  w.attempts.filter((a) => a.backup).map((a) => ({ task: a.task, worker: a.worker, start: a.start, won: a.status === 'done' }));
