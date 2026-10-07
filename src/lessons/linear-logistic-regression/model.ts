/**
 * linear-logistic-regression: the least-squares line (closed form and by gradient
 * descent) and logistic regression trained by gradient steps on log loss, with an
 * optional L2 penalty. Every line, curve and boundary on screen comes from here.
 */
import { blobs, lineWithNoise } from '../../core/fixtures/datasets';
import { gradientStep, leastSquares, linearPredict, logLoss, logLossGradient, mse, mseGradient, sigmoid } from '../../core/fit';
import type { Vec } from '../../core/vec';

export interface Pt {
  x: number;
  y: number;
}

/** Both axes of the linear plot: equal ranges, so a residual's square is drawn square. */
export const LINEAR_DOMAIN: readonly [number, number] = [0, 10];
export const MAX_POINTS = 20;

/** Seeded synthetic data: a noisy line. */
export const LINEAR_DATA: readonly Pt[] = lineWithNoise({ seed: 12, n: 10, slope: 0.6, intercept: 2, noise: 0.8, xRange: [1, 9] });

/** The outlier preset: the same points plus one far below the trend at the right. */
export const OUTLIER: Pt = { x: 9, y: 0.6 };

export type LinearFit =
  | { ok: true; b: number; m: number; residuals: number[]; mse: number }
  | { ok: false; reason: string };

export const NEED_TWO_X = 'Need at least two different x values: through one x, every slope fits equally well.';

export function linearFit(points: readonly Pt[]): LinearFit {
  const distinct = new Set(points.map((p) => p.x)).size;
  const fit = distinct >= 2 ? leastSquares(points.map((p) => p.x), points.map((p) => p.y), 1) : null;
  if (!fit) return { ok: false, reason: NEED_TWO_X };
  const [b, m] = fit.coeffs;
  const residuals = points.map((p) => p.y - (b + m * p.x));
  return { ok: true, b, m, residuals, mse: mse(points.map((p) => b + m * p.x), points.map((p) => p.y)) };
}

/** Index of the point with the largest |residual|, or null without a fit. */
export function biggestResidual(points: readonly Pt[]): number | null {
  const fit = linearFit(points);
  if (!fit.ok) return null;
  let best = 0;
  fit.residuals.forEach((r, i) => {
    if (Math.abs(r) > Math.abs(fit.residuals[best])) best = i;
  });
  return best;
}

// ── The line by gradient descent ─────────────────────────────────────

/** Largest eigenvalue of a symmetric 2×2 [[p, q], [q, r]]. */
const topEigen = (p: number, q: number, r: number) => (p + r) / 2 + Math.hypot((p - r) / 2, q);

export const GD_MAX_STEPS = 200_000;
/** Stop once the gradient is this small: the line has stopped moving. */
export const GD_TOL = 1e-8;

export interface LineSnapshot {
  step: number;
  b: number;
  m: number;
  mse: number;
}

export interface LineDescent {
  rate: number;
  snapshots: LineSnapshot[];
  steps: number;
  converged: boolean;
}

/**
 * Plain gradient descent on MSE from the flat line y = 0. The rate is 1/L, L being the
 * largest curvature of the MSE bowl (2/n·XᵀX): the biggest step that's safe for any data.
 * Snapshots are kept at roughly geometric step counts, so the early moves are all visible.
 */
export function descendLine(points: readonly Pt[]): LineDescent | null {
  if (!linearFit(points).ok) return null;
  const xs = points.map((p) => [p.x] as const);
  const ys = points.map((p) => p.y);
  const n = points.length;
  const sx = points.reduce((s, p) => s + p.x, 0) / n;
  const sxx = points.reduce((s, p) => s + p.x * p.x, 0) / n;
  const rate = 1 / topEigen(2, 2 * sx, 2 * sxx);
  let params: Vec = [0, 0];
  const snap = (step: number): LineSnapshot => ({ step, b: params[0], m: params[1], mse: mse(xs.map((x) => linearPredict(params, x)), ys) });
  const snapshots = [snap(0)];
  let next = 1;
  let step = 0;
  let converged = false;
  while (step < GD_MAX_STEPS) {
    const g = mseGradient(params, xs, ys);
    if (Math.hypot(...g) < GD_TOL) {
      converged = true;
      break;
    }
    params = gradientStep(params, g, rate);
    step++;
    if (step >= next) {
      snapshots.push(snap(step));
      next = Math.ceil(next * 1.35);
    }
  }
  if (snapshots.at(-1)!.step !== step) snapshots.push(snap(step));
  return { rate, snapshots, steps: step, converged };
}

// ── Logistic regression ──────────────────────────────────────────────

export type Dims = 1 | 2;
export type ClassSet = 'overlapping' | 'separable';

export interface Labeled {
  x: number;
  y: number;
  label: 0 | 1;
}

export const LOGISTIC_DOMAIN: readonly [number, number] = [0, 10];

/** Seeded synthetic classes. In 1-D only x is used (y is drawn at the label). */
export function logisticData(dims: Dims, set: ClassSet): Labeled[] {
  const separable = set === 'separable';
  const pts = dims === 1
    ? blobs({ seed: separable ? 31 : 21, centers: separable ? [[3, 0], [6.5, 0]] : [[3.8, 0], [6, 0]], n: 12, spread: separable ? 0.6 : 1.4 })
    : blobs({ seed: separable ? 33 : 24, centers: separable ? [[3.2, 3.4], [6.6, 6.4]] : [[3.8, 4], [6, 6]], n: 14, spread: separable ? 0.7 : 1.5 });
  return pts.map((p) => ({ x: p.x, y: dims === 1 ? p.label : p.y, label: p.label === 1 ? 1 : 0 }));
}

