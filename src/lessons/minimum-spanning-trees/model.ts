import { createDisjointSet } from '../../core/disjointSet';
import { parseInteger } from '../../core/parse';

/**
 * Minimum spanning trees as pure functions over a weighted undirected graph: Kruskal (on
 * core/disjointSet) and Prim, each with an event trace, plus the cut property, a
 * uniqueness check and the "an MST is not a shortest-path tree" comparison.
 */

export interface WGraph {
  /** Node count; nodes are 0 … n - 1. */
  n: number;
  edges: readonly { a: number; b: number; w: number }[];
}

export interface MstResult {
  /** Indices of the chosen edges, in the order they were taken. */
  edges: number[];
  total: number;
  /** Connected components: 1 means a spanning tree, more means a spanning forest. */
  components: number;
}

export type KruskalEvent = {
  edge: number;
  accepted: boolean;
  /** Set label (root) per node after this edge. */
  sets: number[];
  /** Accept only: the nodes on one side of the cut this edge is the lightest across. */
  side: number[] | null;
};

/** Edge indices sorted by weight; ties keep input order. */
export const byWeight = (g: WGraph) => g.edges.map((_, i) => i).sort((x, y) => g.edges[x].w - g.edges[y].w || x - y);

export function kruskal(g: WGraph): MstResult & { events: KruskalEvent[] } {
  const ds = createDisjointSet(g.n, { byRank: true, compress: true });
  const events: KruskalEvent[] = [];
  const chosen: number[] = [];
  let total = 0;
  for (const i of byWeight(g)) {
    if (chosen.length === g.n - 1) break;
    const { a, b, w } = g.edges[i];
    const ra = ds.find(a);
    const side = ds.connected(a, b) ? null : Array.from({ length: g.n }, (_, v) => v).filter((v) => ds.find(v) === ra);
    const accepted = ds.union(a, b);
    if (accepted) {
      chosen.push(i);
      total += w;
    }
    events.push({ edge: i, accepted, sets: Array.from({ length: g.n }, (_, v) => ds.find(v)), side });
  }
  return { edges: chosen, total, components: components(g), events };
}

export type PrimEvent =
  /** A new tree starts at `node` (the start, or a restart in another component). */
  | { kind: 'start'; node: number; frontier: number[] }
  /** The lightest frontier edge `edge` brings in `node`. `frontier` is what crossed the cut before it was taken. */
  | { kind: 'take'; edge: number; node: number; frontier: number[]; inTree: number[] };

/** Prim from `start`; if the graph is disconnected, it restarts at the lowest unreached node. */
export function prim(g: WGraph, start: number): MstResult & { events: PrimEvent[] } {
  const inTree = new Set<number>();
  const events: PrimEvent[] = [];
  const chosen: number[] = [];
  let total = 0;
  const frontier = () =>
    g.edges.map((_, i) => i).filter((i) => inTree.has(g.edges[i].a) !== inTree.has(g.edges[i].b)).sort((x, y) => g.edges[x].w - g.edges[y].w || x - y);
  let next: number | undefined = start;
  while (next !== undefined) {
    inTree.add(next);
    events.push({ kind: 'start', node: next, frontier: frontier() });
    for (let f = frontier(); f.length; f = frontier()) {
      const edge = f[0];
      const { a, b, w } = g.edges[edge];
      const node = inTree.has(a) ? b : a;
      events.push({ kind: 'take', edge, node, frontier: f, inTree: [...inTree] });
      inTree.add(node);
      chosen.push(edge);
      total += w;
    }
    next = Array.from({ length: g.n }, (_, v) => v).find((v) => !inTree.has(v));
  }
  return { edges: chosen, total, components: components(g), events };
}

export function components(g: WGraph): number {
  const ds = createDisjointSet(g.n);
  g.edges.forEach((e) => ds.union(e.a, e.b));
  return ds.count;
}

