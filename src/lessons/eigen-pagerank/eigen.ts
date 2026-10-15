/**
 * Eigenvectors of a 2 x 2 matrix by repeated application, pure: a cloud of arrows that the matrix keeps
 * multiplying and rescaling (power iteration), the residual |A v - lambda v| of any arrow, and what the
 * iteration does for each kind of matrix (it settles on a line, keeps turning, creeps like 1/k, does
 * nothing, or alternates).
 */
import { eigen2x2, powerIteration } from '../../core/linalg';
import { dot, norm, type Mat, type Vec } from '../../core/vec';

export const ARROW_COUNT = 12;
export const ARROW_SPACING_DEGREES = 30;
export const MATRIX_BOUNDS = { min: -3, max: 3 } as const;
export const MATRIX_STEP = 0.1;
/** The most times Apply A runs. */
export const MAX_APPLIES = 60;
/** A residual below this counts as an eigenvector. */
export const RESIDUAL_TOLERANCE = 1e-6;
/** Below this a matrix entry sum is "zero": the zero matrix and repeated eigenvalues are handled by name. */
const ZERO = 1e-12;

export type Matrix2 = [[number, number], [number, number]];

export const DEFAULT_MATRIX: Matrix2 = [[2, 1], [1, 2]];

/** The 3-4-5 rotation: 0.8 and 0.6 are exact on the 0.1 sliders, so the preset is exactly what the sliders show. */
const ROTATION_345: Matrix2 = [[0.8, -0.6], [0.6, 0.8]];
/** How far that rotation turns an arrow each step. */
export const ROTATION_DEGREES = (Math.atan2(ROTATION_345[1][0], ROTATION_345[0][0]) * 180) / Math.PI;

export const PRESETS: readonly { id: string; label: string; A: Matrix2 }[] = [
  { id: 'symmetric', label: '[[2, 1], [1, 2]]', A: DEFAULT_MATRIX },
  { id: 'rotation', label: 'rotation 37° (3-4-5)', A: ROTATION_345 },
  { id: 'shear', label: 'shear', A: [[1, 1], [0, 1]] },
  { id: 'equal', label: 'equal stretch', A: [[2, 0], [0, 2]] },
  { id: 'flip', label: 'flip', A: [[2, 0], [0, -2]] },
];

/** Unit arrows at 30 degree spacing, starting along +x. */
export const cloud = (): [number, number][] =>
  Array.from({ length: ARROW_COUNT }, (_, i) => {
    const a = (i * ARROW_SPACING_DEGREES * Math.PI) / 180;
    return [Math.cos(a), Math.sin(a)];
  });

/** Every iterate of one start vector under A, rescaled to length 1 each step (step 0 is the start). Stops early at the zero vector. */
export const iterates = (A: Mat, start: Vec, steps: number): number[][] => powerIteration(A, { iters: steps, start, norm: 'l2' }).map((s) => s.v);

/** The stretch factor of step k: how much the length grew when A was applied to the step before. Null where the iteration stopped. */
export const stretchAt = (A: Mat, start: Vec, k: number): number | null => {
  const steps = powerIteration(A, { iters: k, start, norm: 'l2' });
  return steps[k] ? steps[k].stretch : null;
};

/** The eigenvalue estimate vᵀAv / vᵀv (the Rayleigh quotient) for a non-zero v. */
export const rayleigh = (A: Mat, v: Vec): number => dot(v, A.map((row) => dot(row, v))) / dot(v, v);

/** |A v - lambda v| for the Rayleigh lambda: zero exactly when v is an eigenvector. Zero vector gives 0. */
export function residual(A: Mat, v: Vec): number {
  if (dot(v, v) === 0) return 0;
  const lambda = rayleigh(A, v);
  return norm(A.map((row, i) => dot(row, v) - lambda * v[i]));
}

