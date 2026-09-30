// Pure maths for logs-exponentials: powers of two, halving, and bits needed.

export const MAX_DOUBLINGS = 40;
/** Largest N the halving and bits tools accept: 2^40, still exact in a JS number. */
export const MAX_N = 2 ** MAX_DOUBLINGS;

/** 2^k, exact for 0 ≤ k ≤ 53. */
export function pow2(k: number): number {
  if (!Number.isInteger(k) || k < 0 || k > 53) throw new RangeError(`2^${k} isn't exact in a JS number`);
  return 2 ** k;
}

/**
 * ⌈log₂ n⌉ for a whole number n ≥ 1, computed exactly from n − 1's binary length
 * (Math.log2 can round the wrong way near powers of two). It is both the bits
 * needed to give n things distinct codes and the halvings to get from n to 1.
 */
export function ceilLog2(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 2 ** 53) throw new RangeError(`need a whole number from 1 to 2^53, got ${n}`);
  return n === 1 ? 0 : (n - 1).toString(2).length;
}

/** n, then ⌈n/2⌉, ⌈n/4⌉ … down to 1. Rounding up keeps every item: the half you keep is never empty. */
export function halvingSteps(n: number): number[] {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`need a whole number ≥ 1, got ${n}`);
  const steps = [n];
  while (steps[steps.length - 1] > 1) steps.push(Math.ceil(steps[steps.length - 1] / 2));
  return steps;
}

/** The 2^10 ≈ 10^3 rule: every 10 doublings add about 3 decimal zeros. */
export const decimalExponent = (k: number) => k * Math.log10(2);

export interface Reference {
  k: number;
  label: string;
}

/** Real quantities that are (almost) powers of two. The values are exact: 2^k. */
export const REFERENCES: readonly Reference[] = [
  { k: 8, label: 'values in one byte' },
  { k: 10, label: '1 KiB (≈ a thousand)' },
  { k: 16, label: 'TCP/UDP port numbers' },
  { k: 20, label: '1 MiB (≈ a million)' },
  { k: 30, label: '1 GiB (≈ a billion)' },
  { k: 32, label: 'IPv4 addresses' },
  { k: 40, label: '1 TiB (≈ a trillion)' },
];

/** The largest reference at or below 2^k, if any. */
export function referenceAtOrBelow(k: number): Reference | null {
  return [...REFERENCES].reverse().find((r) => r.k <= k) ?? null;
}

/** Parse "1,000,000" or "1e6" into a whole number, or null. */
export function parseCount(text: string): number | null {
  const cleaned = text.replace(/[,_\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isInteger(n) && n >= 1 && n <= MAX_N ? n : null;
}

export const group = (n: number) => n.toLocaleString('en-US');

/** The squares drawn for 2^k: all of them up to 2^10, then 1,024 squares that each stand for 2^(k-10). */
export const GRID_MAX_K = 10;
export function squares(k: number): { count: number; eachWorth: number } {
  return k <= GRID_MAX_K ? { count: pow2(k), eachWorth: 1 } : { count: pow2(GRID_MAX_K), eachWorth: pow2(k - GRID_MAX_K) };
}
