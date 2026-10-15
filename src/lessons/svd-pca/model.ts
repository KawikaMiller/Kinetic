/**
 * SVD and PCA for the lesson, pure: 8 x 8 teaching images and their rank-k rebuilds, PCA of a 2-D point
 * cloud (axes, explained variance, projection residuals), the ways to get it wrong (no centring, units,
 * no standardising), two classes separated along the low-variance direction, and the SVD-covariance link.
 * The matrix work is core/linalg (svdSmall, jacobiEigen, covariance); this file is what the lesson asks of it.
 */
import { jacobiEigen, covariance, mean as meanOf, svdReconstruct, svdSmall, type Svd } from '../../core/linalg';
import { gaussian } from '../../core/fixtures/datasets';
import { mulberry32 } from '../../core/random';
import { dot, transpose, type Mat } from '../../core/vec';

// ── Scene 1: an image from its top singular values ───────────────────

export const IMAGE_SIZE = 8;
export type ImageId = 'smiley' | 'stripes' | 'noise';
export const IMAGES: readonly { id: ImageId; label: string }[] = [
  { id: 'smiley', label: 'Smiley' },
  { id: 'stripes', label: 'Stripes' },
  { id: 'noise', label: 'Noise' },
];
const SMILEY = ['..####..', '.#....#.', '#.#..#.#', '#......#', '#.#..#.#', '#..##..#', '.#....#.', '..####..'];
const NOISE_SEED = 5;
const STRIPE_HIGH = 0.9;
const STRIPE_LOW = 0.1;

export function imageOf(id: ImageId): number[][] {
  if (id === 'smiley') return SMILEY.map((row) => Array.from(row, (c) => (c === '#' ? 1 : 0)));
  if (id === 'stripes') return Array.from({ length: IMAGE_SIZE }, () => Array.from({ length: IMAGE_SIZE }, (_, j) => (j % 2 === 0 ? STRIPE_HIGH : STRIPE_LOW)));
  const rnd = mulberry32(NOISE_SEED);
  return Array.from({ length: IMAGE_SIZE }, () => Array.from({ length: IMAGE_SIZE }, () => rnd()));
}

export const svdOf = (A: Mat): Svd => svdSmall(A);
export const rebuild = (svd: Svd, k: number): number[][] => svdReconstruct(svd, k);

export const frobenius = (A: Mat, B: Mat): number => Math.sqrt(A.reduce((s, row, i) => s + row.reduce((t, x, j) => t + (x - B[i][j]) ** 2, 0), 0));

/** sqrt(sum of the discarded sigma_i^2): what the Frobenius error of the rank-k rebuild must be. */
export const discardedNorm = (sigmas: readonly number[], k: number): number => Math.sqrt(sigmas.slice(k).reduce((s, x) => s + x * x, 0));

/** Numbers stored by the rank-k form (k columns of U, k of V, k singular values) and by the plain image. */
export const storageOfRank = (k: number, n = IMAGE_SIZE): number => k * (n + n + 1);
export const storageOfImage = (n = IMAGE_SIZE): number => n * n;
/** The largest k for which the rank-k form is smaller than the plain image. */
export const largestSavingRank = (n = IMAGE_SIZE): number => Math.floor((storageOfImage(n) - 1) / (2 * n + 1));

export const RANK_BOUNDS = { min: 1, max: IMAGE_SIZE } as const;

// ── Scene 2: PCA on a point cloud ────────────────────────────────────

export type P2 = [number, number];
export const MAX_POINTS = 60;
export const PLOT_DOMAIN = [-6, 6] as const;
const CLOUD_SEED = 11;
const CLOUD_COUNT = 40;

export const clampToDomain = (p: P2): P2 => [Math.min(PLOT_DOMAIN[1], Math.max(PLOT_DOMAIN[0], p[0])), Math.min(PLOT_DOMAIN[1], Math.max(PLOT_DOMAIN[0], p[1]))];

