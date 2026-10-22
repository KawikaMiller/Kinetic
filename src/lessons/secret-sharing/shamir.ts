import { Fp, type FieldPoint } from '../../core/field';
import { fakeSecret } from '../../core/fakeSecret';
import { mulberry32 } from '../../core/random';

/** Fields of the first scene (3, 3 and 4 bits) and the byte field of the second (9 bits: every byte 0..255 is an element). */
export const SMALL_PRIMES: readonly number[] = [5, 7, 11];
export const BYTE_PRIME = 257;
export const MAX_SMALL_SHARES = 5;
export const BYTE_SCHEMES: readonly { k: number; n: number }[] = [{ k: 2, n: 3 }, { k: 3, n: 5 }, { k: 4, n: 6 }];
export const WORD_MAX = 6;
export const DEFAULT_WORD = fakeSecret('ses', 'ame');
/** The hand-worked vector: (3, 5) scheme, secret 42, a1 = 100, a2 = 57 over GF(257). */
export const HAND_SECRET = 42;
export const HAND_COEFFS: readonly bigint[] = [100n, 57n];

export const bits = (p: number): number => p.toString(2).length;

export interface Share {
  x: bigint;
  y: bigint;
}

/** The shares of a secret under given random coefficients: f(x) = s + a1 x + a2 x^2 + ... at each x. */
export function makeShares(p: bigint, secret: bigint, coeffs: readonly bigint[], xs: readonly bigint[]): Share[] {
  const F = Fp(p);
  return xs.map((x) => ({ x, y: F.evalPoly([secret, ...coeffs], x) }));
}

/** Shamir reconstruction: Lagrange interpolation at 0 of the points, with the basis values for display. */
export function reconstruct(p: bigint, shares: readonly Share[]): { secret: bigint; basis: bigint[] } {
  const F = Fp(p);
  const pts: FieldPoint[] = shares.map((s) => [s.x, s.y]);
  return { secret: F.interpolateAtZero(pts), basis: F.lagrangeAtZero(shares.map((s) => s.x)) };
}

/** The same value by a second formulation: solve the Vandermonde system for the coefficients by Gaussian elimination; the secret is the constant term. */
export function reconstructByElimination(p: bigint, shares: readonly Share[]): bigint | null {
  const F = Fp(p);
  const matrix = shares.map((s) => shares.map((_, j) => F.pow(s.x, BigInt(j))));
  const solved = F.solveLinear(matrix, shares.map((s) => s.y));
  return solved ? solved[0] : null;
}

/** A basis value as a signed number near zero: 254 mod 257 reads as -3. */
export const signed = (v: bigint, p: bigint): bigint => (v > p / 2n ? v - p : v);

/** `count` coefficients in 0..p-1 from the seeded generator. A real system uses a CSPRNG. */
export function drawCoeffs(seed: number, count: number, p: bigint, stream = 0): bigint[] {
  const rnd = mulberry32((seed * 31 + stream) >>> 0);
  return Array.from({ length: count }, () => BigInt(Math.floor(rnd() * Number(p))));
}

/* ── scene 1: what an adversary with some shares can still say about the secret ─────────────────────── */

/** For every candidate secret, how many polynomials of degree below k through the held shares have f(0) equal to it (coefficients uniform). */
export function consistentCounts(p: number, k: number, held: readonly Share[]): number[] {
  const F = Fp(BigInt(p));
  const counts = Array.from({ length: p }, () => 0);
  const tuples = p ** (k - 1);
  for (let s = 0; s < p; s++) {
    for (let t = 0; t < tuples; t++) {
      const coeffs: bigint[] = [BigInt(s)];
      let rest = t;
      for (let i = 1; i < k; i++) {
        coeffs.push(BigInt(rest % p));
        rest = Math.floor(rest / p);
      }
      if (held.every((h) => F.evalPoly(coeffs, h.x) === h.y)) counts[s]++;
    }
  }
  return counts;
}

