/**
 * Scene 2: why attention divides by sqrt(d_k). Real seeded samples: the dot product of two standard-normal
 * vectors of length d_k, and the largest softmax weight over 8 keys with and without the division. Cached
 * by (seed, d_k), so dragging between settings you have visited costs nothing.
 */
import { histogram, type Histogram } from '../../core/stats';
import { mulberry32, type Rnd } from '../../core/random';

export const DK_STOPS: readonly number[] = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512];
export const DK_DEFAULT = 64;
export const HIST_SAMPLES = 5000;
export const WEIGHT_DRAWS = 2000;
export const KEYS = 8;
export const SCALING_SEED = 11;
export const HIST_BINS = 60;
/** The histogram's fixed range: four standard deviations at the largest d_k (4 x sqrt(512) = 90.5), so widening is visible. */
export const HIST_LIMIT = 92;

/** Standard normals from a uniform source, two per Box-Muller step. */
export function normalStream(rnd: Rnd): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    const radius = Math.sqrt(-2 * Math.log(1 - rnd()));
    const angle = 2 * Math.PI * rnd();
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}

/** Largest softmax weight of `scores` (the softmax of scores divided by `temperature`). */
export function maxWeight(scores: readonly number[], temperature = 1): number {
  const top = Math.max(...scores);
  const total = scores.reduce((s, v) => s + Math.exp((v - top) / temperature), 0);
  return 1 / total;
}

/** Frobenius norm of the softmax Jacobian diag(w) - w w^T: how much gradient the softmax passes. */
export function softmaxGradientNorm(weights: readonly number[]): number {
  const squares = weights.reduce((s, w) => s + w * w, 0);
  const cubes = weights.reduce((s, w) => s + w * w * w, 0);
  return Math.sqrt(Math.max(0, squares - 2 * cubes + squares * squares));
}

const softmaxOf = (scores: readonly number[], temperature: number): number[] => {
  const top = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - top) / temperature));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / total);
};

export interface ScalingResult {
  dk: number;
  seed: number;
  dots: number[];
  /** Sample standard deviation of q . k (theory: sqrt(d_k)). */
  sd: number;
  histogram: Histogram;
  /** Mean over the draws of the largest weight among 8 keys. */
  unscaledMax: number;
  scaledMax: number;
  /** Mean softmax-Jacobian norm: how much gradient reaches the keys. */
  unscaledGrad: number;
  scaledGrad: number;
}

const cache = new Map<string, ScalingResult>();

/** Draw the samples for one d_k (see the module comment); `samples` and `draws` are the sizes (the tests use more). */
export function measureScaling(dk: number, seed = SCALING_SEED, samples = HIST_SAMPLES, draws = WEIGHT_DRAWS): ScalingResult {
  const key = `${seed}:${dk}:${samples}:${draws}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const normal = normalStream(mulberry32(seed * 1000 + dk));
  const vector = () => Array.from({ length: dk }, normal);
  const dot = (a: readonly number[], b: readonly number[]) => a.reduce((s, v, i) => s + v * b[i], 0);

  const dots = Array.from({ length: samples }, () => dot(vector(), vector()));
  const mean = dots.reduce((a, b) => a + b, 0) / samples;
  const sd = Math.sqrt(dots.reduce((s, v) => s + (v - mean) ** 2, 0) / (samples - 1));

  let [un, sc, ung, scg] = [0, 0, 0, 0];
  for (let n = 0; n < draws; n++) {
    const q = vector();
    const scores = Array.from({ length: KEYS }, () => dot(q, vector()));
    const root = Math.sqrt(dk);
    un += maxWeight(scores);
    sc += maxWeight(scores, root);
    ung += softmaxGradientNorm(softmaxOf(scores, 1));
    scg += softmaxGradientNorm(softmaxOf(scores, root));
  }
  const result: ScalingResult = {
    dk, seed, dots, sd,
    histogram: histogram(dots, { bins: HIST_BINS, min: -HIST_LIMIT, max: HIST_LIMIT }),
    unscaledMax: un / draws, scaledMax: sc / draws, unscaledGrad: ung / draws, scaledGrad: scg / draws,
  };
  cache.set(key, result);
  return result;
}
