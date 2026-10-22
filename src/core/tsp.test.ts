import { describe, expect, it } from 'vitest';
import { createDisjointSet } from './disjointSet';
import { mulberry32 } from './random';
import {
  christofidesTour, distanceMatrix, doubleTreeTour, eulerCircuit, heldKarp, MAX_HELD_KARP, MAX_MATCHING_VERTICES, minWeightPerfectMatching,
  primMst, randomPoints, shortcut, tourLength, twoOpt, twoOptStep, type DistMatrix, type Point,
} from './tsp';

/** The approximation-algorithms spec's 7-point map, every distance distinct. */
const M7: Point[] = [
  { x: 1.4, y: 7.2 }, { x: 10, y: 5 }, { x: 6.2, y: 3.2 }, { x: 8.8, y: 0.7 }, { x: 8.1, y: 8.6 }, { x: 6.8, y: 8.7 }, { x: 4.2, y: 2.4 },
];
const SQUARE: Point[] = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];

/** The spec's star: centre O = 0, leaves L1..L4 = 1..4; leaf pairs (1,3), (3,2), (2,4) cost 1.5, the other three cost `m`. */
function star(m: number): number[][] {
  const d = Array.from({ length: 5 }, () => new Array<number>(5).fill(0));
  const set = (a: number, b: number, w: number) => {
    d[a][b] = w;
    d[b][a] = w;
  };
  for (let leaf = 1; leaf <= 4; leaf++) set(0, leaf, 1);
  for (const [a, b] of [[1, 3], [3, 2], [2, 4]]) set(a, b, 1.5);
  for (const [a, b] of [[1, 2], [3, 4], [1, 4]]) set(a, b, m);
  return d;
}

/** Brute force: every permutation of the vertices after vertex 0. */
function bruteForceOptimum(dist: DistMatrix): number {
  const n = dist.length;
  if (n <= 1) return 0;
  let best = Infinity;
  const rest = Array.from({ length: n - 1 }, (_, i) => i + 1);
  const walk = (k: number) => {
    if (k === rest.length) {
      best = Math.min(best, tourLength(dist, [0, ...rest]));
      return;
    }
    for (let i = k; i < rest.length; i++) {
      [rest[k], rest[i]] = [rest[i], rest[k]];
      walk(k + 1);
      [rest[k], rest[i]] = [rest[i], rest[k]];
    }
  };
  walk(0);
  return best;
}

const isPermutation = (tour: readonly number[], n: number) => tour.length === n && new Set(tour).size === n && tour.every((v) => v >= 0 && v < n);
const close = (a: number, b: number, digits = 4) => expect(a).toBeCloseTo(b, digits);

describe('basics', () => {
  it('builds a symmetric Euclidean matrix with a zero diagonal, and measures a closed tour', () => {
    const d = distanceMatrix(SQUARE);
    expect(d[0][2]).toBeCloseTo(Math.sqrt(8), 12);
    expect(d[1][1]).toBe(0);
    expect(d[1][3]).toBe(d[3][1]);
    expect(tourLength(d, [0, 1, 2, 3])).toBe(8);
    expect(tourLength(d, [0])).toBe(0);
    expect(tourLength(d, [])).toBe(0);
  });

  it('draws the same seeded points twice, inside the box', () => {
    const a = randomPoints(mulberry32(3), 6, 50);
    expect(a).toEqual(randomPoints(mulberry32(3), 6, 50));
    for (const p of a) expect(p.x >= 0 && p.x < 50 && p.y >= 0 && p.y < 50).toBe(true);
  });
});

describe('minimum spanning tree', () => {
  it('M7: the six tree edges and the weight 20.8972 of the spec', () => {
    const mst = primMst(distanceMatrix(M7));
    const edges = mst.edges.map(([a, b]) => [Math.min(a, b), Math.max(a, b)].join('-')).sort();
    expect(edges).toEqual(['0-6', '1-2', '1-4', '2-3', '2-6', '4-5'].sort());
    close(mst.weight, 20.8972);
  });

  it('handles 0, 1 and 2 points', () => {
    expect(primMst([])).toEqual({ edges: [], weight: 0 });
    expect(primMst([[0]])).toEqual({ edges: [], weight: 0 });
    expect(primMst([[0, 5], [5, 0]])).toEqual({ edges: [[0, 1]], weight: 5 });
  });

  it('weighs the same as Kruskal (core/disjointSet) on 1,000 seeded maps, and spans every vertex', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const n = 2 + (seed % 11);
      const dist = distanceMatrix(randomPoints(mulberry32(seed), n));
      const all: [number, number, number][] = [];
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) all.push([dist[i][j], i, j]);
      all.sort((x, y) => x[0] - y[0]);
      const sets = createDisjointSet(n);
      let kruskal = 0;
      for (const [w, i, j] of all) if (sets.union(i, j)) kruskal += w;
      const mst = primMst(dist);
      expect(mst.weight, `seed ${seed}`).toBeCloseTo(kruskal, 9);
      expect(mst.edges).toHaveLength(n - 1);
      const check = createDisjointSet(n);
      for (const [a, b] of mst.edges) check.union(a, b);
      expect(check.count).toBe(1);
    }
  });
});

