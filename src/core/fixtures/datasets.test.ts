import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../random';
import { blobs, gaussian, lineWithNoise, moons, twoClassScores } from './datasets';

describe('seeded datasets', () => {
  it('are deterministic per seed and differ across seeds', () => {
    const gens = [
      (seed: number) =>
        blobs({
          seed,
          centers: [
            [0, 0],
            [3, 3],
          ],
          n: 10,
        }),
      (seed: number) => moons({ seed, n: 10 }),
      (seed: number) => lineWithNoise({ seed, n: 10, slope: 1, intercept: 0, noise: 1 }),
      (seed: number) => twoClassScores({ seed, positives: 10, negatives: 10, separation: 2 }),
    ];
    for (const g of gens) {
      expect(g(42)).toEqual(g(42));
      expect(g(42)).not.toEqual(g(43));
    }
  });

  it('gaussian has mean ≈ 0 and s.d. ≈ 1', () => {
    const rnd = mulberry32(9);
    const xs = Array.from({ length: 20000 }, () => gaussian(rnd));
    const m = xs.reduce((a, b) => a + b) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
    expect(Math.abs(m)).toBeLessThan(0.03);
    expect(Math.abs(sd - 1)).toBeLessThan(0.03);
  });

  it('blobs put n points per centre around it', () => {
    const pts = blobs({
      seed: 1,
      centers: [
        [0, 0],
        [10, -5],
      ],
      n: 200,
      spread: 0.5,
    });
    expect(pts).toHaveLength(400);
    const c1 = pts.filter((p) => p.label === 1);
    expect(c1.reduce((s, p) => s + p.x, 0) / c1.length).toBeCloseTo(10, 0);
    expect(c1.reduce((s, p) => s + p.y, 0) / c1.length).toBeCloseTo(-5, 0);
  });

  it('moons without noise lie on their two unit arcs', () => {
    for (const p of moons({ seed: 4, n: 50, noise: 0 })) {
      const [cx, cy] = p.label === 0 ? [0, 0] : [1, 0.5];
      expect(Math.hypot(p.x - cx, p.y - cy)).toBeCloseTo(1, 9);
      expect(p.label === 0 ? p.y >= -1e-9 : p.y <= 0.5 + 1e-9).toBe(true);
    }
  });

  it('twoClassScores are sorted, in (0, 1), and separate as asked', () => {
    const near = twoClassScores({ seed: 3, positives: 500, negatives: 500, separation: 0 });
    const far = twoClassScores({ seed: 3, positives: 500, negatives: 500, separation: 4 });
    for (const set of [near, far]) {
      expect(set).toHaveLength(1000);
      set.forEach((s, i) => {
        expect(s.score > 0 && s.score < 1).toBe(true);
        if (i) expect(s.score).toBeGreaterThanOrEqual(set[i - 1].score);
      });
    }
    const meanGap = (set: typeof near) => {
      const m = (l: 0 | 1) => set.filter((s) => s.label === l).reduce((a, s) => a + s.score, 0) / 500;
      return m(1) - m(0);
    };
    expect(Math.abs(meanGap(near))).toBeLessThan(0.05);
    expect(meanGap(far)).toBeGreaterThan(0.5);
  });
});
