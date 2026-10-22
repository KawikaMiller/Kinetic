import { describe, expect, it } from 'vitest';
import { mulberry32 } from './random';
import { bruteForce } from './sat';
import {
  canAddToMatching, isMaximalMatching, isVertexCover, matchedVertices, maximalMatching, MAX_EXACT_VERTICES, minVertexCover, uncoveredEdges, type Edge,
} from './vertexCover';

/** The oracle, written separately: try every vertex subset as a bitmask and keep the smallest that touches every edge. */
function bruteMinimum(n: number, edges: readonly Edge[]): number {
  let best = n;
  for (let mask = 0; mask < 1 << n; mask++) {
    const size = popcount(mask);
    if (size >= best) continue;
    if (edges.every(([a, b]) => (mask >> a) & 1 || (mask >> b) & 1)) best = size;
  }
  return best;
}
const popcount = (x: number): number => {
  let c = 0;
  for (let v = x; v; v &= v - 1) c++;
  return c;
};

/** Every graph on n labelled vertices: each subset of the n(n-1)/2 possible edges. */
function* allGraphs(n: number): Generator<Edge[]> {
  const pairs: Edge[] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) pairs.push([a, b]);
  for (let mask = 0; mask < 1 << pairs.length; mask++) yield pairs.filter((_, i) => (mask >> i) & 1);
}

const K33: Edge[] = [[0, 3], [0, 4], [0, 5], [1, 3], [1, 4], [1, 5], [2, 3], [2, 4], [2, 5]];
const PATH4: Edge[] = [[0, 1], [1, 2], [2, 3]];
const TRIANGLE: Edge[] = [[0, 1], [1, 2], [0, 2]];
const STAR: Edge[] = [[0, 1], [0, 2], [0, 3], [0, 4]];

function checkOne(n: number, edges: Edge[], label: string): void {
  const opt = bruteMinimum(n, edges);
  const exact = minVertexCover(n, edges);
  expect(exact.size, label).toBe(opt);
  expect(exact.cover, label).toHaveLength(opt);
  expect(isVertexCover(edges, exact.cover), label).toBe(true);
  const m = maximalMatching(edges);
  expect(isMaximalMatching(edges, m.edges), label).toBe(true);
  expect(m.vertices, label).toHaveLength(2 * m.edges.length);
  expect(isVertexCover(edges, m.vertices), label).toBe(true);
  expect(m.vertices.length, label).toBeLessThanOrEqual(2 * opt);
  expect(m.vertices.length, label).toBeGreaterThanOrEqual(opt);
}

describe('against brute force', () => {
  it('matches the optimum, and holds the 2-approximation bound, on EVERY graph with up to 6 vertices (32,768 on 6 alone)', () => {
    let graphs = 0;
    for (let n = 0; n <= 6; n++) {
      for (const edges of allGraphs(n)) {
        checkOne(n, edges, `n=${n} edges=${JSON.stringify(edges)}`);
        graphs++;
      }
    }
    expect(graphs).toBe(1 + 1 + 2 + 8 + 64 + 1024 + 32768);
  });

  it('matches on 500 seeded graphs of 7 to 11 vertices with edge probability 0.2 to 0.7', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const rnd = mulberry32(seed);
      const n = 7 + (seed % 5);
      const p = 0.2 + 0.5 * rnd();
      const edges: Edge[] = [];
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (rnd() < p) edges.push([a, b]);
      checkOne(n, edges, `seed ${seed}`);
    }
  });

  it('the bound is tight: on 1,000 seeded graphs the ratio reaches 2 somewhere but never passes it', () => {
    let worst = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const rnd = mulberry32(seed);
      const n = 4 + (seed % 5);
      const edges: Edge[] = [];
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (rnd() < 0.4) edges.push([a, b]);
      if (edges.length === 0) continue;
      worst = Math.max(worst, maximalMatching(edges).vertices.length / minVertexCover(n, edges).size);
    }
    expect(worst).toBe(2);
  });
});

