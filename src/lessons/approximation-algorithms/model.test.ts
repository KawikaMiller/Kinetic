import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { distanceMatrix, randomPoints, type Point } from '../../core/tsp';
import { maximalMatching, type Edge } from '../../core/vertexCover';

/** K3,3 by hand: vertices 0 to 2 on the left, 3 to 5 on the right, edges in the order the lesson lists them. */
const K33_EDGES: readonly Edge[] = [[0, 3], [0, 4], [0, 5], [1, 3], [1, 4], [1, 5], [2, 3], [2, 4], [2, 5]];
import { ONE_ENDPOINT_WITNESS, VC_PRESETS, coverResult, finishMatching, presetGraph, toggleMatchingEdge } from './vc';
import { ADVERSARY_SEED, ADVERSARY_STEPS, ADVERSARY_UNIT, M7, PLANE, adversary, edgesOf, toursOf } from './tours';
import { CENTRE_LEG, CHEAP_PAIR, DETOUR, STAR_M, clampM, starBanner, starFacts, starMatrix } from './star';

// Independent oracles, written here and not taken from the kit.

/** The size of a minimum vertex cover of n vertices, by trying all 2^n subsets. */
function bruteMinCover(n: number, edges: readonly Edge[]): number {
  let best = n;
  for (let s = 0; s < 2 ** n; s++) {
    if (edges.every(([a, b]) => ((s >> a) & 1) === 1 || ((s >> b) & 1) === 1)) {
      let size = 0;
      for (let i = 0; i < n; i++) size += (s >> i) & 1;
      best = Math.min(best, size);
    }
  }
  return best;
}

const euclid = (a: Point, b: Point) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
const tourCost = (pts: readonly Point[], tour: readonly number[]) => tour.reduce((sum, v, i) => sum + euclid(pts[v], pts[tour[(i + 1) % tour.length]]), 0);

/** The best closed tour through all points by trying every order that starts at point 0. */
function bruteOptimum(pts: readonly Point[]): number {
  const rest = pts.map((_, i) => i).slice(1);
  let best = Infinity;
  const permute = (prefix: number[], left: number[]) => {
    if (left.length === 0) {
      best = Math.min(best, tourCost(pts, [0, ...prefix]));
      return;
    }
    left.forEach((v, i) => permute([...prefix, v], [...left.slice(0, i), ...left.slice(i + 1)]));
  };
  permute([], rest);
  return best;
}

/** Kruskal with a tiny union-find: the spanning tree weight, as a check on Prim. */
function kruskal(pts: readonly Point[]): number {
  const parent = pts.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const all: { a: number; b: number; w: number }[] = [];
  for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) all.push({ a, b, w: euclid(pts[a], pts[b]) });
  all.sort((x, y) => x.w - y.w);
  let total = 0;
  for (const { a, b, w } of all) {
    if (find(a) !== find(b)) {
      parent[find(a)] = find(b);
      total += w;
    }
  }
  return total;
}

describe('vertex cover by maximal matching, by hand', () => {
  const k33 = presetGraph('k33');
  const path4 = presetGraph('path4');

  it('K3,3: clicking (0,3), (1,4), (2,5) is maximal; the cover is all 6 vertices against an optimum of 3, a ratio of exactly 2', () => {
    let matching: number[] = [];
    for (const [a, b] of [[0, 3], [1, 4], [2, 5]]) {
      const i = k33.edges.findIndex((e) => e[0] === a && e[1] === b);
      const move = toggleMatchingEdge(k33.edges, matching, i);
      expect(move.ok).toBe(true);
      if (move.ok) matching = move.matching;
    }
    expect(finishMatching(k33.edges, matching)).toEqual({ ok: true });
    const r = coverResult(6, k33.edges, matching, 'both');
    expect(r.cover).toEqual([0, 1, 2, 3, 4, 5]);
    expect(r.optimum.size).toBe(3);
    expect(bruteMinCover(6, K33_EDGES)).toBe(3);
    expect(r.ratio).toBe(2);
    expect(r.valid).toBe(true);
  });

  it('the path 0-1-2-3: matching {(0,1),(2,3)} costs 4 against 2 (ratio 2) and {(1,2)} is maximal with cover 2 (ratio 1)', () => {
    const wide = coverResult(4, path4.edges, [0, 2], 'both');
    expect(wide.cover.length).toBe(4);
    expect(bruteMinCover(4, path4.edges)).toBe(2);
    expect(wide.ratio).toBe(2);
    expect(finishMatching(path4.edges, [1])).toEqual({ ok: true });
    expect(coverResult(4, path4.edges, [1], 'both').ratio).toBe(1);
  });

  it('the triangle: one matching edge, cover 2, optimum 2', () => {
    const t = presetGraph('triangle');
    expect(finishMatching(t.edges, [0]).ok).toBe(true);
    const r = coverResult(3, t.edges, [0], 'both');
    expect([r.cover.length, r.optimum.size, bruteMinCover(3, t.edges)]).toEqual([2, 2, 2]);
  });

  it('manipulation 1: picking (0,4) after (0,3) is refused because vertex 0 is already matched', () => {
    const i03 = 0;
    const i04 = 1;
    expect(K33_EDGES[i04]).toEqual([0, 4]);
    const first = toggleMatchingEdge(k33.edges, [], i03);
    expect(first).toEqual({ ok: true, matching: [i03] });
    const refused = toggleMatchingEdge(k33.edges, [i03], i04);
    expect(refused).toEqual({
      ok: false,
      text: 'Edge (0, 4) shares vertex 0 with a matching edge you already picked. A matching may not reuse a vertex, which is exactly why its edges are disjoint.',
    });
    expect(toggleMatchingEdge(k33.edges, [i03], i03)).toEqual({ ok: true, matching: [] });
  });

  it('manipulation 2: Done before the matching is maximal names an edge whose endpoints are both free', () => {
    const i03 = 0;
    const i24 = 7;
    expect(K33_EDGES[i24]).toEqual([2, 4]);
    const r = finishMatching(k33.edges, [i03, i24]);
    expect(r).toEqual({ ok: false, text: 'Not maximal yet: edge (1, 5) still has both endpoints free, so it could be added.' });
    expect(finishMatching(k33.edges, []).ok).toBe(false);
  });
});

