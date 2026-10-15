/**
 * Linear algebra for the matrix and ML lessons (markov-chains, eigen-pagerank, svd-pca, embeddings,
 * attention, convolution). It builds on `core/vec` (vectors, `solve`, `inverse`, `det`) and never
 * repeats it: `matMul` and `transpose` are re-exported from there.
 *
 * Everything here is small-matrix code written to be read and stepped through, not a numerics
 * library: dense row-major arrays, Jacobi methods, power iteration. Nothing mutates its inputs.
 * Eigenvectors and singular vectors are returned as arrays of vectors (`vectors[i]` pairs with
 * `values[i]`), sorted by decreasing eigenvalue or singular value; their signs are arbitrary.
 */
import { add, dot, identity, matMul, norm, scale, sub, transpose, type Mat, type Vec } from './vec';

export { matMul, transpose };

/** The sizes Jacobi methods are used at here: svdSmall refuses anything larger. */
export const SMALL_MATRIX_MAX = 8;

const sign = (x: number) => (x < 0 ? -1 : 1);

/** A^k for a square matrix by repeated squaring (A^0 is the identity). */
export function matPow(a: Mat, k: number): number[][] {
  if (!Number.isInteger(k) || k < 0) throw new RangeError('matPow needs a whole, non-negative power');
  let result = identity(a.length);
  let base = a.map((row) => [...row]);
  for (let e = k; e > 0; e = Math.floor(e / 2)) {
    if (e % 2 === 1) result = matMul(result, base);
    base = matMul(base, base);
  }
  return result;
}

// ── Power iteration ──────────────────────────────────────────────────

export interface PowerOptions {
  /** How many multiplications to run (the result has iters + 1 entries, the start included). */
  iters: number;
  /** The starting vector; all ones by default. */
  start?: Vec;
  /** Length used to rescale each iterate: Euclidean (default) or the sum of absolute values (probabilities). */
  norm?: 'l2' | 'l1';
}

export interface PowerStep {
  /** The rescaled iterate. Step 0 is the rescaled start. */
  v: number[];
  /** Rayleigh quotient vᵀAv / vᵀv: the eigenvalue estimate at this step. */
  lambda: number;
  /** ‖A·v_prev‖ / ‖v_prev‖ in the chosen norm: how much the previous iterate was stretched (step 0: 1). */
  stretch: number;
  /** ‖v − v_prev‖ in the chosen norm (step 0: 0). The sign of v may flip each step when the eigenvalue is negative. */
  change: number;
}

const l1 = (v: Vec) => v.reduce((s, x) => s + Math.abs(x), 0);

/**
 * Power iteration: v ← A·v / ‖A·v‖, over and over. Returns every iterate so a lesson can animate
 * them. For a matrix with a strictly dominant eigenvalue the iterates turn toward its eigenvector
 * (unless the start has none of it); the error shrinks by |λ₂/λ₁| a step. If A·v is the zero vector
 * the run stops there.
 */
export function powerIteration(a: Mat, { iters, start, norm: kind = 'l2' }: PowerOptions): PowerStep[] {
  const n = a.length;
  const length = kind === 'l2' ? norm : l1;
  const first: Vec = start ?? new Array(n).fill(1);
  if (first.length !== n) throw new RangeError('start vector does not match the matrix');
  const s0 = length(first);
  if (s0 === 0) throw new RangeError('start vector is zero');
  const rayleigh = (v: Vec) => dot(v, a.map((row) => dot(row, v))) / dot(v, v);
  let v = scale(first, 1 / s0);
  const steps: PowerStep[] = [{ v, lambda: rayleigh(v), stretch: 1, change: 0 }];
  for (let i = 0; i < iters; i++) {
    const w = a.map((row) => dot(row, v));
    const n1 = length(w);
    if (n1 === 0) break;
    const next = scale(w, 1 / n1);
    steps.push({ v: next, lambda: rayleigh(next), stretch: n1 / length(v), change: length(sub(next, v)) });
    v = next;
  }
  return steps;
}