export const features = (pts: readonly Labeled[], dims: Dims): number[][] => pts.map((p) => (dims === 1 ? [p.x] : [p.x, p.y]));

/** The L2 strength when the toggle is on: loss + λ/2·‖w‖² (the bias isn't penalised). */
export const L2 = 0.05;

/** Log loss plus the optional L2 penalty, for params [b, ...w]. */
export function penalisedLoss(params: Vec, xs: readonly Vec[], labels: readonly number[], l2: number): number {
  const probs = xs.map((x) => sigmoid(linearPredict(params, x)));
  return logLoss(probs, labels) + (l2 / 2) * params.slice(1).reduce((s, w) => s + w * w, 0);
}

/** core/fit's log-loss gradient plus the L2 term λ·w on the weights. */
export function penalisedGradient(params: Vec, xs: readonly Vec[], labels: readonly number[], l2: number): number[] {
  return logLossGradient(params, xs, labels).map((g, i) => (i === 0 ? g : g + l2 * params[i]));
}

/**
 * Step size 1/L for the penalised log loss: its curvature is at most ¼·λmax(XᵀX/n) + λ
 * (σ′ ≤ ¼), so with this rate every step lowers the loss (the descent lemma).
 */
export function logisticRate(xs: readonly Vec[], l2: number): number {
  const n = xs.length;
  const rows = xs.map((x) => [1, ...x]);
  const d = rows[0].length;
  const xtx = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => rows.reduce((s, r) => s + r[i] * r[j], 0) / n));
  // Power iteration: the matrix is small and positive semi-definite.
  let v = Array.from({ length: d }, () => 1);
  let lambda = 0;
  for (let k = 0; k < 200; k++) {
    const w = xtx.map((row) => row.reduce((s, a, j) => s + a * v[j], 0));
    lambda = Math.hypot(...w);
    v = w.map((a) => a / lambda);
  }
  return 1 / (0.25 * lambda + l2);
}

export const LOGISTIC_STEPS = 4000;

export interface LogisticSnapshot {
  step: number;
  params: number[];
  loss: number;
}

export interface LogisticRun {
  rate: number;
  snapshots: LogisticSnapshot[];
  /** Every step's loss, for the "never goes up" check. */
  losses: number[];
}

/** Each feature's mean and standard deviation, for standardising. */
export function featureScale(xs: readonly Vec[]): { mean: number[]; sd: number[] } {
  const d = xs[0].length;
  const mean = Array.from({ length: d }, (_, j) => xs.reduce((s, x) => s + x[j], 0) / xs.length);
  const sd = mean.map((m, j) => Math.sqrt(xs.reduce((s, x) => s + (x[j] - m) ** 2, 0) / xs.length) || 1);
  return { mean, sd };
}

/** Params learned on standardised features z = (x − mean)/sd, rewritten for raw x: the same probabilities. */
export function toRawParams(z: readonly number[], mean: readonly number[], sd: readonly number[]): number[] {
  const w = z.slice(1).map((v, j) => v / sd[j]);
  return [z[0] - w.reduce((s, v, j) => s + v * mean[j], 0), ...w];
}

/**
 * Gradient descent on (penalised) log loss from all-zero params. Features are standardised
 * first, as real pipelines do, so the steps aren't crippled by x living far from 0; the
 * snapshots are converted back to raw x, so every curve is in the plot's units. The L2
 * penalty applies to the standardised weights.
 */
export function trainLogistic(pts: readonly Labeled[], dims: Dims, l2: number, steps = LOGISTIC_STEPS): LogisticRun {
  const raw = features(pts, dims);
  const { mean, sd } = featureScale(raw);
  const xs = raw.map((x) => x.map((v, j) => (v - mean[j]) / sd[j]));
  const labels = pts.map((p) => p.label);
  const rate = logisticRate(xs, l2);
  let params: Vec = Array.from({ length: dims + 1 }, () => 0);
  const losses = [penalisedLoss(params, xs, labels, l2)];
  const snapshots: LogisticSnapshot[] = [{ step: 0, params: toRawParams(params, mean, sd), loss: losses[0] }];
  let next = 1;
  for (let step = 1; step <= steps; step++) {
    params = gradientStep(params, penalisedGradient(params, xs, labels, l2), rate);
    losses.push(penalisedLoss(params, xs, labels, l2));
    if (step >= next || step === steps) {
      snapshots.push({ step, params: toRawParams(params, mean, sd), loss: losses[step] });
      next = Math.ceil(next * 1.4);
    }
  }
  return { rate, snapshots, losses };
}

export const weightNorm = (params: readonly number[]) => Math.hypot(...params.slice(1));

/** p(class 1) at a point. */
export const probability = (params: readonly number[], x: readonly number[]) => sigmoid(linearPredict(params, x));

/** Weights still growing: ‖w‖ rose by more than 1% over the second half of training. */
export function stillGrowing(run: LogisticRun): boolean {
  const end = run.snapshots.at(-1)!;
  const mid = [...run.snapshots].reverse().find((s) => s.step <= end.step / 2)!;
  return weightNorm(end.params) > weightNorm(mid.params) * 1.01;
}

/** The class each point gets at a threshold, and how many match their label. */
export function accuracyAt(params: readonly number[], pts: readonly Labeled[], dims: Dims, threshold: number): number {
  const xs = features(pts, dims);
  return pts.filter((p, i) => (probability(params, xs[i]) >= threshold ? 1 : 0) === p.label).length;
}

/** logit(t): where b + w·x must sit for p = t. */
export const logit = (t: number) => Math.log(t / (1 - t));

/** True when one straight cut separates the classes perfectly at p = 0.5 with these params. */
export const separates = (params: readonly number[], pts: readonly Labeled[], dims: Dims) =>
  accuracyAt(params, pts, dims, 0.5) === pts.length;
