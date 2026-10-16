import type { Bit } from '../../core/bits';
import { gcd, mod, modPow } from '../../core/numberTheory';

// Square-and-multiply in both scan directions, as step lists the lesson can replay. core/bits is capped at 53 bits and
// an exponent here goes up to 10^30, so the bit list is built locally from the bigint.

export type Direction = 'ltr' | 'rtl';

/** The bits of e, most significant first; 0 is the single bit 0. */
export function bitsOf(e: bigint): Bit[] {
  if (e < 0n) throw new RangeError('exponent must be non-negative');
  return e === 0n ? [0] : [...e.toString(2)].map((c) => (c === '1' ? 1 : 0));
}

export const popcount = (e: bigint): number => bitsOf(e).filter((b) => b === 1).length;

export interface PowStep {
  kind: 'square' | 'multiply';
  /** Index into bitsOf(e) (MSB first) of the bit being processed. */
  bit: number;
  /** The value of the running product (left to right) or the accumulated result (right to left) before and after. */
  before: bigint;
  after: bigint;
  /** What the step multiplied by: the running value itself for a square, otherwise the base or the running power. */
  factor: bigint;
  /** What the method holds after this step: the result so far (1 before the first multiply) and the running power. */
  result: bigint;
  power: bigint;
}

export interface PowRun {
  direction: Direction;
  result: bigint;
  steps: PowStep[];
  squarings: number;
  multiplications: number;
  /** How many numbers of the modulus's size the method keeps at once. */
  held: number;
  /** The base after reduction mod n. */
  reduced: bigint;
}

/** Left to right: the leading bit starts the result, then for each later bit square, and multiply by the base when the bit is 1. */
function leftToRight(base: bigint, e: bigint, n: bigint): PowRun {
  const b = mod(base, n);
  const bits = bitsOf(e);
  const steps: PowStep[] = [];
  let result = n === 1n ? 0n : 1n;
  if (e > 0n) {
    result = b % n;
    for (let i = 1; i < bits.length; i++) {
      const before = result;
      result = (result * result) % n;
      steps.push({ kind: 'square', bit: i, before, after: result, factor: before, result, power: b });
      if (bits[i] === 1) {
        const squared = result;
        result = (result * b) % n;
        steps.push({ kind: 'multiply', bit: i, before: squared, after: result, factor: b, result, power: b });
      }
    }
  }
  return tally('ltr', result, steps, 1, b);
}

/** Right to left: keep the running power base^(2^i); multiply it into the result when bit i (from the least significant) is 1. */
function rightToLeft(base: bigint, e: bigint, n: bigint): PowRun {
  const b = mod(base, n);
  const bits = bitsOf(e);
  const steps: PowStep[] = [];
  let result: bigint | null = null;
  let power = b % n;
  for (let i = bits.length - 1; i >= 0 && e > 0n; i--) {
    if (bits[i] === 1) {
      if (result === null) {
        result = power;
      } else {
        const before: bigint = result;
        result = (result * power) % n;
        steps.push({ kind: 'multiply', bit: i, before, after: result, factor: power, result, power });
      }
    }
    if (i > 0) {
      const before = power;
      power = (power * power) % n;
      steps.push({ kind: 'square', bit: i, before, after: power, factor: before, result: result ?? 1n, power });
    }
  }
  return tally('rtl', e === 0n ? (n === 1n ? 0n : 1n) : result!, steps, 2, b);
}
function tally(direction: Direction, result: bigint, steps: PowStep[], held: number, reduced: bigint): PowRun {
  return {
    direction,
    result,
    steps,
    squarings: steps.filter((s) => s.kind === 'square').length,
    multiplications: steps.filter((s) => s.kind === 'multiply').length,
    held,
    reduced,
  };
}

/** base^e mod n by square-and-multiply in the chosen direction (n >= 1, e >= 0, any integer base). */
export function powRun(base: bigint, e: bigint, n: bigint, direction: Direction): PowRun {
  if (n < 1n) throw new RangeError('modulus must be at least 1');
  return direction === 'ltr' ? leftToRight(base, e, n) : rightToLeft(base, e, n);
}

