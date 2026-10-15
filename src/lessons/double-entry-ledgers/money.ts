/**
 * Money for scene 1 of double-entry-ledgers: a strict amount parser that yields whole cents as a
 * BigInt (never a double), the three ways of summing payments, bill splitting by largest remainder,
 * tax rounding per line against per total, and refusing to add two currencies.
 */

import type { FieldParse } from '../../core/parse';

export const MAX_DOLLARS = 1_000_000_000_000n;
const CENTS = 100n;

/** An amount typed as `12.34`: ASCII digits, at most two decimals, no sign, no exponent, no separators, up to one trillion dollars. */
export function parseMoney(text: string): FieldParse<bigint> {
  const t = text.trim();
  if (t === '') return { ok: false, error: 'Type an amount, such as 12.34.' };
  if (t.startsWith('-')) return { ok: false, error: 'An amount has no sign: a debit or a credit says which way the money goes.' };
  const m = /^(\d+)(?:\.(\d+))?$/.exec(t);
  if (!m) return { ok: false, error: 'Use digits and one decimal point, like 12.34 (no commas, letters or exponents).' };
  if ((m[2] ?? '').length > 2) return { ok: false, error: 'At most two decimals: money is counted in whole cents.' };
  const cents = BigInt(m[1]) * CENTS + BigInt((m[2] ?? '').padEnd(2, '0'));
  if (cents > MAX_DOLLARS * CENTS) return { ok: false, error: 'That is above one trillion dollars.' };
  return { ok: true, value: cents };
}

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Cents as dollars: $1,234.56, or −$5.00 for a negative. */
export function formatMoney(cents: bigint): string {
  const abs = cents < 0n ? -cents : cents;
  return `${cents < 0n ? '−' : ''}$${group((abs / CENTS).toString())}.${(abs % CENTS).toString().padStart(2, '0')}`;
}

// ── Summing payments ────────────────────────────────────────────────────

export type Representation = 'float' | 'cents' | 'bigint';
export const REPRESENTATIONS: { value: Representation; label: string; code: string }[] = [
  { value: 'float', label: 'JavaScript number, in dollars', code: 'for (let i = 0; i < n; i++) sum += 0.1;' },
  { value: 'cents', label: 'Integer cents', code: 'for (let i = 0; i < n; i++) sum += 10;' },
  { value: 'bigint', label: 'BigInt cents', code: 'for (let i = 0; i < n; i++) sum += 10n;' },
];
export const PAYMENT_COUNTS = [10, 100, 1000, 10_000, 100_000, 1_000_000, 10_000_000] as const;
export const PAYMENT_CENTS = 10;

export interface SumResult {
  /** The sum as the program holds it, with every digit a double carries. */
  shown: string;
  /** What n payments of $0.10 must come to. */
  expected: string;
  equal: boolean;
  /** sum minus expected, as dollars; "0" when exact. */
  drift: string;
}

/** The exact total of n payments of ten cents, written as dollars and cents. */
export const expectedTotal = (n: number): string => {
  const cents = BigInt(n) * BigInt(PAYMENT_CENTS);
  return `${cents / CENTS}.${(cents % CENTS).toString().padStart(2, '0')}`;
};

/** Really sum n payments of $0.10 and compare with the exact total. */
export function sumPayments(rep: Representation, n: number): SumResult {
  const expected = expectedTotal(n);
  if (rep === 'float') {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += 0.1;
    const want = Number(expected);
    return { shown: sum.toPrecision(17), expected, equal: sum === want, drift: sum === want ? '0' : (sum - want).toExponential(3) };
  }
  if (rep === 'cents') {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += PAYMENT_CENTS;
    return { shown: formatMoney(BigInt(sum)), expected, equal: BigInt(sum) === BigInt(n) * BigInt(PAYMENT_CENTS), drift: '0' };
  }
  let sum = 0n;
  const step = BigInt(PAYMENT_CENTS);
  for (let i = 0; i < n; i++) sum += step;
  return { shown: formatMoney(sum), expected, equal: sum === BigInt(n) * step, drift: '0' };
}

// ── Splitting a bill ────────────────────────────────────────────────────

/** Share out `total` cents by `weights` so the shares add up to exactly `total`: floor each ideal share, then hand the left-over cents to the largest remainders (ties go to the earlier share). */
export function allocate(total: bigint, weights: readonly bigint[]): bigint[] {
  const sum = weights.reduce((a, b) => a + b, 0n);
  const floors = weights.map((w) => (total * w) / sum);
  const remainders = weights.map((w, i) => ({ i, r: (total * w) % sum }));
  let left = total - floors.reduce((a, b) => a + b, 0n);
  remainders.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  const shares = [...floors];
  for (const { i } of remainders) {
    if (left === 0n) break;
    shares[i] += 1n;
    left -= 1n;
  }
  return shares;
}

export interface Split {
  naive: bigint[];
  naiveSum: bigint;
  fair: bigint[];
  fairSum: bigint;
}

/** Split a bill evenly two ways: rounding each share on its own, and by largest remainder. */
export function splitBill(total: bigint, parts: number): Split {
  const naive = Array.from({ length: parts }, () => BigInt(Math.round(Number(total) / parts)));
  const fair = allocate(total, Array.from({ length: parts }, () => 1n));
  const add = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
  return { naive, naiveSum: add(naive), fair, fairSum: add(fair) };
}

// ── Tax rounding ────────────────────────────────────────────────────────

const roundHalfUp = (num: bigint, den: bigint): bigint => (2n * num + den) / (2n * den);

export interface TaxResult {
  perLine: { taxes: bigint[]; tax: bigint; total: bigint };
  perTotal: { tax: bigint; total: bigint };
  /** perLine total minus perTotal total, in cents. */
  difference: bigint;
}

export const TAX_LINES: bigint[] = [35n, 35n, 35n];
export const TAX_RATES: { bp: number; label: string }[] = [
  { bp: 500, label: '5%' },
  { bp: 800, label: '8%' },
  { bp: 1000, label: '10%' },
  { bp: 2000, label: '20%' },
];

/** The same lines taxed with the rate rounded on each line, or once on the subtotal (basis points: 1000 is 10%). */
export function taxRounding(lines: readonly bigint[], bp: number): TaxResult {
  const subtotal = lines.reduce((a, b) => a + b, 0n);
  const taxes = lines.map((l) => roundHalfUp(l * BigInt(bp), 10_000n));
  const lineTax = taxes.reduce((a, b) => a + b, 0n);
  const totalTax = roundHalfUp(subtotal * BigInt(bp), 10_000n);
  return {
    perLine: { taxes, tax: lineTax, total: subtotal + lineTax },
    perTotal: { tax: totalTax, total: subtotal + totalTax },
    difference: lineTax - totalTax,
  };
}

// ── Currencies ──────────────────────────────────────────────────────────

export type Currency = 'USD' | 'EUR';
export interface Money {
  cents: bigint;
  currency: Currency;
}

/** Add two amounts, or refuse: different currencies need a conversion rate this lesson never applies. */
export function addMoney(a: Money, b: Money): { ok: true; value: Money } | { ok: false; error: string } {
  if (a.currency !== b.currency) return { ok: false, error: `No conversion rate was applied, so ${a.currency} and ${b.currency} cannot be added.` };
  return { ok: true, value: { cents: a.cents + b.cents, currency: a.currency } };
}