describe('the approximation-algorithms spec fixtures', () => {
  it('K3,3: matching (0,3), (1,4), (2,5) gives a cover of 6 against the optimum 3 = {0, 1, 2}, ratio exactly 2', () => {
    const m = maximalMatching(K33);
    expect(m.edges.map((i) => K33[i])).toEqual([[0, 3], [1, 4], [2, 5]]);
    expect(m.vertices).toEqual([0, 1, 2, 3, 4, 5]);
    expect(minVertexCover(6, K33)).toEqual({ size: 3, cover: [0, 1, 2] });
  });

  it('path 0-1-2-3: the default order gives cover 4 against 2 (ratio 2); starting at the middle edge gives cover 2 (ratio 1)', () => {
    expect(maximalMatching(PATH4)).toEqual({ edges: [0, 2], vertices: [0, 1, 2, 3] });
    expect(maximalMatching(PATH4, [1, 0, 2])).toEqual({ edges: [1], vertices: [1, 2] });
    expect(minVertexCover(4, PATH4).size).toBe(2);
  });

  it('triangle: one matching edge, cover 2, optimum 2; star: one matching edge, cover 2, optimum 1 (the centre)', () => {
    expect(maximalMatching(TRIANGLE).vertices).toEqual([0, 1]);
    expect(minVertexCover(3, TRIANGLE).size).toBe(2);
    expect(maximalMatching(STAR)).toEqual({ edges: [0], vertices: [0, 1] });
    expect(minVertexCover(5, STAR)).toEqual({ size: 1, cover: [0] });
  });

  it('the broken one-endpoint variant leaves an edge uncovered: on the triangle, matching edge (a, b) = (0, 1) keeping only 0 misses (1, 2)', () => {
    const matching = maximalMatching(TRIANGLE);
    const oneEndpoint = matching.edges.map((i) => TRIANGLE[i][0]);
    expect(oneEndpoint).toEqual([0]);
    expect(uncoveredEdges(TRIANGLE, oneEndpoint)).toEqual([1]);
    expect(isVertexCover(TRIANGLE, oneEndpoint)).toBe(false);
  });
});

describe('building a matching edge by edge', () => {
  it('refuses an edge that shares a matched vertex and names the vertex ("(0,4): vertex 0 is already matched")', () => {
    expect(canAddToMatching(K33, [0], 1)).toEqual({ ok: false, vertex: 0 });
    expect(canAddToMatching(K33, [0], 4)).toEqual({ ok: true });
    expect(canAddToMatching(K33, [], 0)).toEqual({ ok: true });
  });

  it('is maximal only when no unchosen edge could be added, and rejects two edges that share a vertex', () => {
    expect(isMaximalMatching(K33, [0, 4, 8])).toBe(true);
    expect(isMaximalMatching(K33, [0, 4])).toBe(false);
    expect(isMaximalMatching(K33, [0, 1])).toBe(false);
    expect(isMaximalMatching([], [])).toBe(true);
    expect(matchedVertices(K33, [0, 4])).toEqual([0, 1, 3, 4]);
  });
});

describe('the reduction target at np-reductions size', () => {
  it('on the 3-SAT gadget graph (2n + 3m vertices) the minimum cover is at most K = n + 2m exactly when the formula is satisfiable, 100 seeded formulas of 2 variables and 3 to 7 clauses', () => {
    let satisfiable = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const rnd = mulberry32(seed);
      const n = 2;
      const m = 3 + (seed % 5);
      // Each clause is falsified by exactly one of the 4 assignments (the third literal repeats the first), so the formula is
      // unsatisfiable exactly when every assignment got killed.
      const clauses = Array.from({ length: m }, () => {
        const kill = Math.floor(rnd() * 4);
        const lits = [kill & 1 ? -1 : 1, kill & 2 ? -2 : 2];
        return [...lits, lits[0]];
      });
      const cnf = { vars: n, clauses };
      const edges: Edge[] = [];
      for (let v = 0; v < n; v++) edges.push([2 * v, 2 * v + 1]);
      cnf.clauses.forEach((clause, j) => {
        const base = 2 * n + 3 * j;
        edges.push([base, base + 1], [base + 1, base + 2], [base, base + 2]);
        clause.forEach((lit, k) => edges.push([base + k, 2 * (Math.abs(lit) - 1) + (lit > 0 ? 0 : 1)]));
      });
      const vertices = 2 * n + 3 * m;
      const min = minVertexCover(vertices, edges).size;
      const sat = bruteForce(cnf).satisfiable;
      expect(min <= n + 2 * m, `seed ${seed}`).toBe(sat);
      expect(min, `seed ${seed}`).toBeGreaterThanOrEqual(n + 2 * m);
      if (sat) satisfiable++;
    }
    expect(satisfiable).toBeGreaterThan(10);
    expect(100 - satisfiable).toBeGreaterThan(5);
  });
});

describe('refusals', () => {
  it('rejects loops, out-of-range vertices and graphs over the exact limit', () => {
    expect(() => minVertexCover(3, [[1, 1]])).toThrow(/loop/);
    expect(() => minVertexCover(3, [[0, 3]])).toThrow(/not between vertices 0 and 2/);
    expect(() => minVertexCover(MAX_EXACT_VERTICES + 1, [])).toThrow(/limited to 30 vertices/);
    expect(minVertexCover(0, [])).toEqual({ size: 0, cover: [] });
    expect(minVertexCover(MAX_EXACT_VERTICES, [[0, 1]]).size).toBe(1);
  });
});