/** The count a naive repeated multiplication needs: e - 1 products (0 for e <= 1). */
export const naiveMultiplications = (e: bigint): bigint => (e > 1n ? e - 1n : 0n);

/** Modular multiplications a run used: squarings plus multiplications. */
export const operationCount = (run: PowRun): number => run.squarings + run.multiplications;

// ── size of the numbers ───────────────────────────────────────────────────

/** Digits of base^e written out in full, floor(e log10 base) + 1 for base >= 2; 1 for base 0 or 1 (and for e = 0). */
export function unreducedDigits(base: bigint, e: bigint): number {
  const b = base < 0n ? -base : base;
  if (b <= 1n || e === 0n) return 1;
  return Math.floor(Number(e) * log10Big(b)) + 1;
}

/** log10 of a positive bigint, exact in the leading digits even past the range of a double. */
export function log10Big(x: bigint): number {
  const s = x.toString();
  if (s.length <= 15) return Math.log10(Number(s));
  return s.length - 15 + Math.log10(Number(s.slice(0, 15)));
}

/** Decimal digits of a non-negative bigint. */
export const digitsOf = (x: bigint): number => x.toString().length;

export interface DigitPoint {
  /** Bits of the exponent processed so far (1 = the leading bit). */
  bits: number;
  /** Digits of base^(the exponent prefix) written in full. */
  unreduced: number;
  /** Digits of the running value when every step is reduced mod n. */
  reduced: number;
}

/** After each bit of the exponent: the digits of the full power so far against those of the reduced running value. */
export function digitSeries(base: bigint, e: bigint, n: bigint): DigitPoint[] {
  const bits = bitsOf(e);
  const b = mod(base, n);
  const written = base < 0n ? -base : base;
  const out: DigitPoint[] = [];
  let prefix = 0n;
  let running = 1n % n;
  for (let i = 0; i < bits.length; i++) {
    prefix = prefix * 2n + BigInt(bits[i]);
    if (i === 0) running = bits[0] === 1 ? b % n : 1n % n;
    else {
      running = (running * running) % n;
      if (bits[i] === 1) running = (running * b) % n;
    }
    out.push({ bits: i + 1, unreduced: unreducedDigits(written, prefix), reduced: digitsOf(running) });
  }
  return out;
}

// ── Fermat ────────────────────────────────────────────────────────────────

export interface FermatCensus {
  /** Bases 2..n-2 that share a factor with n (they cannot pass, and tell you n is composite). */
  shareFactor: number;
  /** Bases 2..n-2 coprime to n. */
  coprime: number;
  /** Coprime bases a with a^(n-1) = 1 (mod n): the bases that do not expose n. */
  passing: number;
  /** The smallest base that exposes n (fails the test), or null when none does. */
  firstExposing: number | null;
}

/** The plain Fermat test a^(n-1) = 1 (mod n), tried on every base 2..n-2 of n. */
export function fermatCensus(n: number): FermatCensus {
  let shareFactor = 0;
  let coprime = 0;
  let passing = 0;
  let firstExposing: number | null = null;
  for (let a = 2; a <= n - 2; a++) {
    if (gcd(BigInt(a), BigInt(n)) !== 1n) {
      shareFactor++;
      if (firstExposing === null) firstExposing = a;
      continue;
    }
    coprime++;
    if (modPow(BigInt(a), BigInt(n - 1), BigInt(n)) === 1n) passing++;
    else if (firstExposing === null) firstExposing = a;
  }
  return { shareFactor, coprime, passing, firstExposing };
}

export type FermatVerdict = 'prime' | 'carmichael' | 'exposed';

/**
 * What the plain Fermat test says about n over every base: a prime passes all of them; an odd composite that passes for
 * every coprime base is a Carmichael number (the test is fooled); any other composite is exposed by some base.
 */
export function fermatVerdict(n: number, c: FermatCensus, prime: boolean): FermatVerdict {
  if (prime) return 'prime';
  return n % 2 === 1 && c.coprime > 0 && c.passing === c.coprime ? 'carmichael' : 'exposed';
}