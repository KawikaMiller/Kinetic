import { isqrt, mod, modInverse, modPow } from '../../core/numberTheory';
import { mulberry32 } from '../../core/random';
import { sha256 } from '../../core/sha256';

/** A toy Schnorr group: p = 2q + 1, g of prime order q. Both are toys (5 and 11 bits) and prove nothing about any real system. */
export interface Group {
  id: 'A' | 'B';
  p: bigint;
  q: bigint;
  g: bigint;
  /** Bit size of p. */
  bits: number;
}

export const GROUP_A: Group = { id: 'A', p: 23n, q: 11n, g: 2n, bits: 5 };
export const GROUP_B: Group = { id: 'B', p: 2039n, q: 1019n, g: 4n, bits: 11 };
export const GROUPS: Record<Group['id'], Group> = { A: GROUP_A, B: GROUP_B };
export const DEFAULT_X = 7n;
export const DEFAULT_R = 5n;
export const SEARCH_REFUSAL = 'this search is only offered for toy sizes';
/** The made-up search speed of the cost line, in steps per second. */
export const ILLUSTRATIVE_RATE = 1e12;
const SECONDS_PER_YEAR = 3.156e7;

const known = (G: Group): boolean => GROUPS[G.id] === G;

export const publicKey = (G: Group, x: bigint): bigint => modPow(G.g, x, G.p);
export const commit = (G: Group, r: bigint): bigint => modPow(G.g, r, G.p);
export const respond = (G: Group, r: bigint, c: bigint, x: bigint): bigint => mod(r + c * x, G.q);

export interface Check {
  /** g^s mod p. */
  lhs: bigint;
  /** t * y^c mod p. */
  rhs: bigint;
  ok: boolean;
}

/** The verifier's equation g^s = t y^c mod p. */
export function verify(G: Group, y: bigint, t: bigint, c: bigint, s: bigint): Check {
  const lhs = modPow(G.g, s, G.p);
  const rhs = mod(t * modPow(y, c, G.p), G.p);
  return { lhs, rhs, ok: lhs === rhs };
}

/** From two accepting answers to one commitment with different challenges: x = (s - s') / (c - c') mod q. */
export function extract(G: Group, c1: bigint, s1: bigint, c2: bigint, s2: bigint): bigint | null {
  if (!known(G)) throw new RangeError(SEARCH_REFUSAL);
  const dc = mod(c1 - c2, G.q);
  const inv = modInverse(dc, G.q);
  return inv === null ? null : mod((s1 - s2) * inv, G.q);
}

/** The simulator, which does not know x: pick s and c, then set t = g^s y^(-c). */
export function simulate(G: Group, y: bigint, c: bigint, s: bigint): bigint {
  const yc = modPow(y, c, G.p);
  return mod(modPow(G.g, s, G.p) * modInverse(yc, G.p)!, G.p);
}

/** The broken simulator that forgets the y^(-c) factor: t = g^s. */
export const simulateBroken = (G: Group, s: bigint): bigint => modPow(G.g, s, G.p);

export interface Triple {
  t: bigint;
  c: bigint;
  s: bigint;
}

const byTriple = (a: Triple, b: Triple): number => Number(a.t - b.t) || Number(a.c - b.c) || Number(a.s - b.s);
const key = (x: Triple): string => `${x.t}|${x.c}|${x.s}`;

/** Every (t, c, s) the honest prover can produce: each r and each c gives one triple. */
export function realTriples(G: Group, x: bigint): Triple[] {
  const out: Triple[] = [];
  for (let r = 0n; r < G.q; r++) for (let c = 0n; c < G.q; c++) out.push({ t: commit(G, r), c, s: respond(G, r, c, x) });
  return out.sort(byTriple);
}

/** Every triple the simulator produces without x: each s and each c gives one triple. */
export function simulatedTriples(G: Group, y: bigint, broken = false): Triple[] {
  const out: Triple[] = [];
  for (let s = 0n; s < G.q; s++) for (let c = 0n; c < G.q; c++) out.push({ t: broken ? simulateBroken(G, s) : simulate(G, y, c, s), c, s });
  return out.sort(byTriple);
}

export interface Comparison {
  count: number;
  /** Simulated triples that are not a real triple (as a multiset): 110 for the broken simulator in group A. */
  missing: number;
  /** Real triples the simulated list does not make. */
  unmatched: number;
  identical: boolean;
  /** The first simulated triple that fails the verifier's equation, if any. */
  firstFailing: Triple | null;
}

/** Compares the real and the simulated lists as multisets and finds the first simulated triple the verifier rejects. */
export function compareTriples(G: Group, y: bigint, real: readonly Triple[], simulated: readonly Triple[]): Comparison {
  const counts = new Map<string, number>();
  for (const r of real) counts.set(key(r), (counts.get(key(r)) ?? 0) + 1);
  let missing = 0;
  for (const s of simulated) {
    const have = counts.get(key(s)) ?? 0;
    if (have === 0) missing++;
    else counts.set(key(s), have - 1);
  }
  const unmatched = [...counts.values()].reduce((a, b) => a + b, 0);
  const firstFailing = simulated.find((x) => !verify(G, y, x.t, x.c, x.s).ok) ?? null;
  return { count: real.length, missing, unmatched, identical: real.length === simulated.length && missing === 0 && unmatched === 0, firstFailing };
}

