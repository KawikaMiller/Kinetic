/** The 2-D lattice picture: one lattice, a good basis and a bad basis, and Babai rounding with each. */
export type Vec = readonly [number, number];

export const GOOD: readonly [Vec, Vec] = [[4, 1], [-1, 4]];
/** b1 = g1 + 5 g2 and b2 = g1 + 6 g2: the same lattice, much longer and nearly parallel vectors. */
export const BAD: readonly [Vec, Vec] = [[-1, 21], [-2, 25]];
export type BasisName = 'good' | 'bad';
export const BASES: Record<BasisName, readonly [Vec, Vec]> = { good: GOOD, bad: BAD };

export const T_MIN = -30;
export const T_MAX = 30;
export const DEFAULT_TARGET: Vec = [10, 7];
/** The window of integer coefficients searched for the brute-force nearest lattice point. */
const COEFF_WINDOW = 60;

export const det = (b: readonly [Vec, Vec]): number => b[0][0] * b[1][1] - b[0][1] * b[1][0];
export const normSq = (v: Vec): number => v[0] * v[0] + v[1] * v[1];

/** Product of the two basis lengths over the determinant: 1 for an orthogonal basis, large for a skewed one. */
export const orthogonalityDefect = (b: readonly [Vec, Vec]): number => Math.sqrt(normSq(b[0]) * normSq(b[1])) / Math.abs(det(b));

/** round(n / d) with halves going up, in integers, for d > 0. */
const roundDiv = (n: number, d: number): number => Math.floor((2 * n + d) / (2 * d));

export interface Rounded {
  /** The real coefficients c1, c2 as exact fractions numerator/denominator. */
  coeffs: readonly [[number, number], [number, number]];
  rounded: readonly [number, number];
  point: Vec;
  /** Squared distance from the target. */
  distSq: number;
}

/** Babai rounding: solve t = c1 b1 + c2 b2 exactly (Cramer), round both coefficients, rebuild the lattice point. */
export function babai(b: readonly [Vec, Vec], t: Vec): Rounded {
  let D = det(b);
  let n1 = t[0] * b[1][1] - t[1] * b[1][0];
  let n2 = b[0][0] * t[1] - b[0][1] * t[0];
  if (D < 0) [D, n1, n2] = [-D, -n1, -n2];
  const c1 = roundDiv(n1, D);
  const c2 = roundDiv(n2, D);
  const point: Vec = [c1 * b[0][0] + c2 * b[1][0], c1 * b[0][1] + c2 * b[1][1]];
  return { coeffs: [[n1, D], [n2, D]], rounded: [c1, c2], point, distSq: normSq([point[0] - t[0], point[1] - t[1]]) };
}

/** The nearest lattice point to t by brute force over a window of integer combinations of the good basis. */
export function nearestPoint(t: Vec): { point: Vec; distSq: number } {
  let best: { point: Vec; distSq: number } | null = null;
  for (let c1 = -COEFF_WINDOW; c1 <= COEFF_WINDOW; c1++) {
    for (let c2 = -COEFF_WINDOW; c2 <= COEFF_WINDOW; c2++) {
      const point: Vec = [c1 * GOOD[0][0] + c2 * GOOD[1][0], c1 * GOOD[0][1] + c2 * GOOD[1][1]];
      const distSq = normSq([point[0] - t[0], point[1] - t[1]]);
      if (best === null || distSq < best.distSq) best = { point, distSq };
    }
  }
  return best!;
}

/** The lattice points inside a window, as integer combinations of the good basis. */
export function latticePoints(limit: number): Vec[] {
  const found: Vec[] = [];
  for (let c1 = -COEFF_WINDOW; c1 <= COEFF_WINDOW; c1++) {
    for (let c2 = -COEFF_WINDOW; c2 <= COEFF_WINDOW; c2++) {
      const x = c1 * GOOD[0][0] + c2 * GOOD[1][0];
      const y = c1 * GOOD[0][1] + c2 * GOOD[1][1];
      if (Math.abs(x) <= limit && Math.abs(y) <= limit) found.push([x, y]);
    }
  }
  return found;
}

/** Whether a vector is in the lattice: its coordinates in the good basis are integers (det 17). */
export function inLattice(v: Vec): boolean {
  const D = det(GOOD);
  const c1 = v[0] * GOOD[1][1] - v[1] * GOOD[1][0];
  const c2 = GOOD[0][0] * v[1] - GOOD[0][1] * v[0];
  return c1 % D === 0 && c2 % D === 0;
}

export const distanceText = (distSq: number): string => (Number.isInteger(Math.sqrt(distSq)) ? String(Math.sqrt(distSq)) : `sqrt(${distSq})`);
