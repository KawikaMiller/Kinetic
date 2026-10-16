/**
 * Summation methods and the exact oracle. The methods run in real JavaScript arithmetic (float32 emulated by
 * Math.fround after every operation); the oracle decomposes every double into a BigInt mantissa and exponent with
 * DataView and sums them exactly, so it never uses floating point to check floating point. Single user, so it lives
 * with the lesson.
 */
import { mulberry32 } from '../../core/random';

export type Precision = 'f64' | 'f32';
export type MethodId = 'naive' | 'sorted' | 'pairwise' | 'kahan' | 'neumaier';

export const METHODS: { id: MethodId; label: string }[] = [
  { id: 'naive', label: 'Naive left fold' },
  { id: 'sorted', label: 'Sorted ascending' },
  { id: 'pairwise', label: 'Pairwise' },
  { id: 'kahan', label: 'Kahan' },
  { id: 'neumaier', label: 'Neumaier' },
];

/** The cap on N: the BigInt oracle stays instant on a phone. */
export const MAX_N = 200_000;

export type GeneratorId = 'dimes' | 'uniform' | 'large-small' | 'blind-spot';

export const GENERATORS: { id: GeneratorId; label: string }[] = [
  { id: 'dimes', label: '0.1 repeated' },
  { id: 'uniform', label: 'Seeded uniform [0, 1)' },
  { id: 'large-small', label: 'One large value, then many 1s' },
  { id: 'blind-spot', label: "Kahan's blind spot" },
];

/** Wikipedia's worked example: the 1e100 swallows both ones in naive and Kahan summation. */
export const BLIND_SPOT: readonly number[] = [1, 1e100, 1, -1e100];

/** The large value of "one large value, then ones": the first integer where adding 1 is lost, per precision. */
export const LARGE: Record<Precision, number> = { f64: 2 ** 53, f32: 2 ** 24 };

const rounder = (p: Precision) => (p === 'f32' ? Math.fround : (x: number) => x);

export interface Dataset {
  values: number[];
  /** Some value did not fit the precision and became infinity: the oracle cannot sum it, so the stage says so. */
  overflow: boolean;
}

export function generate(id: GeneratorId, n: number, seed: number, precision: Precision): Dataset {
  const r = rounder(precision);
  let raw: number[];
  if (id === 'dimes') raw = Array.from({ length: n }, () => 0.1);
  else if (id === 'uniform') {
    const rnd = mulberry32(seed);
    raw = Array.from({ length: n }, () => rnd());
  } else if (id === 'large-small') raw = [LARGE[precision], ...Array.from({ length: n - 1 }, () => 1)];
  else raw = [...BLIND_SPOT];
  const values = raw.map(r);
  return { values, overflow: values.some((v) => !Number.isFinite(v)) };
}

/* ---------- the methods ---------- */

export function naiveSum(values: readonly number[], p: Precision): number {
  const r = rounder(p);
  let s = 0;
  for (const x of values) s = r(s + x);
  return s;
}

export function sortedSum(values: readonly number[], p: Precision): number {
  return naiveSum([...values].sort((a, b) => a - b), p);
}

export function pairwiseSum(values: readonly number[], p: Precision): number {
  const r = rounder(p);
  const go = (lo: number, hi: number): number => {
    if (hi - lo === 0) return 0;
    if (hi - lo === 1) return values[lo];
    const mid = (lo + hi) >> 1;
    return r(go(lo, mid) + go(mid, hi));
  };
  return go(0, values.length);
}

export function kahanSum(values: readonly number[], p: Precision): number {
  const r = rounder(p);
  let sum = 0;
  let c = 0;
  for (const x of values) {
    const y = r(x - c);
    const t = r(sum + y);
    c = r(r(t - sum) - y);
    sum = t;
  }
  return sum;
}

