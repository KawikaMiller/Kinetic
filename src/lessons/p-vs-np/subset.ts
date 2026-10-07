import { mulberry32 } from '../../core/random';

/**
 * Subset sum: given numbers and a target, is there a subset that adds up to the target?
 * Checking a proposed subset (the certificate) takes one pass over the numbers; finding
 * one by brute force tries up to 2ⁿ subsets. The DP solver's cost depends on the target's
 * value, which makes it pseudo-polynomial.
 */

export const MAX_ITEMS = 24;
export const MAX_ABS = 1_000_000;
export const SIZES = [6, 10, 14, 18, 24] as const;

export interface Instance {
  numbers: number[];
  target: number;
}

/** Seeded numbers 1…40, with the target the sum of a seeded subset, so a solution exists. */
export function seededInstance(seed: number, n: number): Instance {
  const rnd = mulberry32(seed);
  const numbers = Array.from({ length: n }, () => 1 + Math.floor(rnd() * 40));
  let target = 0;
  numbers.forEach((v) => {
    if (rnd() < 0.4) target += v;
  });
  return { numbers, target: target || numbers[0] };
}

export interface Verification {
  sum: number;
  ok: boolean;
  /** One step per number looked at: n, whatever the subset. */
  steps: number;
}

/** The verifier: one pass over the numbers, adding the chosen ones. */
export function verify(numbers: readonly number[], chosen: readonly boolean[], target: number): Verification {
  let sum = 0;
  let steps = 0;
  for (let i = 0; i < numbers.length; i++) {
    steps++;
    if (chosen[i]) sum += numbers[i];
  }
  return { sum, ok: sum === target, steps };
}

/** Lowest set bit's index: which element a Gray-code step flips. */
const lowBit = (i: number) => 31 - Math.clz32(i & -i);

export interface SolverState {
  /** Subsets tried so far, the empty one included. */
  tried: number;
  total: number;
  hits: number;
  /** The first subset found that hits the target, as a bit mask, or null. */
  first: number | null;
  /** The subset being tried right now. */
  mask: number;
  sum: number;
  done: boolean;
}

/**
 * Brute force over all 2ⁿ subsets in Gray-code order, so each next subset differs by one
 * number and costs O(1). `advance` runs a budget of subsets and can be resumed; no early exit.
 */
export function createSolver(numbers: readonly number[], target: number) {
  const n = numbers.length;
  const total = 2 ** n;
  const s: SolverState = { tried: 1, total, hits: target === 0 ? 1 : 0, first: target === 0 ? 0 : null, mask: 0, sum: 0, done: total === 1 };
  return {
    state: () => ({ ...s }),
    advance(budget: number) {
      for (let k = 0; k < budget && !s.done; k++) {
        const bit = lowBit(s.tried);
        const on = (s.mask >>> bit) & 1;
        s.mask ^= 1 << bit;
        s.sum += on ? -numbers[bit] : numbers[bit];
        s.tried++;
        if (s.sum === target) {
          s.hits++;
          s.first ??= s.mask >>> 0;
        }
        if (s.tried === total) s.done = true;
      }
      return { ...s };
    },
  };
}

export const maskToChosen = (mask: number, n: number) => Array.from({ length: n }, (_, i) => ((mask >>> i) & 1) === 1);

export interface DpResult {
  possible: boolean;
  /** (n + 1) × (target + 1) cells filled. */
  cells: number;
  /** reach[i][s]: some subset of the first i numbers sums to s. */
  reach: boolean[][];
}

/** The classic table for non-negative numbers and target. */
export function dpSolve(numbers: readonly number[], target: number): DpResult {
  if (target < 0 || numbers.some((v) => v < 0)) throw new RangeError('The table needs non-negative numbers and target');
  const reach: boolean[][] = [Array.from({ length: target + 1 }, (_, s) => s === 0)];
  numbers.forEach((v, i) => {
    const prev = reach[i];
    reach.push(prev.map((r, s) => r || (s >= v && prev[s - v])));
  });
  return { possible: reach[numbers.length][target], cells: (numbers.length + 1) * (target + 1), reach };
}

/** Cells the DP table needs, without building it. */
export const dpCells = (n: number, target: number) => (n + 1) * (target + 1);

/* ---------- the pseudo-polynomial trap ---------- */

export const TRAP_N = 8;
export const MAX_DIGITS = 9;
/** Above this many cells the table is only counted, not built. */
export const DP_RUN_LIMIT = 2_000_000;

/** TRAP_N numbers with exactly `digits` digits each, and a target that is the sum of half of them. */
export function trapInstance(digits: number, seed = 7): Instance {
  const rnd = mulberry32(seed + digits);
  const lo = 10 ** (digits - 1);
  const numbers = Array.from({ length: TRAP_N }, () => lo + Math.floor(rnd() * (9 * lo)));
  const target = numbers.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
  return { numbers, target };
}

/** Digits needed to write the whole input down: the size the complexity is measured against. */
export const inputDigits = (inst: Instance) => [...inst.numbers, inst.target].reduce((s, v) => s + String(Math.abs(v)).length, 0);

/* ---------- parsing the learner's own instance ---------- */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** A list of integers, commas and/or spaces, at most MAX_ITEMS of them, each within ±MAX_ABS. */
export function parseNumbers(text: string): Parsed<number[]> {
  const parts = text.split(/[\s,]+/).filter((p) => p !== '');
  if (!parts.length) return { ok: false, error: 'Type some whole numbers, separated by commas or spaces.' };
  if (/,\s*,/.test(text)) return { ok: false, error: 'There is a gap between two commas: remove the extra comma.' };
  if (parts.length > MAX_ITEMS) return { ok: false, error: `That's ${parts.length} numbers; keep it to ${MAX_ITEMS} so brute force finishes (2²⁴ ≈ 16.8 million subsets).` };
  const values: number[] = [];
  for (const p of parts) {
    if (!/^-?\d+$/.test(p)) return { ok: false, error: `"${p.slice(0, 20)}" isn't a whole number.` };
    if (p.replace('-', '').length > 7 || Math.abs(Number(p)) > MAX_ABS) return { ok: false, error: `${p.slice(0, 20)} is outside ±${MAX_ABS.toLocaleString('en')}.` };
    values.push(Number(p) || 0); // "-0" is just 0
  }
  return { ok: true, value: values };
}

/** The size the "how long would n = 60 take" line extrapolates to. */
export const EXTRAPOLATE_N = 60;

/** Seconds to try all 2^n subsets at a measured rate (subsets per millisecond). */
export const extrapolatedSeconds = (perMs: number, n = EXTRAPOLATE_N) => 2 ** n / perMs / 1000;