/** Edits of the one-message proof's commitment t (every t in 1..p-1 other than the real one, the answer s kept) and how many still pass the recomputed-challenge check. */
export function editsThatPass(G: Group, x: bigint, r: bigint): { tried: number; passing: number } {
  const { y, t, s } = proveFiatShamir(G, x, r);
  let tried = 0;
  let passing = 0;
  for (let e = 1n; e < G.p; e++) {
    if (e === t) continue;
    tried++;
    if (verifyFiatShamir(G, y, e, s).ok) passing++;
  }
  return { tried, passing };
}

/** The cheat of guessing the challenge: fix c', pick s, send t = g^s y^(-c'). It passes exactly when the verifier's c equals c'. */
export function guessAttempt(G: Group, y: bigint, guess: bigint, s: bigint, challenge: bigint): { t: bigint; ok: boolean } {
  const t = simulate(G, y, guess, s);
  return { t, ok: verify(G, y, t, challenge, s).ok };
}

/** Brute-force discrete logarithm: at most q tries, offered for the two toy groups only. */
export function searchSecret(G: Group, y: bigint): { x: bigint; tries: number } {
  if (!known(G)) throw new RangeError(SEARCH_REFUSAL);
  let value = 1n;
  for (let x = 0n; x < G.q; x++) {
    if (value === y) return { x, tries: Number(x) + 1 };
    value = mod(value * G.g, G.p);
  }
  throw new RangeError('searchSecret: y is not a power of g');
}

export interface CostLine {
  /** About the square root of the group order: the generic search. */
  log2: number;
  seconds: number;
}

/** The generic-search cost for a group of order about 2^256, at the made-up rate. */
export function genericCost(orderBits: number): CostLine {
  const steps = isqrt(2n ** BigInt(orderBits));
  return { log2: Math.round(Math.log2(Number(steps))), seconds: Number(steps) / ILLUSTRATIVE_RATE };
}
export const REAL_COST: CostLine = genericCost(256);
export const realYears = (): number => REAL_COST.seconds / SECONDS_PER_YEAR;

/* ── the working shown line by line ──────────────────────────────────────── */

/** One round of the interactive proof with every modular power written out. */
export function workings(G: Group, x: bigint, r: bigint, c: bigint): string[] {
  const y = publicKey(G, x);
  const t = commit(G, r);
  const s = respond(G, r, c, x);
  const check = verify(G, y, t, c, s);
  const yc = modPow(y, c, G.p);
  return [
    `public key  y = g^x = ${G.g}^${x} mod ${G.p} = ${y}`,
    `commitment  t = g^r = ${G.g}^${r} mod ${G.p} = ${t}`,
    `challenge   c = ${c}`,
    `answer      s = r + c x = ${r} + ${c} x ${x} = ${r + c * x} = ${s} mod ${G.q}`,
    `left side   g^s = ${G.g}^${s} mod ${G.p} = ${check.lhs}`,
    `right side  t y^c = ${t} x ${y}^${c} = ${t} x ${yc} = ${t * yc} = ${check.rhs} mod ${G.p}`,
    check.ok ? 'both sides equal: accept' : 'the sides differ: reject',
  ];
}

/** `rounds` seeded rounds of the guessing cheat (a guessed challenge, a random s, a random verifier challenge): how many pass. */
export function guessRun(G: Group, y: bigint, seed: number, rounds: number): { passed: number; expected: number; sigma: number } {
  const rnd = mulberry32(seed);
  const q = Number(G.q);
  let passed = 0;
  for (let i = 0; i < rounds; i++) {
    const guess = BigInt(Math.floor(rnd() * q));
    const s = BigInt(Math.floor(rnd() * q));
    const challenge = BigInt(Math.floor(rnd() * q));
    if (guessAttempt(G, y, guess, s, challenge).ok) passed++;
  }
  const p = 1 / q;
  return { passed, expected: rounds * p, sigma: Math.sqrt(rounds * p * (1 - p)) };
}

/* ── Fiat-Shamir ─────────────────────────────────────────────────────────── */

/** The text hashed for the challenge: the statement (group and public key) and the commitment. */
export const challengeText = (G: Group, y: bigint, t: bigint): string => `kinetic-zk|${G.p}|${G.g}|${y}|${t}`;

/** c = SHA-256(statement and commitment) mod q. */
export function fiatShamirChallenge(G: Group, y: bigint, t: bigint): bigint {
  const digest = sha256(new TextEncoder().encode(challengeText(G, y, t)));
  const n = BigInt(`0x${[...digest].map((b) => b.toString(16).padStart(2, '0')).join('')}`);
  return n % G.q;
}

export interface FsProof {
  y: bigint;
  t: bigint;
  c: bigint;
  s: bigint;
}

export function proveFiatShamir(G: Group, x: bigint, r: bigint): FsProof {
  const y = publicKey(G, x);
  const t = commit(G, r);
  const c = fiatShamirChallenge(G, y, t);
  return { y, t, c, s: respond(G, r, c, x) };
}

/** Anyone recomputes c from the statement and the commitment and checks the equation. */
export function verifyFiatShamir(G: Group, y: bigint, t: bigint, s: bigint): Check & { c: bigint } {
  const c = fiatShamirChallenge(G, y, t);
  return { c, ...verify(G, y, t, c, s) };
}
