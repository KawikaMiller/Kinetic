// Pure maths for conditional-bayes. The three rates are whole numbers of tenths of a percent
// (‰), so every posterior is an exact fraction of integers (BigInt), and the 1,000-person grid
// is the expected counts rounded by largest remainder so the four groups always sum to 1,000.
import type { Confusion } from '../../core/stats';

/** Rates are held in tenths of a percent: 10 = 1%, 990 = 99%. */
export const SCALE = 1000;
export const POPULATION = 1000;
/** "Update again" applies at most this many positive tests in a row. */
export const MAX_TESTS = 3;

export interface Rates {
  /** Base rate: who has it, before any test. */
  prevalence: number;
  /** P(positive | has it), the true-positive rate. */
  sensitivity: number;
  /** P(negative | doesn't have it), the true-negative rate. */
  specificity: number;
}

/** An exact probability num/den. */
export interface Ratio {
  num: bigint;
  den: bigint;
}

export const toNumber = (r: Ratio) => Number(r.num) / Number(r.den);

/**
 * The prior before test number `tests` (1-based): the base rate for the first test, and for each
 * later positive test, the previous posterior. With k positives so far the odds are the base
 * odds × (sensitivity / (1 − specificity))ᵏ, which is what repeated Bayes updates give when
 * the tests' errors are independent.
 */
export function priorBefore(r: Rates, tests: number): Ratio {
  const k = BigInt(tests - 1);
  const s = BigInt(r.sensitivity);
  const f = BigInt(SCALE - r.specificity);
  const sick = BigInt(r.prevalence) * s ** k;
  const well = BigInt(SCALE - r.prevalence) * f ** k;
  return { num: sick, den: sick + well };
}

/** P(has it | positive) after `tests` positive results in a row. The sliders keep sensitivity ≥ 50%, so the denominator is never 0. */
export function posterior(r: Rates, tests = 1): Ratio {
  return priorBefore(r, tests + 1);
}

/**
 * Bayes' theorem term by term, for the panel: P(+|A)·P(A) and P(+), each as a probability.
 * P(A | +) = P(+ | A)·P(A) / P(+).
 */
export function bayesTerms(r: Rates, tests = 1) {
  const prior = priorBefore(r, tests);
  const p = toNumber(prior);
  const sens = r.sensitivity / SCALE;
  const fpr = 1 - r.specificity / SCALE;
  const joint = sens * p;
  const positive = joint + fpr * (1 - p);
  return { prior: p, sens, fpr, joint, positive, posterior: toNumber(posterior(r, tests)) };
}

/**
 * Largest-remainder rounding of exact expected counts num[i] / den (which sum to `total`):
 * floor each, then hand the leftover units to the biggest remainders (earlier groups win ties).
 */
export function largestRemainder(nums: readonly bigint[], den: bigint, total: number): number[] {
  const floors = nums.map((n) => n / den);
  let left = total - Number(floors.reduce((a, b) => a + b, 0n));
  const order = nums.map((n, i) => ({ i, rem: n % den })).sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  const out = floors.map(Number);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

/** The four groups among POPULATION people for test number `tests`, rounded to whole people. */
export function groupCounts(r: Rates, tests = 1): Confusion {
  const prior = priorBefore(r, tests);
  const s = BigInt(r.sensitivity);
  const c = BigInt(r.specificity);
  const scale = BigInt(SCALE);
  const pop = BigInt(POPULATION);
  // Expected count = POPULATION × P(group): numerators over den × SCALE, summing to POPULATION.
  const sick = prior.num;
  const well = prior.den - prior.num;
  const nums = [pop * sick * s, pop * sick * (scale - s), pop * well * (scale - c), pop * well * c];
  const [tp, fn, fp, tn] = largestRemainder(nums, prior.den * scale, POPULATION);
  return { tp, fp, fn, tn };
}

/** The exact expected counts (unrounded), for checking the grid. */
export function expectedCounts(r: Rates, tests = 1): Confusion {
  const p = toNumber(priorBefore(r, tests));
  const s = r.sensitivity / SCALE;
  const c = r.specificity / SCALE;
  return { tp: POPULATION * p * s, fn: POPULATION * p * (1 - s), fp: POPULATION * (1 - p) * (1 - c), tn: POPULATION * (1 - p) * c };
}

/** Grid order: people who have it first (caught, then missed), then those who don't (false alarms, then cleared). */
export type Group = keyof Confusion;
export const GROUP_ORDER: readonly Group[] = ['tp', 'fn', 'fp', 'tn'];

/** Which group person i (0-based, row-major) belongs to. */
export function groupOf(counts: Confusion, i: number): Group {
  let start = 0;
  for (const g of GROUP_ORDER) {
    start += counts[g];
    if (i < start) return g;
  }
  return 'tn';
}

export interface Preset {
  id: string;
  label: string;
  rates: Rates;
  labels: { positive: string; negative: string };
}

export const PRESETS: readonly Preset[] = [
  { id: 'test', label: 'Medical test', rates: { prevalence: 10, sensitivity: 990, specificity: 990 }, labels: { positive: 'sick', negative: 'healthy' } },
  { id: 'rarer', label: 'Rarer condition', rates: { prevalence: 1, sensitivity: 990, specificity: 990 }, labels: { positive: 'sick', negative: 'healthy' } },
  { id: 'alert', label: 'Alert rule', rates: { prevalence: 1, sensitivity: 990, specificity: 990 }, labels: { positive: 'incident', negative: 'fine' } },
  { id: 'spam', label: 'Spam filter', rates: { prevalence: 450, sensitivity: 980, specificity: 995 }, labels: { positive: 'spam', negative: 'not spam' } },
  { id: 'fraud', label: 'Fraud check', rates: { prevalence: 2, sensitivity: 900, specificity: 980 }, labels: { positive: 'fraud', negative: 'legit' } },
];

/** "0.1%", "99%", "99.5%": a rate in tenths of a percent. */
export const rateText = (tenths: number) => `${tenths % 10 ? (tenths / 10).toFixed(1) : tenths / 10}%`;

/** A probability as a percentage to two significant decimals where it matters: 50%, 9.02%, 99%. */
export function probText(p: number): string {
  const v = p * 100;
  if (v === 0 || v === 100) return `${v}%`;
  const dp = v < 1 || v > 99 ? 3 : v < 10 || v > 90 ? 2 : 1;
  return `${trim(v.toFixed(dp))}%`;
}

const trim = (s: string) => (s.includes('.') ? s.replace(/\.?0+$/, '') : s);
