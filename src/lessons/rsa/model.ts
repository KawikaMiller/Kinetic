// Textbook RSA on toy numbers: key generation one check at a time, encrypt/decrypt,
// sign/verify, and what factoring n costs. Everything is exact bigint maths from
// core/numberTheory. Toy sizes only: real RSA uses 2048+ bit moduli and padding.
import { egcd, isProbablePrime, modPow, trialFactor, type EuclidStep } from '../../core/numberTheory';
import { parseBoundedBigInt, type FieldParse } from '../../core/parse';

/** The classic textbook key: p = 61, q = 53, e = 17 gives n = 3233, φ = 3120, d = 2753. */
export const DEFAULT_PARAMS = { p: 61n, q: 53n, e: 17n } as const;
/** Toy primes stay at four digits, so n fits under 10⁸ and every number on screen stays readable. */
export const PRIME_MAX = 9999n;
/** The public exponent real keys almost always use (2¹⁶ + 1). */
export const REAL_E = 65537n;
export const WORD_MAX = 8;

/** Shown in every lane (rollout plan, batch T2-B9). */
export const TOY_WARNING = 'Toy key, trivially breakable — real RSA uses 2048+ bit moduli, padding (OAEP/PSS) and a vetted library. Never use textbook RSA.';

export interface RsaParams {
  p: bigint;
  q: bigint;
  e: bigint;
}

export interface RsaKey extends RsaParams {
  n: bigint;
  phi: bigint;
  d: bigint;
}

export type KeyStepId = 'p' | 'q' | 'distinct' | 'n' | 'phi' | 'e-range' | 'gcd' | 'd';

export interface KeyStep {
  id: KeyStepId;
  ok: boolean;
  /** The value this step produced (n, φ, the gcd, d), when it produces one. */
  value?: bigint;
  /** Why the key stops here, when ok is false. */
  reason?: string;
  /** Factors of a non-prime p or q, for the caption. */
  factors?: bigint[];
}

export interface Keygen {
  steps: KeyStep[];
  key: RsaKey | null;
  /** Extended Euclid on (φ, e): the remainder table that finds d. Null if it never got that far. */
  euclid: EuclidStep[] | null;
  /** The y in φ·x + e·y = 1, before it's reduced mod φ into d. */
  y: bigint | null;
}

const factorsOf = (v: bigint) => (v < 2n ? [] : trialFactor(v).factors);

/**
 * Key generation as the checks a textbook does them, stopping at the first failure with
 * its exact reason. d comes from extended Euclid on (φ, e): φ·x + e·y = 1, so d = y mod φ.
 */
export function keygen({ p, q, e }: RsaParams): Keygen {
  const steps: KeyStep[] = [];
  const done = (): Keygen => ({ steps, key: null, euclid: null, y: null });
  for (const [id, v] of [['p', p], ['q', q]] as const) {
    if (!isProbablePrime(v).prime) {
      steps.push({ id, ok: false, factors: factorsOf(v), reason: `${id} = ${v} isn't prime` });
      return done();
    }
    steps.push({ id, ok: true });
  }
  if (p === q) {
    steps.push({ id: 'distinct', ok: false, reason: `p and q are both ${p}: then n = p², and anyone can take the square root` });
    return done();
  }
  steps.push({ id: 'distinct', ok: true });
  const n = p * q;
  const phi = (p - 1n) * (q - 1n);
  steps.push({ id: 'n', ok: true, value: n });
  steps.push({ id: 'phi', ok: true, value: phi });
  if (e <= 1n || e >= phi) {
    steps.push({ id: 'e-range', ok: false, reason: `e = ${e} must be between 1 and φ = ${phi}, exclusive` });
    return done();
  }
  steps.push({ id: 'e-range', ok: true });
  const { g, y, steps: euclid } = egcd(phi, e);
  if (g !== 1n) {
    steps.push({ id: 'gcd', ok: false, value: g, reason: `gcd(e, φ) = ${g}: e = ${e} shares the factor ${g} with φ = ${phi}, so it has no inverse` });
    return { steps, key: null, euclid, y: null };
  }
  steps.push({ id: 'gcd', ok: true, value: g });
  const d = ((y % phi) + phi) % phi;
  steps.push({ id: 'd', ok: true, value: d });
  return { steps, key: { p, q, e, n, phi, d }, euclid, y };
}

/** The first failed step's reason, or null for a valid key. */
export const keygenError = (k: Keygen) => k.steps.find((s) => !s.ok)?.reason ?? null;

// ── Encrypt, decrypt, sign, verify ──────────────────────────────────

export const encrypt = (k: RsaKey, m: bigint) => modPow(m, k.e, k.n);
export const decrypt = (k: RsaKey, c: bigint) => modPow(c, k.d, k.n);
export const sign = (k: RsaKey, m: bigint) => modPow(m, k.d, k.n);
/** What the public exponent turns a signature back into; it verifies when that equals the message. */
export const unsign = (k: RsaKey, s: bigint) => modPow(s, k.e, k.n);
export const verify = (k: RsaKey, m: bigint, s: bigint) => unsign(k, s) === m;