export interface Secrecy {
  /** Share sets examined: every choice of k-1 x-values from 1..p-1 times every y-tuple. */
  cases: number;
  /** Candidate checks: cases times p. */
  checks: number;
  /** True when every candidate had exactly one consistent polynomial in every case. */
  exactlyOne: boolean;
}

function choose(n: number, r: number, from = 1): number[][] {
  if (r === 0) return [[]];
  const out: number[][] = [];
  for (let first = from; first <= n; first++) for (const rest of choose(n, r - 1, first + 1)) out.push([first, ...rest]);
  return out;
}

/** Candidate-polynomial evaluations an exhaustive check does: the button is offered only up to the limit, so the page stays responsive. */
export const SECRECY_WORK_LIMIT = 2_000_000;
export const secrecyWork = (p: number, k: number): number => choose(p - 1, k - 1).length * p ** (k - 1) * p ** k;

/** Exhaustive perfect secrecy over GF(p) for threshold k: every k-1 x-values from 1..p-1 and every y-tuple. */
export function exhaustiveSecrecy(p: number, k: number): Secrecy {
  let cases = 0;
  let exactlyOne = true;
  for (const xs of choose(p - 1, k - 1)) {
    const yTuples = p ** (k - 1);
    for (let t = 0; t < yTuples; t++) {
      let rest = t;
      const held: Share[] = xs.map((x) => {
        const y = rest % p;
        rest = Math.floor(rest / p);
        return { x: BigInt(x), y: BigInt(y) };
      });
      cases++;
      if (!consistentCounts(p, k, held).every((c) => c === 1)) exactlyOne = false;
    }
  }
  return { cases, checks: cases * p, exactlyOne };
}

/* ── scene 2: a byte or a short word over GF(257) ─────────────────────────────────────────────────── */

export const PRINTABLE = /^[\x20-\x7e]*$/;

export type WordParse = { ok: true; bytes: number[] } | { ok: false; error: string };

/** A word of at most 6 printable ASCII characters, one byte each, or the reason it is refused. */
export function parseWord(text: string): WordParse {
  if (text.length === 0) return { ok: false, error: 'Type 1 to 6 characters.' };
  if (text.length > WORD_MAX) return { ok: false, error: `Keep the word to at most ${WORD_MAX} characters.` };
  if (!PRINTABLE.test(text)) return { ok: false, error: 'Use printable ASCII characters only.' };
  return { ok: true, bytes: [...text].map((c) => c.charCodeAt(0)) };
}

export interface ByteShares {
  k: number;
  n: number;
  secretBytes: number[];
  /** coeffs[b] are the random coefficients of byte b's polynomial. */
  coeffs: bigint[][];
  /** shares[x - 1][b] is the share of byte b at x. */
  shares: bigint[][];
}

/** Coefficients per byte: the first byte takes the override when given (the hand vector), the rest come from the seed. */
export function coefficientsFor(bytes: readonly number[], k: number, seed: number, override: readonly bigint[] | null): bigint[][] {
  return bytes.map((_, b) => (b === 0 && override && override.length === k - 1 ? [...override] : drawCoeffs(seed, k - 1, BigInt(BYTE_PRIME), b)));
}

export function shareBytes(secretBytes: readonly number[], k: number, n: number, coeffs: readonly (readonly bigint[])[]): ByteShares {
  const xs = Array.from({ length: n }, (_, i) => BigInt(i + 1));
  const perByte = secretBytes.map((s, b) => makeShares(BigInt(BYTE_PRIME), BigInt(s), coeffs[b], xs));
  return { k, n, secretBytes: [...secretBytes], coeffs: coeffs.map((c) => [...c]), shares: xs.map((_, i) => perByte.map((row) => row[i].y)) };
}

export type Rebuilt =
  | { ok: true; secretBytes: number[]; basis: bigint[]; sum: string }
  | { ok: false; error: string };

export const refusalFor = (held: number, k: number, n: number): string =>
  `${held} share${held === 1 ? '' : 's'} of a ${k}-of-${n} scheme: every one of the ${BYTE_PRIME} secrets fits equally well.`;

