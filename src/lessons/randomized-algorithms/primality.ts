import { modPow } from '../../core/numberTheory';
import type { Rnd } from '../../core/random';
import { mulberry32 } from '../../core/random';

export const N_MIN = 2n;
export const N_MAX = 1_000_000_000n;
/** Up to this n every base is tried for the census; above it a seeded sample of bases is used and labelled so. */
export const CENSUS_MAX = 20_000;
export const SAMPLE_BASES = 2_000;
export const TRIALS = 10_000;
export const MAX_ROUNDS = 8;

/** n - 1 = d * 2^s with d odd. */
export function decompose(n: bigint): { d: bigint; s: number } {
  let d = n - 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s++;
  }
  return { d, s };
}

/**
 * True when base a does NOT reveal that the odd n >= 5 is composite (a strong liar, or n is prime): a^d is 1 or a^(d 2^r)
 * is n - 1 for some r < s. Bases come from 2 .. n - 2.
 */
export function passesRound(a: bigint, n: bigint): boolean {
  const { d, s } = decompose(n);
  let x = modPow(a, d, n);
  if (x === 1n || x === n - 1n) return true;
  for (let r = 1; r < s; r++) {
    x = (x * x) % n;
    if (x === n - 1n) return true;
  }
  return false;
}

export type Kind = 'prime' | 'even' | 'odd-composite';

/** Even numbers need no bases: divisibility by 2 settles them. Everything else is tested with random bases. */
export function classify(n: bigint): Kind {
  if (n === 2n || n === 3n) return 'prime';
  if (n % 2n === 0n) return 'even';
  for (let p = 3n; p * p <= n; p += 2n) if (n % p === 0n) return 'odd-composite';
  return 'prime';
}

export interface Census {
  /** The bases 2..n-2 that pass the Miller-Rabin round although n is composite. */
  liars: number;
  /** How many bases were looked at: all of them (exact) or a seeded sample. */
  bases: number;
  exact: boolean;
  /** Bases that pass the plain Fermat test a^(n-1) = 1 (mod n). */
  fermat: number;
  /** The share of bases that pass. */
  fraction: number;
}

const total = (n: bigint) => Number(n) - 3;

/** The liar count over every base for n up to CENSUS_MAX, else over SAMPLE_BASES seeded bases. */
export function census(n: bigint, seed: number): Census {
  const exact = n <= BigInt(CENSUS_MAX);
  const bases = exact ? total(n) : SAMPLE_BASES;
  const rnd = mulberry32(seed);
  let liars = 0;
  let fermat = 0;
  for (let k = 0; k < bases; k++) {
    const a = exact ? BigInt(k + 2) : randomBase(n, rnd);
    if (passesRound(a, n)) liars++;
    if (modPow(a, n - 1n, n) === 1n) fermat++;
  }
  return { liars, bases, exact, fermat, fraction: liars / bases };
}

export const randomBase = (n: bigint, rnd: Rnd): bigint => 2n + BigInt(Math.floor(rnd() * total(n)));

export interface Round {
  base: bigint;
  /** True when the base passed (n looks prime so far), false when it proved n composite. */
  passed: boolean;
}

/** Up to k random-base rounds, stopping at the first base that proves n composite (a "no" is certain). */
export function rounds(n: bigint, k: number, seed: number): Round[] {
  const rnd = mulberry32(seed);
  const out: Round[] = [];
  for (let i = 0; i < k; i++) {
    const base = randomBase(n, rnd);
    const passed = passesRound(base, n);
    out.push({ base, passed });
    if (!passed) break;
  }
  return out;
}

/** The bound the lesson states: k rounds err with probability at most (1/4)^k on an odd composite. */
export const boundAfter = (k: number): number => 0.25 ** k;

/** The exact error after k rounds when the liar share is `fraction`: all k independent bases are liars. */
export const exactErrorAfter = (fraction: number, k: number): number => fraction ** k;

/** The share of TRIALS seeded k-round runs, for k = 1..MAX_ROUNDS, that wrongly call the odd composite n probably prime. */
export function trialErrors(n: bigint, seed: number): number[] {
  const rnd = mulberry32(seed);
  const wrong = new Array<number>(MAX_ROUNDS).fill(0);
  for (let t = 0; t < TRIALS; t++) {
    for (let k = 1; k <= MAX_ROUNDS; k++) {
      if (!passesRound(randomBase(n, rnd), n)) break;
      wrong[k - 1]++;
    }
  }
  return wrong.map((w) => w / TRIALS);
}

/** Random bases drawn until one proves the odd composite n composite: the number of tries (a Las Vegas search for a witness). */
export function witnessHunt(n: bigint, seed: number): number {
  const rnd = mulberry32(seed);
  let tries = 0;
  for (;;) {
    tries++;
    if (!passesRound(randomBase(n, rnd), n)) return tries;
  }
}

/** The mean tries over `hunts` seeded hunts. */
export function meanWitnessTries(n: bigint, hunts: number, seed: number): number {
  let sum = 0;
  for (let h = 0; h < hunts; h++) sum += witnessHunt(n, seed + h);
  return sum / hunts;
}