// ── Eigen-decompositions ─────────────────────────────────────────────

export interface EigenDecomposition {
  /** Eigenvalues, largest first. */
  values: number[];
  /** `vectors[i]` is the unit eigenvector of `values[i]`. */
  vectors: number[][];
}

const JACOBI_MAX_SWEEPS = 60;
const JACOBI_TOL = 1e-14;
const SYMMETRIC_TOL = 1e-9;

const offDiagonal = (a: readonly number[][]) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < a.length; j++) if (i !== j) s += a[i][j] * a[i][j];
  return Math.sqrt(s);
};

/**
 * Eigenvalues and eigenvectors of a symmetric matrix by cyclic Jacobi rotations: each rotation zeroes
 * one off-diagonal pair, and sweeping over all pairs shrinks the off-diagonal part to rounding.
 * Throws for a matrix that is not symmetric (use `eigen2x2` for a general 2 x 2).
 */
export function jacobiEigen(sym: Mat): EigenDecomposition {
  const n = sym.length;
  const a = sym.map((row) => [...row]);
  const scaleOf = Math.max(1, ...a.flat().map(Math.abs));
  for (let i = 0; i < n; i++) {
    if (a[i].length !== n) throw new RangeError('jacobiEigen needs a square matrix');
    for (let j = 0; j < i; j++) if (Math.abs(a[i][j] - a[j][i]) > SYMMETRIC_TOL * scaleOf) throw new RangeError('jacobiEigen needs a symmetric matrix');
  }
  const v = identity(n);
  for (let sweep = 0; sweep < JACOBI_MAX_SWEEPS && offDiagonal(a) > JACOBI_TOL * scaleOf; sweep++) {
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (a[p][q] === 0) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = sign(theta) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (const m of [a, v]) {
          for (let k = 0; k < n; k++) [m[k][p], m[k][q]] = [c * m[k][p] - s * m[k][q], s * m[k][p] + c * m[k][q]];
        }
        for (let k = 0; k < n; k++) [a[p][k], a[q][k]] = [c * a[p][k] - s * a[q][k], s * a[p][k] + c * a[q][k]];
      }
    }
  }
  const order = a.map((_, i) => i).sort((i, j) => a[j][j] - a[i][i]);
  return { values: order.map((i) => a[i][i]), vectors: order.map((i) => v.map((row) => row[i])) };
}

const POWER_ITERATIONS = 500;

/**
 * The top `count` eigenpairs of a symmetric matrix by power iteration with deflation: multiply a start
 * vector by the matrix until it stops turning, take its Rayleigh quotient as the eigenvalue,
 * subtract that component and repeat. Meant for positive semi-definite input such as a covariance
 * (a large negative eigenvalue would win the iteration); `jacobiEigen` is the general symmetric solver.
 */
export function topEigen(m: Mat, count: number): EigenDecomposition {
  let a = m.map((r) => [...r]);
  const vectors: number[][] = [];
  const values: number[] = [];
  for (let c = 0; c < count; c++) {
    let v = a.map((_, i) => 1 + i * 0.01);
    for (let it = 0; it < POWER_ITERATIONS; it++) {
      const w = a.map((row) => dot(row, v));
      // Re-orthogonalise against the vectors already found, so rounding can't drift back to them.
      const ortho = vectors.reduce((acc, u) => sub(acc, scale(u, dot(acc, u))), w);
      const n = norm(ortho);
      if (n === 0) break;
      v = scale(ortho, 1 / n);
    }
    const lambda = dot(v, a.map((row) => dot(row, v)));
    vectors.push(v);
    values.push(lambda);
    a = a.map((row, i) => row.map((x, j) => x - lambda * v[i] * v[j]));
  }
  return { vectors, values };
}

export interface Complex {
  re: number;
  im: number;
}

