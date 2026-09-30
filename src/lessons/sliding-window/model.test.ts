import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import {
  bruteLongestUnique, bruteMaxSumOfK, bruteShortestAtLeast, longestUnique, maxSumOfK, shortestAtLeast, spanLength, sumOf,
  type WindowTrace,
} from './model';
import { FIXED_PRESET, SHORTEST_PRESET, UNIQUE_PRESETS } from './presets';

const TRIALS = 500;

/** Each index enters exactly once and leaves at most once, and l never moves backwards. */
function expectLinear(trace: WindowTrace, n: number) {
  expect(trace.steps.length).toBeLessThanOrEqual(2 * n);
  const entered = trace.steps.filter((s) => s.event === 'enter').map((s) => s.index);
  expect(entered).toEqual([...Array(n).keys()]);
  const left = trace.steps.filter((s) => s.event === 'leave').map((s) => s.index);
  expect(new Set(left).size).toBe(left.length);
  trace.steps.forEach((s, i) => {
    if (i > 0) expect(s.l).toBeGreaterThanOrEqual(trace.steps[i - 1].l);
  });
}

const randomText = (rnd: () => number) => Array.from({ length: randInt(0, 14, rnd) }, () => 'abcde'[randInt(0, 4, rnd)]).join('');
const randomNums = (rnd: () => number, lo: number) => Array.from({ length: randInt(1, 14, rnd) }, () => randInt(lo, 12, rnd));

describe('longest substring without repeats', () => {
  it('matches brute force on seeded random strings, in at most 2n moves', () => {
    const rnd = mulberry32(21);
    for (let t = 0; t < TRIALS; t++) {
      const s = randomText(rnd);
      const trace = longestUnique(s);
      expect(spanLength(trace.best)).toBe(bruteLongestUnique(s));
      if (trace.best) expect(new Set(s.slice(trace.best[0], trace.best[1] + 1)).size).toBe(spanLength(trace.best));
      expectLinear(trace, s.length);
    }
  });

  it('keeps the count map equal to the window contents', () => {
    const s = 'abcabcbb';
    for (const step of longestUnique(s).steps) {
      const expected: Record<string, number> = {};
      for (const c of s.slice(step.l, step.r + 1)) expected[c] = (expected[c] ?? 0) + 1;
      expect(step.counts).toEqual(expected);
    }
  });

  it('solves the presets', () => {
    expect(UNIQUE_PRESETS.map((s) => spanLength(longestUnique(s).best))).toEqual([3, 3, 1]);
  });
});

describe('max sum of k consecutive', () => {
  it('matches brute force on seeded random arrays (negatives allowed)', () => {
    const rnd = mulberry32(22);
    for (let t = 0; t < TRIALS; t++) {
      const a = randomNums(rnd, -9);
      const k = randInt(1, a.length, rnd);
      const trace = maxSumOfK(a, k);
      expect(trace.best && sumOf(a, trace.best)).toBe(bruteMaxSumOfK(a, k));
      expect(spanLength(trace.best)).toBe(k);
      expectLinear(trace, a.length);
    }
  });

  it('solves the preset', () => {
    // 12 + 3 + 8 = 23 beats 9 + 2 + 11 = 22 near the end
    expect(maxSumOfK(FIXED_PRESET, 3).best).toEqual([2, 4]);
  });
});

describe('shortest subarray with sum at least target', () => {
  it('matches brute force on seeded random non-negative arrays', () => {
    const rnd = mulberry32(23);
    for (let t = 0; t < TRIALS; t++) {
      const a = randomNums(rnd, 0);
      const target = randInt(1, 40, rnd);
      const trace = shortestAtLeast(a, target);
      expect(spanLength(trace.best)).toBe(bruteShortestAtLeast(a, target));
      if (trace.best) expect(sumOf(a, trace.best)).toBeGreaterThanOrEqual(target);
      expectLinear(trace, a.length);
    }
  });

  it('solves the preset and reports "none" when nothing is big enough', () => {
    expect(spanLength(shortestAtLeast(SHORTEST_PRESET.values, SHORTEST_PRESET.target).best)).toBe(2);
    expect(shortestAtLeast([1, 2, 3], 100).best).toBeNull();
  });
});