/** Largest edge count countMinimumTrees enumerates. */
export const COUNT_MAX_EDGES = 16;

/**
 * How many different edge sets reach the minimum total, by trying every acyclic set of
 * n − components edges. Exact; small graphs only.
 */
export function countMinimumTrees(g: WGraph): number {
  if (g.edges.length > COUNT_MAX_EDGES) throw new RangeError(`countMinimumTrees handles at most ${COUNT_MAX_EDGES} edges`);
  const need = g.n - components(g);
  const best = kruskal(g).total;
  let count = 0;
  const pick: number[] = [];
  const walk = (from: number, sum: number) => {
    if (sum > best) return;
    if (pick.length === need) {
      const ds = createDisjointSet(g.n);
      if (sum === best && pick.every((i) => ds.union(g.edges[i].a, g.edges[i].b))) count++;
      return;
    }
    for (let i = from; i <= g.edges.length - (need - pick.length); i++) {
      pick.push(i);
      walk(i + 1, sum + g.edges[i].w);
      pick.pop();
    }
  };
  walk(0, 0);
  return count;
}

/** All weights different: then the minimum spanning tree is unique. */
export const distinctWeights = (g: WGraph) => new Set(g.edges.map((e) => e.w)).size === g.edges.length;

/** Edges crossing the cut (side, rest), and the lightest weight among them. */
export function cut(g: WGraph, side: readonly number[]): { crossing: number[]; lightest: number[] } {
  const s = new Set(side);
  const crossing = g.edges.map((_, i) => i).filter((i) => s.has(g.edges[i].a) !== s.has(g.edges[i].b));
  const min = Math.min(...crossing.map((i) => g.edges[i].w));
  return { crossing, lightest: crossing.filter((i) => g.edges[i].w === min) };
}

/** Shortest distances from `from` using only the edges listed (default: all). */
export function distances(g: WGraph, from: number, use: readonly number[] = g.edges.map((_, i) => i)): number[] {
  const dist = new Array<number>(g.n).fill(Infinity);
  const done = new Array<boolean>(g.n).fill(false);
  dist[from] = 0;
  for (let k = 0; k < g.n; k++) {
    let u = -1;
    for (let v = 0; v < g.n; v++) if (!done[v] && (u < 0 || dist[v] < dist[u])) u = v;
    if (u < 0 || dist[u] === Infinity) break;
    done[u] = true;
    for (const i of use) {
      const { a, b, w } = g.edges[i];
      const v = a === u ? b : b === u ? a : -1;
      if (v >= 0 && dist[u] + w < dist[v]) dist[v] = dist[u] + w;
    }
  }
  return dist;
}

/** The pair whose route through the tree is longest compared with its true shortest route. */
export function worstDetour(g: WGraph, tree: readonly number[]): { from: number; to: number; viaTree: number; shortest: number } | null {
  let worst: { from: number; to: number; viaTree: number; shortest: number } | null = null;
  for (let s = 0; s < g.n; s++) {
    const full = distances(g, s);
    const viaTree = distances(g, s, tree);
    for (let t = s + 1; t < g.n; t++) {
      if (!Number.isFinite(viaTree[t]) || viaTree[t] === full[t]) continue;
      if (!worst || viaTree[t] - full[t] > worst.viaTree - worst.shortest) worst = { from: s, to: t, viaTree: viaTree[t], shortest: full[t] };
    }
  }
  return worst;
}

export const MAX_WEIGHT = 999;

/** A weight the learner typed: a whole number 0 … 999, or a reason it's refused. */
export function parseWeight(text: string): { ok: true; value: number } | { ok: false; why: string } {
  const v = parseInteger(text);
  if (v === null) return { ok: false, why: 'Weights are whole numbers, like 7.' };
  if (v < 0 || v > MAX_WEIGHT) return { ok: false, why: `Weights go from 0 to ${MAX_WEIGHT}.` };
  return { ok: true, value: v };
}
