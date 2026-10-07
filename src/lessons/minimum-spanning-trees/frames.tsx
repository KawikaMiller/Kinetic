import type { ReactNode } from 'react';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { countMinimumTrees, distinctWeights, kruskal, prim, type MstResult, type WGraph } from './model';

export type Algo = 'kruskal' | 'prim';

export interface MstFrame extends Frame {
  /** The edge being looked at right now. */
  considered: number | null;
  accepted: number[];
  /** Every edge rejected so far (dim once it's no longer the current one). */
  rejected: number[];
  /** Rejected this step (shown red for one frame). */
  rejectedNow: number | null;
  /** Kruskal: set label per node. */
  sets: number[] | null;
  /** Prim: nodes in the tree. */
  inTree: number[];
  /** Prim: edges leaving the tree. */
  frontier: number[];
  /** One side of the cut this step's edge is the lightest across. */
  side: number[] | null;
  total: number;
}

export const ALGO_NAMES: Record<Algo, string> = { kruskal: 'Kruskal', prim: 'Prim' };

/** The closing line, from the results themselves. */
export function verdict(g: WGraph, mine: MstResult, other: MstResult, algo: Algo, unit: string): ReactNode {
  const otherName = ALGO_NAMES[algo === 'kruskal' ? 'prim' : 'kruskal'];
  const totals = mine.total === other.total ? <>{otherName} gets the same total.</> : <>{otherName} gets {other.total}, which would be a bug: please report it.</>;
  if (mine.components > 1) {
    return (
      <>
        <span className="hl bad">Spanning forest, not a tree:</span> the graph is in {mine.components} separate pieces, so the best you can do is {mine.components} trees with{' '}
        {g.n - mine.components} edges, total <b>{mine.total}</b> {unit}. {totals}
      </>
    );
  }
  const count = countMinimumTrees(g);
  return (
    <>
      Minimum spanning tree: {g.n - 1} edges, total <b>{mine.total}</b> {unit}. {totals}{' '}
      {distinctWeights(g)
        ? 'Every weight is different, so this is the only minimum tree.'
        : count === 1
          ? 'Some weights repeat, but only this one tree reaches the minimum here.'
          : `${count} different trees reach this same total. Both algorithms break ties the same way (earlier edge first), so they return the same one.`}
    </>
  );
}

const edgeName = (g: WGraph, i: number, name: (i: number) => string) => `${name(g.edges[i].a)}–${name(g.edges[i].b)} (${g.edges[i].w})`;
const nodeList = (xs: readonly number[], name: (i: number) => string) => `{${xs.map(name).join(', ')}}`;

export function mstFrames(g: WGraph, algo: Algo, start: number, unit: string, name: (i: number) => string): MstFrame[] {
  const rec = createRecorder<MstFrame>(
    { considered: null, accepted: [], rejected: [], rejectedNow: null, sets: null, inTree: [], frontier: [], side: null, total: 0 },
    { transient: { rejectedNow: null, side: null } },
  );
  const k = kruskal(g);
  const p = prim(g, start);
  const ident = Array.from({ length: g.n }, (_, i) => i);

  if (algo === 'kruskal') {
    rec.snap(<>Kruskal: sort every edge by weight, then take them lightest first, skipping any edge whose two ends are already connected.</>, undefined, { sets: ident });
    for (const e of k.events) {
      const now = rec.get();
      if (e.accepted) {
        rec.snap(
          <>
            {edgeName(g, e.edge, name)}: its ends are in different sets, so take it. It's the lightest edge between {nodeList(e.side!, name)} and the rest, and the lightest edge across any
            such cut is always safe.
          </>,
          undefined,
          { considered: e.edge, accepted: [...now.accepted, e.edge], sets: e.sets, side: e.side, total: now.total + g.edges[e.edge].w },
        );
      } else {
        rec.snap(
          <>{edgeName(g, e.edge, name)}: both ends are already connected, so this edge would close a loop. Skip it.</>,
          undefined,
          { considered: e.edge, rejected: [...now.rejected, e.edge], rejectedNow: e.edge },
        );
      }
    }
    const skipped = g.edges.length - k.events.length;
    if (skipped > 0) {
      rec.snap(<>That's {g.n - 1} edges, enough to connect all {g.n} nodes, so the {skipped} heaviest edge{skipped === 1 ? ' is' : 's are'} never even looked at.</>, undefined, { considered: null });
    } else rec.set({ considered: null });
    rec.close(verdict(g, k, p, 'kruskal', unit), 2);
    return rec.frames;
  }

  for (const e of p.events) {
    const now = rec.get();
    if (e.kind === 'start') {
      rec.snap(
        now.inTree.length === 0
          ? <>Prim from {name(e.node)}: grow a single tree, each time adding the lightest edge that leaves it. The blue edges are the frontier.</>
          : <>No edge leaves the tree: the graph is disconnected. Start a second tree at {name(e.node)}.</>,
        undefined,
        { inTree: [...now.inTree, e.node], frontier: e.frontier, considered: null },
      );
    } else {
      const others = e.frontier.length - 1;
      rec.snap(
        <>
          The lightest of the {e.frontier.length} frontier edge{e.frontier.length === 1 ? '' : 's'} is {edgeName(g, e.edge, name)}: take it, and {name(e.node)} joins the tree.
          {others > 0 && <> It's the lightest edge across the cut between the tree and everything else.</>}
        </>,
        undefined,
        { considered: e.edge, frontier: e.frontier, side: e.inTree },
      );
      rec.set({ accepted: [...now.accepted, e.edge], inTree: [...e.inTree, e.node], total: now.total + g.edges[e.edge].w });
    }
  }
  rec.set({ considered: null, frontier: [] });
  rec.close(verdict(g, p, k, 'prim', unit), 2);
  return rec.frames;
}
