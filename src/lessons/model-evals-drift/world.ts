/**
 * The toy world the monitored model lives in. Two features, two classes: x is drawn from two Gaussian
 * blobs (the input distribution P(x)) and the label from a logistic posterior P(y | x). A covariate shift
 * moves P(x) and leaves P(y | x) alone; concept drift leaves P(x) alone and rotates P(y | x).
 * Every draw is seeded, and a day's raw noise depends only on (seed, day), so moving a slider changes the
 * shift and nothing else.
 */
import { gaussian, blobs } from '../../core/fixtures/datasets';
import { gradientStep, linearPredict, logLossGradient, sigmoid } from '../../core/fit';
import { mulberry32, type Rnd } from '../../core/random';

export type Kind = 'covariate' | 'concept';
export type Vec2 = readonly [number, number];

/** Blob centres are +-MU along the diagonal; the common spread is 1. Posterior logit = 2 MU . x / spread^2. */
export const MU = 0.9;
export const SPREAD = 1;
export const DAYS = 40;
export const BATCH = 200;
export const TRAIN_PER_CLASS = 300;
export const TRAIN_SEED = 11;
export const DEFAULT_STREAM_SEED = 5;

/** The true posterior's weights and bias for the unshifted world. */
export const TRUE_WEIGHTS: Vec2 = [(2 * MU) / SPREAD ** 2, (2 * MU) / SPREAD ** 2];

/** Size 100% means the two blobs have moved this share of the way towards each other (covariate shift), or the posterior is rotated this far (concept drift). */
export const MAX_CONTRACTION = 0.9;
export const MAX_ROTATION_DEG = 90;

export const rotate = (w: Vec2, deg: number): Vec2 => {
  const t = (deg * Math.PI) / 180;
  return [w[0] * Math.cos(t) - w[1] * Math.sin(t), w[0] * Math.sin(t) + w[1] * Math.cos(t)];
};

export interface Shift {
  kind: Kind;
  /** 0 to 100. */
  sizePct: number;
}

/** How far the blobs have moved together and how far the posterior has rotated, for a shift. */
export const effect = (s: Shift): { contraction: number; rotationDeg: number } =>
  s.kind === 'covariate' ? { contraction: (MAX_CONTRACTION * s.sizePct) / 100, rotationDeg: 0 } : { contraction: 0, rotationDeg: (MAX_ROTATION_DEG * s.sizePct) / 100 };

export interface Example {
  x: Vec2;
  y: 0 | 1;
}

/** One example from the raw draws (component, two normals, a uniform for the label), under a shift. */
export function draw(rnd: Rnd, shift: Shift | null): Example {
  const comp = rnd() < 0.5 ? -1 : 1;
  const g0 = gaussian(rnd);
  const g1 = gaussian(rnd);
  const u = rnd();
  const e = shift ? effect(shift) : { contraction: 0, rotationDeg: 0 };
  const centre = comp * MU * (1 - e.contraction);
  const x: Vec2 = [centre + SPREAD * g0, centre + SPREAD * g1];
  const w = rotate(TRUE_WEIGHTS, e.rotationDeg);
  return { x, y: u < sigmoid(w[0] * x[0] + w[1] * x[1]) ? 1 : 0 };
}

/** A day's batch: the same raw noise for the same (seed, day), whatever the shift. */
export function dayBatch(seed: number, day: number, shift: Shift | null, n = BATCH): Example[] {
  const rnd = mulberry32(seed * 7919 + day * 104729 + 13);
  return Array.from({ length: n }, () => draw(rnd, shift));
}

export interface Model {
  /** [bias, w1, w2] */
  params: readonly number[];
}

export const predictProb = (m: Model, x: Vec2): number => sigmoid(linearPredict(m.params, x));
export const predict = (m: Model, x: Vec2): 0 | 1 => (predictProb(m, x) >= 0.5 ? 1 : 0);
export const accuracy = (m: Model, batch: readonly Example[]): number => batch.filter((e) => predict(m, e.x) === e.y).length / batch.length;

export const TRAIN_ITERATIONS = 400;
export const TRAIN_RATE = 0.5;

/** Logistic regression by gradient descent on blobs generated from `seed` (labels are the blob each point came from). */
export function trainModel(seed: number, perClass = TRAIN_PER_CLASS, iterations = TRAIN_ITERATIONS): { model: Model; train: { x: Vec2; y: 0 | 1 }[] } {
  const pts = blobs({ seed, centers: [[-MU, -MU], [MU, MU]], n: perClass, spread: SPREAD });
  const train = pts.map((p) => ({ x: [p.x, p.y] as Vec2, y: p.label as 0 | 1 }));
  let params: number[] = [0, 0, 0];
  const xs = train.map((t) => t.x);
  const ys = train.map((t) => t.y);
  for (let i = 0; i < iterations; i++) params = gradientStep(params, logLossGradient(params, xs, ys), TRAIN_RATE);
  return { model: { params }, train };
}
