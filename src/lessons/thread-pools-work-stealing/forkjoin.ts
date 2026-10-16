/**
 * Fork-join on P workers with a deque each. A task over a range of `size` splits in two until the range is at
 * most the grain, then runs `size` ticks of work. The owner pushes and pops at the back of its deque (newest
 * first); an idle worker steals from the front of another worker's (the oldest, usually the largest).
 *
 * The model is greedy (stated on screen): in every tick an idle worker steals at once if any deque holds a
 * task, so Brent's bound holds. A broken variant makes a steal take `stealLatency` ticks, which is not greedy.
 * Joins cost nothing. All randomness (the victim) comes from the tick sim's seeded stream.
 */
import { createTickSim, type TickSim } from '../../core/simTick';
import { mulberry32, type Rnd } from '../../core/random';

export const TOTAL_WORK = 128;
export const RATIOS = [50, 60, 70, 80, 90] as const;
export const WORKER_RANGE = { min: 1, max: 8 } as const;
export const GRAIN_RANGE = { min: 1, max: TOTAL_WORK } as const;
/** Ticks a steal costs in the broken variant. */
export const SLOW_STEAL_TICKS = 6;
/** The lowest seed on which the slow-steal variant breaks Brent's bound (pinned by a test). */
export const BROKEN_SEED = 0;

export interface Task {
  id: number;
  size: number;
  kind: 'fork' | 'leaf';
  /** Ticks this task runs: a leaf's size, or a fork's cost (zero forks resolve instantly). */
  cost: number;
  children: [number, number] | null;
}

export interface Tree {
  tasks: Task[];
  root: number;
  /** Leaf ids in left-to-right order. */
  leaves: number[];
}

export function buildTree(n: number, grain: number, ratioPct: number, forkCost: number): Tree {
  const tasks: Task[] = [];
  const leaves: number[] = [];
  const build = (size: number): number => {
    const id = tasks.length;
    if (size <= grain) {
      tasks.push({ id, size, kind: 'leaf', cost: size, children: null });
      leaves.push(id);
      return id;
    }
    tasks.push({ id, size, kind: 'fork', cost: forkCost, children: null });
    const left = Math.min(size - 1, Math.max(1, Math.round((size * ratioPct) / 100)));
    const a = build(left);
    const b = build(size - left);
    tasks[id].children = [a, b];
    return id;
  };
  const root = build(n);
  return { tasks, root, leaves };
}

/** Total ticks of work, T1. */
export const work = (tree: Tree): number => tree.tasks.reduce((s, t) => s + t.cost, 0);

/** The longest chain of dependent ticks, T-infinity. */
export function span(tree: Tree, id: number = tree.root): number {
  const t = tree.tasks[id];
  return t.cost + (t.children ? Math.max(span(tree, t.children[0]), span(tree, t.children[1])) : 0);
}

export interface Params {
  n: number;
  grain: number;
  ratioPct: number;
  forkCost: number;
  workers: number;
  steal: boolean;
  stealLatency: number;
  seed: number;
}

export interface StealEvent {
  thief: number;
  victim: number;
  task: number;
}

interface Worker {
  task: number | null;
  left: number;
  /** A steal in flight in the broken variant: the task is already off the victim's deque. */
  walking: { task: number; left: number } | null;
}

export interface FJState {
  deques: number[][];
  workers: Worker[];
  /** Tasks not yet completed. */
  remaining: number;
  /** Worker that ran each task (-1 until it starts). */
  ranBy: number[];
  /** Task each worker did a tick of work on this tick, -1 when idle. */
  working: number[];
  /** Steals that began this tick. */
  stolen: StealEvent[];
  steals: number;
  busy: number[];
}

export function forkInit(tree: Tree, p: Params): FJState {
  return {
    deques: Array.from({ length: p.workers }, (_, w) => (w === 0 ? [tree.root] : [])),
    workers: Array.from({ length: p.workers }, () => ({ task: null, left: 0, walking: null })),
    remaining: tree.tasks.length,
    ranBy: tree.tasks.map(() => -1),
    working: Array.from({ length: p.workers }, () => -1),
    stolen: [],
    steals: 0,
    busy: Array.from({ length: p.workers }, () => 0),
  };
}

