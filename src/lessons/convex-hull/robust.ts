import { mulberry32 } from '../../core/random';
import { andrew, cross, type P } from './hull';

/** The classic near-collinear setup: a lattice of doubles just above 0.5 against the segment from (12, 12) to (24, 24). */
export const LATTICE = 256;
/** The spacing of doubles in [0.5, 1): 2^-53. */
export const ULP = 2 ** -53;
export const SEG_FROM: P = { x: 12, y: 12 };
export const SEG_TO: P = { x: 24, y: 24 };
export const SEARCH_SEED = 2024;
export const SEARCH_CANDIDATES = 200_000;
export const MISMATCHES_SHOWN = 5;

export const latticePoint = (i: number, j: number): P => ({ x: 0.5 + i * ULP, y: 0.5 + j * ULP });

/** Orientation in ordinary doubles: what a plain `cross` gives. */
export const orientDouble = cross;

/** A finite double as m * 2^e with m an integer: its exact value. */
function parts(x: number): { m: bigint; e: number } {
  if (x === 0) return { m: 0n, e: 0 };
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0);
  const negative = bits >> 63n === 1n;
  const exp = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & ((1n << 52n) - 1n);
  const m = exp === 0 ? frac : frac | (1n << 52n);
  return { m: negative ? -m : m, e: exp === 0 ? -1074 : exp - 1075 };
}

export interface ExactOrientation {
  sign: -1 | 0 | 1;
  /** The exact value of the cross product is `units` x 2^`exponent`. */
  units: bigint;
  exponent: number;
}

/** The cross product of three points of doubles, computed exactly in BigInt arithmetic on the doubles' exact values. */
export function orientExact(o: P, a: P, b: P): ExactOrientation {
  const all = [o.x, o.y, a.x, a.y, b.x, b.y].map(parts);
  const e0 = Math.min(...all.filter((p) => p.m !== 0n).map((p) => p.e), 0);
  const [ox, oy, ax, ay, bx, by] = all.map((p) => p.m << BigInt(p.e - e0));
  const units = (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
  return { sign: units > 0n ? 1 : units < 0n ? -1 : 0, units, exponent: 2 * e0 };
}

export const orientExactSign = (o: P, a: P, b: P): number => orientExact(o, a, b).sign;

export interface Mismatch {
  /** Lattice indices: the point is (0.5 + i 2^-53, 0.5 + j 2^-53). */
  i: number;
  j: number;
  point: P;
  double: number;
  exact: ExactOrientation;
}

/** The lesson's own seeded search: the first `want` lattice points whose double orientation disagrees in sign with the exact one. */
export function findMismatches(seed = SEARCH_SEED, candidates = SEARCH_CANDIDATES, want = MISMATCHES_SHOWN): Mismatch[] {
  const rnd = mulberry32(seed);
  const found: Mismatch[] = [];
  const seen = new Set<number>();
  for (let n = 0; n < candidates && found.length < want; n++) {
    const i = Math.floor(rnd() * LATTICE);
    const j = Math.floor(rnd() * LATTICE);
    if (seen.has(i * LATTICE + j)) continue;
    seen.add(i * LATTICE + j);
    const point = latticePoint(i, j);
    const double = orientDouble(point, SEG_FROM, SEG_TO);
    const exact = orientExact(point, SEG_FROM, SEG_TO);
    if (Math.sign(double) !== exact.sign) found.push({ i, j, point, double, exact });
  }
  return found;
}

export interface HullDemo {
  withDouble: P[];
  withExact: P[];
}

/** Andrew's chain on the three points with each predicate: the wrong one drops a vertex. */
export function hullDemo(m: Mismatch): HullDemo {
  const pts = [m.point, SEG_FROM, SEG_TO];
  return { withDouble: andrew(pts, 'drop', undefined, orientDouble), withExact: andrew(pts, 'drop', undefined, orientExactSign) };
}

/** The integer version of the same shape: exact in doubles, so both predicates agree. */
export const INTEGER_TRIPLE: readonly [P, P, P] = [{ x: 1, y: 2 }, SEG_FROM, SEG_TO];
