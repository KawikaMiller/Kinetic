/**
 * Small vectors and matrices for the linear-algebra and ML lessons (vectors-similarity,
 * matrices-transformations, gradient-descent, clustering-kmeans, embeddings, rasterization,
 * bezier-interpolation). Plain arrays, any dimension; nothing mutates its inputs.
 *
 * Matrices are row-major arrays of rows: `[[a, b], [c, d]]`. `apply(m, v)` is m·v, so a
 * transform's columns are where the basis vectors land.
 */

export type Vec = readonly number[];
export type Mat = readonly Vec[];

function sameLength(a: Vec, b: Vec) {
  if (a.length !== b.length) throw new RangeError(`vector lengths differ: ${a.length} vs ${b.length}`);
}

export function dot(a: Vec, b: Vec): number {
  sameLength(a, b);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Euclidean length. */
export const norm = (a: Vec) => Math.sqrt(dot(a, a));

/** Cosine similarity in [-1, 1]; NaN when either vector is zero (there's no angle). */
export function cosine(a: Vec, b: Vec): number {
  const d = norm(a) * norm(b);
  return d === 0 ? NaN : dot(a, b) / d;
}

export function add(a: Vec, b: Vec): number[] {
  sameLength(a, b);
  return a.map((x, i) => x + b[i]);
}

export function sub(a: Vec, b: Vec): number[] {
  sameLength(a, b);
  return a.map((x, i) => x - b[i]);
}

export const scale = (a: Vec, k: number): number[] => a.map((x) => x * k);

/** Euclidean distance between two points. */
export const distance = (a: Vec, b: Vec) => norm(sub(a, b));

/** The unit vector in a's direction; null for the zero vector. */
export function normalize(a: Vec): number[] | null {
  const n = norm(a);
  return n === 0 ? null : scale(a, 1 / n);
}

/** The n×n identity. */
export const identity = (n: number): number[][] =>
  Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

export const transpose = (m: Mat): number[][] => (m.length ? m[0].map((_, j) => m.map((row) => row[j])) : []);

/** a·b. Works for any compatible shapes (mat2, mat3, or the normal-equation products in core/fit). */
export function matMul(a: Mat, b: Mat): number[][] {
  if (a.length && a[0].length !== b.length) throw new RangeError('matrix shapes do not line up');
  return a.map((row) => (b[0] ?? []).map((_, j) => row.reduce((s, x, k) => s + x * b[k][j], 0)));
}

/** m·v: where the transform sends the vector. */
export const apply = (m: Mat, v: Vec): number[] => m.map((row) => dot(row, v));

/** Determinant of a 2×2 or 3×3 (the area / volume scale factor; negative = flipped). */
export function det(m: Mat): number {
  if (m.length === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0];
  if (m.length === 3) {
    const [[a, b, c], [d, e, f], [g, h, i]] = m;
    return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  }
  throw new RangeError('det handles 2×2 and 3×3 matrices');
}

/** Below this pivot size a matrix counts as singular. */
const SINGULAR_EPS = 1e-12;

/**
 * Solves A·x = b by Gaussian elimination with partial pivoting. Null when A is singular
 * (some pivot is effectively zero), which is the honest answer: no unique solution.
 */
export function solve(a: Mat, b: Vec): number[] | null {
  const n = a.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let p = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[p][col])) p = r;
    if (Math.abs(m[p][col]) < SINGULAR_EPS) return null;
    [m[col], m[p]] = [m[p], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const k = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= k * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** The inverse of a square matrix, or null when it's singular (det 0: the transform squashes space). */
export function inverse(m: Mat): number[][] | null {
  const n = m.length;
  const cols: number[][] = [];
  for (let j = 0; j < n; j++) {
    const col = solve(m, identity(n)[j]);
    if (!col) return null;
    cols.push(col);
  }
  return transpose(cols);
}

/** The 1-norm (largest absolute column sum), used for condition estimates. */
export const norm1 = (m: Mat) => Math.max(...transpose(m).map((col) => col.reduce((s, x) => s + Math.abs(x), 0)));

/** κ₁(A) = ‖A‖₁·‖A⁻¹‖₁: how much A amplifies rounding error. Infinity when singular. */
export function conditionNumber(m: Mat): number {
  const inv = inverse(m);
  return inv ? norm1(m) * norm1(inv) : Infinity;
}

/** A 2D rotation by `radians`, counter-clockwise. */
export const rotation2 = (radians: number): number[][] => [
  [Math.cos(radians), -Math.sin(radians)],
  [Math.sin(radians), Math.cos(radians)],
];