export function neumaierSum(values: readonly number[], p: Precision): number {
  const r = rounder(p);
  let sum = 0;
  let c = 0;
  for (const x of values) {
    const t = r(sum + x);
    c = r(c + (Math.abs(sum) >= Math.abs(x) ? r(r(sum - t) + x) : r(r(x - t) + sum)));
    sum = t;
  }
  return r(sum + c);
}

export const SUMMERS: Record<MethodId, (values: readonly number[], p: Precision) => number> = {
  naive: naiveSum,
  sorted: sortedSum,
  pairwise: pairwiseSum,
  kahan: kahanSum,
  neumaier: neumaierSum,
};

/* ---------- the exact oracle ---------- */

const view = new DataView(new ArrayBuffer(8));

export interface Decomposed {
  /** Signed integer mantissa. */
  m: bigint;
  /** The value is m * 2^e. */
  e: number;
}

const FRACTION_BITS = 52;
const EXPONENT_BIAS_SHIFT = 1075;

/** A finite double as an exact integer times a power of two, read straight from its bits. */
export function decompose(x: number): Decomposed {
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const field = (hi >>> 20) & 0x7ff;
  const fraction = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  const m = field === 0 ? fraction : fraction | (1n << BigInt(FRACTION_BITS));
  return { m: hi >>> 31 ? -m : m, e: (field === 0 ? 1 : field) - EXPONENT_BIAS_SHIFT };
}

/** Number of trailing zero bits of a non-zero integer mantissa. */
function trailingZeros(m: bigint): number {
  const a = m < 0n ? -m : m;
  const lo = Number(a & 0xffffffffn);
  if (lo !== 0) return 31 - Math.clz32(lo & -lo);
  const hi = Number(a >> 32n);
  return 63 - Math.clz32(hi & -hi);
}

/** The smallest power of two that divides every value (and every extra number): the oracle's common scale. */
export function commonExponent(values: readonly number[], extra: readonly number[] = []): number {
  let emin = Infinity;
  for (const x of [...values, ...extra]) {
    if (x === 0) continue;
    const { m, e } = decompose(x);
    // the lowest set bit of the mantissa: a value like 1.0 does not pull the scale down to 2^-52
    const low = trailingZeros(m);
    emin = Math.min(emin, e + low);
  }
  return emin === Infinity ? 0 : emin;
}

/** One double as a BigInt in units of 2^emin. emin must be at most the value's own lowest set bit. */
export function scaled(x: number, emin: number): bigint {
  if (x === 0) return 0n;
  const { m, e } = decompose(x);
  return m << BigInt(e - emin);
}

/** The exact sum of the doubles, in units of 2^emin. */
export function exactSum(values: readonly number[], emin: number): bigint {
  let s = 0n;
  for (const x of values) s += scaled(x, emin);
  return s;
}

/** n * 2^exp as the nearest double (computed from the top 64 bits, so it works for sums far outside the double range of the BigInt). */
export function bigToNumber(n: bigint, exp: number): number {
  if (n === 0n) return 0;
  const negative = n < 0n;
  const a = negative ? -n : n;
  const shift = Math.max(0, a.toString(2).length - 64);
  const total = shift + exp;
  const half = Math.trunc(total / 2);
  const v = Number(a >> BigInt(shift)) * 2 ** half * 2 ** (total - half);
  return negative ? -v : v;
}

/** Significant digits the exact sum is printed to: more than a double holds, so a rounding error in a result is visible. */
const EXACT_DIGITS = 20;

/**
 * n * 2^exp written as an exact decimal, cut to EXACT_DIGITS significant digits (a trailing ellipsis marks a cut).
 * A dyadic rational has a terminating decimal expansion, so no rounding happens before the cut.
 */
