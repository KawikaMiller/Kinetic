// Pure maths for gcd-euclid: Euclid's remainder table, its rectangle tiling, the extended
// (Bézout) bookkeeping, the naive comparison and the Fibonacci worst case.
import { egcd, modInverse, type EuclidStep } from '../../core/numberTheory';
import { parseBoundedInt, type FieldParse } from '../../core/parse';

/** Largest value a learner may type: 10¹², still exact as a JS number. */
export const MAX_VALUE = 1_000_000_000_000;

/** One whole number from 0 to 10¹². Negatives, decimals, exponents, emoji and markup are refused. */
export function parseValue(text: string): FieldParse<number> {
  return parseBoundedInt(text, {
    min: 0,
    max: MAX_VALUE,
    // Commas only as thousands separators: "1,071" is one number, "10,71" or "1,2" is refused.
    thousands: true,
    messages: {
      grouping: 'One whole number, commas only between groups of three digits.',
      negative: 'Euclid here takes whole numbers from 0 up; no negatives.',
      invalid: () => 'Whole numbers only, like 1071 (no decimals, exponents or letters).',
      tooBig: () => 'Keep it at most 10¹² (a million million).',
    },
  });
}

/** Refuses the one pair Euclid can't answer: gcd(0, 0) has no largest divisor. */
export const pairError = (a: number, b: number) => (a === 0 && b === 0 ? 'gcd(0, 0) is undefined: every number divides 0. Make one of them non-zero.' : null);

export interface Row {
  a: number;
  q: number;
  b: number;
  r: number;
}

export interface Euclid {
  g: number;
  x: number;
  y: number;
  rows: Row[];
}

/** core egcd on plain numbers. */
export function euclid(a: number, b: number): Euclid {
  const { g, x, y, steps } = egcd(BigInt(a), BigInt(b));
  return { g: Number(g), x: Number(x), y: Number(y), rows: steps.map(toRow) };
}

const toRow = (s: EuclidStep): Row => ({ a: Number(s.a), q: Number(s.q), b: Number(s.b), r: Number(s.r) });

/** Plain gcd by trying every d from 1 to min(a, b): the slow way, for the comparison counter. */
export function naiveGcd(a: number, b: number): { g: number; trials: number } {
  if (a === 0 || b === 0) return { g: Math.max(a, b), trials: 0 };
  let g = 1;
  const top = Math.min(a, b);
  for (let d = 1; d <= top; d++) if (a % d === 0 && b % d === 0) g = d;
  return { g, trials: top };
}

/** Trials the naive method needs, without running it (it can be 10¹²). */
export const naiveTrials = (a: number, b: number) => (a === 0 || b === 0 ? 0 : Math.min(a, b));

// ── Extended Euclid ──────────────────────────────────────────────────

export interface BezoutRow {
  /** The remainder on this row: r = a·x + b·y. */
  r: number;
  /** The quotient that made this row from the two above (null on the two starting rows). */
  q: number | null;
  x: number;
  y: number;
}

/**
 * The forward extended-Euclid table: rows start with a (x = 1, y = 0) and b (x = 0, y = 1);
 * each next row is the one two up minus q times the one above, for r, x and y alike, so
 * every row keeps r = a·x + b·y. It stops at the last non-zero remainder, the gcd, whose
 * x and y are the Bézout coefficients.
 */
export function bezoutRows(a: number, b: number): BezoutRow[] {
  const out: BezoutRow[] = [
    { r: a, q: null, x: 1, y: 0 },
    { r: b, q: null, x: 0, y: 1 },
  ];
  if (b === 0) return out.slice(0, 1);
  for (const row of euclid(a, b).rows) {
    if (row.r === 0) break;
    const [two, one] = [out[out.length - 2], out[out.length - 1]];
    out.push({ r: row.r, q: row.q, x: two.x - row.q * one.x, y: two.y - row.q * one.y });
  }
  return out;
}

/** a's inverse mod m, from core modInverse. */
export function inverse(a: number, m: number): number | null {
  const inv = modInverse(BigInt(a), BigInt(m));
  return inv === null ? null : Number(inv);
}

// ── Tiling ───────────────────────────────────────────────────────────

export interface Run {
  /** Which table row placed these squares. */
  row: number;
  /** Top-left of the first square, in the rectangle's own units (width = the larger number). */
  x: number;
  y: number;
  size: number;
  count: number;
  /** Squares march along this axis. */
  axis: 'x' | 'y';
}

/**
 * Euclid as tiling: the rectangle is max(a, b) wide and min(a, b) tall. Each row a = q·b + r
 * lays q squares of side b along the long side; the leftover b × r strip is the next rectangle.
 * A swap row (q = 0, when a < b) places nothing.
 */
export function tiling(a: number, b: number): Run[] {
  const { rows } = euclid(a, b);
  const runs: Run[] = [];
  let rect = { x: 0, y: 0, w: Math.max(a, b), h: Math.min(a, b) };
  rows.forEach((row, i) => {
    if (row.q === 0 || row.b === 0) return;
    const axis = rect.w >= rect.h ? 'x' : 'y';
    runs.push({ row: i, x: rect.x, y: rect.y, size: row.b, count: row.q, axis });
    const used = row.q * row.b;
    rect = axis === 'x'
      ? { x: rect.x + used, y: rect.y, w: rect.w - used, h: rect.h }
      : { x: rect.x, y: rect.y + used, w: rect.w, h: rect.h - used };
  });
  return runs;
}

/** What's left uncovered after `placed` squares of `run`. */
export function leftover(run: Run, placed: number, width: number, height: number): { x: number; y: number; w: number; h: number } {
  const used = placed * run.size;
  return run.axis === 'x'
    ? { x: run.x + used, y: run.y, w: width - (run.x + used), h: run.size }
    : { x: run.x, y: run.y + used, w: run.size, h: height - (run.y + used) };
}

// ── Worst case ───────────────────────────────────────────────────────

/** Fibonacci numbers 1, 2, 3, 5, 8, … up to `limit`. */
export function fibonacciUpTo(limit: number): number[] {
  const out = [1, 2];
  while (out[out.length - 1] + out[out.length - 2] <= limit) out.push(out[out.length - 1] + out[out.length - 2]);
  return out.filter((f) => f <= limit);
}

/** True for neighbouring Fibonacci numbers in either order (89, 55): Euclid's worst case. */
export function isConsecutiveFibonacci(a: number, b: number): boolean {
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  const fibs = fibonacciUpTo(hi);
  const i = fibs.indexOf(hi);
  return i > 0 && fibs[i - 1] === lo;
}

/**
 * The most division steps Euclid takes on any pair with N ≥ a ≥ b ≥ 1 (Lamé): the steps for
 * the largest consecutive Fibonacci pair up to N.
 */
export function worstSteps(limit: number): number {
  if (limit < 2) return limit < 1 ? 0 : 1;
  const fibs = fibonacciUpTo(limit);
  const hi = fibs[fibs.length - 1];
  const lo = fibs[fibs.length - 2] ?? 1;
  return euclid(hi, lo).rows.length;
}
