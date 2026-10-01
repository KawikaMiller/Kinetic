/**
 * Counting and statistics for the combinatorics, birthday-paradox, probability-basics,
 * expected-value, conditional-bayes, shuffle-reservoir, linear-time-sorting and
 * classification-metrics lessons. `mean` and `percentile` live in core/sim; use those.
 */
import { mean } from './sim';

/** n! exactly. */
export function factorial(n: number): bigint {
  if (!Number.isInteger(n) || n < 0) throw new RangeError('factorial takes a non-negative integer');
  let r = 1n;
  for (let i = 2n; i <= BigInt(n); i++) r *= i;
  return r;
}

/** n choose k exactly; 0 when k is outside 0..n. */
export function choose(n: number, k: number): bigint {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0) throw new RangeError('choose takes integers with n ≥ 0');
  if (k < 0 || k > n) return 0n;
  const kk = Math.min(k, n - k);
  let r = 1n;
  for (let i = 1; i <= kk; i++) r = (r * BigInt(n - kk + i)) / BigInt(i);
  return r;
}

/** log₂(n!) as a float, summed so it never overflows: the comparison-sort lower bound. */
export function log2Factorial(n: number): number {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log2(i);
  return s;
}

/** Variance: population by default, sample (n − 1) with `{ sample: true }`. NaN with too few values. */
export function variance(xs: readonly number[], opts: { sample?: boolean } = {}): number {
  const n = xs.length;
  const div = opts.sample ? n - 1 : n;
  if (div <= 0) return NaN;
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / div;
}

export const stdDev = (xs: readonly number[], opts: { sample?: boolean } = {}) => Math.sqrt(variance(xs, opts));

export interface Histogram {
  /** bins + 1 boundaries, from min to max. */
  edges: number[];
  counts: number[];
  /** Values outside [min, max], which aren't counted in any bin. */
  outside: number;
}

/**
 * Equal-width histogram over [min, max]. Each bin is half-open [a, b) except the last,
 * which includes max, so a value exactly at max is counted.
 */
export function histogram(xs: readonly number[], o: { bins: number; min: number; max: number }): Histogram {
  if (!(o.bins >= 1) || !(o.max > o.min)) throw new RangeError('histogram needs bins ≥ 1 and max > min');
  const width = (o.max - o.min) / o.bins;
  const edges = Array.from({ length: o.bins + 1 }, (_, i) => o.min + i * width);
  const counts = new Array<number>(o.bins).fill(0);
  let outside = 0;
  for (const x of xs) {
    if (x < o.min || x > o.max || Number.isNaN(x)) {
      outside++;
      continue;
    }
    counts[x === o.max ? o.bins - 1 : Math.floor((x - o.min) / width)]++;
  }
  return { edges, counts, outside };
}

/** P(X = k) for X ~ Binomial(n, p). */
export function binomialPmf(n: number, k: number, p: number): number {
  if (k < 0 || k > n) return 0;
  return Number(choose(n, k)) * p ** k * (1 - p) ** (n - k);
}

/** Above this many items `collisionProbability` switches from the exact product to the approximation. */
export const COLLISION_EXACT_LIMIT = 100_000;

/**
 * The birthday problem: probability that at least two of n items picked uniformly from `space`
 * values collide. Exact product form up to COLLISION_EXACT_LIMIT items, then
 * 1 − e^(−n(n−1)/2d); `method` says which, so the lesson can label it.
 */
export function collisionProbability(n: number, space: number): { p: number; method: 'exact' | 'approx' } {
  if (n <= 1) return { p: 0, method: 'exact' };
  if (n > space) return { p: 1, method: 'exact' };
  if (n <= COLLISION_EXACT_LIMIT) {
    let noCollision = 1;
    for (let i = 1; i < n; i++) noCollision *= (space - i) / space;
    return { p: 1 - noCollision, method: 'exact' };
  }
  return { p: 1 - Math.exp((-n * (n - 1)) / (2 * space)), method: 'approx' };
}

/** The mean after each value: running[i] = mean(xs[0..i]). The law of large numbers, live. */
export function runningMean(xs: readonly number[]): number[] {
  let sum = 0;
  return xs.map((x, i) => (sum += x) / (i + 1));
}