export interface Item {
  /** The character it came from, in word mode. */
  ch?: string;
  m: bigint;
  c: bigint;
  back: bigint;
}

export const runItems = (k: RsaKey, ms: readonly { m: bigint; ch?: string }[]): Item[] =>
  ms.map(({ m, ch }) => {
    const c = encrypt(k, m);
    return { ch, m, c, back: decrypt(k, c) };
  });

/** Groups of item indexes that share a ciphertext (only groups of two or more). */
export function repeatedCiphertexts(items: readonly Item[]): number[][] {
  const by = new Map<bigint, number[]>();
  items.forEach((it, i) => by.set(it.c, [...(by.get(it.c) ?? []), i]));
  return [...by.values()].filter((g) => g.length > 1);
}

/** Messages that encrypt to themselves under this key (0, 1 and n − 1 always do). */
export const fixedPoints = (k: RsaKey) => [0n, 1n, k.n - 1n].filter((m) => encrypt(k, m) === m);

export type MessageInput = { mode: 'number'; text: string } | { mode: 'word'; text: string };

/**
 * The message as RSA inputs, or the reason it's refused. A number must be 0 ≤ m < n. A word
 * is encrypted one character at a time, by code point: a toy encoding, which is exactly how
 * textbook RSA's determinism shows up (equal letters, equal ciphertexts).
 */
export function parseMessage(input: MessageInput, n: bigint): FieldParse<{ m: bigint; ch?: string }[]> {
  if (input.mode === 'number') {
    const r = parseBoundedBigInt(input.text, {
      min: 0n,
      max: n - 1n,
      thousands: true,
      messages: {
        empty: 'Type a message number.',
        invalid: (t) => `"${t}" isn't a whole number. Switch to Word to encrypt text.`,
        tooBig: () => `The message must be smaller than n = ${n}.`,
        negative: 'Messages are numbers from 0 up to n − 1.',
      },
    });
    return r.ok ? { ok: true, value: [{ m: r.value }] } : r;
  }
  const chars = [...input.text];
  if (input.text.trim() === '') return { ok: false, error: 'Type a short word.' };
  if (chars.length > WORD_MAX) return { ok: false, error: `Keep it to ${WORD_MAX} characters.` };
  const big = chars.find((ch) => BigInt(ch.codePointAt(0)!) >= n);
  if (big) return { ok: false, error: `"${big}" has code ${big.codePointAt(0)}, which isn't below n = ${n}. Use bigger primes or plain letters.` };
  return { ok: true, value: chars.map((ch) => ({ ch, m: BigInt(ch.codePointAt(0)!) })) };
}

/** A tampered copy of m for the verify demo: m + 1, or m − 1 at the top of the range. */
export const edited = (m: bigint, n: bigint) => (m + 1n < n ? m + 1n : m - 1n);

/** Parse one of the key fields: p, q or e. */
export function parseParam(name: 'p' | 'q' | 'e', text: string): FieldParse<bigint> {
  const max = name === 'e' ? PRIME_MAX * PRIME_MAX : PRIME_MAX;
  return parseBoundedBigInt(text, {
    min: 2n,
    max,
    thousands: true,
    messages: {
      empty: `Type a value for ${name}.`,
      negative: `${name} must be a positive whole number.`,
      tooSmall: () => `${name} must be at least 2.`,
      tooBig: () => (name === 'e' ? `e must be below φ, so keep it under ${max.toLocaleString('en-US')}.` : `Toy primes only here: keep ${name} at ${PRIME_MAX} or less.`),
    },
  });
}

// ── Why size matters ────────────────────────────────────────────────

/** Illustrative trial-division speed for the projection: a billion divisions a second. */
export const DIVISIONS_PER_SECOND = 1e9;
export const BITS_MIN = 16;
export const BITS_MAX = 2048;
export const BITS_STEP = 16;

export const bitLength = (n: bigint) => n.toString(2).length;

/**
 * Trial division tries odd divisors up to √n, about √n / 2 of them. For a b-bit n that is
 * about 2^(b/2 − 1): computed in log space so 2048 bits stays finite.
 */
export const trialDivisionsLog2 = (bits: number) => bits / 2 - 1;
export const trialSeconds = (bits: number) => 2 ** trialDivisionsLog2(bits) / DIVISIONS_PER_SECOND;

export interface FactorRun {
  factors: bigint[];
  steps: number;
}

export const factorToy = (n: bigint): FactorRun => trialFactor(n);

/** Who holds which key, and which operation uses it. */
export const KEY_ROLES = [
  { op: 'Encrypt', key: 'public (n, e)', who: 'anyone' },
  { op: 'Decrypt', key: 'private d', who: 'only the owner' },
  { op: 'Sign', key: 'private d', who: 'only the owner' },
  { op: 'Verify', key: 'public (n, e)', who: 'anyone' },
] as const;