/** A seeded correlated cloud: spread 2.2 along x, y follows 0.8 x with scatter 0.9, centred near (0.5, 0.3). */
export function cloudPoints(seed = CLOUD_SEED, n = CLOUD_COUNT): P2[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => {
    const x = 2.2 * gaussian(rnd);
    return clampToDomain([0.5 + x, 0.3 + 0.8 * x + 0.9 * gaussian(rnd)]);
  });
}

const orient = (v: readonly number[]): [number, number] => {
  const lead = Math.abs(v[0]) > 1e-12 ? v[0] : v[1];
  return lead < 0 ? [-v[0], -v[1]] : [v[0], v[1]];
};

export interface PcaResult {
  mean: P2;
  /** Population covariance entries a (xx), b (xy), c (yy). */
  cov: { a: number; b: number; c: number };
  values: [number, number];
  /** Unit principal axes, first non-zero component positive. */
  axes: [[number, number], [number, number]];
  /** lambda_1 / (lambda_1 + lambda_2), or null with no variance at all. */
  explained: number | null;
  /** `same`: every point equal, so no axes; `line`: collinear, so no second axis; otherwise `none`. */
  degenerate: 'none' | 'same' | 'line';
}

const DEGENERATE_RATIO = 1e-9;
const NO_VARIANCE = 1e-12;

export function pcaOf(points: readonly P2[]): PcaResult {
  const C = covariance(points);
  const e = jacobiEigen(C);
  const total = e.values[0] + e.values[1];
  const degenerate = total < NO_VARIANCE ? 'same' : e.values[1] < DEGENERATE_RATIO * e.values[0] ? 'line' : 'none';
  const m = meanOf(points);
  return {
    mean: [m[0], m[1]],
    cov: { a: C[0][0], b: C[0][1], c: C[1][1] },
    values: [Math.max(0, e.values[0]), Math.max(0, e.values[1])],
    axes: [orient(e.vectors[0]), orient(e.vectors[1])],
    explained: total < NO_VARIANCE ? null : e.values[0] / total,
    degenerate,
  };
}

/** The closed-form eigenvalues of a 2 x 2 covariance: (a + c)/2 +- sqrt(((a - c)/2)^2 + b^2). */
export function closedFormValues({ a, b, c }: PcaResult['cov']): [number, number] {
  const mid = (a + c) / 2;
  const radius = Math.sqrt(((a - c) / 2) ** 2 + b * b);
  return [mid + radius, mid - radius];
}

/** Each point turned about `centre` by -angle (so an axis at `angle` ends up along x). */
export function rotateAbout(points: readonly P2[], centre: P2, angle: number): P2[] {
  const [s, c] = [Math.sin(-angle), Math.cos(-angle)];
  return points.map(([x, y]) => {
    const [dx, dy] = [x - centre[0], y - centre[1]];
    return [centre[0] + c * dx - s * dy, centre[1] + s * dx + c * dy];
  });
}

export const axisAngle = (v: readonly number[]): number => Math.atan2(v[1], v[0]);

/** Points projected onto the line through `centre` along unit `axis`. */
export function projectOnto(points: readonly P2[], centre: P2, axis: readonly number[]): P2[] {
  return points.map(([x, y]) => {
    const t = (x - centre[0]) * axis[0] + (y - centre[1]) * axis[1];
    return [centre[0] + t * axis[0], centre[1] + t * axis[1]];
  });
}

/** Sum of squared distances from the points to their projections: the variance the dropped axis holds, times n. */
export const residualSumSquares = (points: readonly P2[], projected: readonly P2[]): number =>
  points.reduce((s, [x, y], i) => s + (x - projected[i][0]) ** 2 + (y - projected[i][1]) ** 2, 0);

// ── Scene 3: ways to get it wrong ────────────────────────────────────