/** Components of v along the two real eigenvectors (non-orthogonal case solved exactly): v = c1 e1 + c2 e2. Null when the eigenvectors are dependent. */
export function eigenCoordinates(e1: Vec, e2: Vec, v: Vec): [number, number] | null {
  const d = e1[0] * e2[1] - e1[1] * e2[0];
  if (Math.abs(d) < ZERO) return null;
  return [(v[0] * e2[1] - v[1] * e2[0]) / d, (e1[0] * v[1] - e1[1] * v[0]) / d];
}

export type Behaviour =
  | { kind: 'zero' }
  | { kind: 'all' }
  | { kind: 'converges'; lambda1: number; lambda2: number; ratio: number; flips: boolean }
  | { kind: 'ties'; lambda1: number; lambda2: number }
  | { kind: 'complex'; re: number; im: number; modulus: number }
  | { kind: 'shear'; lambda: number };

/** What repeated application does to arrows, from the eigenvalues. */
export function behaviourOf(A: Matrix2): Behaviour {
  if (A.every((row) => row.every((x) => Math.abs(x) < ZERO))) return { kind: 'zero' };
  const e = eigen2x2(A);
  if (e === null) return { kind: 'shear', lambda: (A[0][0] + A[1][1]) / 2 };
  if (e.kind === 'complex') return { kind: 'complex', re: e.values[0].re, im: e.values[0].im, modulus: Math.hypot(e.values[0].re, e.values[0].im) };
  const [l1, l2] = e.values;
  if (Math.abs(l1 - l2) < ZERO) return { kind: 'all' };
  if (Math.abs(Math.abs(l1) - Math.abs(l2)) < 1e-9) return { kind: 'ties', lambda1: l1, lambda2: l2 };
  return { kind: 'converges', lambda1: l1, lambda2: l2, ratio: Math.abs(l2 / l1), flips: l1 < 0 };
}

/** The angle of a vector as a direction of a line (mod 180 degrees), in degrees from 0 to 180. */
export const lineAngle = (v: Vec): number => {
  const deg = (Math.atan2(v[1], v[0]) * 180) / Math.PI;
  return ((deg % 180) + 180) % 180;
};

/** The smaller angle between two lines, in degrees. */
export const lineGap = (a: Vec, b: Vec): number => {
  const d = Math.abs(lineAngle(a) - lineAngle(b));
  return Math.min(d, 180 - d);
};

export type EigenLine = { direction: Vec; tone: 'ok' | 'violet' };

/** A null vector of A - lambda I for a shear (its one eigen-direction), unit length. */
function shearDirection(A: Matrix2, lambda: number): Vec {
  const rows: Vec[] = [[A[0][0] - lambda, A[0][1]], [A[1][0], A[1][1] - lambda]];
  const row = norm(rows[0]) >= norm(rows[1]) ? rows[0] : rows[1];
  return [-row[1] / norm(row), row[0] / norm(row)];
}

/** The eigen-lines worth drawing: two for distinct real eigenvalues (larger first), the single one of a shear, none otherwise. */
export function eigenLines(A: Matrix2): EigenLine[] {
  const b = behaviourOf(A);
  if (b.kind === 'shear') return [{ direction: shearDirection(A, b.lambda), tone: 'ok' }];
  if (b.kind !== 'converges' && b.kind !== 'ties') return [];
  const e = eigen2x2(A);
  if (!e || e.kind !== 'real') return [];
  return e.vectors.map((direction, i): EigenLine => ({ direction, tone: i === 0 ? 'ok' : 'violet' }));
}

/** How close (degrees) a dragged arrow must come to an eigen-line to snap onto it. */
export const SNAP_DEGREES = 3;

/** The arrow moved onto an eigen-line (keeping its length) when within SNAP_DEGREES of one; otherwise unchanged. */
export function snapToEigenLine(v: readonly number[], lines: readonly EigenLine[]): [number, number] {
  const length = norm(v);
  if (length === 0) return [v[0], v[1]];
  for (const { direction } of lines) {
    const along = dot(v, direction);
    const gap = (Math.acos(Math.min(1, Math.abs(along) / length)) * 180) / Math.PI;
    if (gap <= SNAP_DEGREES) return [Math.sign(along) * length * direction[0], Math.sign(along) * length * direction[1]];
  }
  return [v[0], v[1]];
}
