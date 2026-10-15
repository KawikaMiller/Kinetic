import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { cosine, normalize } from '../../core/vec';
import { compareIndexes } from './compare';
import { CURSE_K, DIMS, concentrationRatio, curseRows, ivfRecallAt } from './concentration';
import { DEFAULT_K, DEFAULT_QUERY, DEFAULT_SEED, MAX_K, DOMAIN, POINTS_2D, bruteForce, clusteredPoints, dist, dragQuery, hits, missed, recallAt, seededQueries, uniformPoints, type Point } from './data';
import { DEFAULT_EF_CONSTRUCTION, DEFAULT_M, buildHnsw, reachableFromStart, searchHnsw } from './hnsw';
import { DEFAULT_NLIST, DEFAULT_NPROBE, buildIvf, searchIvf } from './ivf';
import { kmeans } from './kmeans';

const seeds = Array.from({ length: 10 }, (_, i) => i);

describe('exact search', () => {
  it('brute force equals a full sort by distance on 500 seeded sets, and costs one computation per point', () => {
    for (let s = 0; s < 500; s++) {
      const rnd = mulberry32(s);
      const n = 5 + Math.floor(rnd() * 60);
      const pts = uniformPoints(s, n, 2);
      const q = [rnd(), rnd()];
      const k = 1 + Math.floor(rnd() * MAX_K);
      const found = bruteForce(pts, q, k);
      const sorted = pts.map((p) => dist(p, q)).sort((a, b) => a - b).slice(0, Math.min(k, n));
      expect(found.neighbours.map((x) => x.d), `set ${s}`).toEqual(sorted);
      expect(found.computations).toBe(n);
    }
  });

  it('k above N is clamped, duplicates are kept and ranked by distance, and an empty set returns nothing', () => {
    const pts: Point[] = [[0, 0], [0, 0], [3, 4]];
    const f = bruteForce(pts, [0, 0], 10);
    expect(f.neighbours.map((x) => x.d)).toEqual([0, 0, 5]);
    expect(bruteForce([], [0, 0], 3).neighbours).toEqual([]);
  });

  it('recall is judged on distances, so a tie cannot fail it, and the missed neighbours are named', () => {
    const pts: Point[] = [[1, 0], [-1, 0], [0, 1], [5, 5]];
    const truth = bruteForce(pts, [0, 0], 2).neighbours;
    const other = [{ id: 1, d: 1 }, { id: 2, d: 1 }];
    expect(recallAt(truth, other)).toBe(1);
    expect(hits(truth, other)).toBe(2);
    expect(recallAt(truth, [{ id: 3, d: 7.07 }])).toBe(0);
    expect(missed(truth, [{ id: 3, d: 7.07 }]).length).toBe(2);
    expect(recallAt([], [])).toBe(1);
  });

  it('the identity |a - b|^2 = 2 - 2cos(a, b) holds for unit vectors on 1,000 random pairs, so Euclidean and cosine rank alike', () => {
    const rnd = mulberry32(3);
    for (let i = 0; i < 1_000; i++) {
      const a = normalize([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5])!;
      const b = normalize([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5])!;
      expect(dist(a, b) ** 2).toBeCloseTo(2 - 2 * cosine(a, b), 12);
    }
    const pts = clusteredPoints(DEFAULT_SEED).map((p) => normalize(p)!);
    for (const q of seededQueries(2, 30, 2, 1)) {
      const nq = normalize(q)!;
      const euclid = bruteForce(pts, nq, 5).neighbours.map((x) => x.d);
      const byCosine = pts.map((p, id) => ({ id, c: cosine(p, nq) })).sort((x, y) => y.c - x.c || x.id - y.id).slice(0, 5).map((x) => dist(pts[x.id], nq));
      euclid.forEach((d, i) => expect(byCosine[i]).toBeCloseTo(d, 9));
    }
  });

  it('on raw points, with lengths, cosine and Euclidean order differ for some queries (the broken-variant check)', () => {
    const pts = clusteredPoints(DEFAULT_SEED);
    let differ = 0;
    for (const q of seededQueries(5, 30, 2, 10)) {
      const byEuclid = bruteForce(pts, q, 5).neighbours.map((x) => x.id);
      const byCosine = pts.map((p, id) => ({ id, c: cosine(p, q) })).sort((x, y) => y.c - x.c || x.id - y.id).slice(0, 5).map((x) => x.id);
      if (byEuclid.join() !== byCosine.join()) differ++;
    }
    expect(differ).toBeGreaterThan(20);
  });

  it('the dataset is 400 points in 5 clusters inside the plot, the same for one seed', () => {
    const pts = clusteredPoints(DEFAULT_SEED);
    expect(pts).toHaveLength(POINTS_2D);
    expect(pts.every((p) => p.every((v) => v >= 0 && v <= 10))).toBe(true);
    expect(clusteredPoints(DEFAULT_SEED)).toEqual(pts);
    expect(clusteredPoints(DEFAULT_SEED + 1)).not.toEqual(pts);
  });
});

