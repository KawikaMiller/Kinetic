/**
 * K4-5 core/tsp: the travelling-salesman toolkit behind approximation-algorithms and local-search-annealing.
 *
 * Everything works on a distance matrix `dist[i][j]`, so a lesson can feed it Euclidean points (`distanceMatrix`)
 * or a hand-edited, deliberately non-metric matrix. A tour is a permutation of the vertices read as a closed cycle.
 *
 *  - `distanceMatrix`, `randomPoints`, `tourLength`
 *  - `primMst`: minimum spanning tree (Prim from vertex 0, ties to the lowest index)
 *  - `heldKarp`: the exact optimum by dynamic programming over subsets (n at most 12)
 *  - `twoOpt` / `twoOptStep`: 2-opt local search with the move trace and each move's delta
 *  - `doubleTreeTour`: MST doubling, a preorder walk of the tree (children in index order)
 *  - `christofidesTour`: MST plus a minimum-weight perfect matching on the odd-degree vertices (bitmask DP, at most
 *    12 of them), an Euler circuit, then shortcuts. The Euler-circuit tie-break is PINNED: Hierholzer's walk always
 *    takes the unused edge to the smallest-index neighbour first, and the circuit is that walk in traversal order,
 *    so a lesson's hand-worked tour reproduces.
 *
 * The 2x and 1.5x guarantees need the triangle inequality; with it broken `doubleTreeTour` can be arbitrarily bad.
 */
import type { Rnd } from './random';

export interface Point {
  x: number;
  y: number;
}
export type DistMatrix = readonly (readonly number[])[];
export type Edge = readonly [number, number];

/** Held-Karp walks 2^(n-1) subsets; past this a lesson should use an approximation. */
export const MAX_HELD_KARP = 12;
/** The matching DP walks 2^k subsets of the k odd-degree vertices. */
export const MAX_MATCHING_VERTICES = 12;
/** A 2-opt move must beat zero by more than this to count as an improvement (float noise guard). */
export const IMPROVE_EPSILON = 1e-9;

export function distanceMatrix(points: readonly Point[]): number[][] {
  return points.map((a) => points.map((b) => Math.hypot(a.x - b.x, a.y - b.y)));
}

/** `n` seeded points uniform in [0, size) x [0, size). */
export function randomPoints(rnd: Rnd, n: number, size = 100): Point[] {
  return Array.from({ length: n }, () => ({ x: rnd() * size, y: rnd() * size }));
}

/** Length of the closed tour (back to the start); 0 for fewer than two vertices. */
export function tourLength(dist: DistMatrix, tour: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < tour.length; i++) total += dist[tour[i]][tour[(i + 1) % tour.length]];
  return total;
}

// ── Minimum spanning tree ───────────────────────────────────────────────

export interface Mst {
  /** Edges as `[parent, child]` in the order Prim added them. */
  edges: Edge[];
  weight: number;
}

/** Prim's algorithm from vertex 0. Among equally close vertices the lowest index is added, via the lowest-index parent. */
export function primMst(dist: DistMatrix): Mst {
  const n = dist.length;
  if (n === 0) return { edges: [], weight: 0 };
  const inTree = new Array<boolean>(n).fill(false);
  const best = new Array<number>(n).fill(Infinity);
  const parent = new Array<number>(n).fill(-1);
  best[0] = 0;
  const edges: Edge[] = [];
  let weight = 0;
  for (let step = 0; step < n; step++) {
    let v = -1;
    for (let i = 0; i < n; i++) if (!inTree[i] && (v === -1 || best[i] < best[v])) v = i;
    inTree[v] = true;
    if (parent[v] >= 0) {
      edges.push([parent[v], v]);
      weight += best[v];
    }
    for (let u = 0; u < n; u++) {
      if (!inTree[u] && dist[v][u] < best[u]) {
        best[u] = dist[v][u];
        parent[u] = v;
      }
    }
  }
  return { edges, weight };
}

// ── Held-Karp ───────────────────────────────────────────────────────────

/**
 * The optimal tour by dynamic programming over subsets, starting and ending at vertex 0. Ties go to the smallest
 * predecessor, so the returned tour is deterministic (an optimal tour is rarely unique; its length is).
 * Refuses n above `MAX_HELD_KARP`.
 */
