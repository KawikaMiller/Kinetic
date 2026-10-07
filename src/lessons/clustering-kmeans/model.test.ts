import { describe, expect, it } from 'vitest';
import { blobs } from '../../core/fixtures/datasets';
import {
  ELBOW_MAX_K, PRESET_IDS, agreement, assignAll, bestOfRestarts, elbowCurve, elbowK, finalStep, inertia, initCentroids, initPlusPlus,
  lloyd, preset, silhouette, sqDist, standardise, updateCentroids,
  type P,
} from './model';
import { mulberry32 } from '../../core/random';

/** 100 seeded runs: random and k-means++ starts, k from 1 to 6, on varied blobs. */
const RUNS = Array.from({ length: 100 }, (_, s) => {
  const pts = blobs({ seed: 300 + s, centers: ([[0, 0], [3, 1], [1, 4], [5, 5]] as [number, number][]).slice(0, 2 + (s % 3)), n: 6 + (s % 5) * 5, spread: 0.5 + (s % 4) * 0.4 })
    .map((p) => [p.x, p.y] as P);
  const k = 1 + (s % 6);
  return { pts, steps: lloyd(pts, initCentroids(pts, k, s % 2 ? 'random' : 'plusplus', s)) };
});
const PRESET_RUNS = PRESET_IDS.map((id) => {
  const p = preset(id);
  return { pts: p.points, steps: lloyd(p.points, p.fixedStart ?? initCentroids(p.points, p.k, 'plusplus', 1)) };
});

describe('Lloyd\'s algorithm', () => {
  it('inertia never increases after any assign or update step, on every preset and 100 seeded runs', () => {
    for (const { steps } of [...PRESET_RUNS, ...RUNS]) {
      const values = steps.map((s) => s.inertia).filter((v): v is number => v !== null);
      for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThanOrEqual(values[i - 1] * (1 + 1e-12) + 1e-12);
    }
  });

  it('alternates assign and update, and stops exactly when an assign step changes nothing', () => {
    for (const { pts, steps } of [...PRESET_RUNS, ...RUNS]) {
      expect(steps[0].phase).toBe('init');
      const last = finalStep(steps);
      expect(last.phase).toBe('done');
      expect(assignAll(pts, last.centroids)).toEqual(last.assign);
      for (let i = 1; i < steps.length - 1; i++) expect(steps[i].phase).toBe(i % 2 ? 'assign' : 'update');
      // Every assign before the end really changed something.
      steps.filter((s) => s.phase === 'assign').forEach((s) => expect(s.changed).toBeGreaterThan(0));
    }
  });

  it('the assign step puts every point with its nearest centroid', () => {
    for (const { pts, steps } of RUNS.slice(0, 30)) {
      for (const s of steps.filter((x) => x.phase === 'assign')) {
        pts.forEach((p, i) => {
          const d = s.centroids.map((c) => sqDist(p, c));
          expect(d[s.assign![i]]).toBe(Math.min(...d));
        });
      }
    }
  });

  it('the update step moves each centroid to the arithmetic mean of its points', () => {
    for (const { pts, steps } of RUNS.slice(0, 40)) {
      for (const s of steps.filter((x) => x.phase === 'update')) {
        s.centroids.forEach((c, j) => {
          const mine = pts.filter((_, i) => s.assign![i] === j);
          if (!mine.length) return;
          expect(c[0]).toBeCloseTo(mine.reduce((t, p) => t + p[0], 0) / mine.length, 10);
          expect(c[1]).toBeCloseTo(mine.reduce((t, p) => t + p[1], 0) / mine.length, 10);
        });
      }
    }
  });

  it('an empty cluster is reseeded to the point farthest from its own centroid', () => {
    const pts: P[] = [[0, 0], [1, 0], [10, 0], [12, 0]];
    const { centroids, reseeded } = updateCentroids(pts, [0, 0, 1, 1], [[0.5, 0], [11, 0], [100, 100]]);
    // Points 0 and 1 are 0.5 from their mean (0.5, 0); 2 and 3 are 1 from theirs (11, 0). Of the tied pair the first wins.
    expect(reseeded).toEqual([{ cluster: 2, point: 2 }]);
    expect(centroids[2]).toEqual(pts[2]);
    expect(centroids[0]).toEqual([0.5, 0]);
  });
});

describe('starts', () => {
  it('random (Forgy) picks k distinct data points; both starts are deterministic per seed', () => {
    const pts = preset('three').points;
    const a = initCentroids(pts, 5, 'random', 7);
    expect(new Set(a.map((c) => pts.indexOf(c))).size).toBe(5);
    expect(initCentroids(pts, 5, 'random', 7)).toEqual(a);
    expect(initCentroids(pts, 3, 'plusplus', 7)).toEqual(initCentroids(pts, 3, 'plusplus', 7));
  });

  it('k-means++ follows D² sampling: second-pick frequencies match the exact probabilities', () => {
    const pts: P[] = [[0, 0], [1, 0], [3, 0], [7, 0]];
    const n = pts.length;
    const trials = 40000;
    const counts = new Map<string, number>();
    for (let s = 0; s < trials; s++) {
      const [a, b] = initPlusPlus(pts, 2, mulberry32(s + 1)).map((c) => pts.indexOf(c));
      counts.set(`${a},${b}`, (counts.get(`${a},${b}`) ?? 0) + 1);
    }
    for (let a = 0; a < n; a++) {
      const d2 = pts.map((p) => sqDist(p, pts[a]));
      const total = d2.reduce((t, v) => t + v, 0);
      for (let b = 0; b < n; b++) {
        const expected = (1 / n) * (d2[b] / total);
        const got = (counts.get(`${a},${b}`) ?? 0) / trials;
        expect(Math.abs(got - expected)).toBeLessThan(0.01);
      }
    }
  });
});

