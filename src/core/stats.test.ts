import { describe, expect, it } from 'vitest';
import {
  binomialPmf,
  choose,
  collisionProbability,
  COLLISION_EXACT_LIMIT,
  factorial,
  histogram,
  log2Factorial,
  runningMean,
  stdDev,
  variance,
} from './stats';

describe('factorial and choose', () => {
  it('match hand-computed values', () => {
    expect(factorial(0)).toBe(1n);
    expect(factorial(5)).toBe(120n);
    expect(factorial(20)).toBe(2432902008176640000n);
    expect(factorial(25)).toBe(15511210043330985984000000n); // beyond Number precision
  });
  it('choose equals n!/(k!(n−k)!) and Pascal’s rule', () => {
    for (let n = 0; n <= 30; n++)
      for (let k = 0; k <= n; k++) {
        expect(choose(n, k)).toBe(factorial(n) / (factorial(k) * factorial(n - k)));
        if (n > 0 && k > 0 && k < n) expect(choose(n, k)).toBe(choose(n - 1, k - 1) + choose(n - 1, k));
      }
    expect(choose(52, 5)).toBe(2598960n);
    expect(choose(5, 7)).toBe(0n);
    expect(choose(5, -1)).toBe(0n);
  });
  it('rejects bad input', () => {
    expect(() => factorial(-1)).toThrow(RangeError);
    expect(() => factorial(2.5)).toThrow(RangeError);
  });
});

describe('log2Factorial', () => {
  it('equals log₂ of the exact factorial', () => {
    for (const n of [0, 1, 2, 5, 10, 20]) expect(log2Factorial(n)).toBeCloseTo(Math.log2(Number(factorial(n))), 9);
  });
  it('the sort lower bound: ⌈log₂ 10!⌉ = 22 comparisons', () => {
    expect(Math.ceil(log2Factorial(10))).toBe(22);
  });
});

describe('variance and stdDev', () => {
  it('match hand-computed values', () => {
    const xs = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(variance(xs)).toBe(4);
    expect(stdDev(xs)).toBe(2);
    expect(variance(xs, { sample: true })).toBeCloseTo(32 / 7, 12);
    expect(variance([5])).toBe(0);
    expect(variance([5], { sample: true })).toBeNaN();
    expect(variance([])).toBeNaN();
  });
});

describe('histogram', () => {
  it('counts half-open bins and includes max in the last', () => {
    const h = histogram([0, 0.5, 1, 1.5, 2, 2, -1, 3], { bins: 2, min: 0, max: 2 });
    expect(h.edges).toEqual([0, 1, 2]);
    expect(h.counts).toEqual([2, 4]);
    expect(h.outside).toBe(2);
  });
  it('every in-range value lands in exactly one bin', () => {
    const xs = Array.from({ length: 1000 }, (_, i) => (i * 7919) % 1000) as number[];
    const h = histogram(xs, { bins: 7, min: 0, max: 999 });
    expect(h.counts.reduce((a, b) => a + b, 0) + h.outside).toBe(xs.length);
    expect(h.outside).toBe(0);
  });
  it('rejects a degenerate range', () => {
    expect(() => histogram([1], { bins: 0, min: 0, max: 1 })).toThrow(RangeError);
    expect(() => histogram([1], { bins: 2, min: 1, max: 1 })).toThrow(RangeError);
  });
});

describe('binomialPmf', () => {
  it('sums to 1 and matches a hand value', () => {
    let s = 0;
    for (let k = 0; k <= 10; k++) s += binomialPmf(10, k, 0.3);
    expect(s).toBeCloseTo(1, 12);
    expect(binomialPmf(4, 2, 0.5)).toBeCloseTo(6 / 16, 12);
    expect(binomialPmf(4, 5, 0.5)).toBe(0);
  });
});

describe('collisionProbability', () => {
  it('23 people share a birthday more often than not', () => {
    const p23 = collisionProbability(23, 365);
    expect(p23.method).toBe('exact');
    expect(p23.p).toBeCloseTo(0.5072972, 6);
    expect(collisionProbability(22, 365).p).toBeLessThan(0.5);
  });
  it('edge cases: 0–1 items never collide, more items than values always do', () => {
    expect(collisionProbability(1, 365).p).toBe(0);
    expect(collisionProbability(366, 365).p).toBe(1);
  });
  it('switches to the approximation above the limit and says so', () => {
    const big = collisionProbability(COLLISION_EXACT_LIMIT + 1, 2 ** 52);
    expect(big.method).toBe('approx');
    const n = COLLISION_EXACT_LIMIT + 1;
    expect(big.p).toBeCloseTo(1 - Math.exp((-n * (n - 1)) / (2 * 2 ** 52)), 12);
  });
  it('the approximation is close to exact where both apply', () => {
    for (const n of [10, 50, 1000]) {
      const exact = collisionProbability(n, 1e6).p;
      expect(Math.abs(exact - (1 - Math.exp((-n * (n - 1)) / 2e6)))).toBeLessThan(1e-3);
    }
  });
});

describe('runningMean', () => {
  it('is the mean of each prefix', () => {
    expect(runningMean([2, 4, 6, 8])).toEqual([2, 3, 4, 5]);
    expect(runningMean([])).toEqual([]);
  });
});
