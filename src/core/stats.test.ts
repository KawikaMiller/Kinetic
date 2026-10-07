import { describe, expect, it } from 'vitest';
import {
  binomialPmf,
  classificationMetrics,
  confusionAt,
  choose,
  collisionProbability,
  COLLISION_EXACT_LIMIT,
  factorial,
  histogram,
  log2Factorial,
  logCheckpoints,
  runningMean,
  runningStats,
  stdDev,
  variance,
} from './stats';
import { mean } from './sim';

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
  it('keeps tiny chances in huge spaces instead of rounding them to 0', () => {
    const space = 2 ** 128;
    expect(collisionProbability(2, space).p).toBeCloseTo(1 / space, 50);
    expect(collisionProbability(2, space).p / (1 / space)).toBeCloseTo(1, 12);
    const exact = collisionProbability(1000, space);
    expect(exact.method).toBe('exact');
    expect(exact.p / ((1000 * 999) / 2 / space)).toBeCloseTo(1, 9);
    const approx = collisionProbability(1e9, space);
    expect(approx.method).toBe('approx');
    expect(approx.p / ((1e9 * (1e9 - 1)) / 2 / space)).toBeCloseTo(1, 9);
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

describe('logCheckpoints', () => {
  it('keeps every count to 10, then thins out, always ending at n', () => {
    expect(logCheckpoints(0)).toEqual([]);
    expect(logCheckpoints(1)).toEqual([1]);
    expect(logCheckpoints(7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(logCheckpoints(12)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const pts = logCheckpoints(100_000);
    expect(pts[pts.length - 1]).toBe(100_000);
    for (let i = 1; i < pts.length; i++) expect(pts[i]).toBeGreaterThan(pts[i - 1]);
  });
  it('places about perDecade points per decade once past 10', () => {
    const inDecade = (pts: number[], lo: number) => pts.filter((k) => k > lo && k <= lo * 10).length;
    expect(inDecade(logCheckpoints(1e6), 1e4)).toBe(40);
    expect(inDecade(logCheckpoints(1e6, 10), 1e4)).toBe(10);
    // Early decades lose a few to rounding collisions (10^(1 + e/40) repeats integers below ~60).
    expect(inDecade(logCheckpoints(1e6), 10)).toBeLessThanOrEqual(40);
  });
});

describe('runningStats', () => {
  it('equals a direct mean and population SD at every checkpoint', () => {
    const xs = Array.from({ length: 3000 }, (_, i) => ((i * 7919) % 101) - 37);
    const pts = runningStats(xs);
    expect(pts.map((p) => p.n)).toEqual(logCheckpoints(xs.length));
    for (const p of pts) {
      const head = xs.slice(0, p.n);
      expect(p.mean).toBeCloseTo(mean(head), 10);
      expect(p.sd).toBeCloseTo(stdDev(head), 9);
    }
  });
  it('reports at the counts it is given, and nothing for an empty input', () => {
    expect(runningStats([1, 2, 3, 4], [2, 4])).toEqual([{ n: 2, mean: 1.5, sd: 0.5 }, { n: 4, mean: 2.5, sd: Math.sqrt(1.25) }]);
    expect(runningStats([])).toEqual([]);
  });
  it('stays accurate on a huge offset, where the naive sum of squares cancels', () => {
    const xs = Array.from({ length: 1000 }, (_, i) => 1e9 + (i % 2)); // SD exactly 0.5
    const last = runningStats(xs).at(-1)!;
    expect(last.sd).toBeCloseTo(0.5, 9);
  });
});

describe('classification metrics', () => {
  it('derives the textbook numbers', () => {
    // 100 sick of 1,000; the test catches 90 and false-alarms on 45
    const m = classificationMetrics({ tp: 90, fn: 10, fp: 45, tn: 855 });
    expect(m.precision).toBeCloseTo(90 / 135, 12);
    expect(m.recall).toBeCloseTo(0.9, 12);
    expect(m.specificity).toBeCloseTo(0.95, 12);
    expect(m.fpr).toBeCloseTo(0.05, 12);
    expect(m.accuracy).toBeCloseTo(0.945, 12);
    expect(m.f1).toBeCloseTo((2 * m.precision * m.recall) / (m.precision + m.recall), 12);
  });

  it('says NaN for an undefined metric instead of inventing one', () => {
    const m = classificationMetrics({ tp: 0, fp: 0, fn: 5, tn: 5 });
    expect(m.precision).toBeNaN();
    expect(m.recall).toBe(0);
    expect(classificationMetrics({ tp: 0, fp: 0, fn: 0, tn: 0 }).accuracy).toBeNaN();
  });

  it('counts outcomes at a threshold (score ≥ threshold is positive)', () => {
    const ex = [
      { score: 0.1, label: 0 as const },
      { score: 0.4, label: 1 as const },
      { score: 0.5, label: 0 as const },
      { score: 0.9, label: 1 as const },
    ];
    expect(confusionAt(ex, 0.5)).toEqual({ tp: 1, fp: 1, fn: 1, tn: 1 });
    expect(confusionAt(ex, 0)).toEqual({ tp: 2, fp: 2, fn: 0, tn: 0 });
    expect(confusionAt(ex, 1)).toEqual({ tp: 0, fp: 0, fn: 2, tn: 2 });
  });
});
