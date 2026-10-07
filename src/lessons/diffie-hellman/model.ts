// Diffie-Hellman on toy numbers: the group, the exchange (honest and with a man in the
// middle), Eve's brute force, and what bigger primes cost her. Exact bigint maths from
// core/numberTheory. Toy sizes only: real DH uses 2048+ bit primes or elliptic curves.
import { isProbablePrime, modPow, trialFactor } from '../../core/numberTheory';
import { parseBoundedBigInt, type FieldParse } from '../../core/parse';
import { equalMix } from '../../core/paint';

export const DEFAULTS = { p: 23n, g: 5n, a: 6n, b: 15n } as const;
/** Toy primes stay at five digits, so Eve's brute force finishes instantly. */
export const P_MAX = 99_991n;
export const P_MIN = 5n;
/** Eve's own secrets in the man-in-the-middle run: one for each side she fakes. Lesson-chosen. */
export const EVE_SECRETS = { toBob: 9n, toAlice: 13n } as const;

export const TOY_WARNING = 'Toy numbers, trivially breakable: real DH uses 2048+ bit primes or elliptic curves. The ECDH lane is real WebCrypto.';

export interface DhParams {
  p: bigint;
  g: bigint;
  a: bigint;
  b: bigint;
}

/** How many distinct values gˣ mod p takes: the order of g. A generator makes all p − 1. */
export function orderOf(g: bigint, p: bigint): number {
  let v = g % p;
  let k = 1;
  while (v !== 1n) {
    v = (v * g) % p;
    k++;
    if (BigInt(k) > p) throw new Error(`g = ${g} has no order mod ${p}`);
  }
  return k;
}

export type GStrength = 'generator' | 'prime-subgroup' | 'tiny' | 'composite';
/** Below this many values a group is tiny however its order factors. */
export const TINY_ORDER = 8;

export interface GInfo {
  /** How many distinct values g makes: its order. */
  order: number;
  kind: GStrength;
  /** The order's prime factors (with repeats), for the composite case. */
  factors: bigint[];
}

/**
 * How good a base g is, by its order k:
 * - generator: k = p − 1, all values. Real groups avoid this: it leaks the parity of a.
 * - prime-subgroup: k is prime, which is what real groups deliberately use (huge k).
 * - tiny: only a handful of values.
 * - composite: k splits into prime factors, and Eve's search splits into pieces that size (Pohlig–Hellman).
 */
export function gStrength(g: bigint, p: bigint): GInfo {
  const order = orderOf(g, p);
  const factors = trialFactor(BigInt(order)).factors;
  if (BigInt(order) === p - 1n) return { order, kind: 'generator', factors };
  if (order < TINY_ORDER) return { order, kind: 'tiny', factors };
  if (isProbablePrime(BigInt(order)).prime) return { order, kind: 'prime-subgroup', factors };
  return { order, kind: 'composite', factors };
}

export interface Exchange {
  A: bigint;
  B: bigint;
  /** What Alice and Bob each compute as "the" shared secret. */
  sAlice: bigint;
  sBob: bigint;
  /** In the man-in-the-middle run: Eve's fake public values, and the two secrets she now holds. */
  mitm: { E1: bigint; E2: bigint; withAlice: bigint; withBob: bigint } | null;
}

/**
 * The exchange. Honest: A = gᵃ and B = gᵇ cross the wire, and both compute s = Bᵃ = Aᵇ.
 * With a man in the middle, Eve swaps both public values for her own (E₁ = g^e₁ to Bob,
 * E₂ = g^e₂ to Alice), so Alice computes E₂ᵃ and Bob E₁ᵇ, and Eve can compute both.
 */
export function exchange({ p, g, a, b }: DhParams, mitm: boolean): Exchange {
  const A = modPow(g, a, p);
  const B = modPow(g, b, p);
  if (!mitm) return { A, B, sAlice: modPow(B, a, p), sBob: modPow(A, b, p), mitm: null };
  const E1 = modPow(g, EVE_SECRETS.toBob, p);
  const E2 = modPow(g, EVE_SECRETS.toAlice, p);
  return {
    A,
    B,
    sAlice: modPow(E2, a, p),
    sBob: modPow(E1, b, p),
    mitm: { E1, E2, withAlice: modPow(A, EVE_SECRETS.toAlice, p), withBob: modPow(B, EVE_SECRETS.toBob, p) },
  };
}

