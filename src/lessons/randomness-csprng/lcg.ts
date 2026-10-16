/**
 * The lesson's own toy generators: linear congruential generators, used only to show structure. Nothing here ever
 * touches `Math.random` output, a real token or anyone's session id.
 */

export interface LcgParams {
  id: 'toy' | 'randu' | 'minstd';
  label: string;
  /** What the preset is, in a sentence. */
  text: string;
  a: number;
  c: number;
  m: number;
}

const TWO_31 = 2 ** 31;

export const PRESETS: readonly LcgParams[] = [
  { id: 'toy', label: 'A toy with a small m', text: 'x(n+1) = (5 x(n) + 1) mod 64: small enough to see every point', a: 5, c: 1, m: 64 },
  { id: 'randu', label: 'RANDU, a famous bad one', text: 'x(n+1) = 65539 x(n) mod 2^31, a historically poor generator', a: 65539, c: 0, m: TWO_31 },
  { id: 'minstd', label: 'A good-looking one', text: 'x(n+1) = 16807 x(n) mod (2^31 - 1), the Park-Miller multiplier', a: 16807, c: 0, m: TWO_31 - 1 },
];

export const presetById = (id: LcgParams['id']) => PRESETS.find((p) => p.id === id)!;

/** One step. Every preset's a x + c stays below 2^53, so plain numbers are exact (a BigInt reference checks it in the tests). */
export const lcgNext = (x: number, p: LcgParams): number => (p.a * x + p.c) % p.m;

/** The first `count` states starting from `seed` (the seed itself is the first). */
export function lcgSequence(p: LcgParams, seed: number, count: number): number[] {
  const out: number[] = [];
  let x = seed % p.m;
  for (let i = 0; i < count; i++) {
    out.push(x);
    x = lcgNext(x, p);
  }
  return out;
}

/** Consecutive pairs (x(n), x(n+1)) scaled into the unit square. */
export function pairs(p: LcgParams, seed: number, count: number): { x: number; y: number }[] {
  const s = lcgSequence(p, seed, count + 1);
  return Array.from({ length: count }, (_, i) => ({ x: s[i] / p.m, y: s[i + 1] / p.m }));
}

/** Consecutive triples scaled into the unit cube. */
export function triples(p: LcgParams, seed: number, count: number): { u: number; v: number; w: number }[] {
  const s = lcgSequence(p, seed, count + 2);
  return Array.from({ length: count }, (_, i) => ({ u: s[i] / p.m, v: s[i + 1] / p.m, w: s[i + 2] / p.m }));
}

/** The full-period conditions for m a power of two: c odd and a - 1 divisible by 4. */
export const hasFullPeriod = (p: LcgParams): boolean => Number.isInteger(Math.log2(p.m)) && p.c % 2 === 1 && (p.a - 1) % 4 === 0;

/** Marsaglia's bound: k-tuples of an LCG with modulus m lie on at most (k! m)^(1/k) parallel hyperplanes. */
export function hyperplaneBound(k: number, m: number): number {
  let factorial = 1;
  for (let i = 2; i <= k; i++) factorial *= i;
  return Math.floor((factorial * m) ** (1 / k));
}

// ── RANDU ────────────────────────────────────────────────────────────────

export const RANDU = presetById('randu');

/** RANDU's third output from the first two: x(n+2) = 6 x(n+1) - 9 x(n) mod 2^31, in exact integer arithmetic. */
export function randuIdentity(x0: number, x1: number): number {
  const m = BigInt(RANDU.m);
  return Number((((6n * BigInt(x1) - 9n * BigInt(x0)) % m) + m) % m);
}

/** The plane normal: every triple satisfies 9 u - 6 v + w = an integer. */
export const RANDU_NORMAL = { u: 9, v: -6, w: 1 } as const;

/** The integer 9 u - 6 v + w, computed exactly from the states (BigInt, so no rounding). */
export function planeIndex(x0: number, x1: number, x2: number): number {
  const m = BigInt(RANDU.m);
  const total = 9n * BigInt(x0) - 6n * BigInt(x1) + BigInt(x2);
  if (total % m !== 0n) throw new RangeError('not a RANDU triple');
  return Number(total / m);
}

/** The rotation about the vertical axis that views those planes edge on, in degrees. Worked out from the normal, not typed. */
export const EDGE_ON_DEGREES = ((Math.atan2(-RANDU_NORMAL.v, -RANDU_NORMAL.u) * 180) / Math.PI + 360) % 360;

/** Project a triple: rotate about the vertical axis by `degrees` and plot (across, w). */
export function project(t: { u: number; v: number; w: number }, degrees: number): { x: number; y: number } {
  const a = (degrees * Math.PI) / 180;
  return { x: t.u * Math.cos(a) + t.v * Math.sin(a), y: t.w };
}

const SAMPLE_STATES = 100_000;
const SAMPLE_SEED = 1;

/** The distinct plane indices among 100,000 consecutive RANDU triples: how many planes the points use. */
export function randuPlaneIndices(): number[] {
  const s = lcgSequence(RANDU, SAMPLE_SEED, SAMPLE_STATES + 2);
  const seen = new Set<number>();
  for (let i = 0; i < SAMPLE_STATES; i++) seen.add(planeIndex(s[i], s[i + 1], s[i + 2]));
  return [...seen].sort((a, b) => a - b);
}