describe('the one-endpoint broken variant', () => {
  const W = ONE_ENDPOINT_WITNESS;

  it('the named witness leaves an edge uncovered, and the correct rule covers it', () => {
    const broken = coverResult(W.n, W.edges, W.matching, 'one');
    expect(broken.valid).toBe(false);
    expect(broken.cover).toEqual([...W.kept]);
    expect(broken.uncovered).toEqual([...W.uncovered]);
    expect(coverResult(W.n, W.edges, W.matching, 'both').valid).toBe(true);
  });

  it('it is the shortest witness: every graph on 3 vertices with at most 1 edge, and every graph on 2, is covered by one endpoint per matching edge', () => {
    for (let n = 1; n <= 3; n++) {
      const pairs: Edge[] = [];
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) pairs.push([a, b]);
      for (let mask = 0; mask < 2 ** pairs.length; mask++) {
        const edges = pairs.filter((_, i) => ((mask >> i) & 1) === 1);
        if (edges.length > 1) continue;
        const matching = maximalMatching(edges).edges;
        expect(coverResult(n, edges, matching, 'one').valid, `n=${n} mask=${mask}`).toBe(true);
      }
    }
  });

  it('on 200 seeded graphs of 7 vertices (edge probability 0.4) the fixed rule is a cover every time and the broken one fails on most', () => {
    const rnd = mulberry32(2026);
    let broken = 0;
    let graphs = 0;
    while (graphs < 200) {
      const edges: Edge[] = [];
      for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) if (rnd() < 0.4) edges.push([a, b]);
      if (edges.length === 0) continue;
      graphs++;
      const matching = maximalMatching(edges).edges;
      expect(coverResult(7, edges, matching, 'both').valid).toBe(true);
      if (!coverResult(7, edges, matching, 'one').valid) broken++;
    }
    expect(broken).toBe(BROKEN_OF_200);
    expect(broken / 200).toBeGreaterThan(0.9);
  });

  it('the 2-approximation bound holds on 1,000 seeded graphs against a bitmask optimum', () => {
    const rnd = mulberry32(99);
    let ratioTwo = 0;
    for (let g = 0; g < 1000; g++) {
      const n = 3 + Math.floor(rnd() * 6);
      const edges: Edge[] = [];
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (rnd() < 0.4) edges.push([a, b]);
      if (edges.length === 0) continue;
      const matching = maximalMatching(edges).edges;
      const cover = coverResult(n, edges, matching, 'both');
      const opt = bruteMinCover(n, edges);
      expect(cover.optimum.size).toBe(opt);
      expect(cover.cover.length).toBeLessThanOrEqual(2 * opt);
      if (cover.cover.length === 2 * opt) ratioTwo++;
    }
    expect(ratioTwo).toBeGreaterThan(0);
  });
});

