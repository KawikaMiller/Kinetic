/**
 * The cancellation scene: two functions that lose digits when written naively, each beside a rewrite that does not,
 * checked against an 80-digit oracle built from a BigInt integer square root. The oracle never uses the rewritten
 * formula, so a wrong rewrite would show up as wrong digits.
 */
export const K_MIN = 1;
export const K_MAX = 20;
export const K_DEFAULT = 16;

/** Decimal digits the oracle works to. */
const ORACLE_DIGITS = 80;
const SCALE = 10n ** BigInt(ORACLE_DIGITS);
/** Significant digits the strip compares: a double carries about this many. */
export const STRIP_DIGITS = 16;
/** Digits of the oracle used for the relative error: more than a double holds, so the oracle's own rounding does not show. */
const ORACLE_PRECISION = 25;

/** floor(sqrt(n)) for a non-negative BigInt, by Newton's method. */
export function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** sqrt(v) in units of 10^-80, for an integer v. */
const rootScaled = (v: bigint) => isqrt(v * SCALE * SCALE);

export type FunctionId = 'sqrt-difference' | 'quadratic-root';

export const FUNCTIONS: { id: FunctionId; label: string; naive: string; stable: string }[] = [
  { id: 'sqrt-difference', label: 'sqrt(x + 1) - sqrt(x)', naive: 'Math.sqrt(x + 1) - Math.sqrt(x)', stable: '1 / (Math.sqrt(x + 1) + Math.sqrt(x))' },
  { id: 'quadratic-root', label: 'Smaller root of t^2 + b t + 1', naive: '(-b + Math.sqrt(b * b - 4)) / 2', stable: '1 / (-(b + Math.sqrt(b * b - 4)) / 2)' },
];

export const tenToThe = (k: number): number => Number(`1e${k}`);

export interface Candidates {
  naive: number;
  stable: number;
}

/** Both versions of a function at x = b = 10^k, in real JavaScript doubles. */
export function candidates(id: FunctionId, k: number): Candidates {
  const x = tenToThe(k);
  if (id === 'sqrt-difference') return { naive: Math.sqrt(x + 1) - Math.sqrt(x), stable: 1 / (Math.sqrt(x + 1) + Math.sqrt(x)) };
  const root = Math.sqrt(x * x - 4);
  const q = -(x + root) / 2;
  return { naive: (-x + root) / 2, stable: 1 / q };
}

/** The true value as a BigInt in units of 10^-80, for x = b = 10^k. */
export function oracleScaled(id: FunctionId, k: number): bigint {
  const x = 10n ** BigInt(k);
  if (id === 'sqrt-difference') return rootScaled(x + 1n) - rootScaled(x);
  // the root of smaller magnitude of t^2 + b t + 1 is -(b - sqrt(b^2 - 4)) / 2; its magnitude is the value compared
  const half = (x * SCALE - rootScaled(x * x - 4n)) / 2n;
  return -half;
}

/** The oracle's first `count` significant digits (STRIP_DIGITS by default), and the decimal exponent of the first one. */
export function oracleDigits(scaledValue: bigint, count = STRIP_DIGITS): { digits: string; exponent: number } {
  const negative = scaledValue < 0n;
  const text = (negative ? -scaledValue : scaledValue).toString();
  let exponent = text.length - 1 - ORACLE_DIGITS;
  const head = BigInt(text.slice(0, count).padEnd(count, '0'));
  // round half up on the next digit, so 4.99999999999999999e-9 reads as 5.000000000000000e-9, as the double does
  let rounded = (text[count] ?? '0') >= '5' ? head + 1n : head;
  if (rounded.toString().length > count) {
    rounded /= 10n;
    exponent++;
  }
  return { digits: rounded.toString(), exponent };
}

/** A double's first STRIP_DIGITS significant digits, from toExponential, and its decimal exponent. */
export function doubleDigits(v: number): { digits: string; exponent: number } {
  if (v === 0) return { digits: '0'.repeat(STRIP_DIGITS), exponent: 0 };
  const [mantissa, exp] = Math.abs(v).toExponential(STRIP_DIGITS - 1).split('e');
  return { digits: mantissa.replace('.', ''), exponent: Number(exp) };
}

/** The oracle as a double (for the relative error), without going through the rewritten formula. */
export function oracleNumber(scaledValue: bigint): number {
  const { digits, exponent } = oracleDigits(scaledValue, ORACLE_PRECISION);
  return (scaledValue < 0n ? -1 : 1) * Number(`${digits[0]}.${digits.slice(1)}e${exponent}`);
}

/** Digits a result gets right, from its relative error against the oracle: 0 to STRIP_DIGITS. */
export function digitsCorrect(result: number, oracle: number): number {
  if (!Number.isFinite(result)) return 0;
  const rel = Math.abs(result - oracle) / Math.abs(oracle);
  if (rel === 0) return STRIP_DIGITS;
  if (rel >= 1) return 0;
  return Math.min(STRIP_DIGITS, Math.max(0, Math.floor(-Math.log10(rel))));
}

export interface Reading {
  oracle: number;
  oracleDigits: string;
  naive: { value: number; digits: string; correct: number; matching: number };
  stable: { value: number; digits: string; correct: number; matching: number };
}

/** Everything the scene shows for one function at one k. */
export function read(id: FunctionId, k: number): Reading {
  const c = candidates(id, k);
  const o = oracleScaled(id, k);
  const oracle = oracleNumber(o);
  const oracleText = oracleDigits(o).digits;
  const compare = (value: number) => {
    const digits = doubleDigits(value).digits;
    return { value, digits, correct: digitsCorrect(value, oracle), matching: matchingPrefix(oracleText, digits) };
  };
  return { oracle, oracleDigits: oracleText, naive: compare(c.naive), stable: compare(c.stable) };
}

/** How many leading characters two digit strings share: the strip's green cells. */
export function matchingPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}
