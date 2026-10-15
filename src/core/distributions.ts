/**
 * Probability distributions for the statistics, queueing and performance lessons: seeded
 * samplers, densities and cumulative distributions, and a Kolmogorov-Smirnov distance to
 * check one against the other.
 *
 * Every sampler takes an `Rnd` first (pass `mulberry32(seed)` for a reproducible run), so the
 * same seed gives the same sample. Each sampler has a matching `*Pdf`/`*Pmf` and `*Cdf`, and
 * the tests hold them to each other: the pdf integrates to 1, the cdf equals the integral of
 * the pdf, and `ksStatistic(samples, cdf)` stays small.
 */
import type { Rnd } from './random';

const SQRT2 = Math.SQRT2;
const SQRT_PI = Math.sqrt(Math.PI);

/* ---------- special functions ---------- */

/** erf switches from its Taylor series to the erfc continued fraction beyond this |x|. */
const ERF_SERIES_LIMIT = 3;
const ERF_SERIES_TERMS = 80;
const ERFC_FRACTION_DEPTH = 80;

/** Complementary error function for x > ERF_SERIES_LIMIT, by its continued fraction. */
function erfcTail(x: number): number {
  let tail = x;
  for (let n = ERFC_FRACTION_DEPTH; n >= 1; n--) tail = x + n / 2 / tail;
  return Math.exp(-x * x) / (SQRT_PI * tail);
}

/** The error function, accurate to about 1e-13 everywhere. */
export function erf(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const a = Math.abs(x);
  if (a > ERF_SERIES_LIMIT) return Math.sign(x) * (1 - erfcTail(a));
  let term = a;
  let sum = a;
  for (let n = 1; n < ERF_SERIES_TERMS; n++) {
    term *= (-a * a) / n;
    sum += term / (2 * n + 1);
  }
  return Math.sign(x) * ((2 / SQRT_PI) * sum);
}

/** ln(k!) by summing logs: exact enough for the Poisson and Zipf sizes a lesson uses. */
function lnFactorial(k: number): number {
  let s = 0;
  for (let i = 2; i <= k; i++) s += Math.log(i);
  return s;
}

/* ---------- normal ---------- */

export const normalPdf = (x: number, mean = 0, sd = 1) => Math.exp(-0.5 * ((x - mean) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));

/** P(X ≤ x). The far tail uses erfc directly, so it keeps its tiny values instead of rounding to 0 or 1. */
export function normalCdf(x: number, mean = 0, sd = 1): number {
  const z = (x - mean) / (sd * SQRT2);
  if (z < -ERF_SERIES_LIMIT) return 0.5 * erfcTail(-z);
  if (z > ERF_SERIES_LIMIT) return 1 - 0.5 * erfcTail(z);
  return 0.5 * (1 + erf(z));
}