describe('metric TSP on the 7-point map M7, by hand', () => {
  const t = toursOf(M7);

  it('the spanning tree weighs 20.8972 (Kruskal agrees) and its edges are the six listed', () => {
    expect(kruskal(M7)).toBeCloseTo(20.8972, 3);
    expect(t.mst.weight).toBeCloseTo(20.8972, 3);
    const key = (e: readonly [number, number]) => `${Math.min(...e)}-${Math.max(...e)}`;
    expect(t.mst.edges.map(key).sort()).toEqual(['0-6', '1-2', '1-4', '2-3', '2-6', '4-5']);
  });

  it('doubling visits 0 6 2 1 4 5 3 for 35.3858, within 2 x 20.8972 = 41.7944', () => {
    expect(t.doubling.tour).toEqual([0, 6, 2, 1, 4, 5, 3]);
    expect(tourCost(M7, [0, 6, 2, 1, 4, 5, 3])).toBeCloseTo(35.3858, 3);
    expect(t.doubling.length).toBeCloseTo(35.3858, 3);
    expect(t.doubling.length).toBeLessThanOrEqual(2 * 20.8972);
  });

  it('the odd-degree vertices are 0, 2, 3, 5 and the best pairing is (0,5) + (2,3) = 9.2114 (the others cost 14.4944 and more)', () => {
    const degree = new Array<number>(7).fill(0);
    for (const [a, b] of t.mst.edges) {
      degree[a]++;
      degree[b]++;
    }
    expect(degree.flatMap((d, v) => (d % 2 === 1 ? [v] : []))).toEqual([0, 2, 3, 5]);
    const d = (a: number, b: number) => euclid(M7[a], M7[b]);
    const pairings = [d(0, 5) + d(2, 3), d(0, 2) + d(3, 5), d(0, 3) + d(2, 5)];
    expect(Math.min(...pairings)).toBeCloseTo(9.2114, 3);
    expect(pairings[1]).toBeCloseTo(14.4944, 3);
    expect(t.christofides.matching.weight).toBeCloseTo(Math.min(...pairings), 9);
  });

  it('Christofides gives the tour 0 5 4 1 2 3 6 for 29.2517, at most tree + matching = 30.1086', () => {
    expect(t.christofides.tour).toEqual([0, 5, 4, 1, 2, 3, 6]);
    expect(tourCost(M7, [0, 5, 4, 1, 2, 3, 6])).toBeCloseTo(29.2517, 3);
    expect(t.christofides.length).toBeLessThanOrEqual(20.8972 + 9.2114 + 1e-3);
  });

  it('the optimum is 26.7612 by trying all 720 orders, the ratios are 1.3223 and 1.0931, and the tree is below the optimum', () => {
    expect(bruteOptimum(M7)).toBeCloseTo(26.7612, 3);
    expect(t.optimum.length).toBeCloseTo(26.7612, 3);
    expect(t.ratioDoubling).toBeCloseTo(1.3223, 3);
    expect(t.ratioChristofides).toBeCloseTo(1.0931, 3);
    expect(t.mst.weight).toBeLessThan(t.optimum.length);
    expect(edgesOf(t, 'optimum')).toHaveLength(7);
    expect(edgesOf(t, 'mst')).toHaveLength(6);
  });

  it('on 1,000 seeded maps (5 to 10 points) the proved ceilings hold: doubling 2, Christofides 1.5, tree no more than the optimum', () => {
    const rnd = mulberry32(31);
    let worstDoubling = 0;
    let worstChristofides = 0;
    for (let i = 0; i < 1000; i++) {
      const n = 5 + Math.floor(rnd() * 6);
      const pts = randomPoints(rnd, n, PLANE);
      const x = toursOf(pts);
      expect(x.doubling.length).toBeLessThanOrEqual(2 * x.optimum.length + 1e-9);
      expect(x.christofides.length).toBeLessThanOrEqual(1.5 * x.optimum.length + 1e-9);
      expect(x.mst.weight).toBeLessThanOrEqual(x.optimum.length + 1e-9);
      expect([...x.doubling.tour].sort((a, b) => a - b)).toEqual(pts.map((_, k) => k));
      if (n <= 8 && i < 150) expect(x.optimum.length).toBeCloseTo(bruteOptimum(pts), 6);
      worstDoubling = Math.max(worstDoubling, x.ratioDoubling);
      worstChristofides = Math.max(worstChristofides, x.ratioChristofides);
      expect(distanceMatrix(pts)[0][0]).toBe(0);
    }
    expect(worstDoubling).toBeGreaterThan(1);
    expect(worstChristofides).toBeGreaterThan(1);
  }, 120_000);

  it('the adversary is deterministic for a seed, never worse than where it started, and stays within the bound of 2', () => {
    const a = adversary(M7, ADVERSARY_SEED);
    expect(adversary(M7, ADVERSARY_SEED)).toEqual(a);
    expect(a.bestRatio).toBeGreaterThanOrEqual(a.startRatio);
    expect(a.bestRatio).toBeLessThanOrEqual(2);
    expect(toursOf(a.points).ratioDoubling).toBeCloseTo(a.bestRatio, 9);
    for (const [i, p] of a.points.entries()) {
      expect(Math.abs(p.x - M7[i].x)).toBeLessThanOrEqual(ADVERSARY_STEPS * ADVERSARY_UNIT);
      expect(p.x >= 0 && p.x <= PLANE && p.y >= 0 && p.y <= PLANE).toBe(true);
    }
    expect(adversary(M7, ADVERSARY_SEED + 1)).not.toEqual(a);
  });
});