export function heldKarp(dist: DistMatrix): { length: number; tour: number[] } {
  const n = dist.length;
  if (n > MAX_HELD_KARP) throw new RangeError(`Held-Karp is limited to ${MAX_HELD_KARP} points; got ${n}.`);
  if (n <= 1) return { length: 0, tour: n === 0 ? [] : [0] };
  const m = n - 1; // vertices 1..n-1 are bits 0..m-1
  const full = (1 << m) - 1;
  const cost = Array.from({ length: full + 1 }, () => new Array<number>(m).fill(Infinity));
  const prev = Array.from({ length: full + 1 }, () => new Array<number>(m).fill(-1));
  for (let j = 0; j < m; j++) cost[1 << j][j] = dist[0][j + 1];
  for (let set = 1; set <= full; set++) {
    for (let j = 0; j < m; j++) {
      if (!(set & (1 << j)) || cost[set][j] === Infinity) continue;
      for (let k = 0; k < m; k++) {
        if (set & (1 << k)) continue;
        const next = set | (1 << k);
        const c = cost[set][j] + dist[j + 1][k + 1];
        if (c < cost[next][k]) {
          cost[next][k] = c;
          prev[next][k] = j;
        }
      }
    }
  }
  let last = 0;
  let length = Infinity;
  for (let j = 0; j < m; j++) {
    const c = cost[full][j] + dist[j + 1][0];
    if (c < length) {
      length = c;
      last = j;
    }
  }
  const tour: number[] = [];
  let set = full;
  for (let j = last; j !== -1; ) {
    tour.push(j + 1);
    const p = prev[set][j];
    set &= ~(1 << j);
    j = p;
  }
  tour.push(0);
  return { length, tour: tour.reverse() };
}

// ── 2-opt ───────────────────────────────────────────────────────────────

/**
 * One 2-opt move: with `a = tour[i]`, `b = tour[i + 1]`, `c = tour[j]`, `d = tour[j + 1]` (wrapping), replace edges
 * (a, b) and (c, d) with (a, c) and (b, d) by reversing the positions i + 1 to j. `delta` is the new length minus
 * the old one (negative = shorter); `tour` is the result.
 */
export interface TwoOptMove {
  i: number;
  j: number;
  delta: number;
  tour: number[];
}

/** The first improving 2-opt move in scan order (i ascending, then j ascending), or null at a 2-opt local minimum. */
export function twoOptStep(dist: DistMatrix, tour: readonly number[]): TwoOptMove | null {
  const n = tour.length;
  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // the two edges share vertex tour[0]
      const [a, b, c, d] = [tour[i], tour[i + 1], tour[j], tour[(j + 1) % n]];
      const delta = dist[a][c] + dist[b][d] - dist[a][b] - dist[c][d];
      if (delta < -IMPROVE_EPSILON) {
        const next = [...tour.slice(0, i + 1), ...tour.slice(i + 1, j + 1).reverse(), ...tour.slice(j + 1)];
        return { i, j, delta, tour: next };
      }
    }
  }
  return null;
}

/** Repeat `twoOptStep` until none improves (or `maxMoves` is reached): the final tour and every move made. */
export function twoOpt(dist: DistMatrix, start: readonly number[], options: { maxMoves?: number } = {}): { tour: number[]; moves: TwoOptMove[]; length: number } {
  const maxMoves = options.maxMoves ?? Infinity;
  const moves: TwoOptMove[] = [];
  let tour = [...start];
  while (moves.length < maxMoves) {
    const move = twoOptStep(dist, tour);
    if (!move) break;
    moves.push(move);
    tour = move.tour;
  }
  return { tour, moves, length: tourLength(dist, tour) };
}

// ── Tours from the spanning tree ────────────────────────────────────────

/** Tree adjacency lists, neighbours ascending. */
function adjacency(n: number, edges: readonly Edge[]): number[][] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  for (const list of adj) list.sort((x, y) => x - y);
  return adj;
}

/** MST doubling: the preorder of the tree from vertex 0, children in index order, closed up. */
export function doubleTreeTour(dist: DistMatrix): { tour: number[]; length: number; mst: Mst } {
  const n = dist.length;
  const mst = primMst(dist);
  const adj = adjacency(n, mst.edges);
  const tour: number[] = [];
  const seen = new Array<boolean>(n).fill(false);
  const visit = (v: number) => {
    seen[v] = true;
    tour.push(v);
    for (const u of adj[v]) if (!seen[u]) visit(u);
  };
  if (n > 0) visit(0);
  return { tour, length: tourLength(dist, tour), mst };
}

