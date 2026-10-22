/**
 * Vertex cover for np-reductions (the exact minimum, as the reduction's target) and approximation-algorithms (the
 * maximal-matching 2-approximation against that optimum). Graphs are `n` vertices numbered 0 to n-1 and an edge
 * list of `[a, b]` pairs; an edge is named by its index in that list.
 *
 *  - `minVertexCover`: exact, by branch and bound (up to `MAX_EXACT_VERTICES` vertices)
 *  - `maximalMatching`: greedy, deterministic (smallest edge index first unless an order is given)
 *  - `canAddToMatching` / `isMaximalMatching`: what a learner who builds the matching edge by edge needs for refusals
 *  - `isVertexCover` / `uncoveredEdges`: validity of any proposed cover
 */

export type Edge = readonly [number, number];

/** The exact search is exponential in the worst case; the lessons' graphs (at most 23 vertices) finish instantly. */
export const MAX_EXACT_VERTICES = 30;

function assertGraph(n: number, edges: readonly Edge[]): void {
  if (!Number.isInteger(n) || n < 0) throw new RangeError('The number of vertices must be a whole number, 0 or more.');
  for (const [a, b] of edges) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n || b >= n) throw new RangeError(`Edge (${a}, ${b}) is not between vertices 0 and ${n - 1}.`);
    if (a === b) throw new RangeError(`Edge (${a}, ${b}) is a loop; a vertex cover has no use for loops.`);
  }
}

/** Indices of the edges neither of whose endpoints is in `cover`. */
export function uncoveredEdges(edges: readonly Edge[], cover: Iterable<number>): number[] {
  const set = new Set(cover);
  return edges.flatMap(([a, b], i) => (set.has(a) || set.has(b) ? [] : [i]));
}

export const isVertexCover = (edges: readonly Edge[], cover: Iterable<number>): boolean => uncoveredEdges(edges, cover).length === 0;

// ── Exact minimum ───────────────────────────────────────────────────────

/**
 * A minimum vertex cover, ascending. Branch and bound: take the highest-degree vertex (ties to the lowest index) or,
 * failing that, all of its neighbours; prune when the cover so far plus a maximal-matching lower bound cannot beat the
 * best found. The cover returned is the first optimum the search reaches (taking the vertex is tried first), so it is
 * deterministic: K3,3 gives {0, 1, 2}. Throws `RangeError` above `MAX_EXACT_VERTICES` vertices.
 */
export function minVertexCover(n: number, edges: readonly Edge[]): { size: number; cover: number[] } {
  assertGraph(n, edges);
  if (n > MAX_EXACT_VERTICES) throw new RangeError(`The exact cover is limited to ${MAX_EXACT_VERTICES} vertices; got ${n}.`);
  let best: number[] | null = null;

  const matchingBound = (remaining: readonly Edge[]): number => {
    const used = new Set<number>();
    let count = 0;
    for (const [a, b] of remaining) {
      if (used.has(a) || used.has(b)) continue;
      used.add(a);
      used.add(b);
      count++;
    }
    return count;
  };

  const search = (remaining: readonly Edge[], chosen: readonly number[]): void => {
    if (remaining.length === 0) {
      if (best === null || chosen.length < best.length) best = [...chosen];
      return;
    }
    if (best !== null && chosen.length + matchingBound(remaining) >= best.length) return;
    const degree = new Map<number, number>();
    for (const [a, b] of remaining) {
      degree.set(a, (degree.get(a) ?? 0) + 1);
      degree.set(b, (degree.get(b) ?? 0) + 1);
    }
    let v = -1;
    for (const [u, d] of degree) if (v === -1 || d > degree.get(v)! || (d === degree.get(v) && u < v)) v = u;
    search(remaining.filter(([a, b]) => a !== v && b !== v), [...chosen, v]);
    const neighbours = [...new Set(remaining.flatMap(([a, b]) => (a === v ? [b] : b === v ? [a] : [])))];
    search(remaining.filter(([a, b]) => !neighbours.includes(a) && !neighbours.includes(b)), [...chosen, ...neighbours]);
  };

  search(edges, []);
  const cover = [...(best ?? [])].sort((x, y) => x - y);
  return { size: cover.length, cover };
}

// ── Maximal matching and the 2-approximation ────────────────────────────

export interface Matching {
  /** Indices (into the edge list) of the chosen edges, in the order chosen. */
  edges: number[];
  /** Both endpoints of every chosen edge, ascending: a vertex cover at most twice the optimum. */
  vertices: number[];
}

const endpoints = (edges: readonly Edge[], chosen: readonly number[]): number[] =>
  [...new Set(chosen.flatMap((i) => edges[i]))].sort((x, y) => x - y);

/**
 * A maximal matching: scan the edges in `order` (default: smallest edge index first) and keep an edge when neither of
 * its endpoints is taken yet. Maximal, not maximum, so the result depends on the order: on the path 0-1-2-3 the
 * default scan picks (0,1) and (2,3), while starting with the middle edge picks (1,2) alone.
 */
export function maximalMatching(edges: readonly Edge[], order?: readonly number[]): Matching {
  const taken = new Set<number>();
  const chosen: number[] = [];
  for (const i of order ?? edges.map((_, k) => k)) {
    const [a, b] = edges[i];
    if (taken.has(a) || taken.has(b)) continue;
    taken.add(a);
    taken.add(b);
    chosen.push(i);
  }
  return { edges: chosen, vertices: endpoints(edges, chosen) };
}

/** The matched endpoints of a chosen set of edges (the 2-approximate cover when the set is a maximal matching). */
export const matchedVertices = (edges: readonly Edge[], chosen: readonly number[]): number[] => endpoints(edges, chosen);

/** Whether edge `edge` can join the matching: ok, or the first vertex it shares with a chosen edge (for "vertex 0 is already matched"). */
export function canAddToMatching(edges: readonly Edge[], chosen: readonly number[], edge: number): { ok: true } | { ok: false; vertex: number } {
  const taken = new Set(endpoints(edges, chosen));
  const shared = edges[edge].find((v) => taken.has(v));
  return shared === undefined ? { ok: true } : { ok: false, vertex: shared };
}

/** Whether the chosen edges share no vertex and no unchosen edge could still be added. */
export function isMaximalMatching(edges: readonly Edge[], chosen: readonly number[]): boolean {
  const taken = new Set<number>();
  for (const i of chosen) {
    if (edges[i].some((v) => taken.has(v))) return false;
    for (const v of edges[i]) taken.add(v);
  }
  return edges.every(([a, b]) => taken.has(a) || taken.has(b));
}