/** One tick: acquire until nobody can, then every busy worker does one unit of work. */
export function forkStep(s: FJState, tree: Tree, p: Params, rnd: Rnd): FJState {
  if (s.remaining === 0) return { ...s, working: s.working.map(() => -1), stolen: [] };
  const deques = s.deques.map((d) => d.slice());
  const workers = s.workers.map((w) => ({ ...w, walking: w.walking ? { ...w.walking } : null }));
  const ranBy = s.ranBy.slice();
  const busy = s.busy.slice();
  const stolen: StealEvent[] = [];
  let remaining = s.remaining;
  let steals = s.steals;

  /** Start task `id` on worker `w`; a zero-cost fork resolves on the spot: the worker keeps the first child and pushes the second. */
  const start = (w: number, id: number) => {
    let cur = id;
    for (;;) {
      const t = tree.tasks[cur];
      ranBy[cur] = w;
      if (t.kind === 'fork' && t.cost === 0) {
        remaining--;
        deques[w].push(t.children![1]);
        cur = t.children![0];
      } else {
        workers[w].task = cur;
        workers[w].left = t.cost;
        return;
      }
    }
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (let w = 0; w < workers.length; w++) {
      const me = workers[w];
      if (me.task !== null) continue;
      if (me.walking) {
        if (me.walking.left === 0) {
          const id = me.walking.task;
          me.walking = null;
          start(w, id);
          changed = true;
        }
        continue;
      }
      const own = deques[w].pop();
      if (own !== undefined) {
        start(w, own);
        changed = true;
        continue;
      }
      if (!p.steal) continue;
      const victims = deques.map((d, v) => (v !== w && d.length > 0 ? v : -1)).filter((v) => v >= 0);
      if (victims.length === 0) continue;
      const victim = victims[Math.floor(rnd() * victims.length)];
      const task = deques[victim].shift()!;
      steals++;
      stolen.push({ thief: w, victim, task });
      if (p.stealLatency === 0) start(w, task);
      else me.walking = { task, left: p.stealLatency };
      changed = true;
    }
  }

  const working = workers.map(() => -1);
  workers.forEach((me, w) => {
    if (me.task === null) {
      if (me.walking && me.walking.left > 0) me.walking.left--;
      return;
    }
    working[w] = me.task;
    busy[w]++;
    if (--me.left > 0) return;
    const t = tree.tasks[me.task];
    remaining--;
    me.task = null;
    if (t.kind === 'fork') {
      deques[w].push(t.children![1]);
      start(w, t.children![0]);
    }
  });

  return { deques, workers, remaining, ranBy, working, stolen, steals, busy };
}

export interface ForkResult {
  tree: Tree;
  makespan: number;
  steals: number;
  work: number;
  span: number;
  busy: number[];
  ranBy: number[];
  /** Share of worker-ticks spent working. */
  utilisation: number;
}

const treeOf = (p: Params): Tree => buildTree(p.n, p.grain, p.ratioPct, p.forkCost);

/** Runs to the end without keeping history (the sweeps call this many times). */
export function runForkJoin(p: Params, tree: Tree = treeOf(p)): ForkResult {
  const rnd = mulberry32(p.seed);
  const limit = work(tree) * (p.stealLatency + 2) + 10;
  let state = forkInit(tree, p);
  let ticks = 0;
  while (state.remaining > 0 && ticks < limit) {
    state = forkStep(state, tree, p, rnd);
    ticks++;
  }
  return summarise(tree, state, ticks, p);
}

function summarise(tree: Tree, state: FJState, makespan: number, p: Params): ForkResult {
  return {
    tree,
    makespan,
    steals: state.steals,
    work: work(tree),
    span: span(tree),
    busy: state.busy,
    ranBy: state.ranBy,
    utilisation: state.busy.reduce((a, b) => a + b, 0) / (p.workers * makespan),
  };
}

/** The seeded tick sim of the same run, for scrubbing and the live view. */
export function createForkSim(p: Params, tree: Tree = treeOf(p)): TickSim<FJState> {
  return createTickSim<FJState>({
    seed: p.seed,
    init: () => forkInit(tree, p),
    step: (s, rnd) => forkStep(s, tree, p, rnd),
  });
}

/** Ticks until the work is done, read from a sim's history (the first state with nothing remaining). */
export function makespanOf(sim: TickSim<FJState>, limit: number): number {
  sim.at(limit);
  const k = sim.history.findIndex((s) => s.remaining === 0);
  return k < 0 ? limit : k;
}

/** Brent's bound for a greedy scheduler: T1 / P + T-infinity. */
export const brentBound = (r: ForkResult, workers: number): number => r.work / workers + r.span;
/** The floor no schedule can beat: the larger of T1 / P and T-infinity. */
export const lowerBound = (r: ForkResult, workers: number): number => Math.max(r.work / workers, r.span);

/** Makespan against the grain, everything else held: the sweep the grain scene draws. */
export function sweepGrain(base: Omit<Params, 'grain'>): { grain: number; makespan: number }[] {
  const out: { grain: number; makespan: number }[] = [];
  for (let grain = GRAIN_RANGE.min; grain <= GRAIN_RANGE.max; grain++) out.push({ grain, makespan: runForkJoin({ ...base, grain }).makespan });
  return out;
}
