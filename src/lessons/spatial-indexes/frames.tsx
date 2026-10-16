import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import type { Pt, Rect } from './data';
import { kdRange, knn, subtreeIds, type KdTree } from './kdtree';

export type KdQuery = { kind: 'nn'; q: Pt; k: number } | { kind: 'range'; rect: Rect };

export interface KdFrame extends Frame {
  /** Nodes whose point has been distance-checked so far. */
  visited: number[];
  /** Subtrees skipped so far (roots). */
  pruned: number[];
  /** The node being looked at. */
  current: number | null;
  /** Nodes in the result so far. */
  found: number[];
}

export interface KdRun {
  frames: KdFrame[];
  visitedCount: number;
  prunedCount: number;
  /** Distances (nearest) or hit count (range): what the closing caption states. */
  resultSummary: string;
}

const f1 = (v: number) => v.toFixed(1);
const hl = (v: ReactNode, tone = '') => <span className={`hl ${tone}`.trim()}>{v}</span>;
const at = (t: KdTree, id: number) => `(${f1(t.nodes[id].point[0])}, ${f1(t.nodes[id].point[1])})`;
const lineOf = (t: KdTree, id: number) => `${t.nodes[id].axis === 0 ? 'x' : 'y'} = ${f1(t.nodes[id].point[t.nodes[id].axis])}`;
/** The node whose child `id` is: the splitting line the search just came back to. */
const parentOf = (t: KdTree, id: number): number => t.nodes.findIndex((x) => x.left === id || x.right === id);

/** One frame per event of the search, narrated from the search's own event list. */
export function kdFrames(tree: KdTree, query: KdQuery): KdRun {
  const n = tree.nodes.length;
  const rec = createRecorder<KdFrame>({ visited: [], pruned: [], current: null, found: [] }, { transient: { current: null } });
  if (tree.root === null) {
    rec.snap(<>There are no points, so there is nothing to search: no points.</>);
    return { frames: rec.frames, visitedCount: 0, prunedCount: 0, resultSummary: 'no points' };
  }
  if (query.kind === 'nn') {
    const run = knn(tree, query.q, query.k);
    rec.snap(<>Find the {query.k === 1 ? 'nearest point' : `${query.k} nearest points`} to the query. Walk down the tree toward the query, then come back and check whether the other side could hold anything closer.</>);
    const seen: number[] = [];
    const found: { node: number; distance: number }[] = [];
    for (const e of run.events) {
      const cur = rec.get();
      if (e.kind === 'check') {
        seen.push(e.node);
        if (found.length < query.k || e.distance < found[found.length - 1].distance) {
          found.push({ node: e.node, distance: e.distance });
          found.sort((a, b) => a.distance - b.distance);
          if (found.length > query.k) found.pop();
        }
        const kept = found.some((x) => x.node === e.node);
        rec.snap(
          <>Check the point at {at(tree, e.node)}: it is {hl(f1(e.distance), 'info')} from the query{kept ? <>, so it joins the {hl('best so far', 'ok')}.</> : <>, no better than the {hl(f1(e.kth ?? 0))} already held.</>}</>,
          undefined,
          { current: e.node, visited: [...seen], found: found.map((x) => x.node) },
        );
      } else if (e.kind === 'cross') {
        rec.snap(
          <>Back at the line {lineOf(tree, parentOf(tree, e.node))}: the query is {hl(f1(e.planeDistance))} from it and {e.kth === null ? 'fewer than k points are held' : <>the k-th best is {hl(f1(e.kth))}</>}, so the other side could hold a closer point: {hl('go in', 'info')}.</>,
          undefined,
          { current: e.node, visited: cur.visited },
        );
      } else {
        rec.snap(
          <>Back at the line {lineOf(tree, parentOf(tree, e.node))}: the query is {hl(f1(e.planeDistance))} from it and the k-th best is only {hl(f1(e.kth))}, so nothing on the other side can beat it: {hl(`skip ${plural(subtreeIds(tree, e.node).length, 'point')}`, 'dim')} without looking.</>,
          undefined,
          { current: e.node, pruned: [...cur.pruned, e.node] },
        );
      }
    }
    const summary = run.found.map((x) => f1(x.distance)).join(', ');
    rec.set({ current: null });
    rec.close(<>Done: {hl(plural(run.visited.length, 'node'), 'info')} visited of {n}, {plural(run.pruned.length, 'subtree')} skipped. The result is at distance {hl(summary, 'ok')}; a plain scan would have checked all {n}.</>, 2);
    return { frames: rec.frames, visitedCount: run.visited.length, prunedCount: run.pruned.length, resultSummary: summary };
  }
  const run = kdRange(tree, query.rect);
  rec.snap(<>Find every point inside the rectangle: visit a subtree only when the splitting line lets the rectangle reach that side.</>);
  const seen: number[] = [];
  const hits: number[] = [];
  for (const e of run.events) {
    const cur = rec.get();
    if (e.kind === 'check') {
      seen.push(e.node);
      if (e.inside) hits.push(e.node);
      rec.snap(
        <>Check the point at {at(tree, e.node)}: it is {e.inside ? hl('inside', 'ok') : hl('outside', 'info')} the rectangle.</>,
        undefined,
        { current: e.node, visited: [...seen], found: [...hits] },
      );
    } else {
      rec.snap(
        <>The rectangle does not reach the {e.side} side of the line {lineOf(tree, parentOf(tree, e.node))}, so {hl(`skip ${plural(subtreeIds(tree, e.node).length, 'point')}`, 'dim')} there.</>,
        undefined,
        { current: e.node, pruned: [...cur.pruned, e.node] },
      );
    }
  }
  rec.set({ current: null });
  rec.close(<>Done: {hl(plural(run.visited.length, 'node'), 'info')} visited of {n}, {hl(plural(run.hits.length, 'hit'), 'ok')}, {plural(run.pruned.length, 'subtree')} skipped. A plain scan would have checked all {n}.</>, 2);
  return { frames: rec.frames, visitedCount: run.visited.length, prunedCount: run.pruned.length, resultSummary: String(run.hits.length) };
}
