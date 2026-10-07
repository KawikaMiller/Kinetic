/**
 * Quickselect with Lomuto partitioning (the same moves as quick sort in the sorting lesson),
 * three pivot rules, and the matching full quick sort for the comparison race. Every value
 * comparison is counted, median-of-three's included.
 */
import { mulberry32, randInt, type Rnd } from '../../core/random';

export type PivotRule = 'last' | 'random' | 'median3';

export const MAX_VALUES = 16;
export const MAX_VALUE = 99;
export const DEFAULT_SEED = 7;

export type QsStep =
  | { t: 'round'; lo: number; hi: number; arr: number[] }
  | { t: 'pivot'; lo: number; hi: number; chosen: number; sample: number[] | null; cmps: number; arr: number[] }
  | { t: 'cmp'; lo: number; hi: number; i: number; j: number; small: boolean; swapped: boolean; arr: number[] }
  | { t: 'place'; lo: number; hi: number; p: number; arr: number[] }
  | { t: 'keep'; lo: number; hi: number; p: number; next: [number, number] | null };

export interface SelectRun {
  steps: QsStep[];
  value: number;
  /** Final array: everything left of k is ≤ value, everything right is ≥ value. */
  arr: number[];
  comparisons: number;
  rounds: number;
}

/** Pivot rules choose an index in [lo, hi] and report the comparisons they spent. */
function choosePivot(a: readonly number[], lo: number, hi: number, rule: PivotRule, rnd: Rnd): { at: number; sample: number[] | null; cmps: number } {
  if (rule === 'random') return { at: randInt(lo, hi, rnd), sample: null, cmps: 0 };
  if (rule === 'median3' && hi - lo >= 2) {
    const mid = Math.floor((lo + hi) / 2);
    const m = medianOfThree(a, lo, mid, hi);
    return { at: m.at, sample: [lo, mid, hi], cmps: m.cmps };
  }
  return { at: hi, sample: null, cmps: 0 };
}

/** The index holding the median of a[x], a[y], a[z], with the comparisons it took (2 or 3). */
export function medianOfThree(a: readonly number[], x: number, y: number, z: number): { at: number; cmps: number } {
  const [p, q, r] = [a[x], a[y], a[z]];
  if (p < q) {
    if (q < r) return { at: y, cmps: 2 };
    return { at: p < r ? z : x, cmps: 3 };
  }
  if (p < r) return { at: x, cmps: 2 };
  return { at: q < r ? z : y, cmps: 3 };
}

const swap = (a: number[], i: number, j: number) => {
  [a[i], a[j]] = [a[j], a[i]];
};

/**
 * Lomuto partition of a[lo..hi] around a[hi]: values ≤ pivot move left of i. Records each
 * comparison when `steps` is given. Returns the pivot's final index and the comparisons made.
 */
function partition(a: number[], lo: number, hi: number, steps: QsStep[] | null): { p: number; cmps: number } {
  const pivot = a[hi];
  let i = lo;
  let cmps = 0;
  for (let j = lo; j < hi; j++) {
    cmps++;
    const small = a[j] <= pivot;
    const swapped = small && i !== j;
    if (small) {
      if (swapped) swap(a, i, j);
      i++;
    }
    steps?.push({ t: 'cmp', lo, hi, i, j, small, swapped, arr: a.slice() });
  }
  swap(a, i, hi);
  return { p: i, cmps };
}

/** Find the value at sorted index k. The array is copied; nothing outside is changed. */
export function quickselect(values: readonly number[], k: number, rule: PivotRule, seed = DEFAULT_SEED): SelectRun {
  if (!Number.isInteger(k) || k < 0 || k >= values.length) throw new RangeError(`k = ${k} is outside 0..${values.length - 1}`);
  const a = values.slice();
  const rnd = mulberry32(seed);
  const steps: QsStep[] = [];
  let lo = 0;
  let hi = a.length - 1;
  let comparisons = 0;
  let rounds = 0;
  for (;;) {
    if (lo === hi) {
      steps.push({ t: 'keep', lo, hi, p: lo, next: null });
      break;
    }
    rounds++;
    steps.push({ t: 'round', lo, hi, arr: a.slice() });
    const choice = choosePivot(a, lo, hi, rule, rnd);
    comparisons += choice.cmps;
    swap(a, choice.at, hi);
    steps.push({ t: 'pivot', lo, hi, chosen: choice.at, sample: choice.sample, cmps: choice.cmps, arr: a.slice() });
    const { p, cmps } = partition(a, lo, hi, steps);
    comparisons += cmps;
    steps.push({ t: 'place', lo, hi, p, arr: a.slice() });
    const next: [number, number] | null = p === k ? null : k < p ? [lo, p - 1] : [p + 1, hi];
    steps.push({ t: 'keep', lo, hi, p, next });
    if (!next) break;
    [lo, hi] = next;
  }
  return { steps, value: a[k], arr: a, comparisons, rounds };
}

