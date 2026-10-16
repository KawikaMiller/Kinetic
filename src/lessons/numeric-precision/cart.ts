/**
 * Where the cents go: a seeded cart, a tax rate in basis points and a rounding mode, computed three ways: float64
 * dollars (real JavaScript), integer cents with an explicit rule, and exact rational arithmetic in BigInt. The cart's
 * prices are made up (illustrative).
 */
import { mulberry32 } from '../../core/random';

export type Mode = 'half-up' | 'half-even' | 'truncate';
export type Granularity = 'line' | 'total';
export type Representation = 'float' | 'cents';

export const MODES: { id: Mode; label: string }[] = [
  { id: 'half-up', label: 'Half up' },
  { id: 'half-even', label: 'Half to even' },
  { id: 'truncate', label: 'Truncate' },
];

export const ITEMS_MIN = 1;
export const ITEMS_MAX = 200;
export const RATE_MAX_BP = 1500;
export const RATE_STEP_BP = 25;
const BP_DENOMINATOR = 10_000;

export interface Item {
  /** Unit price in whole cents (so 1999 is $19.99). */
  cents: number;
  quantity: number;
}

const PRICE_FLOOR = 50;
const PRICE_SPAN = 9950;
const QUANTITY_MAX = 4;

/** A seeded cart of made-up items. */
export function makeCart(count: number, seed: number): Item[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => ({ cents: PRICE_FLOOR + Math.floor(rnd() * PRICE_SPAN), quantity: 1 + Math.floor(rnd() * QUANTITY_MAX) }));
}

/** n / d rounded to a whole number by the rule, for non-negative integers. */
export function roundDiv(n: number, d: number, mode: Mode): number {
  const q = Math.floor(n / d);
  const twice = 2 * (n - q * d);
  if (mode === 'truncate' || twice < d) return q;
  if (twice > d) return q + 1;
  return mode === 'half-up' || q % 2 === 1 ? q + 1 : q;
}

/** Tax in cents with integer cents and an explicit rule: round each line, or round the total once. */
export function centsTax(cart: readonly Item[], bp: number, mode: Mode, granularity: Granularity): number {
  const lineNumerators = cart.map((i) => i.cents * i.quantity * bp);
  if (granularity === 'line') return lineNumerators.reduce((s, n) => s + roundDiv(n, BP_DENOMINATOR, mode), 0);
  return roundDiv(
    lineNumerators.reduce((s, n) => s + n, 0),
    BP_DENOMINATOR,
    mode,
  );
}

/** A float amount of cents rounded by the rule: the way float code usually does it, with no exact tie detection beyond the float itself. */
function floatRound(x: number, mode: Mode): number {
  if (mode === 'truncate') return Math.trunc(x);
  if (mode === 'half-up') return Math.floor(x + 0.5);
  const floor = Math.floor(x);
  const frac = x - floor;
  if (frac === 0.5) return floor % 2 === 0 ? floor : floor + 1;
  return Math.round(x);
}

/** The same tax in float64 dollars: price * quantity * rate, converted to cents and rounded. */
export function floatTax(cart: readonly Item[], bp: number, mode: Mode, granularity: Granularity): number {
  const rate = bp / BP_DENOMINATOR;
  const lineTaxCents = cart.map((i) => (i.cents / 100) * i.quantity * rate * 100);
  if (granularity === 'line') return lineTaxCents.reduce((s, x) => s + floatRound(x, mode), 0);
  return floatRound(
    lineTaxCents.reduce((s, x) => s + x, 0),
    mode,
  );
}

/** The exact answer in BigInt rational arithmetic: floor, remainder and a comparison of 2r with d, nothing else. */
export function exactTax(cart: readonly Item[], bp: number, mode: Mode, granularity: Granularity): bigint {
  const d = BigInt(BP_DENOMINATOR);
  const round = (n: bigint): bigint => {
    const q = n / d;
    const r = n - q * d;
    if (mode === 'truncate' || 2n * r < d) return q;
    if (2n * r > d) return q + 1n;
    return mode === 'half-up' || q % 2n === 1n ? q + 1n : q;
  };
  const numerators = cart.map((i) => BigInt(i.cents) * BigInt(i.quantity) * BigInt(bp));
  return granularity === 'line' ? numerators.reduce((s, n) => s + round(n), 0n) : round(numerators.reduce((s, n) => s + n, 0n));
}

export interface TaxView {
  representation: Representation;
  tax: number;
  exact: number;
  /** Cents the representation is away from the exact answer (negative: short). */
  drift: number;
}

export function taxView(cart: readonly Item[], bp: number, mode: Mode, granularity: Granularity, representation: Representation): TaxView {
  const tax = representation === 'float' ? floatTax(cart, bp, mode, granularity) : centsTax(cart, bp, mode, granularity);
  const exact = Number(exactTax(cart, bp, mode, granularity));
  return { representation, tax, exact, drift: tax - exact };
}

/** The subtotal in cents. */
export const subtotal = (cart: readonly Item[]): number => cart.reduce((s, i) => s + i.cents * i.quantity, 0);

/** The cents as a dollar string, e.g. 12345 to "123.45". */
export const dollars = (cents: number): string => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