describe('Held-Karp', () => {
  it('equals brute force over all permutations for n up to 8, on 40 seeded maps each, and returns a tour that has that length', () => {
    for (let n = 1; n <= 8; n++) {
      for (let seed = 1; seed <= 40; seed++) {
        const dist = distanceMatrix(randomPoints(mulberry32(seed * 31 + n), n));
        const hk = heldKarp(dist);
        expect(hk.length, `n=${n} seed=${seed}`).toBeCloseTo(bruteForceOptimum(dist), 9);
        expect(isPermutation(hk.tour, n)).toBe(true);
        expect(hk.tour[0] ?? 0).toBe(0);
        expect(tourLength(dist, hk.tour)).toBeCloseTo(hk.length, 9);
      }
    }
  });

  it('is exact on a non-Euclidean, asymmetric-looking matrix too (it only reads the matrix)', () => {
    const rnd = mulberry32(99);
    const n = 7;
    const dist = Array.from({ length: n }, () => Array.from({ length: n }, () => 1 + Math.floor(rnd() * 9)));
    expect(heldKarp(dist).length).toBeCloseTo(bruteForceOptimum(dist), 9);
  });

  it('M7: the optimum is 26.7612', () => {
    const hk = heldKarp(distanceMatrix(M7));
    close(hk.length, 26.7612);
  });

  it('handles the empty and single-point cases, and refuses n above the limit with the limit stated', () => {
    expect(heldKarp([])).toEqual({ length: 0, tour: [] });
    expect(heldKarp([[0]])).toEqual({ length: 0, tour: [0] });
    const twelve = distanceMatrix(randomPoints(mulberry32(5), MAX_HELD_KARP));
    expect(isPermutation(heldKarp(twelve).tour, MAX_HELD_KARP)).toBe(true);
    expect(() => heldKarp(distanceMatrix(randomPoints(mulberry32(5), MAX_HELD_KARP + 1)))).toThrow(/limited to 12 points; got 13/);
  });
});

describe('2-opt', () => {
  it('crossed square 0, 2, 1, 3: 9.6569 becomes 8 in one move of delta -1.6569', () => {
    const d = distanceMatrix(SQUARE);
    const crossed = [0, 2, 1, 3];
    close(tourLength(d, crossed), 9.6569);
    const move = twoOptStep(d, crossed)!;
    expect(move).toMatchObject({ i: 0, j: 2, tour: [0, 1, 2, 3] });
    close(move.delta, -1.6569);
    const run = twoOpt(d, crossed);
    expect(run.moves).toHaveLength(1);
    expect(run.length).toBe(8);
  });

  it('stops at a local minimum: no reversal of any segment shortens the tour (checked by recomputing every neighbour tour)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const n = 6 + (seed % 7);
      const rnd = mulberry32(seed);
      const dist = distanceMatrix(randomPoints(rnd, n));
      const start = Array.from({ length: n }, (_, i) => i).sort(() => rnd() - 0.5);
      const run = twoOpt(dist, start);
      expect(isPermutation(run.tour, n)).toBe(true);
      expect(run.length).toBeLessThanOrEqual(tourLength(dist, start) + 1e-9);
      for (let i = 0; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
          const neighbour = [...run.tour.slice(0, i), ...run.tour.slice(i, j + 1).reverse(), ...run.tour.slice(j + 1)];
          expect(tourLength(dist, neighbour), `seed ${seed} reverse ${i}..${j}`).toBeGreaterThanOrEqual(run.length - 1e-7);
        }
      }
      expect(run.length).toBeGreaterThanOrEqual(heldKarp(dist).length - 1e-9);
    }
  });

  it('every move is an improving step whose delta is the real change in length, so the deltas add up', () => {
    const rnd = mulberry32(8);
    const dist = distanceMatrix(randomPoints(rnd, 10));
    const start = [0, 5, 2, 9, 1, 7, 3, 8, 4, 6];
    const run = twoOpt(dist, start);
    let before = tourLength(dist, start);
    for (const m of run.moves) {
      expect(m.delta).toBeLessThan(0);
      expect(tourLength(dist, m.tour) - before).toBeCloseTo(m.delta, 9);
      before = tourLength(dist, m.tour);
    }
    expect(run.length).toBeCloseTo(before, 12);
    expect(run.moves.length).toBeGreaterThan(0);
  });

  it('maxMoves stops early, a good tour has no move, and tiny tours have none', () => {
    const d = distanceMatrix(SQUARE);
    expect(twoOpt(d, [0, 2, 1, 3], { maxMoves: 0 }).tour).toEqual([0, 2, 1, 3]);
    expect(twoOptStep(d, [0, 1, 2, 3])).toBeNull();
    expect(twoOptStep(d, [0, 1, 2])).toBeNull();
    expect(twoOptStep(d, [])).toBeNull();
  });
});

