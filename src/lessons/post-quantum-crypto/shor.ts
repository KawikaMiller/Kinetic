import { gcd, modPow } from '../../core/numberTheory';

/** The largest N the page accepts: the order-finding loop then takes at most N steps. */
export const N_MAX = 999;

export type Refusal = { ok: false; error: string };

const smallestFactor = (n: number): number => {
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return d;
  return n;
};

/** Whether N is a power of a single prime, p^k with k >= 1. */
export function isPrimePower(n: number): boolean {
  const p = smallestFactor(n);
  let m = n;
  while (m % p === 0) m /= p;
  return m === 1;
}

/** An odd composite up to 999 that is not a prime power, or the reason the page refuses it. */
export function checkN(n: number): { ok: true } | Refusal {
  if (!Number.isInteger(n) || n < 2) return { ok: false, error: `${n} is not a whole number from 2 up.` };
  if (n > N_MAX) return { ok: false, error: `${n} is above ${N_MAX}: the loop below takes up to N steps, so the page stops at ${N_MAX}.` };
  if (n % 2 === 0) return { ok: false, error: `${n} is even: 2 is already a factor, so no order finding is needed.` };
  if (smallestFactor(n) === n) return { ok: false, error: `${n} is prime: there is nothing to factor.` };
  if (isPrimePower(n)) return { ok: false, error: `${n} is a prime power: the order trick needs two different prime factors.` };
  return { ok: true };
}

/** How many N from 3 to N_MAX the page admits (odd, composite, not a prime power). */
export const ADMITTED_COUNT = Array.from({ length: N_MAX - 2 }, (_, i) => i + 3).filter((n) => checkN(n).ok).length;

/** The order of a mod N by repeated multiplication, with the step count; null when gcd(a, N) is not 1. */
export function orderByLoop(a: number, N: number): { r: number; steps: number } | null {
  if (gcd(BigInt(a), BigInt(N)) !== 1n) return null;
  let value = a % N;
  let steps = 1;
  while (value !== 1) {
    value = (value * a) % N;
    steps++;
  }
  return { r: steps, steps };
}

/** The order by a second method: the smallest r with modPow(a, r, N) = 1, searched with BigInt powers. */
export function orderByModPow(a: number, N: number): number | null {
  if (gcd(BigInt(a), BigInt(N)) !== 1n) return null;
  for (let r = 1; r <= N; r++) if (modPow(BigInt(a), BigInt(r), BigInt(N)) === 1n) return r;
  return null;
}

export type ShorFailure = 'r is odd' | 'a^(r/2) = -1';

export interface ShorRun {
  N: number;
  a: number;
  r: number;
  /** Steps the loop took to find r: equal to r. */
  steps: number;
  /** a^(r/2) mod N when r is even. */
  half: number | null;
  failure: ShorFailure | null;
  /** The two gcds, when the base works. */
  factors: [number, number] | null;
  /** The sequence a^1, a^2, ... mod N up to a^r = 1, for the trace. */
  powers: number[];
}

/** Everything the page shows for one (N, a): the order, the checks on it and the gcd step. */
export function shorRun(N: number, a: number): ShorRun | Refusal {
  const found = orderByLoop(a, N);
  if (!found) return { ok: false, error: `gcd(${a}, ${N}) = ${gcd(BigInt(a), BigInt(N))} is not 1: the base shares a factor with ${N}, so a gcd alone already splits it. Try a base with gcd 1.` };
  const { r, steps } = found;
  const powers: number[] = [];
  let value = 1;
  for (let i = 0; i < r; i++) {
    value = (value * a) % N;
    powers.push(value);
  }
  if (r % 2 === 1) return { N, a, r, steps, half: null, failure: 'r is odd', factors: null, powers };
  const half = Number(modPow(BigInt(a), BigInt(r / 2), BigInt(N)));
  if (half === N - 1) return { N, a, r, steps, half, failure: 'a^(r/2) = -1', factors: null, powers };
  const f1 = Number(gcd(BigInt(half - 1), BigInt(N)));
  const f2 = Number(gcd(BigInt(half + 1), BigInt(N)));
  return { N, a, r, steps, half, failure: null, factors: [f1, f2], powers };
}

export const isRun = (x: ShorRun | Refusal): x is ShorRun => !('ok' in x);

export interface BaseTable {
  N: number;
  rows: { a: number; run: ShorRun }[];
  /** Bases a in 2..N-1 coprime to N, and how many of them work. */
  coprime: number;
  works: number;
  /** Euler's phi(N): the coprime bases counting a = 1, which never works (its order is 1, odd). */
  phi: number;
}

/** The table over every base coprime to N. */
export function baseTable(N: number): BaseTable {
  const rows: BaseTable['rows'] = [];
  for (let a = 2; a < N; a++) {
    const run = shorRun(N, a);
    if (isRun(run)) rows.push({ a, run });
  }
  return { N, rows, coprime: rows.length, works: rows.filter((x) => x.run.failure === null).length, phi: rows.length + 1 };
}
