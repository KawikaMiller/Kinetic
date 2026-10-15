/**
 * vector-search, scene 3: a simplified HNSW (hierarchical navigable small world) graph. Pure.
 *
 * Every point gets a top layer at random (most only layer 0, a few higher). Inserting a point finds, layer by layer, its nearest
 * existing points and links it to the M nearest ("simple neighbour selection", not the paper's heuristic); a neighbour that ends up with too
 * many links keeps its nearest. Searching starts at the top layer's entry point, hops greedily to a closer neighbour, drops a layer when none
 * is closer, and at layer 0 keeps a candidate list of size `efSearch`.
 */
import { mulberry32 } from '../../core/random';
import { dist, type Found, type Neighbour, type Point } from './data';

export const MIN_M = 2;
export const MAX_M = 8;
export const DEFAULT_M = 4;
export const DEFAULT_EF_CONSTRUCTION = 32;
export const MAX_EF = 400;
export const DEFAULT_EF_SEARCH = 1;

export interface Hnsw {
  points: readonly Point[];
  m: number;
  /** Top layer of each point. */
  levels: number[];
  /** `links[layer][id]`: neighbour ids at that layer (empty for a point not on it). */
  links: number[][][];
  entry: number;
  top: number;
  /** Distance computations spent building it. */
  computations: number;
}

/** The most links a point keeps: M on the upper layers, 2M on layer 0. */
const maxLinks = (m: number, layer: number) => (layer === 0 ? 2 * m : m);

export interface LayerSearch {
  /** The ef nearest found, nearest first. */
  found: Neighbour[];
  /** Every point whose distance was computed, in the order visited. */
  visited: number[];
}

/** Best-first search of one layer from `entries`, keeping the `ef` nearest seen. */
function searchLayer(h: { points: readonly Point[]; links: number[][][] }, q: Point, entries: readonly number[], ef: number, layer: number): LayerSearch {
  const seen = new Set<number>(entries);
  const visited = [...entries];
  const dq = (id: number): Neighbour => ({ id, d: dist(h.points[id], q) });
  const candidates: Neighbour[] = entries.map(dq);
  const best: Neighbour[] = [...candidates];
  const byDist = (a: Neighbour, b: Neighbour) => a.d - b.d || a.id - b.id;
  while (candidates.length > 0) {
    candidates.sort(byDist);
    const c = candidates.shift()!;
    best.sort(byDist);
    if (best.length >= ef && c.d > best[ef - 1].d) break;
    for (const nb of h.links[layer][c.id]) {
      if (seen.has(nb)) continue;
      seen.add(nb);
      visited.push(nb);
      const n = dq(nb);
      best.sort(byDist);
      if (best.length < ef || n.d < best[best.length - 1].d) {
        candidates.push(n);
        best.push(n);
        best.sort(byDist);
        if (best.length > ef) best.pop();
      }
    }
  }
  best.sort(byDist);
  return { found: best.slice(0, ef), visited };
}

export function buildHnsw(points: readonly Point[], m: number, efConstruction: number, seed: number): Hnsw {
  const rnd = mulberry32(seed);
  const mL = 1 / Math.log(Math.max(m, 2));
  const levels = points.map(() => Math.floor(-Math.log(1 - rnd()) * mL));
  const topLevel = Math.max(0, ...levels);
  const links: number[][][] = Array.from({ length: topLevel + 1 }, () => points.map(() => []));
  let entry = 0;
  let top = levels[0] ?? 0;
  let computations = 0;
  const count = (visited: readonly number[]) => {
    computations += visited.length;
  };
  for (let id = 1; id < points.length; id++) {
    const q = points[id];
    let eps = [entry];
    for (let layer = top; layer > levels[id]; layer--) {
      const r = searchLayer({ points, links }, q, eps, 1, layer);
      count(r.visited);
      eps = [r.found[0].id];
    }
    for (let layer = Math.min(levels[id], top); layer >= 0; layer--) {
      const r = searchLayer({ points, links }, q, eps, efConstruction, layer);
      count(r.visited);
      const chosen = r.found.slice(0, m).map((n) => n.id);
      links[layer][id] = chosen;
      for (const nb of chosen) {
        const list = [...links[layer][nb], id];
        links[layer][nb] = list.length > maxLinks(m, layer) ? list.map((x) => ({ id: x, d: dist(points[nb], points[x]) })).sort((a, b) => a.d - b.d || a.id - b.id).slice(0, maxLinks(m, layer)).map((x) => x.id) : list;
        if (list.length > maxLinks(m, layer)) computations += list.length;
      }
      eps = r.found.map((n) => n.id);
    }
    if (levels[id] > top) {
      top = levels[id];
      entry = id;
    }
  }
  return { points, m, levels, links, entry, top, computations };
}

