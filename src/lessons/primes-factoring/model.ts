// Pure maths for primes-factoring: the sieve plan, a resumable trial-division run, the
// time extrapolation the plot and captions read, and the three primality checks.
import { isProbablePrime, modPow, sieve, trialFactor } from '../../core/numberTheory';
import { humanDuration, latency, power } from '../../core/format';
import type { Rnd } from '../../core/random';

// ── Sieve ────────────────────────────────────────────────────────────

export const SIEVE_SIZES = [100, 200, 400] as const;
export type SieveSize = (typeof SIEVE_SIZES)[number];
/** Grid columns per size: 10 × 10, 20 × 10, 20 × 20. */
export const sieveCols = (n: SieveSize) => (n === 100 ? 10 : 20);

export interface SievePlan {
  n: number;
  primes: number[];
  passes: { prime: number; crossed: number[] }[];
  /** crossedBy[m]: index of the pass that crossed m out, or −1. */
  crossedBy: Int16Array;
  /** The first prime whose square passes n: where the sieve stops. */
  stopPrime: number;
}

export function sievePlan(n: number): SievePlan {
  const { primes, passes } = sieve(n);
  const crossedBy = new Int16Array(n + 1).fill(-1);
  passes.forEach((p, i) => p.crossed.forEach((m) => (crossedBy[m] = i)));
  const stopPrime = primes.find((p) => p * p > n) ?? n + 1;
  return { n, primes, passes, crossedBy, stopPrime };
}

export type SievePhase = 'start' | 'light' | 'cross' | 'done';
export type CellState = 'one' | 'unvisited' | 'current' | 'fresh' | 'crossed' | 'prime';

/** What cell m looks like during pass `pass` in `phase`. */
export function cellState(m: number, plan: SievePlan, pass: number, phase: SievePhase): CellState {
  if (m < 2) return 'one';
  const by = plan.crossedBy[m];
  if (phase === 'done') return by >= 0 ? 'crossed' : 'prime';
  const current = plan.passes[pass]?.prime;
  if (m === current) return 'current';
  if (by >= 0 && (by < pass || (by === pass && phase === 'cross'))) return by === pass ? 'fresh' : 'crossed';
  // primes[i] is the prime of pass i, so a prime whose pass is over is confirmed.
  const index = plan.primes.indexOf(m);
  return index >= 0 && index < pass ? 'prime' : 'unvisited';
}

/** Primes confirmed and numbers crossed out so far. */
export function sieveCounts(plan: SievePlan, pass: number, phase: SievePhase): { primes: number; crossings: number } {
  if (phase === 'done') return { primes: plan.primes.length, crossings: plan.passes.reduce((s, p) => s + p.crossed.length, 0) };
  const finished = phase === 'cross' ? pass + 1 : Math.max(0, pass);
  const crossings = plan.passes.slice(0, finished).reduce((s, p) => s + p.crossed.length, 0);
  return { primes: phase === 'start' ? 0 : pass + 1, crossings };
}

/** Multiples of p below p², every one already crossed by a smaller prime: what starting at 2p would redo. */
export const belowSquare = (p: number) => Array.from({ length: p - 2 }, (_, i) => (i + 2) * p);

/** "57 = 3 × 19", "53 is prime", for cell tooltips. */
export function factorText(m: number): string {
  if (m < 2) return `${m} is neither prime nor composite`;
  const { factors } = trialFactor(BigInt(m));
  return factors.length === 1 ? `${m} is prime` : `${m} = ${factors.join(' × ')}`;
}

// ── Trial division, run in slices ────────────────────────────────────

/** The live run stops here and says "too big to try here". */
export const STEP_CAP = 100_000_000;

export interface TrialRun {
  n: bigint;
  /** Next divisor to try. */
  d: bigint;
  steps: number;
  factor: bigint | null;
  /** 'found' a factor, proved 'prime' (d² > n), hit the 'capped' limit, or still 'running'. */
  status: 'running' | 'found' | 'prime' | 'capped';
}

export function startTrial(n: bigint): TrialRun {
  if (n < 2n) throw new RangeError('trial division needs n ≥ 2');
  return { n, d: 2n, steps: 0, factor: null, status: n < 4n ? 'prime' : 'running' };
}

/**
 * Try up to `budget` more divisors (2, then odd numbers), as trialFactor does. Plain numbers
 * while n fits in 2⁵³ (much faster), bigint above.
 */
export function advanceTrial(run: TrialRun, budget: number): TrialRun {
  if (run.status !== 'running') return run;
  const limit = Math.min(budget, STEP_CAP - run.steps);
  if (run.n <= BigInt(Number.MAX_SAFE_INTEGER)) {
    const n = Number(run.n);
    let d = Number(run.d);
    for (let i = 0; i < limit; i++) {
      if (d * d > n) return { ...run, d: BigInt(d), steps: run.steps + i, status: 'prime' };
      if (n % d === 0) return { ...run, d: BigInt(d), steps: run.steps + i + 1, factor: BigInt(d), status: 'found' };
      d += d === 2 ? 1 : 2;
    }
    return capOrContinue({ ...run, d: BigInt(d), steps: run.steps + limit });
  }
  let d = run.d;
  for (let i = 0; i < limit; i++) {
    if (d * d > run.n) return { ...run, d, steps: run.steps + i, status: 'prime' };
    if (run.n % d === 0n) return { ...run, d, steps: run.steps + i + 1, factor: d, status: 'found' };
    d += d === 2n ? 1n : 2n;
  }
  return capOrContinue({ ...run, d, steps: run.steps + limit });
}