describe('the non-metric star, by hand', () => {
  const ratio = (m: number) => starFacts(m).ratio;

  it('the tree weighs 4, the optimum 6.5 and MST doubling 3.5 + 2M, so the ratio is (3.5 + 2M) / 6.5', () => {
    for (const m of [1.5, 2, 4.75, 10, 100, 200]) {
      const f = starFacts(m);
      expect(f.mstWeight).toBe(4);
      expect(f.optimumLength).toBeCloseTo(6.5, 12);
      expect(f.doublingLength).toBeCloseTo(3.5 + 2 * m, 12);
      expect(f.ratio).toBeCloseTo((3.5 + 2 * m) / 6.5, 12);
    }
    // by the spec's arithmetic: 7.5 / 6.5, 13 / 6.5, 203.5 / 6.5
    expect(ratio(1.5)).toBeCloseTo(1, 3);
    expect(ratio(2)).toBeCloseTo(1.154, 3);
    expect(ratio(4.75)).toBeCloseTo(2, 3);
    expect(ratio(10)).toBeCloseTo(3.615, 3);
    expect(ratio(100)).toBeCloseTo(31.31, 2);
  });

  it('the optimum of 6.5 is two centre legs and three cheap pairs, by trying every order of the 5 vertices', () => {
    const d = starMatrix(2);
    let best = Infinity;
    const permute = (prefix: number[], left: number[]) => {
      if (left.length === 0) {
        const tour = [0, ...prefix];
        best = Math.min(best, tour.reduce((s, v, i) => s + d[v][tour[(i + 1) % 5]], 0));
        return;
      }
      left.forEach((v, i) => permute([...prefix, v], [...left.slice(0, i), ...left.slice(i + 1)]));
    };
    permute([], [1, 2, 3, 4]);
    expect(best).toBe(2 * CENTRE_LEG + 3 * CHEAP_PAIR);
  });

  it('manipulation 3: M above the detour of 2 voids the guarantee, with the exact banner text; at 2 there is no banner', () => {
    expect(DETOUR).toBe(2);
    expect(starBanner(starFacts(2))).toBeNull();
    expect(starBanner(starFacts(1.5))).toBeNull();
    expect(starBanner(starFacts(100))).toBe(
      'The guarantee no longer applies: d(L1, L2) = 100 exceeds the detour d(L1, O) + d(O, L2) = 2, so shortcutting can lengthen the tour. Ratio here: 31.3.',
    );
    expect(starBanner(starFacts(2.25))).toContain('d(L1, L2) = 2.25 exceeds the detour');
  });

  it('the guarantee is a proved ceiling only on metric inputs: past the detour the ratio exceeds 2 (the planted non-metric case)', () => {
    expect(ratio(100)).toBeGreaterThan(2);
    for (let m = STAR_M.min; m <= DETOUR; m += STAR_M.step) expect(ratio(m)).toBeLessThanOrEqual(2);
    expect(starFacts(2.25).violates).toBe(true);
  });

  it('the slider is clamped to 1.5 to 200 on steps of 0.25: one step past either end lands on the end', () => {
    expect(clampM(1.25)).toBe(1.5);
    expect(clampM(200.25)).toBe(200);
    expect(clampM(2.1)).toBe(2);
    expect(clampM(-5)).toBe(1.5);
  });

  it('every preset graph fits the editor limits', () => {
    for (const p of VC_PRESETS) {
      expect(p.graph.names.length).toBeLessThanOrEqual(8);
      expect(p.graph.edges.length).toBeLessThanOrEqual(12);
      expect(p.graph.at).toHaveLength(p.graph.names.length);
    }
  });
});

/** How many of those 200 seeded graphs the one-endpoint rule leaves an edge uncovered on (found by running the loop above; over 90%, so the page shows a witness instead). */
const BROKEN_OF_200 = 192;
