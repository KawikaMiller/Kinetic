import { createFactorisation, createSgd, type Rating } from '../../core/nn';
import { svdReconstruct, svdSmall } from '../../core/linalg';
import { mulberry32 } from '../../core/random';

/**
 * Scene 2: the best rank-r update (a truncated SVD, Eckart-Young) and the one gradient descent finds.
 * The target is a seeded 8 x 8 matrix with a designed spectrum, so the optimum is known in closed form.
 * LoRA adapters are trained by gradient, not by SVD: the SVD here only supplies the floor.
 */

export const N = 8;
export const SPECTRUM = [5, 3, 1, 0.5, 0.25, 0.1, 0.05, 0.02] as const;
export const TOTAL_ENERGY = SPECTRUM.reduce((s, v) => s + v * v, 0);
export const DEFAULT_LORA_SEED = 3;
export const RANK_LIMITS = { min: 1, max: N } as const;
export const TRAIN_STEPS = 1500;
export const LEARNING_RATE = 3;
export const MOMENTUM = 0.9;
/** The tolerance the page states: trained relative error within this of the optimum's after TRAIN_STEPS. */
export const TOLERANCE = 0.005;

type Mat = number[][];

const frobenius2 = (m: readonly (readonly number[])[]): number => m.reduce((s, row) => s + row.reduce((t, v) => t + v * v, 0), 0);
const sub = (a: Mat, b: Mat): Mat => a.map((row, i) => row.map((v, j) => v - b[i][j]));

/** A seeded 8 x 8 target update dW* = U diag(SPECTRUM) V^T, with U and V from the SVD of a seeded matrix. */
export function makeTarget(seed: number): Mat {
  const rnd = mulberry32(seed);
  const raw = Array.from({ length: N }, () => Array.from({ length: N }, () => rnd() * 2 - 1));
  const { u, v } = svdSmall(raw);
  return u.map((row) => v.map((vrow) => SPECTRUM.reduce((s, sigma, k) => s + sigma * row[k] * vrow[k], 0)));
}

/** Squared error of the best rank-r approximation: the sum of the squared singular values past r. */
export const optimumEnergy = (r: number): number => SPECTRUM.slice(r).reduce((s, v) => s + v * v, 0);
export const optimumRelative = (r: number): number => optimumEnergy(r) / TOTAL_ENERGY;

/** The truncated SVD of a matrix at rank r, by the library: the independent route to the same floor. */
export const truncated = (m: Mat, r: number): Mat => svdReconstruct(svdSmall(m), r);

export const relativeError = (target: Mat, approx: Mat): number => frobenius2(sub(target, approx)) / frobenius2(target);

export interface TrainRun {
  /** Relative squared error of B A against the target after k steps, k = 0..steps. */
  curve: number[];
  final: number;
  optimum: number;
  /** Final minus optimum: never below -1e-9. */
  gap: number;
  withinTolerance: boolean;
}

const ratingsOf = (target: Mat): Rating[] => target.flatMap((row, user) => row.map((rating, item) => ({ user, item, rating })));

/** Fit B A (an N x r by r x N product) to the target by gradient descent through core/nn's factorisation, over all 64 entries as observations. */
export const train = (target: Mat, r: number, seed: number, steps = TRAIN_STEPS): TrainRun => trainWith(target, r, seed, steps, LEARNING_RATE);

export function trainWith(target: Mat, r: number, seed: number, steps: number, learningRate: number): TrainRun {
  const model = createFactorisation({ users: N, items: N, factors: r, seed });
  const sgd = createSgd({ learningRate, momentum: MOMENTUM });
  const ratings = ratingsOf(target);
  const energy = frobenius2(target);
  const errorNow = () => {
    let s = 0;
    for (const { user, item, rating } of ratings) s += (model.predict(user, item) - rating) ** 2;
    return s / energy;
  };
  const curve = [errorNow()];
  for (let k = 0; k < steps; k += 1) {
    sgd.step(model, ratings);
    curve.push(errorNow());
  }
  const final = curve[curve.length - 1];
  const optimum = frobenius2(sub(target, truncated(target, r))) / energy;
  return { curve, final, optimum, gap: final - optimum, withinTolerance: final - optimum <= TOLERANCE };
}

/** Squared error of a random rank-r matrix against the target (a competitor the optimum must beat). */
export function randomCompetitor(target: Mat, r: number, rnd: () => number): number {
  const b = Array.from({ length: N }, () => Array.from({ length: r }, () => rnd() * 2 - 1));
  const a = Array.from({ length: r }, () => Array.from({ length: N }, () => rnd() * 2 - 1));
  const product = b.map((row) => a[0].map((_, j) => row.reduce((s, v, k) => s + v * a[k][j], 0)));
  return frobenius2(sub(target, product));
}

export { frobenius2 };
