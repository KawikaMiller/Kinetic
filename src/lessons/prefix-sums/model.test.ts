import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import {
  applyNaively, applyWithDiff, naiveRangeSum, offByOneRangeSum, prefixSums, rangeSum, type RangeUpdate,
} from './model';
import { DIFF_BASE, DIFF_UPDATES, RANGE_PRESET } from './presets';

const TRIALS = 500;

describe('prefix sums', () => {
  it('has n + 1 entries starting at 0', () => {
    const p = prefixSums(RANGE_PRESET);
    expect(p).toHaveLength(RANGE_PRESET.length + 1);
    expect(p[0]).toBe(0);
    expect(p[p.length - 1]).toBe(RANGE_PRESET.reduce((a, b) => a + b, 0));
  });

  it('answers every range of the preset exactly like adding it up', () => {
    const p = prefixSums(RANGE_PRESET);
    for (let l = 0; l < RANGE_PRESET.length; l++) {
      for (let r = l; r < RANGE_PRESET.length; r++) expect(rangeSum(p, l, r)).toBe(naiveRangeSum(RANGE_PRESET, l, r));
    }
  });

  it('matches brute force on seeded random arrays (negatives included)', () => {
    const rnd = mulberry32(31);
    for (let t = 0; t < TRIALS; t++) {
      const a = Array.from({ length: randInt(1, 20, rnd) }, () => randInt(-9, 9, rnd));
      const p = prefixSums(a);
      const l = randInt(0, a.length - 1, rnd);
      const r = randInt(l, a.length - 1, rnd);
      expect(rangeSum(p, l, r)).toBe(naiveRangeSum(a, l, r));
    }
  });

  it('prefix[r] − prefix[l] is off by one: it drops a[r]', () => {
    const p = prefixSums(RANGE_PRESET);
    expect(offByOneRangeSum(p, 2, 5)).toBe(naiveRangeSum(RANGE_PRESET, 2, 5) - RANGE_PRESET[5]);
  });
});

describe('difference arrays', () => {
  it('rebuild the same array as applying each update cell by cell (preset)', () => {
    expect(applyWithDiff(DIFF_BASE, DIFF_UPDATES).result).toEqual(applyNaively(DIFF_BASE, DIFF_UPDATES));
  });

  it('writes +v at the start and −v just after the end', () => {
    const { diff } = applyWithDiff([0, 0, 0, 0, 0, 0, 0, 0], [{ from: 2, to: 6, add: 5 }]);
    expect(diff).toEqual([0, 0, 5, 0, 0, 0, 0, -5, 0]);
  });

  it('match naive updates on seeded random inputs, including ranges ending at the last index', () => {
    const rnd = mulberry32(32);
    for (let t = 0; t < TRIALS; t++) {
      const n = randInt(1, 16, rnd);
      const base = Array.from({ length: n }, () => randInt(-9, 9, rnd));
      const updates: RangeUpdate[] = Array.from({ length: randInt(0, 6, rnd) }, () => {
        const from = randInt(0, n - 1, rnd);
        return { from, to: randInt(from, n - 1, rnd), add: randInt(-5, 5, rnd) };
      });
      expect(applyWithDiff(base, updates).result).toEqual(applyNaively(base, updates));
    }
  });
});