const capOrContinue = (run: TrialRun): TrialRun => (run.steps >= STEP_CAP ? { ...run, status: 'capped' } : run);

// ── Extrapolation ────────────────────────────────────────────────────

/** RSA-2048's modulus has 617 decimal digits. */
export const RSA_2048_DIGITS = 617;
export const AGE_OF_UNIVERSE_S = 13.8e9 * 365.25 * 24 * 3600;

/**
 * Divisions trial division needs for an n of `digits` digits whose smallest factor is near √n
 * (two primes of equal size, the RSA case): the odd numbers up to √n, about √n / 2.
 */
export const stepsForDigits = (digits: number) => 10 ** (digits / 2) / 2;

/**
 * Seconds trial division would take on a `digits`-digit semiprime at the measured speed.
 * Worked out in log space: √n for 617 digits is 10^308.5, past the largest double.
 */
export const extrapolateSeconds = (digits: number, stepsPerSecond: number) =>
  10 ** (digits / 2 - Math.log10(2) - Math.log10(stepsPerSecond));

const YEAR_S = 365.25 * 24 * 3600;
/** A time span: ms below a second, and "about 10ⁿ years" once it's past a million years (humanDuration prints raw floats there). */
export function longTime(seconds: number): string {
  const years = seconds / YEAR_S;
  if (seconds < 1) return latency(seconds * 1e9);
  if (years < 1e6) return humanDuration(seconds);
  return `about ${power(Math.floor(Math.log10(years)), 10)} years`;
}

export const digitsOf = (n: bigint) => n.toString().length;

/** A random prime with exactly `digits` digits (next prime up from a random start). */
export function primeWithDigits(digits: number, rnd: Rnd): bigint {
  const lo = 10n ** BigInt(digits - 1);
  const span = 9n * lo;
  let p = lo + BigInt(Math.floor(rnd() * Number(span)));
  if (p % 2n === 0n) p += 1n;
  while (!isProbablePrime(p).prime) p += 2n;
  // The step past the top is astronomically unlikely, but the digit count is a promise.
  return digitsOf(p) === digits ? p : primeWithDigits(digits, rnd);
}

// ── Primality ────────────────────────────────────────────────────────

/** Trial division in the primality check only runs up to here (√n/2 ≈ 500,000 divisions). */
export const TRIAL_LIMIT = 1_000_000_000_000n;
/** Longest number the primality field accepts. */
export const MAX_DIGITS = 40;

/** Fermat's test with base 2: a prime always gives 2^(n−1) ≡ 1 (mod n); so do Carmichael numbers. */
export function fermatSaysPrime(n: bigint): boolean {
  if (n === 2n) return true;
  if (n < 2n || n % 2n === 0n) return false;
  return modPow(2n, n - 1n, n) === 1n;
}

/** Divisions trial division needs to rule out every factor of n: the odd numbers up to √n. */
export const trialStepsFor = (n: bigint) => Math.sqrt(Number(n)) / 2;

export interface Primality {
  fermat: boolean;
  millerRabin: { prime: boolean; certain: boolean };
  trial: { factors: bigint[]; steps: number } | 'too-big';
  /** The true answer when it's known for certain (trial division, or Miller-Rabin below its bound). */
  truth: boolean | null;
}

export function primality(n: bigint): Primality {
  const millerRabin = isProbablePrime(n);
  const trial = n <= TRIAL_LIMIT ? trialFactor(n) : 'too-big';
  const truth = trial !== 'too-big' ? trial.factors.length === 1 : millerRabin.certain ? millerRabin.prime : null;
  return { fermat: fermatSaysPrime(n), millerRabin, trial, truth };
}

export type ParsedBig = { value: bigint } | { error: string };

/** A whole number from 2 to 40 digits. */
export function parseCandidate(text: string): ParsedBig {
  const t = text.trim().replace(/^(\d{1,3})((,\d{3})+)$/, (m) => m.replace(/,/g, ''));
  if (!t) return { error: 'Type a whole number.' };
  if (/^[-−]/.test(t)) return { error: 'Primes are positive: type a whole number from 2 up.' };
  if (!/^\d+$/.test(t)) return { error: 'Whole numbers only, like 561 (no decimals, exponents, letters or lists).' };
  if (t.replace(/^0+/, '').length > MAX_DIGITS) return { error: `Keep it to ${MAX_DIGITS} digits.` };
  const v = BigInt(t);
  if (v < 2n) return { error: `${v} is neither prime nor composite: try 2 or more.` };
  return { value: v };
}