/** Rebuild from the chosen share numbers (1-based); fewer than k are refused with the reason. */
export function rebuild(s: ByteShares, chosen: readonly number[]): Rebuilt {
  if (chosen.length < s.k) return { ok: false, error: refusalFor(chosen.length, s.k, s.n) };
  const p = BigInt(BYTE_PRIME);
  const xs = chosen.map((c) => BigInt(c));
  const basis = Fp(p).lagrangeAtZero(xs);
  const secretBytes = s.secretBytes.map((_, b) => Number(reconstruct(p, chosen.map((c) => ({ x: BigInt(c), y: s.shares[c - 1][b] }))).secret));
  const first = chosen.map((c, i) => `${signed(basis[i], p)} x ${s.shares[c - 1][0]}`);
  const total = chosen.reduce((acc, c, i) => acc + signed(basis[i], p) * s.shares[c - 1][0], 0n);
  return { ok: true, secretBytes, basis, sum: `${first.join(' + ')} = ${total} = ${Fp(p).norm(total)} mod ${p}` };
}

/** "Interpolate anyway": the unique polynomial of degree below the number of chosen shares, read at 0. Usually a wrong secret. */
export function interpolateAnyway(s: ByteShares, chosen: readonly number[]): number[] {
  const p = BigInt(BYTE_PRIME);
  return s.secretBytes.map((_, b) => Number(reconstruct(p, chosen.map((c) => ({ x: BigInt(c), y: s.shares[c - 1][b] }))).secret));
}

export const bytesText = (bytes: readonly number[]): string => (bytes.every((b) => b >= 32 && b <= 126) ? String.fromCharCode(...bytes) : bytes.join(', '));

/* ── scene 3: where it goes wrong ─────────────────────────────────────────────────────────────────── */

export const SHARE_LIMIT = BYTE_PRIME - 1;

export type Checked = { ok: true; secret: bigint } | { ok: false; error: string };

/** Reconstruct from typed shares over GF(257); x = 0 and repeated x-values are refused, a wrong y rebuilds a wrong secret without any error. */
export function reconstructChecked(shares: readonly Share[]): Checked {
  const zero = shares.findIndex((s) => s.x === 0n);
  if (zero >= 0) return { ok: false, error: `x = 0 is the secret itself: share ${zero + 1} cannot have it.` };
  for (let i = 0; i < shares.length; i++) {
    const first = shares.findIndex((s) => s.x === shares[i].x);
    if (first !== i) return { ok: false, error: `Two shares with the same x are one point: shares ${first + 1} and ${i + 1} both use x = ${shares[i].x}.` };
  }
  return { ok: true, secret: reconstruct(BigInt(BYTE_PRIME), shares).secret };
}

export type Source = 'uniform' | 'zero-or-one';
export const SOURCE_SUPPORT: Record<Source, (p: number) => number[]> = {
  uniform: (p) => Array.from({ length: p }, (_, i) => i),
  'zero-or-one': () => [0, 1],
};

/** The hand case of the bad coefficient source: GF(7), k = 3, secret 2 and a = (1, 1), so f = 2 + x + x^2. */
export const BAD_SOURCE_CASE = { p: 7, secret: 2, coeffs: [1n, 1n] as const, xs: [1n, 2n] as const };

/** Secrets that keep non-zero probability given two shares of a threshold-3 scheme, when each coefficient is drawn from `support`. Brute force over the support. */
export function possibleSecrets(p: number, shares: readonly Share[], support: readonly number[]): number[] {
  const F = Fp(BigInt(p));
  const found = new Set<number>();
  for (let s = 0; s < p; s++) {
    for (const a1 of support) {
      for (const a2 of support) {
        const coeffs = [BigInt(s), BigInt(a1), BigInt(a2)];
        if (shares.every((h) => F.evalPoly(coeffs, h.x) === h.y)) found.add(s);
      }
    }
  }
  return [...found].sort((a, b) => a - b);
}

/** The guess chance from k-1 shares: 1 over the number of field elements. */
export const guessChance = (p: number): string => `1/${p}`;