export interface BruteForce {
  /** The first x with gˣ ≡ A (mod p). It may differ from Alice's a when g isn't a generator. */
  found: bigint;
  tries: number;
  /** Bˣ mod p: Alice and Bob's secret, recovered. */
  secret: bigint;
}

/** Eve tries x = 1, 2, 3 … until gˣ ≡ A (mod p): the discrete logarithm the slow way. */
export function bruteForce(p: bigint, g: bigint, A: bigint, B: bigint): BruteForce {
  let v = g % p;
  for (let x = 1n; x < p; x++) {
    if (v === A) return { found: x, tries: Number(x), secret: modPow(B, x, p) };
    v = (v * g) % p;
  }
  throw new Error(`no x with ${g}^x ≡ ${A} (mod ${p})`);
}

// ── Parsing ─────────────────────────────────────────────────────────

export type ParamName = keyof DhParams;

/** Parse all four fields together, so g, a and b are checked against the p typed beside them. */
export function parseParams(text: Record<ParamName, string>): FieldParse<DhParams> {
  const p = parseBoundedBigInt(text.p, {
    min: P_MIN,
    max: P_MAX,
    thousands: true,
    messages: {
      empty: 'Type a prime p.',
      negative: 'p must be a positive prime.',
      tooSmall: () => `Keep p at ${P_MIN} or more.`,
      tooBig: () => `Toy primes only here: keep p at ${P_MAX.toLocaleString('en-US')} or less.`,
    },
  });
  if (!p.ok) return p;
  if (!isProbablePrime(p.value).prime) return { ok: false, error: `p = ${p.value} isn't prime, so the numbers 1 … p − 1 don't form the group DH needs.` };
  const top = p.value - 2n;
  const inRange = (name: 'g' | 'a' | 'b', min: bigint) =>
    parseBoundedBigInt(text[name], {
      min,
      max: top,
      thousands: true,
      messages: {
        empty: `Type a value for ${name}.`,
        negative: `${name} must be positive.`,
        tooSmall: () => `${name} must be between ${min} and p − 2 = ${top}.`,
        tooBig: () => `${name} must be between ${min} and p − 2 = ${top}.`,
      },
    });
  const g = inRange('g', 2n);
  if (!g.ok) return g;
  const a = inRange('a', 1n);
  if (!a.ok) return a;
  const b = inRange('b', 1n);
  if (!b.ok) return b;
  return { ok: true, value: { p: p.value, g: g.value, a: a.value, b: b.value } };
}

// ── Bigger p ────────────────────────────────────────────────────────

/** Illustrative brute-force speed for the projection: a billion tries a second. */
export const TRIES_PER_SECOND = 1e9;
export const DIGITS_MIN = 2;
/** A 2048-bit prime has 617 decimal digits. */
export const DIGITS_MAX = 617;

/** log₁₀ of the seconds to try every x below a d-digit p (about 10ᵈ tries). Log space keeps 617 digits finite. */
export const bruteLog10Seconds = (digits: number) => digits - Math.log10(TRIES_PER_SECOND);

export interface Paint {
  /** A CSS colour: a token, or a real color-mix() of tokens. */
  color: string;
  /** Token names of the base paints in it, sorted (repeats allowed: Eve's guess has two ambers). */
  parts: string[];
}

/** Base paints by token name. */
export const paint = (token: string): Paint => ({ color: `var(--${token})`, parts: [token] });

/**
 * Equal parts of every base paint in the inputs (core/paint equalMix), in sorted order, so it
 * depends only on the parts and never on the order they were added.
 */
export function mix(...paints: Paint[]): Paint {
  const parts = paints.flatMap((p) => p.parts).sort();
  return { color: equalMix(parts.map((name) => `var(--${name})`)), parts };
}

export const sameMix = (x: Paint, y: Paint) => x.parts.join() === y.parts.join();
