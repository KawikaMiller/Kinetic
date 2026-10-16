/**
 * Starvation in a fixed pool: a parent task takes a worker, submits its two children to the shared queue and
 * blocks until both finish. When every worker holds a blocked parent and children still wait in the queue,
 * nothing can ever run again: the sim says "stalled" deterministically. "Join by helping" lets a waiting
 * worker run a queued task instead of idling, which removes the stall. A simplification of real fork-join
 * pools, which help or add threads to compensate.
 */
import { createTickSim, type TickSim } from '../../core/simTick';

export const STARVE_WORKERS = { min: 1, max: 8 } as const;
export const STARVE_DEPTH = { min: 1, max: 4 } as const;
export const LEAF_TICKS = 4;

export interface StarveParams {
  workers: number;
  depth: number;
  helping: boolean;
  seed: number;
}

/** A complete binary tree of tasks in breadth-first order: ids 0..2^depth - 2 are parents, the rest leaves. */
export const parentCount = (depth: number): number => 2 ** depth - 1;
export const taskCount = (depth: number): number => 2 ** (depth + 1) - 1;
export const isParent = (id: number, depth: number): boolean => id < parentCount(depth);
export const childrenOf = (id: number): [number, number] => [2 * id + 1, 2 * id + 2];

interface Frame {
  task: number;
  phase: 'run' | 'wait';
  left: number;
}

export interface StarveState {
  queue: number[];
  stacks: Frame[][];
  done: boolean[];
  /** Tasks finished so far. */
  finished: number;
  /** What each worker did this tick: a task id it ran or helped with, -2 blocked in a join, -1 idle. */
  doing: number[];
}

export const starveInit = (p: StarveParams): StarveState => ({
  queue: [0],
  stacks: Array.from({ length: p.workers }, () => []),
  done: Array.from({ length: taskCount(p.depth) }, () => false),
  finished: 0,
  doing: Array.from({ length: p.workers }, () => -1),
});

export function starveStep(s: StarveState, p: StarveParams): StarveState {
  if (s.finished === taskCount(p.depth)) return { ...s, doing: s.doing.map(() => -1) };
  const queue = s.queue.slice();
  const stacks = s.stacks.map((st) => st.map((f) => ({ ...f })));
  const done = s.done.slice();
  const doing = s.doing.map(() => -1);
  let finished = s.finished;

  const begin = (w: number, id: number) => {
    if (isParent(id, p.depth)) {
      queue.push(...childrenOf(id));
      stacks[w].push({ task: id, phase: 'wait', left: 0 });
    } else stacks[w].push({ task: id, phase: 'run', left: LEAF_TICKS });
    doing[w] = id;
  };

  /** The queue hands out one task a tick, as a dispatcher would. */
  let dispatched = false;
  for (let w = 0; w < p.workers; w++) {
    const stack = stacks[w];
    const top = stack.at(-1);
    if (!top) {
      if (queue.length && !dispatched) {
        begin(w, queue.shift()!);
        dispatched = true;
      }
    } else if (top.phase === 'run') {
      doing[w] = top.task;
      if (--top.left === 0) {
        stack.pop();
        done[top.task] = true;
        finished++;
      }
    } else {
      const [a, b] = childrenOf(top.task);
      if (done[a] && done[b]) {
        stack.pop();
        done[top.task] = true;
        finished++;
        doing[w] = top.task;
      } else if (p.helping && queue.length && !dispatched) {
        begin(w, queue.shift()!);
        dispatched = true;
      } else doing[w] = -2;
    }
  }
  return { queue, stacks, done, finished, doing };
}

/** Every worker holds a parent that is still waiting on its children, and tasks wait in the queue: nothing can run again. */
export function isStalled(s: StarveState, p: StarveParams): boolean {
  if (s.finished === taskCount(p.depth) || s.queue.length === 0 || p.helping) return false;
  return s.stacks.every((st) => {
    const top = st.at(-1);
    if (!top || top.phase !== 'wait') return false;
    const [a, b] = childrenOf(top.task);
    return !(s.done[a] && s.done[b]);
  });
}

export function createStarveSim(p: StarveParams): TickSim<StarveState> {
  return createTickSim<StarveState>({
    seed: p.seed,
    init: () => starveInit(p),
    step: (s) => starveStep(s, p),
    check: (s) => (isStalled(s, p) ? 'stalled' : null),
  });
}

export interface StarveResult {
  stalled: boolean;
  /** Ticks until the last task finished, or until the stall was detected. */
  ticks: number;
  finished: number;
  total: number;
}

/** Run until the last task finishes or the pool stalls, one tick at a time, so `sim.ticks` is the real finish time and not a run limit. */
export function runStarveToEnd(p: StarveParams): TickSim<StarveState> {
  const sim = createStarveSim(p);
  const total = taskCount(p.depth);
  const limit = total * (LEAF_TICKS + 2) * 2 + 20;
  while (sim.ticks < limit && sim.violation === null && sim.state.finished < total) sim.run(1);
  return sim;
}

export function runStarve(p: StarveParams): StarveResult {
  const sim = runStarveToEnd(p);
  const total = taskCount(p.depth);
  const stalled = sim.violation !== null;
  return { stalled, ticks: sim.ticks, finished: sim.state.finished, total };
}