describe('dragging the query never changes what the other scenes search with', () => {
  const NUDGES: Point[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
  it('across unit mode on and off, every k, and every start and nudge direction, the stored query stays in the domain and keeps its length in unit mode', () => {
    const starts: Point[] = [DEFAULT_QUERY, [0.3, 9.7], [9.9, 0.2], [10, 10], [5, 5], [0, 4]];
    for (const unit of [false, true]) {
      for (let k = 1; k <= MAX_K; k++) {
        for (const start of starts) {
          for (const [dx, dy] of NUDGES) {
            let stored: Point = start;
            for (let step = 0; step < 40; step++) {
              const shown = unit ? (normalize(stored) ?? stored) : stored;
              const stepSize = unit ? 0.02 : 0.2;
              stored = dragQuery(stored, [shown[0] + dx * stepSize, shown[1] + dy * stepSize], unit);
              const id = `unit ${unit} k ${k} start ${start} nudge ${dx},${dy} step ${step}`;
              expect(Math.min(...stored), id).toBeGreaterThanOrEqual(0);
              expect(Math.max(...stored), id).toBeLessThanOrEqual(DOMAIN + 1e-9);
              if (unit && stored[0] + stored[1] > 0) {
                const length = Math.hypot(stored[0], stored[1]);
                const cap = Math.min(Math.hypot(start[0], start[1]), DOMAIN / Math.max(stored[0] / length, stored[1] / length));
                expect(length, id).toBeCloseTo(cap, 6);
              }
            }
          }
        }
      }
    }
  });

  it('the repro: five arrow-key steps in unit mode leave IVF scanning about what it did before, not the near-origin query that cut it to 49 points', () => {
    const points = clusteredPoints(DEFAULT_SEED);
    const ivf = buildIvf(points, DEFAULT_NLIST, DEFAULT_SEED);
    let stored: Point = DEFAULT_QUERY;
    for (let i = 0; i < 5; i++) {
      const shown = normalize(stored) ?? stored;
      stored = dragQuery(stored, [shown[0] - 0.02, shown[1]], true);
    }
    const before = searchIvf(ivf, DEFAULT_QUERY, DEFAULT_K, DEFAULT_NPROBE);
    const after = searchIvf(ivf, stored, DEFAULT_K, DEFAULT_NPROBE);
    expect(Math.hypot(stored[0], stored[1])).toBeCloseTo(Math.hypot(DEFAULT_QUERY[0], DEFAULT_QUERY[1]), 6);
    expect(Math.abs(after.computations - before.computations)).toBeLessThan(0.5 * before.computations);
  });

  it('as drawn, the handle is the query: a drag sets it directly, clamped to the domain', () => {
    expect(dragQuery(DEFAULT_QUERY, [3, 4], false)).toEqual([3, 4]);
    expect(dragQuery(DEFAULT_QUERY, [-2, 40], false)).toEqual([0, DOMAIN]);
    expect(dragQuery(DEFAULT_QUERY, [0, 0], true)).toEqual(DEFAULT_QUERY);
  });
});

describe('k-means and IVF', () => {
  const pts = clusteredPoints(DEFAULT_SEED);

  it('k-means is deterministic, every point sits in its nearest centroid at the end, and the cells partition the points', () => {
    const c = kmeans(pts, 8, 3);
    expect(kmeans(pts, 8, 3)).toEqual(c);
    pts.forEach((p, i) => {
      const nearest = c.centroids.reduce((best, cen, k) => (dist(p, cen) < dist(p, c.centroids[best]) ? k : best), 0);
      expect(dist(p, c.centroids[c.assign[i]])).toBeCloseTo(dist(p, c.centroids[nearest]), 12);
    });
    const ivf = buildIvf(pts, 8, 3);
    expect(ivf.members.flat().sort((a, b) => a - b)).toEqual(pts.map((_, i) => i));
  });

  it('with nprobe = nlist the index returns exactly the brute-force distances, for 10 seeds, 20 queries and several nlist', () => {
    for (const s of seeds) {
      const data = clusteredPoints(s);
      for (const nlist of [4, 8, 17, 32]) {
        const ivf = buildIvf(data, nlist, s);
        for (const q of seededQueries(s, 20, 2, 10)) {
          const exact = bruteForce(data, q, 5).neighbours.map((x) => x.d);
          expect(searchIvf(ivf, q, 5, nlist).neighbours.map((x) => x.d)).toEqual(exact);
        }
      }
    }
  });

  it('recall is non-decreasing in nprobe on every seed, because the scanned sets are nested', () => {
    for (const s of seeds) {
      const data = clusteredPoints(s);
      const ivf = buildIvf(data, 16, s);
      for (const q of seededQueries(s + 50, 25, 2, 10)) {
        const truth = bruteForce(data, q, 10).neighbours;
        let last = -1;
        for (let nprobe = 1; nprobe <= 16; nprobe++) {
          const r = searchIvf(ivf, q, 10, nprobe);
          const recall = recallAt(truth, r.neighbours);
          expect(recall).toBeGreaterThanOrEqual(last);
          last = recall;
        }
      }
    }
  });

  it('probing fewer cells scans fewer points and a miss is a true neighbour in a cell that was not probed', () => {
    const ivf = buildIvf(pts, 16, 2);
    let sawMiss = false;
    for (const q of seededQueries(9, 40, 2, 10)) {
      const truth = bruteForce(pts, q, 10).neighbours;
      const r = searchIvf(ivf, q, 10, 1);
      expect(r.scanned.length).toBeLessThan(searchIvf(ivf, q, 10, 16).scanned.length);
      expect(r.computations).toBe(16 + r.scanned.length);
      for (const m of missed(truth, r.neighbours)) {
        sawMiss = true;
        expect(r.scanned).not.toContain(m.id);
      }
    }
    expect(sawMiss).toBe(true);
  });
});

describe('HNSW', () => {
  it('links stay within the limits, never point at their own node, and the entry point is on the top layer', () => {
    const pts = clusteredPoints(DEFAULT_SEED);
    const h = buildHnsw(pts, DEFAULT_M, DEFAULT_EF_CONSTRUCTION, DEFAULT_SEED);
    h.links.forEach((layer, l) => layer.forEach((list, id) => {
      expect(list.length).toBeLessThanOrEqual(l === 0 ? 2 * DEFAULT_M : DEFAULT_M);
      expect(list).not.toContain(id);
      if (list.length > 0) expect(h.levels[id]).toBeGreaterThanOrEqual(l);
    }));
    expect(h.levels[h.entry]).toBe(h.top);
    expect(buildHnsw(pts, DEFAULT_M, DEFAULT_EF_CONSTRUCTION, DEFAULT_SEED).links).toEqual(h.links);
  });

  it('with efSearch >= N the search is exact whenever its layer-0 start reaches every point along the links, which the test checks for each query it uses', () => {
    let exact = 0;
    for (const s of seeds) {
      const data = clusteredPoints(s).slice(0, 150);
      const h = buildHnsw(data, 8, 64, s);
      for (const q of seededQueries(s, 10, 2, 10)) {
        const r = searchHnsw(h, q, 5, data.length);
        if (reachableFromStart(h, r.start) < data.length) continue;
        exact++;
        expect(r.neighbours.map((x) => x.d)).toEqual(bruteForce(data, q, 5).neighbours.map((x) => x.d));
      }
    }
    expect(exact).toBeGreaterThan(50);
  });

  it('recall tends to rise with efSearch but is not claimed monotone: the mean over queries is higher at 64 than at 1, and at 400 at least as high as at 64', () => {
    const data = clusteredPoints(DEFAULT_SEED);
    const h = buildHnsw(data, DEFAULT_M, DEFAULT_EF_CONSTRUCTION, DEFAULT_SEED);
    const queries = seededQueries(8, 80, 2, 10);
    const mean = (ef: number) => queries.reduce((s, q) => s + recallAt(bruteForce(data, q, 5).neighbours, searchHnsw(h, q, 5, ef).neighbours), 0) / queries.length;
    expect(mean(64)).toBeGreaterThan(mean(1));
    expect(mean(400)).toBeGreaterThanOrEqual(mean(64));
  });

  it('the default query gets stuck with a short candidate list and escapes with a longer one, and the search costs far fewer than N computations', () => {
    const data = clusteredPoints(DEFAULT_SEED);
    const h = buildHnsw(data, DEFAULT_M, DEFAULT_EF_CONSTRUCTION, DEFAULT_SEED);
    const truth = bruteForce(data, DEFAULT_QUERY, DEFAULT_K).neighbours;
    const short = searchHnsw(h, DEFAULT_QUERY, DEFAULT_K, 1);
    const long = searchHnsw(h, DEFAULT_QUERY, DEFAULT_K, 16);
    expect(recallAt(truth, short.neighbours)).toBeLessThan(1);
    expect(recallAt(truth, long.neighbours)).toBe(1);
    expect(long.computations).toBeLessThan(data.length);
    expect(short.trace.at(-1)!.kind).toBe('done');
    expect(short.trace[0].kind).toBe('enter');
    expect(short.path[0].layer).toBe(h.top);
  });

  it('every trace step carries a running computation count that ends at the search total', () => {
    const data = clusteredPoints(2);
    const h = buildHnsw(data, 4, 16, 2);
    const r = searchHnsw(h, [3, 3], 5, 8);
    r.trace.forEach((t, i) => { if (i > 0) expect(t.computations).toBeGreaterThanOrEqual(r.trace[i - 1].computations); });
    expect(r.trace.at(-1)!.computations).toBe(r.computations);
  });
});

describe('the curse of dimensionality, computed', () => {
  it('the spread of distances shrinks from d = 2 to d = 256 and both readouts are numbers the lesson prints', () => {
    const rows = curseRows(DEFAULT_SEED);
    expect(rows.map((r) => r.d)).toEqual([...DIMS]);
    const first = rows[0];
    const last = rows.at(-1)!;
    expect(first.ratio).toBeGreaterThan(20);
    expect(last.ratio).toBeLessThan(0.5);
    expect(first.recall).toBeGreaterThan(0.95);
    expect(last.recall).toBeLessThan(0.7);
    expect(last.recall).toBeLessThan(first.recall);
    expect(concentrationRatio(DEFAULT_SEED, 2)).toBe(first.ratio);
    expect(ivfRecallAt(DEFAULT_SEED, 256)).toBe(last.recall);
    for (let i = 1; i < rows.length; i++) expect(rows[i].ratio).toBeLessThan(rows[i - 1].ratio);
    expect(CURSE_K).toBe(10);
  });

  it('is deterministic per seed and different across seeds', () => {
    expect(concentrationRatio(1, 16)).toBe(concentrationRatio(1, 16));
    expect(concentrationRatio(1, 16)).not.toBe(concentrationRatio(2, 16));
  });
});

describe('the comparison table', () => {
  it('is measured: brute force is exact at N computations, the others trade recall for fewer, and every figure is non-negative', () => {
    const pts = clusteredPoints(DEFAULT_SEED);
    const rows = compareIndexes(pts, { nlist: 8, nprobe: 2, m: 4, efConstruction: 32, efSearch: 16, seed: DEFAULT_SEED });
    expect(rows.map((r) => r.name)).toEqual(['Brute force', 'IVF', 'HNSW']);
    expect(rows[0]).toMatchObject({ recall: 1, computations: 400, extra: 0, build: 0 });
    expect(rows[1].computations).toBeLessThan(400);
    expect(rows[2].computations).toBeLessThan(400);
    expect(rows[1].recall).toBeLessThanOrEqual(1);
    expect(rows[2].extra).toBeGreaterThan(rows[1].extra);
    expect(rows.every((r) => r.recall >= 0 && r.computations >= 0 && r.build >= 0)).toBe(true);
    expect(rows[1].extra).toBe(8 * 2 + 400);
  });
});
