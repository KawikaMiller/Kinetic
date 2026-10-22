import { mulberry32, randInt, type Rnd } from '../../core/random';

/** The toy modulus: not prime on purpose, so q / 4 = 24.5 is never an integer and the decoding rule has no ties. */
export const Q = 98;
export const HALF = 49;
/** A bit decodes correctly exactly when the centred noise has absolute value at most this. */
export const NOISE_LIMIT = 24;

export const N_RANGE = [2, 8] as const;
export const M_RANGE = [4, 16] as const;
export const B_RANGE = [0, 15] as const;
export const SWEEP_TRIALS = 1000;
export const BITS = 8;

export interface LweParams {
  n: number;
  m: number;
  B: number;
}
export const DEFAULT_PARAMS: LweParams = { n: 4, m: 8, B: 2 };
/** The preset that fails: about half of the encryptions go wrong, well under 90%. */
export const FAILING_PARAMS: LweParams = { n: 4, m: 16, B: 8 };
export const DEFAULT_SEED = 7;
/** A sweep counts as failing when at least 5% of its 1,000 encryptions decode wrongly. */
export const SEVERE_FAILURES = 50;
/** The lowest seed on which the failing preset is severe (re-pinned from a run over seeds 0..199; the test recomputes it). */
export const BROKEN_SEED = 4;

export const mod = (v: number, q = Q): number => ((v % q) + q) % q;
/** Reduce into -49..48: the signed residue of a noise sum. */
export const centred = (v: number): number => {
  const r = mod(v);
  return r > HALF - 1 ? r - Q : r;
};

export interface PublicKey {
  /** m rows of n numbers mod 98. */
  A: number[][];
  /** b_i = <a_i, s> + e_i mod 98. */
  b: number[];
}
export interface KeyPair {
  s: number[];
  pub: PublicKey;
  /** The noise terms e_i, each in -B..B (kept for the explanation and the tests). */
  e: number[];
}

const inner = (u: readonly number[], v: readonly number[]): number => u.reduce((acc, x, i) => acc + x * v[i], 0);

/** A secret, public rows and noisy products, all drawn from `rnd`. */
export function keygen(p: LweParams, rnd: Rnd): KeyPair {
  const s = Array.from({ length: p.n }, () => randInt(0, Q - 1, rnd));
  const A = Array.from({ length: p.m }, () => Array.from({ length: p.n }, () => randInt(0, Q - 1, rnd)));
  const e = Array.from({ length: p.m }, () => randInt(-p.B, p.B, rnd));
  const b = A.map((row, i) => mod(inner(row, s) + e[i]));
  return { s, pub: { A, b }, e };
}

export interface Ciphertext {
  u: number[];
  v: number;
  /** Which rows were summed. */
  subset: boolean[];
}

/** Encrypt one bit: sum a random subset of the rows and add 49 for a 1. */
export function encryptBit(pub: PublicKey, bit: 0 | 1, rnd: Rnd): Ciphertext {
  const n = pub.A[0].length;
  const subset = pub.A.map(() => rnd() < 0.5);
  const u = Array.from({ length: n }, (_, j) => mod(pub.A.reduce((acc, row, i) => acc + (subset[i] ? row[j] : 0), 0)));
  const v = mod(pub.b.reduce((acc, bi, i) => acc + (subset[i] ? bi : 0), 0) + HALF * bit);
  return { u, v, subset };
}

export interface Decryption {
  /** v - <u, s> mod 98. */
  d: number;
  bit: 0 | 1;
}

/** Decrypt: the bit is 1 exactly when d is strictly closer to 49 than to 0 (distances taken mod 98). */
export function decryptBit(s: readonly number[], ct: Ciphertext): Decryption {
  const d = mod(ct.v - inner(ct.u, s));
  const toZero = Math.min(d, Q - d);
  const toHalf = Math.abs(d - HALF);
  return { d, bit: toHalf < toZero ? 1 : 0 };
}

