import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import type { Digraph, KosarajuRun } from './model';

export interface SccFrame extends Frame {
  phase: 'pass1' | 'reverse' | 'pass2';
  /** The recursion path of the DFS right now (the last node is the one being worked on). */
  path: number[];
  /** Nodes in the order they finished: the finish-order stack, top last. */
  finished: number[];
  /** Finish time of each finished node, aligned with `finished`. */
  times: number[];
  /** Component index per node, -1 until pass 2 reaches it. */
  comp: number[];
  /** The node the search is on. */
  current: number | null;
  /** The edges are drawn reversed. */
  reversed: boolean;
}

const list = (g: Digraph, vs: readonly number[]) => vs.map((v) => g.names[v]).join(', ');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function sccFrames(g: Digraph, run: KosarajuRun): SccFrame[] {
  const n = g.names.length;
  const name = (v: number) => g.names[v];
  const rec = createRecorder<SccFrame>(
    { phase: 'pass1', path: [], finished: [], times: [], comp: new Array<number>(n).fill(-1), current: null, reversed: false },
  );
  const given = run.order.every((v, i) => v === i);
  rec.snap(
    <>
      Pass 1 is a depth-first search on the graph as drawn, trying start nodes in the order {list(g, run.order)}
      {given ? '' : ' (not alphabetical: the components will not care)'}. A node goes on the finish-order stack when its search is completely done.
    </>,
  );
  for (const e of run.pass1) {
    const now = rec.get();
    if (e.kind === 'enter') {
      rec.snap(
        e.parent === null ? (
          <>Start a new search at {name(e.node)}: nothing visited so far reaches it.</>
        ) : (
          <>Visit {name(e.node)}, reached from {name(e.parent)}.</>
        ),
        undefined,
        { path: [...now.path, e.node], current: e.node },
      );
    } else {
      const path = now.path.slice(0, -1);
      rec.snap(
        <>
          {name(e.node)} has no unvisited out-neighbour left: <span className="hl ok">finish it at time {e.time}</span> and push it on the stack.
        </>,
        undefined,
        { path, finished: [...now.finished, e.node], times: [...now.times, e.time], current: path.length ? path[path.length - 1] : null },
      );
    }
  }
  rec.snap(
    <>
      Pass 1 done. Finish order, first to last: {list(g, run.finishOrder)}; the top of the stack is {name(run.finishOrder[run.finishOrder.length - 1])}. Now every edge flips direction, and pass 2 searches the{' '}
      <span className="hl violet">reversed graph</span>.
    </>,
    undefined,
    { phase: 'reverse', reversed: true, current: null, path: [] },
  );
  for (const e of run.pass2) {
    const now = rec.get();
    const comp = [...now.comp];
    comp[e.node] = e.comp;
    rec.snap(
      e.kind === 'root' ? (
        <>
          Pop the stack until a node is still unassigned: {name(e.node)}. A search from it in the reversed graph reaches exactly its component, which is number {e.comp + 1}.
        </>
      ) : (
        <>
          Visit {name(e.node)} from {name(e.parent!)} in the reversed graph: it joins component {e.comp + 1}.
        </>
      ),
      undefined,
      { phase: 'pass2', current: e.node, comp },
    );
  }
  const sizes = run.components.map((c) => c.length);
  rec.set({ current: null });
  rec.close(
    <>
      {plural(run.components.length, 'component')}: {run.components.map((c) => `{${list(g, [...c].sort((a, b) => a - b))}}`).join(', ')}
      {sizes.every((s) => s === 1) ? '. Every node is alone, which is what a graph with no cycle looks like.' : '.'} The search order shown is one valid choice; the components do not depend on it.
    </>,
    2,
  );
  return rec.frames;
}