describe('the presets teach what they claim', () => {
  it('"Bad start" converges to a worse local optimum, and best-of-restarts finds a much better one', () => {
    const p = preset('badinit');
    const stuck = finalStep(lloyd(p.points, p.fixedStart!)).inertia!;
    expect(bestOfRestarts(p.points, p.k, 1).inertia).toBeLessThan(stuck * 0.6);
  });

  it('"Stranded centroid" empties a cluster on the first assign and reseeds it, then still converges', () => {
    const p = preset('stranded');
    const steps = lloyd(p.points, p.fixedStart!);
    expect(steps[2].phase).toBe('update');
    expect(steps[2].reseeded).toHaveLength(1);
    expect(new Set(steps[1].assign).size).toBe(2);
    expect(new Set(finalStep(steps).assign).size).toBe(3);
  });

  it('"Moons": even the best k = 2 run splits the curved groups badly', () => {
    const p = preset('moons');
    const best = finalStep(bestOfRestarts(p.points, 2, 1).steps);
    expect(agreement(best.assign!, p.groups, 2)!).toBeLessThan(0.85);
  });

  it('"Different scales": raw k-means splits on the noisy big-unit feature; standardising recovers the groups', () => {
    const p = preset('scales');
    const raw = finalStep(bestOfRestarts(p.points, 2, 1).steps);
    const std = finalStep(bestOfRestarts(standardise(p.points), 2, 1).steps);
    expect(agreement(raw.assign!, p.groups, 2)!).toBeLessThan(0.7);
    expect(agreement(std.assign!, p.groups, 2)!).toBe(1);
  });

  it('"Three clear blobs": the elbow sits at k = 3 and k = 3 has the best silhouette', () => {
    const curve = elbowCurve(preset('three').points, 1);
    expect(elbowK(curve)).toBe(3);
    const best = curve.filter((c) => c.silhouette !== null).reduce((a, b) => (b.silhouette! > a.silhouette! ? b : a));
    expect(best.k).toBe(3);
  });
});

describe('elbow and silhouette', () => {
  it('the best-of-restarts elbow curve is non-increasing in k on every preset', () => {
    for (const id of PRESET_IDS) {
      const curve = elbowCurve(preset(id).points, 1);
      expect(curve).toHaveLength(ELBOW_MAX_K);
      for (let i = 1; i < curve.length; i++) expect(curve[i].inertia).toBeLessThanOrEqual(curve[i - 1].inertia + 1e-9);
    }
  });

  it('best of restarts really is the lowest of its runs', () => {
    const pts = preset('moons').points;
    const best = bestOfRestarts(pts, 4, 10);
    for (let s = 10; s < 15; s++) expect(best.inertia).toBeLessThanOrEqual(finalStep(lloyd(pts, initCentroids(pts, 4, 'plusplus', s))).inertia! + 1e-12);
  });

  it('silhouette matches a hand-worked case', () => {
    // Clusters {0, 1} and {10}: point 0 has a = 1, b = 10 → 0.9; point 1: a = 1, b = 9 → 8/9; the singleton scores 0.
    const s = silhouette([[0, 0], [1, 0], [10, 0]], [0, 0, 1]);
    expect(s).toBeCloseTo((0.9 + 8 / 9 + 0) / 3, 12);
    expect(silhouette([[0, 0], [1, 1]], [0, 0])).toBe(0);
  });

  it('elbowK finds the corner of a hand-made curve, and refuses a straight line', () => {
    const mk = (ys: number[]) => ys.map((inertia, i) => ({ k: i + 1, inertia, silhouette: null }));
    expect(elbowK(mk([100, 50, 10, 8, 6, 4]))).toBe(3);
    expect(elbowK(mk([60, 50, 40, 30, 20]))).toBeNull();
  });

  it('inertia is the sum of squared distances to the assigned centroid', () => {
    expect(inertia([[0, 0], [3, 4]], [[0, 0], [0, 4]], [0, 1])).toBe(9);
  });
});

describe('standardise', () => {
  it('gives each feature mean 0 and standard deviation 1, and leaves a constant feature at 0', () => {
    const z = standardise([[1, 5], [3, 5], [5, 5]]);
    expect(z.map((p) => p[1])).toEqual([0, 0, 0]);
    const xs = z.map((p) => p[0]);
    expect(xs.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 12);
    expect(Math.sqrt(xs.reduce((a, b) => a + b * b, 0) / 3)).toBeCloseTo(1, 12);
  });
});