export type Eigen2x2 =
  | { kind: 'real'; values: [number, number]; vectors: [[number, number], [number, number]] }
  | { kind: 'complex'; values: [Complex, Complex]; vectors: [[Complex, Complex], [Complex, Complex]] };

const REPEATED_TOL = 1e-12;

/**
 * Closed-form eigen-decomposition of any real 2 x 2 matrix, from the characteristic quadratic
 * λ² − tr·λ + det = 0. Real eigenvalues come back largest |λ| first with unit eigenvectors; a negative
 * discriminant gives a conjugate pair (positive imaginary part first) with complex unit eigenvectors
 * (a rotation-like matrix). Null when the matrix is defective: a repeated eigenvalue with only one
 * eigendirection (a shear). A scalar matrix has a repeated eigenvalue and every direction, so it
 * returns the coordinate axes.
 */
export function eigen2x2(m: Mat): Eigen2x2 | null {
  if (m.length !== 2 || m[0].length !== 2 || m[1].length !== 2) throw new RangeError('eigen2x2 needs a 2 x 2 matrix');
  const [[a, b], [c, d]] = m;
  const half = (a + d) / 2;
  const disc = half * half - (a * d - b * c);
  const magnitude = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d), 1);
  if (Math.abs(disc) <= REPEATED_TOL * magnitude * magnitude) {
    const scalar = Math.abs(b) <= REPEATED_TOL * magnitude && Math.abs(c) <= REPEATED_TOL * magnitude && Math.abs(a - d) <= REPEATED_TOL * magnitude;
    return scalar ? { kind: 'real', values: [half, half], vectors: [[1, 0], [0, 1]] } : null;
  }
  if (disc > 0) {
    const root = Math.sqrt(disc);
    const values = [half + root, half - root].sort((x, y) => Math.abs(y) - Math.abs(x)) as [number, number];
    return { kind: 'real', values, vectors: [realEigenvector(a, b, c, d, values[0]), realEigenvector(a, b, c, d, values[1])] };
  }
  const im = Math.sqrt(-disc);
  const lambdas: [Complex, Complex] = [{ re: half, im }, { re: half, im: -im }];
  return { kind: 'complex', values: lambdas, vectors: [complexEigenvector(a, b, c, d, lambdas[0]), complexEigenvector(a, b, c, d, lambdas[1])] };
}

/** A null vector of A − λI from whichever row is larger, unit length, first non-zero component positive. */
function realEigenvector(a: number, b: number, c: number, d: number, lambda: number): [number, number] {
  const fromRow1: [number, number] = [-b, a - lambda];
  const fromRow2: [number, number] = [d - lambda, -c];
  const v = norm(fromRow1) >= norm(fromRow2) ? fromRow1 : fromRow2;
  const u = scale(v, 1 / norm(v)) as [number, number];
  const lead = Math.abs(u[0]) > 1e-12 ? u[0] : u[1];
  return lead < 0 ? [-u[0], -u[1]] : u;
}

function complexEigenvector(a: number, b: number, c: number, d: number, lambda: Complex): [Complex, Complex] {
  const fromRow1: [Complex, Complex] = [{ re: -b, im: 0 }, { re: a - lambda.re, im: -lambda.im }];
  const fromRow2: [Complex, Complex] = [{ re: d - lambda.re, im: -lambda.im }, { re: -c, im: 0 }];
  const size = (v: readonly [Complex, Complex]) => Math.hypot(v[0].re, v[0].im, v[1].re, v[1].im);
  const v = size(fromRow1) >= size(fromRow2) ? fromRow1 : fromRow2;
  const k = 1 / size(v);
  return [{ re: v[0].re * k, im: v[0].im * k }, { re: v[1].re * k, im: v[1].im * k }];
}

// ── SVD ──────────────────────────────────────────────────────────────