describe('tours from the spanning tree, M7 hand-worked in the spec', () => {
  const dist = distanceMatrix(M7);

  it('doubling visits 0 6 2 1 4 5 3 (preorder, children in index order): 35.3858, at most twice the tree', () => {
    const t = doubleTreeTour(dist);
    expect(t.tour).toEqual([0, 6, 2, 1, 4, 5, 3]);
    close(t.length, 35.3858);
    expect(t.length).toBeLessThanOrEqual(2 * t.mst.weight);
  });

  it('Christofides: odd vertices {0,2,3,5}, matching (0,5)+(2,3) = 9.2114, circuit 0 5 4 1 2 3 2 6 0, tour 0 5 4 1 2 3 6 = 29.2517', () => {
    const c = christofidesTour(dist);
    expect(c.odd).toEqual([0, 2, 3, 5]);
    expect(c.matching.pairs).toEqual([[0, 5], [2, 3]]);
    close(c.matching.weight, 9.2114);
    expect(c.circuit).toEqual([0, 5, 4, 1, 2, 3, 2, 6, 0]);
    expect(c.tour).toEqual([0, 5, 4, 1, 2, 3, 6]);
    close(c.length, 29.2517);
    expect(c.length).toBeLessThanOrEqual(c.mst.weight + c.matching.weight + 1e-9);
  });

  it('the other pairings cost more, the optimum is 26.7612, and the ratios are 1.3223 and 1.0931 (the tree is below the optimum)', () => {
    close(dist[0][2] + dist[3][5], 14.4944);
    const opt = heldKarp(dist).length;
    close(opt, 26.7612);
    close(doubleTreeTour(dist).length / opt, 1.3223);
    close(christofidesTour(dist).length / opt, 1.0931);
    expect(primMst(dist).weight).toBeLessThan(opt);
  });
});

describe('minimum-weight perfect matching', () => {
  /** Every pairing, by recursion: the oracle. */
  function bestPairing(dist: DistMatrix, vs: number[]): number {
    if (vs.length === 0) return 0;
    const [first, ...rest] = vs;
    return Math.min(...rest.map((other, i) => dist[first][other] + bestPairing(dist, rest.filter((_, k) => k !== i))));
  }

  it('equals the best of all pairings for 2, 4, 6 and 8 vertices on 50 seeded matrices each, and the pairs cover each vertex once', () => {
    for (const k of [2, 4, 6, 8]) {
      for (let seed = 1; seed <= 50; seed++) {
        const dist = distanceMatrix(randomPoints(mulberry32(seed * 7 + k), 10));
        const vs = Array.from({ length: k }, (_, i) => (i * 3 + seed) % 10).filter((v, i, a) => a.indexOf(v) === i);
        if (vs.length !== k) continue;
        const m = minWeightPerfectMatching(dist, vs);
        expect(m.weight).toBeCloseTo(bestPairing(dist, vs), 9);
        expect(m.pairs.flat().sort()).toEqual([...vs].sort());
        expect(m.pairs.reduce((s, [a, b]) => s + dist[a][b], 0)).toBeCloseTo(m.weight, 9);
      }
    }
  });

  it('is empty for no vertices and refuses an odd count or more than 12', () => {
    expect(minWeightPerfectMatching([], [])).toEqual({ pairs: [], weight: 0 });
    expect(() => minWeightPerfectMatching(distanceMatrix(M7), [0, 1, 2])).toThrow(/even number/);
    const big = distanceMatrix(randomPoints(mulberry32(1), 14));
    expect(() => minWeightPerfectMatching(big, Array.from({ length: MAX_MATCHING_VERTICES + 2 }, (_, i) => i))).toThrow(/limited to 12 vertices/);
    expect(minWeightPerfectMatching(big, Array.from({ length: MAX_MATCHING_VERTICES }, (_, i) => i)).pairs).toHaveLength(6);
  });
});