/** A full quick sort with the same pivot rule (and the same seed): its total comparisons. */
export function quicksortComparisons(values: readonly number[], rule: PivotRule, seed = DEFAULT_SEED): { comparisons: number; sorted: number[] } {
  const a = values.slice();
  const rnd = mulberry32(seed);
  let comparisons = 0;
  const go = (lo: number, hi: number) => {
    if (lo >= hi) return;
    const choice = choosePivot(a, lo, hi, rule, rnd);
    comparisons += choice.cmps;
    swap(a, choice.at, hi);
    const { p, cmps } = partition(a, lo, hi, null);
    comparisons += cmps;
    go(lo, p - 1);
    go(p + 1, hi);
  };
  go(0, a.length - 1);
  return { comparisons, sorted: a };
}

/** Last-element pivot on ascending distinct input: ranges [0, h] for h = n−1 down to k, h comparisons each. */
export const sortedLastComparisons = (n: number, k: number) => ((n - 1 + k) * (n - k)) / 2;

export type Winner = 'select' | 'sort' | 'tie';
export const winner = (select: number, sort: number): Winner => (select < sort ? 'select' : select > sort ? 'sort' : 'tie');

/** True when xs and ys hold the same values, in any order. */
export function sameMultiset(xs: readonly number[], ys: readonly number[]): boolean {
  if (xs.length !== ys.length) return false;
  const a = [...xs].sort((p, q) => p - q);
  const b = [...ys].sort((p, q) => p - q);
  return a.every((v, i) => v === b[i]);
}

// ── Which k ───────────────────────────────────────────────────────────

export type KChoice = 'min' | 'q1' | 'median' | 'q3' | 'max';
export const K_CHOICES: { value: KChoice; label: string }[] = [
  { value: 'min', label: 'Smallest' },
  { value: 'q1', label: '25%' },
  { value: 'median', label: 'Median' },
  { value: 'q3', label: '75%' },
  { value: 'max', label: 'Largest' },
];

/** The sorted index each choice means for n values (the lower median when n is even). */
export function kFor(choice: KChoice, n: number): number {
  const last = n - 1;
  switch (choice) {
    case 'min': return 0;
    case 'q1': return Math.floor(last / 4);
    case 'median': return Math.floor(last / 2);
    case 'q3': return Math.floor((3 * last) / 4);
    case 'max': return last;
  }
}

// ── Input ─────────────────────────────────────────────────────────────

export type ValuesResult = { ok: true; values: number[] } | { ok: false; error: string };
const PLAIN_INT = /^-?\d+$/;

/** 1 to 16 whole numbers from 0 to 99, or the sentence to show instead. */
export function parseValues(text: string): ValuesResult {
  const t = text.trim();
  if (t === '') return { ok: false, error: 'Type at least one number.' };
  if (/^,|,$|,\s*,/.test(t)) return { ok: false, error: 'There’s a gap in the list: remove the extra comma.' };
  const tokens = t.split(/[\s,]+/);
  if (!tokens.every((s) => PLAIN_INT.test(s))) return { ok: false, error: 'Type whole numbers separated by commas or spaces, like 37, 12, 85.' };
  if (tokens.some((s) => s.startsWith('-'))) return { ok: false, error: `No negatives here: use whole numbers from 0 to ${MAX_VALUE}.` };
  if (tokens.length > MAX_VALUES) return { ok: false, error: `Up to ${MAX_VALUES} numbers fit on screen; that’s ${tokens.length}.` };
  if (tokens.some((s) => s.replace(/^0+(?=\d)/, '').length > 2)) return { ok: false, error: `Keep each number between 0 and ${MAX_VALUE}.` };
  return { ok: true, values: tokens.map(Number) };
}

export const PRESETS = [
  { id: 'shuffled', label: 'Shuffled', values: [37, 12, 85, 3, 64, 23, 91, 50, 8, 71, 44] },
  { id: 'sorted', label: 'Sorted', values: [3, 8, 12, 23, 37, 44, 50, 64, 71, 85, 91, 97] },
  { id: 'dupes', label: 'Duplicates', values: [5, 2, 5, 9, 2, 5, 1, 5, 7, 5] },
] as const;