export function exactDecimal(n: bigint, exp: number): string {
  if (n === 0n) return '0';
  const sign = n < 0n ? '-' : '';
  const a = n < 0n ? -n : n;
  const k = Math.max(0, -exp);
  const all = (exp >= 0 ? a << BigInt(exp) : a * 5n ** BigInt(k)).toString();
  const cut = all.slice(EXACT_DIGITS).replace(/0+$/, '') !== '';
  const digits = all.slice(0, EXACT_DIGITS).replace(/0+$/, '') || '0';
  const e10 = all.length - k - 1;
  const tail = cut ? '…' : '';
  if (e10 >= 21 || e10 < -6) return `${sign}${digits[0]}${digits.length > 1 ? `.${digits.slice(1)}` : ''}${tail}e${e10 >= 0 ? '+' : '-'}${Math.abs(e10)}`;
  if (e10 < 0) return `${sign}0.${'0'.repeat(-e10 - 1)}${digits}${tail}`;
  const intPart = digits.padEnd(e10 + 1, '0').slice(0, e10 + 1);
  const frac = digits.slice(e10 + 1);
  return `${sign}${intPart}${frac ? `.${frac}` : ''}${tail}`;
}

/** The spacing of numbers at the magnitude of v, in the working precision. */
export function ulp(v: number, p: Precision): number {
  const a = Math.abs(v);
  if (a === 0 || !Number.isFinite(a)) return NaN;
  let e = Math.floor(Math.log2(a));
  if (2 ** (e + 1) <= a) e++;
  if (2 ** e > a) e--;
  return p === 'f32' ? 2 ** (Math.max(e, -126) - 23) : 2 ** (Math.max(e, -1022) - 52);
}

/** Log-spaced checkpoints from 1 to n, for the error plot. */
export function checkpoints(n: number, count = 36): number[] {
  const set = new Set<number>([1, n]);
  for (let i = 1; i < count; i++) set.add(Math.max(1, Math.round(n ** (i / count))));
  return [...set].sort((a, b) => a - b);
}

export interface MethodRun {
  id: MethodId;
  result: number;
  /** |result - exact|, computed exactly. */
  error: number;
  /** The error in ulps of the exact sum, or null when the exact sum is 0. */
  ulps: number | null;
}

export interface Evaluation {
  exact: number;
  /** The exact sum as a decimal string, so it never reads as a rounded double. */
  exactText: string;
  runs: MethodRun[];
  /** Error by method at each checkpoint of the running count, for the plot. */
  curves: Record<MethodId, { n: number; error: number }[]>;
}

/** The absolute error of a result against the exact sum S (in units of 2^emin), as a double. */
function errorOf(result: number, exactScaled: bigint, emin: number): number {
  const diff = scaled(result, emin) - exactScaled;
  return bigToNumber(diff < 0n ? -diff : diff, emin);
}

/** Run every method on the data, exactly compare each with the oracle, and sample the error as the count grows. */
export function evaluate(values: readonly number[], p: Precision): Evaluation {
  const points = checkpoints(values.length);
  const results = points.map((k) => {
    const prefix = values.slice(0, k);
    return Object.fromEntries(METHODS.map((m) => [m.id, SUMMERS[m.id](prefix, p)])) as Record<MethodId, number>;
  });
  const emin = commonExponent(values, results.flatMap((r) => Object.values(r)));
  const prefixSums = new Map<number, bigint>();
  let running = 0n;
  let at = 0;
  for (const k of points) {
    while (at < k) running += scaled(values[at++], emin);
    prefixSums.set(k, running);
  }
  const total = prefixSums.get(values.length) as bigint;
  const exact = bigToNumber(total, emin);
  const final = results[results.length - 1];
  const runs = METHODS.map(({ id }) => {
    const error = errorOf(final[id], total, emin);
    const u = ulp(exact, p);
    return { id, result: final[id], error, ulps: exact === 0 ? null : error / u };
  });
  const curves = Object.fromEntries(
    METHODS.map(({ id }) => [id, points.map((k, i) => ({ n: k, error: errorOf(results[i][id], prefixSums.get(k) as bigint, emin) }))]),
  ) as Evaluation['curves'];
  return { exact, exactText: exactDecimal(total, emin), runs, curves };
}