export type Units = 'm' | 'cm';
export interface Mistakes {
  centre: boolean;
  units: Units;
  standardise: boolean;
}
export const DEFAULT_MISTAKES: Mistakes = { centre: true, units: 'm', standardise: false };
const CM_PER_M = 100;
const BODY_SEED = 21;
const BODY_COUNT = 60;

/** Height in metres and weight in kilograms, correlated: invented, seeded. */
export function bodyData(seed = BODY_SEED, n = BODY_COUNT): P2[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => {
    const g1 = gaussian(rnd);
    const g2 = gaussian(rnd);
    return [1.7 + 0.1 * g1, 70 + 12 * (0.6 * g1 + 0.8 * g2)];
  });
}

export interface MistakeResult {
  /** The first axis as a direction in feature space (feature 1 across, feature 2 up), in degrees from 0 to 180. */
  angle1: number;
  axes: [[number, number], [number, number]];
  values: [number, number];
  explained: number;
  /** Direction of the mean from the origin, degrees 0 to 180, in the (scaled) feature space. */
  meanAngle: number;
  /** Correlation of the two features. */
  rho: number;
  /** Standard deviation (population) of each feature in the chosen units, before any standardising. */
  spreads: [number, number];
  /** The mean of each feature in the chosen units: what centring subtracts. */
  means: [number, number];
}

const lineDegrees = (v: readonly number[]) => (((Math.atan2(v[1], v[0]) * 180) / Math.PI) % 180 + 180) % 180;

interface Prepared {
  /** The features in the chosen units. */
  scaled: P2[];
  mean: P2;
  sd: [number, number];
  /** What PCA is run on: centred, standardised, or (the mistake) the scaled data as they are. */
  prepared: P2[];
}

function prepare(data: readonly P2[], o: Mistakes): Prepared {
  const n = data.length;
  const scaled: P2[] = data.map(([x, y]) => [o.units === 'cm' ? x * CM_PER_M : x, y]);
  const m = meanOf(scaled);
  const sd = [0, 1].map((j) => Math.sqrt(scaled.reduce((s, p) => s + (p[j] - m[j]) ** 2, 0) / n)) as [number, number];
  const prepared: P2[] = o.standardise
    ? scaled.map((p) => [(p[0] - m[0]) / sd[0], (p[1] - m[1]) / sd[1]])
    : o.centre
      ? scaled.map((p) => [p[0] - m[0], p[1] - m[1]])
      : scaled;
  return { scaled, mean: [m[0], m[1]], sd, prepared };
}

export function applyMistakes(data: readonly P2[], o: Mistakes): MistakeResult {
  const n = data.length;
  const { scaled, mean: m, sd, prepared } = prepare(data, o);
  const rho = scaled.reduce((s, p) => s + ((p[0] - m[0]) * (p[1] - m[1])), 0) / n / (sd[0] * sd[1]);
  // Second-moment matrix about the origin: the covariance when the data are centred, something else when not.
  const S = [[0, 0], [0, 0]];
  for (const p of prepared) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) S[i][j] += (p[i] * p[j]) / n;
  const e = jacobiEigen(S);
  const meanVec = o.standardise ? [0, 1] : [m[0], m[1]];
  return {
    angle1: lineDegrees(e.vectors[0]),
    axes: [orient(e.vectors[0]), orient(e.vectors[1])],
    values: [e.values[0], e.values[1]],
    explained: e.values[0] / (e.values[0] + e.values[1]),
    meanAngle: lineDegrees(meanVec),
    rho,
    spreads: sd,
    means: m,
  };
}

export interface MistakeCloud {
  /** The points PCA runs on, drawn at a common scale so that angles are true. */
  points: P2[];
  /** The data before centring (not drawn when they are what PCA runs on, or when standardising changes the scale). */
  before: P2[] | null;
  /** Where the mean sits at that scale: the point that centring moves to the origin. */
  mean: P2;
}