/** The accumulated noise of a ciphertext: the sum of e_i over the chosen rows (unreduced). */
export const accumulatedNoise = (e: readonly number[], ct: Ciphertext): number => e.reduce((acc, ei, i) => acc + (ct.subset[i] ? ei : 0), 0);

/** The analytic rule: the bit decodes correctly iff the centred noise has |eps| <= 24. */
export const decodesCorrectly = (eps: number): boolean => Math.abs(centred(eps)) <= NOISE_LIMIT;

export interface BitRow {
  index: number;
  sent: 0 | 1;
  eps: number;
  epsCentred: number;
  d: number;
  got: 0 | 1;
  ok: boolean;
}

/** A byte's worth of bits, each its own ciphertext, with the noise and the verdict per bit. */
export function encryptByte(kp: KeyPair, bits: readonly (0 | 1)[], rnd: Rnd): BitRow[] {
  return bits.map((sent, index) => {
    const ct = encryptBit(kp.pub, sent, rnd);
    const eps = accumulatedNoise(kp.e, ct);
    const { d, bit } = decryptBit(kp.s, ct);
    return { index, sent, eps, epsCentred: centred(eps), d, got: bit, ok: bit === sent };
  });
}

/** The seeded message byte, as bits, most significant first. */
export const messageBits = (seed: number): (0 | 1)[] => {
  const rnd = mulberry32(seed + 1);
  return Array.from({ length: BITS }, () => (rnd() < 0.5 ? 0 : 1));
};

const KEY_SALT = 0;
const TRIAL_SALT = 0x9e3779b1;

/** The key a seed and parameters give. */
export const keyFor = (p: LweParams, seed: number): KeyPair => keygen(p, mulberry32(seed + KEY_SALT));

/** The encryption stream of a seed, separate from the key stream. */
export const trialStream = (seed: number): Rnd => mulberry32((seed ^ TRIAL_SALT) >>> 0);

export interface Sweep {
  trials: number;
  failures: number;
  /** The first trial that failed, with its centred noise. */
  firstFailure: { trial: number; epsCentred: number } | null;
}

/** 1,000 seeded encryptions of a random bit each under one key: how many decode wrongly. */
export function sweep(p: LweParams, seed: number, trials = SWEEP_TRIALS): Sweep {
  const kp = keyFor(p, seed);
  const rnd = trialStream(seed);
  let failures = 0;
  let firstFailure: Sweep['firstFailure'] = null;
  for (let t = 0; t < trials; t++) {
    const bit = rnd() < 0.5 ? 0 : 1;
    const ct = encryptBit(kp.pub, bit, rnd);
    const { bit: got } = decryptBit(kp.s, ct);
    if (got !== bit) {
      failures++;
      firstFailure ??= { trial: t, epsCentred: centred(accumulatedNoise(kp.e, ct)) };
    }
  }
  return { trials, failures, firstFailure };
}

export interface CandidateSearch {
  /** Secrets (n = 2 only) whose every row is consistent within +-B. */
  candidates: number;
  /** Secrets examined: 98^2. */
  examined: number;
  containsTrue: boolean;
}

export const SEARCH_N = 2;
export const SEARCH_SPACE = Q ** SEARCH_N;

/** Brute force over all 98^2 secrets for n = 2: how many agree with the public rows within +-B. Refuses other n. */
export function candidateSearch(kp: KeyPair, B: number): CandidateSearch {
  if (kp.s.length !== SEARCH_N) throw new RangeError(`candidateSearch: only offered for n = ${SEARCH_N} (${SEARCH_SPACE} secrets)`);
  let candidates = 0;
  let containsTrue = false;
  for (let s0 = 0; s0 < Q; s0++) {
    for (let s1 = 0; s1 < Q; s1++) {
      const fits = kp.pub.A.every((row, i) => Math.abs(centred(kp.pub.b[i] - row[0] * s0 - row[1] * s1)) <= B);
      if (fits) {
        candidates++;
        if (s0 === kp.s[0] && s1 === kp.s[1]) containsTrue = true;
      }
    }
  }
  return { candidates, examined: SEARCH_SPACE, containsTrue };
}
