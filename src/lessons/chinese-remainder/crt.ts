import { egcd, gcd, mod, modInverse, modPow, type EuclidStep } from '../../core/numberTheory';

// The Chinese remainder theorem on toy-sized numbers: the system, the gears' coincidence, the constructive formula, the
// general case with a shared factor, residue arithmetic and the toy CRT speed-up of a modular exponentiation.

export const M_MIN = 2;
export const M_MAX = 30;
export const GEARS_MAX = 3;

export interface System {
  moduli: number[];
  residues: number[];
}

export const gcdN = (a: number, b: number): number => Number(gcd(BigInt(a), BigInt(b)));
export const lcmN = (ms: readonly number[]): number => ms.reduce((l, m) => (l / gcdN(l, m)) * m, 1);
export const productN = (ms: readonly number[]): number => ms.reduce((p, m) => p * m, 1);

export function pairwiseCoprime(ms: readonly number[]): boolean {
  return ms.every((a, i) => ms.every((b, j) => i >= j || gcdN(a, b) === 1));
}

/** Each residue held inside 0..m-1 (a residue slider follows its modulus slider). */
export const clampResidues = (moduli: readonly number[], residues: readonly number[]): number[] => moduli.map((m, i) => Math.max(0, Math.min(m - 1, residues[i] ?? 0)));

/** Two congruences x = a1 (mod m1) and x = a2 (mod m2) can hold together exactly when a1 = a2 (mod gcd(m1, m2)). */
export const compatiblePair = (a1: number, m1: number, a2: number, m2: number): boolean => (((a1 - a2) % gcdN(m1, m2)) + gcdN(m1, m2)) % gcdN(m1, m2) === 0;

export type Solution = { ok: true; x: number; modulus: number } | { ok: false; i: number; j: number; gcd: number };

/** The solution of a system, unique modulo the lcm, or the first pair of congruences that contradict each other. */
export function solve(sys: System): Solution {
  const { moduli: ms, residues: as } = sys;
  for (let i = 0; i < ms.length; i++) {
    for (let j = i + 1; j < ms.length; j++) {
      if (!compatiblePair(as[i], ms[i], as[j], ms[j])) return { ok: false, i, j, gcd: gcdN(ms[i], ms[j]) };
    }
  }
  let x = as[0] % ms[0];
  let m = ms[0];
  for (let k = 1; k < ms.length; k++) {
    const g = gcdN(m, ms[k]);
    const step = ms[k] / g;
    const inverse = modInverse(BigInt(m / g), BigInt(step)) ?? 0n;
    const t = Number((BigInt((as[k] - x) / g) * inverse) % BigInt(step));
    x = x + m * (((t % step) + step) % step);
    m = (m / g) * ms[k];
    x = ((x % m) + m) % m;
  }
  return { ok: true, x, modulus: m };
}

/** Every x in 0..limit-1 that satisfies all the congruences: the brute-force reference. */
export function bruteSolutions(sys: System, limit: number): number[] {
  const out: number[] = [];
  for (let x = 0; x < limit; x++) if (sys.moduli.every((m, i) => x % m === sys.residues[i])) out.push(x);
  return out;
}

/** The first x at which every gear is on its chosen remainder, searching 0..limit-1, or null. */
export const firstMatch = (sys: System, limit: number): number | null => bruteSolutions(sys, limit)[0] ?? null;

export interface CrtTerm {
  modulus: number;
  residue: number;
  /** M_i = M / m_i, a multiple of every other modulus. */
  partial: number;
  /** y_i = M_i^-1 mod m_i, or null when it does not exist. */
  inverse: number | null;
  /** a_i * M_i * y_i. */
  term: number;
  /** The Euclid remainder table behind the inverse. */
  steps: EuclidStep[];
}

export interface CrtBuild {
  product: number;
  terms: CrtTerm[];
  sum: number;
  x: number;
}

/**
 * The constructive formula x = sum a_i M_i y_i mod M. With `assumeInverse` a missing inverse is replaced by 1, which is what
 * applying the coprime formula to moduli that share a factor amounts to: the broken variant.
 */
export function crtBuild(sys: System, assumeInverse = false): CrtBuild | null {
  const { moduli: ms, residues: as } = sys;
  if (!assumeInverse && !pairwiseCoprime(ms)) return null;
  const product = productN(ms);
  const terms = ms.map((m, i): CrtTerm => {
    const partial = product / m;
    const inverse = modInverse(BigInt(partial), BigInt(m));
    const y = inverse === null ? (assumeInverse ? 1 : null) : Number(inverse);
    return { modulus: m, residue: as[i], partial, inverse: y, term: as[i] * partial * (y ?? 0), steps: egcd(BigInt(partial % m), BigInt(m)).steps };
  });
  const sum = terms.reduce((s, t) => s + t.term, 0);
  return { product, terms, sum, x: sum % product };
}

/** The remainders of v modulo each modulus. */
export const toResidues = (v: number, moduli: readonly number[]): number[] => moduli.map((m) => v % m);

/** Add or multiply two residue tuples component by component, with no carries between moduli. */
export function residueOp(u: readonly number[], v: readonly number[], moduli: readonly number[], op: 'add' | 'multiply'): number[] {
  return moduli.map((m, i) => (op === 'add' ? (u[i] + v[i]) % m : (u[i] * v[i]) % m));
}

/** The number below M that has these residues (pairwise coprime moduli), by the constructive formula. */
export function fromResidues(residues: readonly number[], moduli: readonly number[]): number {
  return crtBuild({ moduli: [...moduli], residues: [...residues] })!.x;
}

// ── the toy CRT speed-up ──────────────────────────────────────────────────

export interface CrtExponentiation {
  dp: bigint;
  dq: bigint;
  mp: bigint;
  mq: bigint;
  qInv: bigint;
  h: bigint;
  result: bigint;
}

/** c^d mod pq as two half-size exponentiations mod p and mod q, recombined (Garner's one-line formula). */
export function crtExponentiation(c: bigint, d: bigint, p: bigint, q: bigint): CrtExponentiation {
  const dp = d % (p - 1n);
  const dq = d % (q - 1n);
  const mp = modPow(c, dp, p);
  const mq = modPow(c, dq, q);
  const qInv = modInverse(q, p)!;
  const h = mod(qInv * (mp - mq), p);
  return { dp, dq, mp, mq, qInv, h, result: mq + h * q };
}

/** Bits needed to write x (toy sizes, below 2^32). */
const bitsIn = (x: bigint): number => 32 - Math.clz32(Number(x));

/** The schoolbook cost model: each modular multiplication costs (bits of the modulus)^2 digit steps, and there are about (bits of the exponent) of them. */
export const workUnits = (modulus: bigint, exponent: bigint): number => bitsIn(modulus) ** 2 * bitsIn(exponent);

export interface Work {
  full: number;
  crt: number;
  ratio: number;
}

export function workOf(p: bigint, q: bigint, d: bigint): Work {
  const full = workUnits(p * q, d);
  const crt = workUnits(p, d % (p - 1n)) + workUnits(q, d % (q - 1n));
  return { full, crt, ratio: crt / full };
}
