import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { chromatic, type Graph, type GreedyRun } from './model';

export interface GreedyFrame extends Frame {
  /** colours[v] so far, 0 = not coloured yet. */
  colours: number[];
  /** How many nodes of the order are coloured. */
  done: number;
  current: number | null;
  /** Colours the current node may not take, and the one it took. */
  forbidden: number[];
  chosen: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Colouring one node per frame, in the run's order. */
export function greedyFrames(g: Graph, run: GreedyRun): GreedyFrame[] {
  const n = g.names.length;
  const name = (v: number) => g.names[v];
  const best = chromatic(g).number;
  const rec = createRecorder<GreedyFrame>({ colours: Array<number>(n).fill(0), done: 0, current: null, forbidden: [], chosen: 0 });
  rec.snap(
    <>
      Greedy colouring in the order {run.order.map(name).join(', ')}: each node takes the smallest colour that none of its already-coloured neighbours has. The order is yours to change.
    </>,
  );
  run.steps.forEach((s, i) => {
    const colours = [...rec.get().colours];
    colours[s.node] = s.colour;
    rec.snap(
      <>
        {name(s.node)}: {s.forbidden.length ? <>its coloured neighbours use <span className="hl dim">{s.forbidden.join(', ')}</span>, so it takes </> : <>no neighbour is coloured yet, so it takes </>}
        <span className="hl">colour {s.colour}</span>.
      </>,
      undefined,
      { colours, done: i + 1, current: s.node, forbidden: s.forbidden, chosen: s.colour },
    );
  });
  const excess = run.used - best;
  rec.set({ current: null });
  rec.close(
    excess > 0 ? (
      <>
        Greedy used <span className="hl orange">{plural(run.used, 'colour')}</span>; the exact minimum is <span className="hl ok">{best}</span>, so this order wasted {plural(excess, 'colour')}. A different order can do better.
      </>
    ) : (
      <>
        Greedy used <span className="hl ok">{plural(run.used, 'colour')}</span>, and the exact minimum is {best}: this order happens to be optimal. A different order might not be.
      </>
    ),
    2,
  );
  return rec.frames;
}
