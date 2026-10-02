import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { countOrders, cycleEdges, dfsTopo, findCycle, isValidOrder, kahn, type Dag } from './model';

export type Algo = 'kahn' | 'dfs';

export interface TsFrame extends Frame {
  /** Kahn: incoming arrows not yet crossed off, per node. Null in DFS. */
  indeg: Record<string, number> | null;
  queue: string[];
  output: string[];
  current: string | null;
  consumed: number[];
  /** DFS: the nodes on the current search path, root first. */
  path: string[];
  cycle: string[] | null;
  cycleEdges: number[];
}

export const ALGO_NAMES: Record<Algo, string> = { kahn: "Kahn's queue", dfs: 'DFS post-order' };

const chain = (cycle: readonly string[]) => [...cycle, cycle[0]].join(' → ');
const list = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The closing line for a finished run: computed from the order itself and the graph. */
export function verdict(g: Dag, order: readonly string[], other: readonly string[]): ReactNode {
  if (!isValidOrder(g, order)) return <>That order breaks an arrow, which shouldn't happen: please report it.</>;
  const n = countOrders(g);
  const same = order.join() === other.join();
  return (
    <>
      Order: <b>{order.join(', ')}</b>. Checked: every arrow points forward. It's one of{' '}
      <b>{n.toLocaleString('en')}</b> valid order{n === 1 ? '' : 's'}
      {n > 1 && (same ? ', and the other algorithm happens to find the same one.' : ': the other algorithm finds a different one.')}
      {n === 1 && ': the arrows pin down every position.'}
    </>
  );
}

export function topoFrames(g: Dag, algo: Algo): TsFrame[] {
  const rec = createRecorder<TsFrame>({ indeg: null, queue: [], output: [], current: null, consumed: [], path: [], cycle: null, cycleEdges: [] });
  const V = g.nodes.length;
  const k = kahn(g);
  const d = dfsTopo(g);

  if (algo === 'kahn') {
    for (const e of k.events) {
      if (e.kind === 'start') {
        rec.snap(
          e.queue.length
            ? <>Count each node's incoming arrows (the violet badges). {list(e.queue)} {e.queue.length === 1 ? 'has' : 'have'} none, so {e.queue.length === 1 ? 'it starts' : 'they start'} in the queue.</>
            : <>Count each node's incoming arrows (the violet badges). Every node has at least one, so nothing can go first: the queue starts empty.</>,
          undefined,
          { indeg: e.indeg, queue: e.queue },
        );
      } else if (e.kind === 'emit') {
        rec.snap(
          <>{e.node} leaves the front of the queue: nothing it waits on is left, so it's <b>#{rec.get().output.length + 1}</b> in the order.</>,
          undefined,
          { current: e.node, queue: e.queue, output: [...rec.get().output, e.node] },
        );
      } else {
        const targets = e.edges.map((i) => g.edges[i].to);
        const drops = targets.map((t) => `${t} to ${e.indeg[t]}`);
        rec.snap(
          targets.length === 0
            ? <>{e.node} has no outgoing arrows, so no badge changes.</>
            : <>Cross off {e.node}'s arrows: {list(drops)}.{e.freed.length > 0 && <> {list(e.freed)} {e.freed.length === 1 ? 'hits' : 'hit'} 0 and {e.freed.length === 1 ? 'joins' : 'join'} the queue.</>}</>,
          undefined,
          { current: null, indeg: e.indeg, queue: e.queue, consumed: [...rec.get().consumed, ...e.edges] },
        );
      }
    }
    if (k.order.length < V) {
      const cycle = findCycle(g, k.stuck)!;
      rec.snap(
        <>
          <span className="hl bad">Jammed.</span> The queue is empty but {k.stuck.length} of {V} nodes are left, each still waiting on an arrow:{' '}
          <b>{chain(cycle)}</b> is a cycle, so no valid order exists.
        </>,
        2,
        { cycle, cycleEdges: cycleEdges(g, cycle) },
      );
    } else rec.close(verdict(g, k.order, d.order), 2);
    return rec.frames;
  }

  rec.snap(<>Depth-first: follow arrows as deep as they go. A node is finished when everything after it is, and finished nodes go on the <b>front</b> of the output.</>);
  for (const e of d.events) {
    const now = rec.get();
    if (e.kind === 'enter') {
      rec.snap(<>visit({e.node}): it joins the path. Follow its arrows before finishing it.</>, undefined, { current: e.node, path: [...now.path, e.node] });
    } else if (e.kind === 'finish') {
      const path = now.path.slice(0, -1);
      const leaf = !g.edges.some((x) => x.from === e.node);
      rec.snap(
        leaf
          ? <>{e.node} has no arrows out, so it's finished straight away: it goes on the front of the output.</>
          : <>Everything after {e.node} is placed, so {e.node} goes on the front: it must come before all of them.</>,
        undefined,
        { current: path[path.length - 1] ?? null, path, output: [e.node, ...now.output] },
      );
    } else {
      rec.snap(
        <>
          <span className="hl bad">Cycle.</span> {e.from} → {e.to} points back at {e.to}, which is still on the path: <b>{chain(e.cycle)}</b>. Stop: no valid order
          exists.
        </>,
        2,
        { current: e.from, cycle: e.cycle, cycleEdges: cycleEdges(g, e.cycle) },
      );
    }
  }
  if (!d.cycle) rec.close(verdict(g, d.order, k.order), 2);
  return rec.frames;
}
