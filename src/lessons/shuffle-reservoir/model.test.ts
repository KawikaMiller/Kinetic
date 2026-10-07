import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { factorial } from '../../core/stats';
import { captionText as text } from '../../core/testing/captions';
import { heatCaption, reservoirFrames, shuffleFrames } from './frames';
import {
  applySwaps, enumeratePaths, exactInclusion, flagged, heat, inclusionCounts, pathCounts, permKey, permutations, reservoirDraws,
  reservoirRun,
} from './model';

describe('exact enumeration', () => {
  it('Fisher-Yates gives each of the n! arrangements exactly one path, for n ≤ 6', () => {
    for (let n = 1; n <= 6; n++) {
      const paths = enumeratePaths('fisher-yates', n);
      expect(paths.length).toBe(Number(factorial(n)));
      const counts = pathCounts(paths);
      expect(counts.size).toBe(Number(factorial(n)));
      for (const p of permutations(n)) expect(counts.get(permKey(p))).toBe(1);
    }
  });

  it('the naive shuffle at n = 3: 123, 312, 321 get 4 of 27; 132, 213, 231 get 5', () => {
    const counts = pathCounts(enumeratePaths('naive', 3));
    expect(Object.fromEntries(counts)).toEqual({ '123': 4, '312': 4, '321': 4, '132': 5, '213': 5, '231': 5 });
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(27);
  });

  it('the naive shuffle is uneven for every n from 3 to 6, and n! never divides nⁿ for 3..8', () => {
    for (let n = 3; n <= 6; n++) {
      const counts = [...pathCounts(enumeratePaths('naive', n)).values()];
      expect(Math.max(...counts)).toBeGreaterThan(Math.min(...counts));
    }
    for (let n = 3; n <= 8; n++) expect(BigInt(n) ** BigInt(n) % factorial(n)).not.toBe(0n);
  });

  it('permutations are all distinct arrangements of 1..n', () => {
    expect(permutations(3).map(permKey)).toEqual(['123', '132', '213', '231', '312', '321']);
    expect(new Set(permutations(5).map(permKey)).size).toBe(120);
  });

  it('applySwaps applies the swaps in order', () => {
    expect(applySwaps(3, [{ i: 0, j: 2 }, { i: 1, j: 2 }])).toEqual([3, 1, 2]);
  });
});

describe('seeded heatmaps (10,000 runs, fixed seed)', () => {
  it('Fisher-Yates stays within 3 standard errors in every cell for n = 3..8', () => {
    for (let n = 3; n <= 8; n++) expect(flagged(heat('fisher-yates', n, 10_000, 1001), 10_000)).toEqual([]);
  });

  it('the naive bias at n = 3 exceeds 3 standard errors', () => {
    expect(flagged(heat('naive', 3, 10_000, 1001), 10_000).length).toBeGreaterThan(0);
  });

  it('Fisher-Yates over 60,000 runs at n = 3 passes a chi-square test on the 6 orders (5 d.f., 0.1% critical 20.52); naive fails it', () => {
    const chi = (algo: 'fisher-yates' | 'naive') => {
      const rnd = mulberry32(42);
      const counts = new Map<string, number>();
      const RUNS = 60_000;
      for (let r = 0; r < RUNS; r++) {
        const swaps = Array.from({ length: algo === 'naive' ? 3 : 2 }, (_, i) => ({ i, j: algo === 'naive' ? Math.floor(rnd() * 3) : i + Math.floor(rnd() * (3 - i)) }));
        const k = permKey(applySwaps(3, swaps));
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      return [...counts.values()].reduce((s, c) => s + (c - RUNS / 6) ** 2 / (RUNS / 6), 0);
    };
    expect(chi('fisher-yates')).toBeLessThan(20.52);
    expect(chi('naive')).toBeGreaterThan(20.52);
  });

  it('the random-comparator heatmap is whatever this engine does: only its totals are asserted', () => {
    const counts = heat('comparator', 5, 2000, 3);
    for (const row of counts) expect(row.reduce((a, b) => a + b, 0)).toBe(2000);
  });

  it('the heat caption counts flagged cells from the data', () => {
    const counts = heat('naive', 3, 10_000, 1001);
    const off = flagged(counts, 10_000).length;
    expect(text(heatCaption('naive', 3, 10_000, counts))).toContain(`${off} of 9`);
    expect(text(heatCaption('fisher-yates', 3, 10_000, heat('fisher-yates', 3, 10_000, 1001)))).toContain('No cell is more than 3 standard errors off');
  });
});

describe('reservoir sampling', () => {
  it('inclusion is exactly k/n for every item, enumerating all n!/k! runs, n ≤ 6 and every k', () => {
    for (let n = 2; n <= 6; n++) {
      for (let k = 1; k < n; k++) {
        const { counts, paths } = exactInclusion(n, k);
        expect(BigInt(paths)).toBe(factorial(n) / factorial(k));
        // counts[i] / paths = k / n  ⇔  counts[i] · n = k · paths
        for (const c of counts) expect(c * n).toBe(k * paths);
      }
    }
  });

  it('a run keeps exactly k distinct items from the stream', () => {
    const rnd = mulberry32(9);
    for (let t = 0; t < 200; t++) {
      const steps = reservoirRun(10, 3, reservoirDraws(10, 3, rnd));
      const kept = steps[steps.length - 1].reservoir;
      expect(new Set(kept).size).toBe(3);
      kept.forEach((v) => expect(v >= 1 && v <= 10).toBe(true));
    }
  });

  it('10,000 seeded runs keep every item within 3 standard errors of k/n', () => {
    const counts = inclusionCounts(10, 3, 10_000, 1001);
    const se = Math.sqrt(10_000 * 0.3 * 0.7);
    for (const c of counts) expect(Math.abs(c - 3000)).toBeLessThan(3 * se);
  });

  it('frames: captions follow the draws, and the stream ends with k items kept', () => {
    const f = reservoirFrames(10, 3, 1);
    expect(f[f.length - 1].reservoir.length).toBe(3);
    const steps = reservoirRun(10, 3, reservoirDraws(10, 3, mulberry32(1)));
    steps.forEach((s, i) => {
      const say = text(f[i + 1].say);
      if (s.draw === null) expect(say).toContain('straight into slot');
      else if (s.slot !== null) expect(say).toContain(`item ${s.evicted} is evicted`);
      else expect(say).toContain('passes by');
    });
  });
});

describe('shuffle frames', () => {
  it('replay the seeded swaps and end on the result; Fisher-Yates settles every position', () => {
    for (const algo of ['fisher-yates', 'naive'] as const) {
      for (let n = 3; n <= 8; n++) {
        const f = shuffleFrames(algo, n, 5);
        const last = f[f.length - 1];
        expect([...last.arr].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
        expect(last.settled).toBe(algo === 'fisher-yates' ? n : 0);
        expect(last.i).toBe(null);
      }
    }
    expect(text(shuffleFrames('naive', 3, 1).at(-1)!.say)).toContain("27 equally likely paths, which can't split evenly over 6");
    expect(shuffleFrames('comparator', 4, 1).length).toBe(2);
  });
});