export type TraceKind = 'enter' | 'hop' | 'drop' | 'visit' | 'done';

export interface TraceStep {
  kind: TraceKind;
  layer: number;
  /** The node the step is about. */
  node: number;
  /** Its distance to the query. */
  d: number;
  /** Distance computations so far. */
  computations: number;
  /** For a hop: the node we came from. */
  from?: number;
}

export interface HnswResult extends Found {
  /** Points whose distance was computed, over the whole search. */
  visited: number[];
  trace: TraceStep[];
  /** The walk on the upper layers, as (layer, node) in order. */
  path: { layer: number; node: number }[];
  /** The node layer 0 starts from. */
  start: number;
}

/** Search from the entry point: greedy on the upper layers, a candidate list of size max(efSearch, k) on layer 0. */
export function searchHnsw(h: Hnsw, q: Point, k: number, efSearch: number): HnswResult {
  const trace: TraceStep[] = [];
  const path: { layer: number; node: number }[] = [];
  const visitedAll: number[] = [];
  let computations = 0;
  let cur = h.entry;
  let curD = dist(h.points[cur], q);
  computations++;
  visitedAll.push(cur);
  trace.push({ kind: 'enter', layer: h.top, node: cur, d: curD, computations });
  for (let layer = h.top; layer > 0; layer--) {
    path.push({ layer, node: cur });
    let moved = true;
    while (moved) {
      moved = false;
      for (const nb of h.links[layer][cur]) {
        const d = dist(h.points[nb], q);
        computations++;
        visitedAll.push(nb);
        if (d < curD) {
          trace.push({ kind: 'hop', layer, node: nb, d, computations, from: cur });
          cur = nb;
          curD = d;
          path.push({ layer, node: cur });
          moved = true;
          break;
        }
      }
    }
    trace.push({ kind: 'drop', layer, node: cur, d: curD, computations });
  }
  const ef = Math.max(efSearch, k);
  const r = searchLayer(h, q, [cur], ef, 0);
  computations += r.visited.length - 1;
  for (const id of r.visited.slice(1)) trace.push({ kind: 'visit', layer: 0, node: id, d: dist(h.points[id], q), computations });
  visitedAll.push(...r.visited.slice(1));
  trace.push({ kind: 'done', layer: 0, node: r.found[0]?.id ?? cur, d: r.found[0]?.d ?? curD, computations });
  return { neighbours: r.found.slice(0, k), computations, visited: visitedAll, trace, path, start: cur };
}

/** How many points a layer-0 search can reach by following links (they are directed) from `start`: all of them is what makes `efSearch >= N` exact. */
export function reachableFromStart(h: Hnsw, start: number): number {
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length > 0) {
    for (const nb of h.links[0][stack.pop()!]) {
      if (!seen.has(nb)) {
        seen.add(nb);
        stack.push(nb);
      }
    }
  }
  return seen.size;
}

/** Numbers stored beyond the points: every neighbour id on every layer. */
export const extraNumbers = (h: Hnsw): number => h.links.reduce((s, layer) => s + layer.reduce((n, list) => n + list.length, 0), 0);
