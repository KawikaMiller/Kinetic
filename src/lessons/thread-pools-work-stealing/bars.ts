import type { GanttBar, GanttLane } from '../../components/GanttLanes';
import type { TickSim } from '../../core/simTick';
import { plainTone, type Tone } from '../../core/tone';
import type { FJState, Tree } from './forkjoin';

/** A worker is a plain category: the four categorical hues, wrapping, never a status colour. */
export const workerTone = (w: number): Tone => plainTone(w);

export const workerLanes = (workers: number): GanttLane[] => Array.from({ length: workers }, (_, w) => ({ id: `w${w}`, label: `worker ${w}` }));

type Status = { kind: 'work'; task: number } | { kind: 'idle' } | { kind: 'walking' };

/** Each worker's ticks as merged bars (work in its own tone, idle dim and hatched, a steal in flight dashed), plus a diamond at every steal. */
export function forkBars(sim: TickSim<FJState>, tree: Tree, makespan: number): GanttBar[] {
  sim.at(makespan);
  const h = sim.history;
  const workers = h[0].workers.length;
  const bars: GanttBar[] = [];
  for (let w = 0; w < workers; w++) {
    let open: { status: Status; start: number } | null = null;
    const close = (end: number) => {
      if (!open) return;
      const { status, start } = open;
      const id = `w${w}-${start}`;
      if (status.kind === 'work') {
        const size = tree.tasks[status.task].size;
        bars.push({ id, lane: `w${w}`, start, end, tone: workerTone(w), kind: 'work', label: `worker ${w}, a piece of ${size}` });
      } else if (status.kind === 'walking') bars.push({ id, lane: `w${w}`, start, end, tone: 'info', kind: 'blocked', label: `worker ${w}, walking to steal` });
      else bars.push({ id, lane: `w${w}`, start, end, tone: 'dim', kind: 'wait', label: `worker ${w}, idle` });
      open = null;
    };
    for (let t = 1; t <= makespan; t++) {
      const task = h[t].working[w];
      const status: Status = task >= 0 ? { kind: 'work', task } : h[t].workers[w].walking ? { kind: 'walking' } : { kind: 'idle' };
      const same = open && open.status.kind === status.kind && (status.kind !== 'work' || (open.status.kind === 'work' && open.status.task === status.task));
      if (!same) {
        close(t - 1);
        open = { status, start: t - 1 };
      }
    }
    close(makespan);
  }
  for (let t = 1; t <= makespan; t++) {
    h[t].stolen.forEach((e, i) => bars.push({ id: `steal-${t}-${i}`, lane: `w${e.thief}`, start: t - 1, end: t - 1, tone: 'info', label: 'steal' }));
  }
  return bars;
}

/** The leaf strip's state of one leaf at a tick: not spawned yet, waiting in a deque, running on a worker, or finished. */
export type LeafState = { kind: 'hidden' } | { kind: 'queued' } | { kind: 'running'; worker: number } | { kind: 'done'; worker: number };

export function leafState(sim: TickSim<FJState>, parentOf: readonly number[], leaf: number, tick: number): LeafState {
  const s = sim.history[Math.min(tick, sim.history.length - 1)];
  const owner = s.ranBy[leaf];
  if (owner < 0) return s.ranBy[parentOf[leaf]] >= 0 ? { kind: 'queued' } : { kind: 'hidden' };
  return s.workers[owner].task === leaf ? { kind: 'running', worker: owner } : { kind: 'done', worker: owner };
}

export const parentsOf = (tree: Tree): number[] => {
  const parent = tree.tasks.map(() => -1);
  tree.tasks.forEach((t) => t.children?.forEach((c) => (parent[c] = t.id)));
  return parent;
};
