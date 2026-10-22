import { describe, expect, it } from 'vitest';
import { addSketches, deltaOf, depthFor, epsilonOf, estimate, sameGrid, update, widthFor, UNIVERSE, exactCounts, exactTop, keyOfRank, sketchOf, zipfStream } from '../../core/countMin';
import { mergeRun, splitRoundRobin } from './merge';
import { PLAIN, errorRun, overCount, overLimit, underCount, ghostKey, GHOST_DELETES } from './stream';

describe('the guarantee, by Monte Carlo over 200 hash seeds', () => {
  const fixed = zipfStream(5_000, 1.2, 77);
  const counts = exactCounts(fixed);
  const items = [0, 1, 2, 5, 20, 100, 500, 1_000, 1_500, 1_999];
  for (const [w, d] of [[272, 5], [55, 3]] as const) {
    it(`w = ${w}, d = ${d}: the share of runs whose error passes epsilon*N is at most delta plus 0.02, for every fixed item`, () => {
      const limit = epsilonOf(w) * fixed.length;
      const bad = new Array<number>(items.length).fill(0);
      for (let seed = 0; seed < 200; seed++) {
        const s = sketchOf(fixed, w, d, 1_000 + seed);
        items.forEach((r, i) => { if (estimate(s, keyOfRank(r)) - counts[r] > limit) bad[i]++; });
      }
      bad.forEach((n) => expect(n / 200).toBeLessThanOrEqual(deltaOf(d) + 0.02));
    });
  }

  it('sizing: epsilon 0.01 and delta 0.01 give w = 272, d = 5 and 1,360 counters, and the other way round', () => {
    expect(widthFor(0.01)).toBe(272);
    expect(depthFor(0.01)).toBe(5);
    expect(widthFor(0.01) * depthFor(0.01)).toBe(1_360);
    expect(widthFor(0.05)).toBe(55);
    expect(depthFor(0.05)).toBe(3);
    expect(epsilonOf(272)).toBeCloseTo(0.00999, 4);
    expect(deltaOf(5)).toBeCloseTo(0.00674, 4);
    expect(epsilonOf(widthFor(0.01))).toBeLessThanOrEqual(0.01);
    expect(deltaOf(depthFor(0.01))).toBeLessThanOrEqual(0.01);
  });

  it('a run reports the share of items over epsilon*N, which sits near or under delta at the default size', () => {
    const run = errorRun(zipfStream(20_000, 1.2, 5), 272, 5, 5);
    expect(overLimit(run, epsilonOf(272) * run.n) / UNIVERSE).toBeLessThanOrEqual(deltaOf(5) + 0.02);
    expect(underCount(run)).toBe(0);
  });
});

describe('merging sketches across partitions', () => {
  it('with the same seeds the cell-by-cell sum equals the sketch of the combined stream, over 100 seeded splits', () => {
    for (let seed = 0; seed < 100; seed++) {
      const stream = zipfStream(600, 0.8 + (seed % 9) / 10, seed, 100);
      const run = mergeRun(stream, 16 + (seed % 4) * 16, 1 + (seed % 5), seed, true);
      expect(run.equal, `seed ${seed}`).toBe(true);
      expect(run.differingCells).toBe(0);
      expect(run.parts.map((p) => p.total)).toEqual(splitRoundRobin(stream).map((p) => p.length));
    }
  });

  it('with different seeds the sum is wrong: it differs from the combined sketch and undercounts some item (the broken variant the check must reject)', () => {
    let wrongSeeds = 0;
    let undercounts = 0;
    for (let seed = 0; seed < 100; seed++) {
      const stream = zipfStream(600, 1.1, seed, 100);
      const run = mergeRun(stream, 32, 3, seed, false);
      if (!run.equal) wrongSeeds++;
      const counts = exactCounts(stream, 100);
      for (let r = 0; r < 100; r++) if (estimate(run.merged, keyOfRank(r)) < counts[r]) undercounts++;
    }
    expect(wrongSeeds).toBe(100);
    expect(undercounts).toBeGreaterThan(0);
  });

  it('adding is linear: the sum of two sketches is the sketch of the two streams joined, and the inputs are left alone', () => {
    const a = sketchOf([0, 1, 1, 2], 16, 3, 7);
    const b = sketchOf([2, 2, 3], 16, 3, 7);
    const before = Array.from(a.counts);
    expect(sameGrid(addSketches(a, b), sketchOf([0, 1, 1, 2, 2, 2, 3], 16, 3, 7))).toBe(true);
    expect(Array.from(a.counts)).toEqual(before);
  });
});

describe('breaking it', () => {
  const stream = zipfStream(20_000, 1.2, 5);

  it('the mean estimator overcounts more than the minimum, on every item and in the total error', () => {
    const min = errorRun(stream, 272, 5, 5, PLAIN);
    const mean = errorRun(stream, 272, 5, 5, { how: 'mean', ghostDeletes: 0 });
    let total = [0, 0];
    for (let r = 0; r < UNIVERSE; r++) {
      expect(mean.errors[r]).toBeGreaterThanOrEqual(min.errors[r]);
      total = [total[0] + min.errors[r], total[1] + mean.errors[r]];
    }
    expect(total[1]).toBeGreaterThan(total[0]);
  });

  it('deleting items that were added keeps the one-sided guarantee: the estimate stays at or above the remaining count, over 200 seeds', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = zipfStream(500, 1.0, seed, 60);
      const sketch = sketchOf(s, 16, 3, seed);
      const removed = s.filter((_, i) => i % 3 === 0);
      for (const r of removed) update(sketch, keyOfRank(r), -1);
      const remaining = exactCounts(s.filter((_, i) => i % 3 !== 0), 60);
      for (let r = 0; r < 60; r++) expect(estimate(sketch, keyOfRank(r))).toBeGreaterThanOrEqual(remaining[r]);
    }
  });

  it('deleting items that were never added can undercount other items: with 300 ghost deletes some items fall below their true count, with none no item does', () => {
    expect(underCount(errorRun(stream, 272, 5, 5, PLAIN))).toBe(0);
    const spoiled = errorRun(stream, 272, 5, 5, { how: 'min', ghostDeletes: GHOST_DELETES });
    expect(underCount(spoiled)).toBeGreaterThan(0);
    expect(spoiled.errors.some((e) => e < 0)).toBe(true);
    expect(ghostKey(0)).not.toBe(ghostKey(1));
  });

  it('a width of 4 sends everything into 4 columns: estimates run up toward the whole stream', () => {
    const tiny = errorRun(stream, 4, 5, 5);
    const mean = Array.from(tiny.errors).reduce((a, b) => a + b, 0) / UNIVERSE;
    expect(mean).toBeGreaterThan(0.1 * stream.length);
    expect(Math.max(...tiny.errors)).toBeLessThanOrEqual(stream.length);
    expect(overCount(tiny)).toBeGreaterThan(UNIVERSE * 0.9);
  });

  it('exactTop breaks ties toward the lower rank', () => {
    expect(exactTop(Int32Array.from([3, 5, 5, 1]), 2)).toEqual([1, 2]);
  });
});