/**
 * The cheapest way to pair up `vertices` (an even count, at most `MAX_MATCHING_VERTICES`) by bitmask DP. The lowest
 * unmatched vertex is paired with each candidate in ascending order and a strictly cheaper pairing replaces the
 * best, so among equal-weight pairings the first one found wins (deterministic).
 */
export function minWeightPerfectMatching(dist: DistMatrix, vertices: readonly number[]): { pairs: Edge[]; weight: number } {
  const k = vertices.length;
  if (k % 2 !== 0) throw new RangeError(`A perfect matching needs an even number of vertices; got ${k}.`);
  if (k > MAX_MATCHING_VERTICES) throw new RangeError(`The matching is limited to ${MAX_MATCHING_VERTICES} vertices; got ${k}.`);
  const full = (1 << k) - 1;
  const best = new Array<number>(full + 1).fill(Infinity);
  /** The pair (low, other) that last improved each mask, as indices into `vertices`. */
  const via: [number, number][] = new Array(full + 1);
  best[0] = 0;
  for (let mask = 0; mask < full; mask++) {
    if (best[mask] === Infinity) continue;
    let low = 0;
    while (mask & (1 << low)) low++;
    for (let other = low + 1; other < k; other++) {
      if (mask & (1 << other)) continue;
      const next = mask | (1 << low) | (1 << other);
      const w = best[mask] + dist[vertices[low]][vertices[other]];
      if (w < best[next]) {
        best[next] = w;
        via[next] = [low, other];
      }
    }
  }
  const pairs: Edge[] = [];
  for (let mask = full; mask; ) {
    const [low, other] = via[mask];
    pairs.push([vertices[low], vertices[other]]);
    mask &= ~(1 << low) & ~(1 << other);
  }
  return { pairs: pairs.reverse(), weight: best[full] };
}

/**
 * An Euler circuit of a connected multigraph (every degree even) from `start`, by Hierholzer's algorithm with the
 * pinned tie-break: at each vertex take the unused edge to the smallest-index neighbour. Returned in traversal order,
 * closed (first vertex = last vertex).
 */
export function eulerCircuit(n: number, edges: readonly Edge[], start = 0): number[] {
  const adj: { to: number; id: number }[][] = Array.from({ length: n }, () => []);
  edges.forEach(([a, b], id) => {
    adj[a].push({ to: b, id });
    adj[b].push({ to: a, id });
  });
  for (const list of adj) list.sort((x, y) => x.to - y.to || x.id - y.id);
  const used = new Array<boolean>(edges.length).fill(false);
  const cursor = new Array<number>(n).fill(0);
  const stack = [start];
  const popped: number[] = [];
  while (stack.length > 0) {
    const v = stack[stack.length - 1];
    while (cursor[v] < adj[v].length && used[adj[v][cursor[v]].id]) cursor[v]++;
    if (cursor[v] === adj[v].length) {
      popped.push(stack.pop()!);
    } else {
      const { to, id } = adj[v][cursor[v]];
      used[id] = true;
      stack.push(to);
    }
  }
  return popped.reverse();
}

/** The first visit of each vertex along a closed walk: the shortcut tour. */
export const shortcut = (walk: readonly number[]): number[] => [...new Set(walk)];

export interface ChristofidesResult {
  tour: number[];
  length: number;
  mst: Mst;
  /** The odd-degree vertices of the tree and the pairing chosen for them. */
  odd: number[];
  matching: { pairs: Edge[]; weight: number };
  /** The Euler circuit of tree + matching, before shortcutting (closed). */
  circuit: number[];
}

/** Christofides' tour: MST + minimum perfect matching on its odd vertices, Euler circuit (pinned tie-break), shortcut. */
export function christofidesTour(dist: DistMatrix): ChristofidesResult {
  const n = dist.length;
  const mst = primMst(dist);
  const degree = new Array<number>(n).fill(0);
  for (const [a, b] of mst.edges) {
    degree[a]++;
    degree[b]++;
  }
  const odd = degree.flatMap((d, v) => (d % 2 === 1 ? [v] : []));
  const matching = minWeightPerfectMatching(dist, odd);
  const circuit = n === 0 ? [] : eulerCircuit(n, [...mst.edges, ...matching.pairs]);
  const tour = shortcut(circuit);
  return { tour, length: tourLength(dist, tour), mst, odd, matching, circuit };
}