/** A = U · diag(s) · Vᵀ with r = min(rows, cols): U is rows x r, V is cols x r, s is non-increasing. */
export interface Svd {
  u: number[][];
  s: number[];
  v: number[][];
}

const SVD_MAX_SWEEPS = 60;
const SVD_TOL = 1e-15;

/**
 * Singular value decomposition of a small matrix (at most 8 x 8; the small-matrix label is the
 * honest one: this is one-sided Jacobi, which is simple and accurate but cubic and sweeps many
 * times). It rotates pairs of columns until all are orthogonal; the column lengths are the singular
 * values. Columns of U for zero singular values are completed to an orthonormal set.
 */
export function svdSmall(a: Mat): Svd {
  const rows = a.length;
  const cols = a[0]?.length ?? 0;
  if (rows === 0 || cols === 0) throw new RangeError('svdSmall needs a non-empty matrix');
  if (rows > SMALL_MATRIX_MAX || cols > SMALL_MATRIX_MAX) throw new RangeError(`svdSmall handles up to ${SMALL_MATRIX_MAX} x ${SMALL_MATRIX_MAX}`);
  if (rows < cols) {
    const t = svdSmall(transpose(a));
    return { u: t.v, s: t.s, v: t.u };
  }
  const b = a.map((row) => [...row]);
  const v = identity(cols);
  for (let sweep = 0; sweep < SVD_MAX_SWEEPS; sweep++) {
    let rotated = false;
    for (let p = 0; p < cols; p++) {
      for (let q = p + 1; q < cols; q++) {
        let alpha = 0;
        let beta = 0;
        let gamma = 0;
        for (let k = 0; k < rows; k++) {
          alpha += b[k][p] * b[k][p];
          beta += b[k][q] * b[k][q];
          gamma += b[k][p] * b[k][q];
        }
        if (gamma === 0 || Math.abs(gamma) <= SVD_TOL * Math.sqrt(alpha * beta)) continue;
        rotated = true;
        const zeta = (beta - alpha) / (2 * gamma);
        const t = sign(zeta) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = c * t;
        for (const m of [b, v]) {
          for (let k = 0; k < m.length; k++) [m[k][p], m[k][q]] = [c * m[k][p] - s * m[k][q], s * m[k][p] + c * m[k][q]];
        }
      }
    }
    if (!rotated) break;
  }
  const lengths = Array.from({ length: cols }, (_, j) => Math.sqrt(b.reduce((s, row) => s + row[j] * row[j], 0)));
  const order = lengths.map((_, j) => j).sort((i, j) => lengths[j] - lengths[i]);
  const s = order.map((j) => lengths[j]);
  const floor = (s[0] || 1) * SVD_TOL * Math.max(rows, cols);
  const uCols: number[][] = [];
  for (const [rank, j] of order.entries()) {
    uCols.push(s[rank] > floor ? b.map((row) => row[j] / s[rank]) : orthogonalComplement(uCols, rows));
  }
  return { u: transpose(uCols), s: s.map((x) => (x > floor ? x : 0)), v: transpose(order.map((j) => v.map((row) => row[j]))) };
}

/** A unit vector orthogonal to every vector in `basis`, taken from the coordinate axis with the most left over. */
function orthogonalComplement(basis: readonly Vec[], dim: number): number[] {
  let best: number[] = [];
  let bestNorm = -1;
  for (let i = 0; i < dim; i++) {
    const e = Array.from({ length: dim }, (_, k) => (k === i ? 1 : 0));
    // Twice, as Gram-Schmidt loses orthogonality to rounding otherwise.
    let r: number[] = e;
    for (let pass = 0; pass < 2; pass++) for (const u of basis) r = sub(r, scale(u, dot(r, u)));
    if (norm(r) > bestNorm) [best, bestNorm] = [r, norm(r)];
  }
  return scale(best, 1 / bestNorm);
}