/** Everything scene 3 draws, scaled so the farthest coordinate of the unprepared data is 1 (the axes keep their true angle). */
export function mistakeCloud(data: readonly P2[], o: Mistakes): MistakeCloud {
  const { scaled, mean, prepared } = prepare(data, o);
  if (o.standardise) {
    const reach = Math.max(...prepared.flat().map(Math.abs));
    return { points: prepared.map(([x, y]) => [x / reach, y / reach]), before: null, mean: [0, 0] };
  }
  const reach = Math.max(...scaled.flat().map(Math.abs));
  const at = (p: P2): P2 => [p[0] / reach, p[1] / reach];
  return { points: prepared.map(at), before: o.centre ? scaled.map(at) : null, mean: at(mean) };
}

// ── Scene 4: variance is not information about the question ──────────

export interface Labelled {
  point: P2;
  label: 0 | 1;
}
const CLASS_SEED = 31;
const CLASS_COUNT = 30;
const CLASS_SPREAD_X = 3;
const CLASS_GAP = 1.1;
const CLASS_SPREAD_Y = 0.5;

/** Two classes with the same wide spread along x and a small split along y: the separation is in the low-variance direction. */
export function classData(seed = CLASS_SEED, n = CLASS_COUNT): Labelled[] {
  const rnd = mulberry32(seed);
  return ([0, 1] as const).flatMap((label) =>
    Array.from({ length: n }, (): Labelled => ({
      point: clampToDomain([CLASS_SPREAD_X * gaussian(rnd), (label === 0 ? -CLASS_GAP : CLASS_GAP) + CLASS_SPREAD_Y * gaussian(rnd)]),
      label,
    })),
  );
}

/** The best accuracy of one threshold on 1-D values, in either direction, by trying a cut between every pair of neighbours. */
export function bestThresholdAccuracy(values: readonly number[], labels: readonly (0 | 1)[]): number {
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const n = values.length;
  let best = 0;
  for (let cut = 0; cut <= n; cut++) {
    const below = order.slice(0, cut);
    const above = order.slice(cut);
    const lowIsZero = below.filter((i) => labels[i] === 0).length + above.filter((i) => labels[i] === 1).length;
    best = Math.max(best, lowIsZero, n - lowIsZero);
  }
  return best / n;
}

export const alongAxis = (points: readonly P2[], centre: P2, axis: readonly number[]): number[] => points.map((p) => (p[0] - centre[0]) * axis[0] + (p[1] - centre[1]) * axis[1]);

// ── Scene 5: SVD and PCA are the same computation ────────────────────

export const SMALL_ROWS = 8;
export const SMALL_FEATURES = 3;

/** A centred 8 x 3 data matrix from a seed: columns share a common factor so they are correlated. */
export function smallData(seed: number): number[][] {
  const rnd = mulberry32(seed);
  const raw = Array.from({ length: SMALL_ROWS }, () => {
    const common = gaussian(rnd);
    return [common + 0.5 * gaussian(rnd), 0.7 * common + 0.8 * gaussian(rnd), 0.3 * common + 1.2 * gaussian(rnd)];
  });
  const m = meanOf(raw);
  return raw.map((row) => row.map((x, j) => x - m[j]));
}

export interface SvdPcaRow {
  sigma: number;
  /** sigma^2 / (n - 1). */
  fromSvd: number;
  /** The matching eigenvalue of the sample covariance X^T X / (n - 1). */
  fromCovariance: number;
}

export function svdVersusCovariance(X: Mat): SvdPcaRow[] {
  const n = X.length;
  const { s } = svdSmall(X);
  const cov = transpose(X).map((col) => transpose(X).map((other) => dot(col, other) / (n - 1)));
  const values = jacobiEigen(cov).values;
  return values.map((fromCovariance, i) => ({ sigma: s[i] ?? 0, fromSvd: (s[i] ?? 0) ** 2 / (n - 1), fromCovariance }));
}