describe('Euler circuit tie-break (pinned: smallest vertex index first)', () => {
  it('takes the smaller neighbour first, so a triangle reads 0 1 2 0, not 0 2 1 0', () => {
    expect(eulerCircuit(3, [[0, 1], [1, 2], [2, 0]])).toEqual([0, 1, 2, 0]);
    expect(eulerCircuit(3, [[2, 0], [1, 2], [0, 1]])).toEqual([0, 1, 2, 0]);
  });

  it('on a figure of eight it goes through the smaller loop first, then splices the other', () => {
    // Two triangles sharing vertex 0: 0-1-2 and 0-3-4.
    const circuit = eulerCircuit(5, [[0, 1], [1, 2], [2, 0], [0, 3], [3, 4], [4, 0]]);
    expect(circuit).toEqual([0, 1, 2, 0, 3, 4, 0]);
    expect(shortcut(circuit)).toEqual([0, 1, 2, 3, 4]);
  });

  it('uses every edge of a multigraph exactly once and ends where it started', () => {
    const edges: [number, number][] = [[0, 1], [0, 1], [1, 2], [2, 3], [3, 1]];
    const circuit = eulerCircuit(4, [...edges, [0, 2], [0, 2]]);
    expect(circuit[0]).toBe(0);
    expect(circuit.at(-1)).toBe(0);
    const used = circuit.slice(1).map((v, i) => [circuit[i], v].sort().join('-')).sort();
    const given = [...edges, [0, 2], [0, 2]].map((e) => [...e].sort().join('-')).sort();
    expect(used).toEqual(given);
  });
});

describe('gate: tour quality on 1,000 seeded Euclidean instances of 5 to 10 points', () => {
  it('doubling stays within 2x the optimum, Christofides within 1.5x, the tree below the optimum, every tour a permutation (a bound on these seeded maps, not a proof)', () => {
    let worstDouble = 0;
    let worstChristofides = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const n = 5 + (seed % 6);
      const dist = distanceMatrix(randomPoints(mulberry32(seed), n));
      const opt = heldKarp(dist).length;
      const mst = primMst(dist).weight;
      const dbl = doubleTreeTour(dist);
      const chr = christofidesTour(dist);
      expect(isPermutation(dbl.tour, n), `double seed ${seed}`).toBe(true);
      expect(isPermutation(chr.tour, n), `christofides seed ${seed}`).toBe(true);
      expect(mst).toBeLessThanOrEqual(opt + 1e-9);
      expect(dbl.length / opt, `double seed ${seed}`).toBeLessThanOrEqual(2);
      expect(chr.length / opt, `christofides seed ${seed}`).toBeLessThanOrEqual(1.5);
      expect(dbl.length).toBeGreaterThanOrEqual(opt - 1e-9);
      expect(chr.length).toBeGreaterThanOrEqual(opt - 1e-9);
      expect(chr.length).toBeLessThanOrEqual(mst + chr.matching.weight + 1e-9);
      expect(chr.circuit).toHaveLength(n - 1 + chr.matching.pairs.length + 1);
      worstDouble = Math.max(worstDouble, dbl.length / opt);
      worstChristofides = Math.max(worstChristofides, chr.length / opt);
    }
    // The bounds are not vacuous on this set: the heuristics are measurably worse than optimal somewhere.
    expect(worstDouble).toBeGreaterThan(1.2);
    expect(worstChristofides).toBeGreaterThan(1.1);
  });

  it('a planted non-metric instance exceeds the bound, so the test above can fail', () => {
    const d = star(100);
    expect(d[1][2] > d[1][0] + d[0][2]).toBe(true); // the triangle inequality is broken
    const opt = heldKarp(d).length;
    close(opt, 6.5);
    close(primMst(d).weight, 4);
    const dbl = doubleTreeTour(d);
    expect(dbl.tour).toEqual([0, 1, 2, 3, 4]);
    close(dbl.length, 203.5);
    close(dbl.length / opt, 31.3077);
    expect(dbl.length / opt).toBeGreaterThan(2);
  });
});

describe('the star of the spec as the matrix is bent: ratio (3.5 + 2M) / 6.5', () => {
  it.each([[1.5, 1.0], [2, 7.5 / 6.5], [4.75, 2], [10, 3.6154], [100, 31.3077]])('M = %s gives ratio %s', (m, ratio) => {
    const d = star(m);
    close(heldKarp(d).length, 6.5);
    close(doubleTreeTour(d).length / 6.5, ratio);
    close((3.5 + 2 * m) / 6.5, ratio);
  });
});