/** One normal sample (Box-Muller; uses two uniforms per call so a seed maps to a sample 1:1). */
export function normal(rnd: Rnd, mean = 0, sd = 1): number {
  const u = 1 - rnd();
  const v = rnd();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ---------- exponential ---------- */

export const exponentialPdf = (x: number, rate = 1) => (x < 0 ? 0 : rate * Math.exp(-rate * x));
export const exponentialCdf = (x: number, rate = 1) => (x < 0 ? 0 : -Math.expm1(-rate * x));

/** Exponential with the given rate (mean 1/rate). `expSample` in core/random takes the mean instead. */
export const exponential = (rnd: Rnd, rate = 1) => -Math.log(1 - rnd()) / rate;

/* ---------- log-normal ---------- */

/** `mu` and `sigma` are the mean and SD of ln X, not of X. */
export const lognormalPdf = (x: number, mu = 0, sigma = 1) => (x <= 0 ? 0 : normalPdf(Math.log(x), mu, sigma) / x);
export const lognormalCdf = (x: number, mu = 0, sigma = 1) => (x <= 0 ? 0 : normalCdf(Math.log(x), mu, sigma));
export const lognormal = (rnd: Rnd, mu = 0, sigma = 1) => Math.exp(normal(rnd, mu, sigma));

/* ---------- Pareto ---------- */

/** Pareto type I: minimum `xm`, tail index `alpha` (P(X > x) = (xm/x)^alpha). */
export const paretoPdf = (x: number, xm: number, alpha: number) => (x < xm ? 0 : (alpha * xm ** alpha) / x ** (alpha + 1));
export const paretoCdf = (x: number, xm: number, alpha: number) => (x < xm ? 0 : 1 - (xm / x) ** alpha);
export const pareto = (rnd: Rnd, xm: number, alpha: number) => xm / (1 - rnd()) ** (1 / alpha);

/* ---------- Poisson ---------- */

/** P(X = k) for X ~ Poisson(lambda), worked in log space so a large lambda doesn't overflow. */
export function poissonPmf(k: number, lambda: number): number {
  if (!Number.isInteger(k) || k < 0) return 0;
  if (lambda === 0) return k === 0 ? 1 : 0;
  return Math.exp(-lambda + k * Math.log(lambda) - lnFactorial(k));
}

/** P(X ≤ k). */
export function poissonCdf(k: number, lambda: number): number {
  let sum = 0;
  for (let i = 0; i <= Math.floor(k); i++) sum += poissonPmf(i, lambda);
  return Math.min(1, sum);
}

/** Largest lambda Knuth's product method handles in one go (e^-500 is still a normal double). */
const POISSON_CHUNK = 500;

/** A Poisson count (Knuth's product of uniforms; a large lambda is split into chunks, since Poisson sums). */
export function poisson(rnd: Rnd, lambda: number): number {
  let count = 0;
  for (let left = lambda; left > 0; left -= POISSON_CHUNK) {
    const limit = Math.exp(-Math.min(left, POISSON_CHUNK));
    let p = 1;
    for (;;) {
      p *= rnd();
      if (p <= limit) break;
      count++;
    }
  }
  return count;
}

/* ---------- Zipf ---------- */

/** Generalised harmonic number H(n, s) = Σ k^-s for k = 1..n: the Zipf normaliser. */
export function harmonic(n: number, s = 1): number {
  let h = 0;
  for (let k = 1; k <= n; k++) h += k ** -s;
  return h;
}

/** P(rank = k) under Zipf with `n` ranks and exponent `s`; 0 outside 1..n. */
export const zipfPmf = (k: number, n: number, s = 1) => (Number.isInteger(k) && k >= 1 && k <= n ? k ** -s / harmonic(n, s) : 0);

/**
 * A Zipf sampler over ranks 1..n (rank 1 is the hottest). Builds the cumulative table once
 * and returns a function taking an `Rnd`, so a draw is one binary search:
 * `const draw = zipfSampler(1000, 1.1); draw(rnd)`.
 */
export function zipfSampler(n: number, s = 1): (rnd: Rnd) => number {
  const cum: number[] = [];
  let total = 0;
  for (let k = 1; k <= n; k++) cum.push((total += k ** -s));
  return (rnd) => {
    const target = rnd() * total;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] > target) hi = mid;
      else lo = mid + 1;
    }
    return lo + 1;
  };
}

/* ---------- quantiles and goodness of fit ---------- */

/**
 * The p-quantile of an ascending-sorted sample with linear interpolation between neighbours
 * (the usual "type 7"). core/sim `percentile` instead picks an element, which is what a
 * latency percentile on a list of requests means; use this one for a smooth estimate.
 * NaN for an empty sample.
 */
export function quantile(sorted: readonly number[], p: number): number {
  if (!sorted.length) return NaN;
  const pos = Math.min(1, Math.max(0, p)) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
}

/**
 * The Kolmogorov-Smirnov distance between a sample and a continuous cdf: the largest gap
 * between the sample's step function and `cdf`. Under the null it is about 0.87/√n typically
 * and stays below `ksCritical(n)` all but 1 time in 1000.
 */
export function ksStatistic(sample: readonly number[], cdf: (x: number) => number): number {
  const xs = [...sample].sort((a, b) => a - b);
  const n = xs.length;
  let d = 0;
  xs.forEach((x, i) => {
    const f = cdf(x);
    d = Math.max(d, Math.abs((i + 1) / n - f), Math.abs(f - i / n));
  });
  return d;
}

/** Coefficient of the KS critical value at the 0.001 level. */
const KS_C_001 = 1.95;

/** A KS distance above this, for a sample of n, rejects the fit at the 0.1% level. */
export const ksCritical = (n: number) => KS_C_001 / Math.sqrt(n);