/** The rank-k matrix U_k · diag(s_k) · V_kᵀ (all terms by default): the best rank-k approximation of A. */
export function svdReconstruct({ u, s, v }: Svd, k = s.length): number[][] {
  return u.map((urow) => v.map((vrow) => s.slice(0, k).reduce((sum, sigma, t) => sum + sigma * urow[t] * vrow[t], 0)));
}

// ── Statistics ───────────────────────────────────────────────────────

/** The mean of the points (a vector the same length as each point). */
export const mean = (points: readonly Vec[]): number[] =>
  scale(points.reduce<number[]>((s, v) => add(s, v), new Array(points[0].length).fill(0)), 1 / points.length);

/** Covariance matrix of the points, dividing by n (the population covariance). */
export function covariance(points: readonly Vec[]): number[][] {
  const m = mean(points);
  const d = m.length;
  const c = Array.from({ length: d }, () => new Array<number>(d).fill(0));
  for (const p of points) {
    const x = sub(p, m);
    for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) c[i][j] += (x[i] * x[j]) / points.length;
  }
  return c;
}

export interface Pca {
  mean: number[];
  /** Unit principal axes, largest variance first. */
  axes: number[][];
  /** Variance along each kept axis, and the total over all of them. */
  variances: number[];
  total: number;
}

/** Principal component analysis: the `k` directions of greatest variance of the points. */
export function pca(points: readonly Vec[], k = 2): Pca {
  const cov = covariance(points);
  const { vectors, values } = topEigen(cov, k);
  return { mean: mean(points), axes: vectors, variances: values, total: cov.reduce((s, r, i) => s + r[i], 0) };
}

/** Coordinates of a point along the kept axes: (x − mean)·axis for each. */
export const pcaProject = (p: Pca, v: Vec): number[] => {
  const x = sub(v, p.mean);
  return p.axes.map((axis) => dot(x, axis));
};

// ── Neural-network pieces ────────────────────────────────────────────

/** softmax(x / temperature), computed from x − max(x) so large inputs don't overflow. */
export function softmax(xs: Vec, temperature = 1): number[] {
  if (temperature <= 0) throw new RangeError('temperature must be positive');
  const top = Math.max(...xs);
  const exps = xs.map((x) => Math.exp((x - top) / temperature));
  const total = exps.reduce((s, e) => s + e, 0);
  return exps.map((e) => e / total);
}

export interface ConvOptions {
  stride?: number;
  /** Zeros added on every side. */
  pad?: number;
}

/**
 * 2-D convolution as deep-learning libraries define it (cross-correlation: the kernel is not
 * flipped), single channel, zero padding. The output is floor((H + 2·pad − kh) / stride) + 1 rows and
 * the same for columns.
 */
export function conv2d(image: Mat, kernel: Mat, { stride = 1, pad = 0 }: ConvOptions = {}): number[][] {
  if (!Number.isInteger(stride) || stride < 1) throw new RangeError('stride must be a whole number of at least 1');
  if (!Number.isInteger(pad) || pad < 0) throw new RangeError('pad must be a whole number of at least 0');
  const [h, w] = [image.length, image[0]?.length ?? 0];
  const [kh, kw] = [kernel.length, kernel[0]?.length ?? 0];
  const outH = Math.floor((h + 2 * pad - kh) / stride) + 1;
  const outW = Math.floor((w + 2 * pad - kw) / stride) + 1;
  if (kh === 0 || kw === 0 || outH < 1 || outW < 1) throw new RangeError('the kernel does not fit the padded image');
  return Array.from({ length: outH }, (_, oy) =>
    Array.from({ length: outW }, (_, ox) => {
      let sum = 0;
      for (let ky = 0; ky < kh; ky++) {
        for (let kx = 0; kx < kw; kx++) {
          const y = oy * stride + ky - pad;
          const x = ox * stride + kx - pad;
          if (y >= 0 && y < h && x >= 0 && x < w) sum += image[y][x] * kernel[ky][kx];
        }
      }
      return sum;
    }),
  );
}
