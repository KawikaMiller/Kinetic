import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import {
  bruteForcePairSum, dedupeTrace, isSortedAscending, pairKey, pairsRuledOut, palindromeTrace, twoPointerPairSum,
} from './model';
import { PRESETS } from './presets';

const RANDOM_ARRAYS = 500;

function sortedArray(rnd: () => number) {
  const n = randInt(0, 14, rnd);
  return Array.from({ length: n }, () => randInt(-20, 20, rnd)).sort((a, b) => a - b);
}

describe('two-pointer pair sum', () => {
  it('agrees with brute force on 500 seeded random sorted arrays, in at most n-1 checks', () => {
    const rnd = mulberry32(7);
    for (let k = 0; k < RANDOM_ARRAYS; k++) {
      const arr = sortedArray(rnd);
      const target = randInt(-40, 40, rnd);
      const { checks, pair } = twoPointerPairSum(arr, target);
      const brute = bruteForcePairSum(arr, target);
      expect(pair === null).toBe(brute === null);
      if (pair) {
        expect(pair[0]).toBeLessThan(pair[1]);
        expect(arr[pair[0]] + arr[pair[1]]).toBe(target);
      }
      expect(checks.length).toBeLessThanOrEqual(Math.max(0, arr.length - 1));
    }
  });

  it('never rules out a pair that sums to the target (the proof the matrix shows)', () => {
    const rnd = mulberry32(11);
    for (let k = 0; k < RANDOM_ARRAYS; k++) {
      const arr = sortedArray(rnd);
      const target = randInt(-40, 40, rnd);
      for (const check of twoPointerPairSum(arr, target).checks) {
        for (const [i, j] of pairsRuledOut(check)) expect(arr[i] + arr[j]).not.toBe(target);
      }
    }
  });

  it('rules out every pair exactly once when there is no answer', () => {
    const arr = [1, 2, 4, 7, 11];
    const seen = new Set<string>();
    for (const check of twoPointerPairSum(arr, 100).checks) {
      for (const [i, j] of pairsRuledOut(check)) {
        expect(seen.has(pairKey(i, j))).toBe(false);
        seen.add(pairKey(i, j));
      }
    }
    expect(seen.size).toBe((arr.length * (arr.length - 1)) / 2);
  });

  it('matches brute force on every preset except the unsorted one, which it misses', () => {
    for (const p of PRESETS) {
      const found = twoPointerPairSum(p.values, p.target).pair !== null;
      const exists = bruteForcePairSum(p.values, p.target) !== null;
      if (isSortedAscending(p.values)) expect(found).toBe(exists);
      else expect({ found, exists }).toEqual({ found: false, exists: true });
    }
  });

  it('handles empty and single-item arrays', () => {
    expect(twoPointerPairSum([], 3)).toEqual({ checks: [], pair: null });
    expect(twoPointerPairSum([3], 6)).toEqual({ checks: [], pair: null });
  });
});

describe('palindrome check', () => {
  it('agrees with reversing the string', () => {
    const rnd = mulberry32(3);
    for (let k = 0; k < RANDOM_ARRAYS; k++) {
      const s = Array.from({ length: randInt(0, 9, rnd) }, () => 'ab'[randInt(0, 1, rnd)]).join('');
      expect(palindromeTrace(s).isPalindrome).toBe(s === [...s].reverse().join(''));
    }
  });

  it('stops at the first mismatch', () => {
    const { checks, isPalindrome } = palindromeTrace('abcdxba');
    expect(isPalindrome).toBe(false);
    expect(checks.map((c) => c.match)).toEqual([true, true, false]);
  });
});

describe('remove duplicates in place', () => {
  it('leaves exactly the distinct values, in order, in the first k cells', () => {
    const rnd = mulberry32(5);
    for (let k = 0; k < RANDOM_ARRAYS; k++) {
      const arr = sortedArray(rnd);
      const { length, values, steps } = dedupeTrace(arr);
      expect(values.slice(0, length)).toEqual([...new Set(arr)]);
      expect(steps.length).toBe(Math.max(0, arr.length - 1));
    }
  });
});
