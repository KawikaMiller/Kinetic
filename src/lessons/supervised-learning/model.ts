/**
 * supervised-learning: polynomial fits to seeded noisy samples of a known curve, a
 * train/validation split, ridge regularisation, and a held-out test set.
 *
 * Model selection (best degree, best λ) only ever sees training and validation data:
 * those functions don't take the test set at all, so the demo can't leak it.
 */
import { gaussian } from '../../core/fixtures/datasets';
import { leastSquares, mse, polyEval } from '../../core/fit';
import { mulberry32, shuffle } from '../../core/random';

export interface Sample {
  x: number;
  y: number;
}

/** The hidden truth. Shown dashed, because with synthetic data we can. */
export const trueCurve = (x: number) => Math.sin(Math.PI * x);
export const NOISE = 0.3;
export const X_RANGE: readonly [number, number] = [-1, 1];

export const DATA_SEED = 7;
export const TEST_SEED = 4242;
export const TEST_N = 60;
export const MIN_TRAIN = 10;
export const MAX_TRAIN = 200;
export const MAX_DEGREE = 12;

/** Half as many validation points as training points, and never fewer than 10. */
export const validationCount = (nTrain: number) => Math.max(10, Math.round(nTrain / 2));

/** `count` seeded samples of the true curve plus normal noise. The first k never change as count grows. */
export function samples(seed: number, count: number): Sample[] {
  const rnd = mulberry32(seed);
  const [lo, hi] = X_RANGE;
  return Array.from({ length: count }, () => {
    const x = lo + rnd() * (hi - lo);
    return { x, y: trueCurve(x) + gaussian(rnd) * NOISE };
  });
}

export interface Split {
  train: Sample[];
  val: Sample[];
}

/** Draw nTrain + validationCount(nTrain) samples and shuffle them into the two sets with splitSeed. */
export function makeSplit(nTrain: number, splitSeed: number, dataSeed = DATA_SEED): Split {
  const pool = samples(dataSeed, nTrain + validationCount(nTrain));
  const order = shuffle(pool.map((_, i) => i), mulberry32(splitSeed));
  return { train: order.slice(0, nTrain).map((i) => pool[i]), val: order.slice(nTrain).map((i) => pool[i]) };
}

/** The test set: its own seed, never part of the pool, never used to choose anything. */
export const TEST_SET: readonly Sample[] = samples(TEST_SEED, TEST_N);

export type Fit =
  | { ok: true; coeffs: number[]; illConditioned: boolean }
  | { ok: false; reason: string };

export type CoefficientWarning = 'none' | 'interpolates' | 'singular';

/**
 * degree + 1 coefficients against n points: equal means the curve can pass through every
 * training point; more means least squares has no unique answer unless λ > 0.
 */
export function coefficientWarning(nTrain: number, degree: number, lambda: number): CoefficientWarning {
  if (degree + 1 > nTrain) return lambda > 0 ? 'interpolates' : 'singular';
  return degree + 1 === nTrain ? 'interpolates' : 'none';
}

export function fitPoly(train: readonly Sample[], degree: number, lambda: number): Fit {
  if (coefficientWarning(train.length, degree, lambda) === 'singular') {
    return { ok: false, reason: `${degree + 1} coefficients but only ${train.length} training points: no unique fit without λ > 0.` };
  }
  const f = leastSquares(train.map((s) => s.x), train.map((s) => s.y), degree, { lambda });
  if (!f) return { ok: false, reason: 'The normal equations are singular here: no unique fit.' };
  return { ok: true, coeffs: f.coeffs, illConditioned: f.illConditioned };
}

export const mseOf = (coeffs: readonly number[], set: readonly Sample[]) => mse(set.map((s) => polyEval(coeffs, s.x)), set.map((s) => s.y));

export interface ErrorPoint {
  /** The degree or λ this point is for. */
  at: number;
  train: number;
  val: number;
}

/** Training and validation MSE for every degree 0..MAX_DEGREE that has a fit. */
export function degreeCurve(split: Split, lambda: number): ErrorPoint[] {
  const out: ErrorPoint[] = [];
  for (let d = 0; d <= MAX_DEGREE; d++) {
    const f = fitPoly(split.train, d, lambda);
    if (f.ok) out.push({ at: d, train: mseOf(f.coeffs, split.train), val: mseOf(f.coeffs, split.val) });
  }
  return out;
}

/** λ = 10^e for e from LAMBDA_EXP_MIN to LAMBDA_EXP_MAX in quarter steps. */
export const LAMBDA_EXP_MIN = -6;
export const LAMBDA_EXP_MAX = 1;
export const LAMBDA_EXP_STEP = 0.25;
export const LAMBDA_GRID: number[] = Array.from(
  { length: Math.round((LAMBDA_EXP_MAX - LAMBDA_EXP_MIN) / LAMBDA_EXP_STEP) + 1 },
  (_, i) => 10 ** (LAMBDA_EXP_MIN + i * LAMBDA_EXP_STEP),
);

export function lambdaCurve(split: Split, degree: number): ErrorPoint[] {
  const out: ErrorPoint[] = [];
  for (const lambda of LAMBDA_GRID) {
    const f = fitPoly(split.train, degree, lambda);
    if (f.ok) out.push({ at: lambda, train: mseOf(f.coeffs, split.train), val: mseOf(f.coeffs, split.val) });
  }
  return out;
}

/** The setting with the lowest validation error (validation only: never the test set). */
export function bestBy(curve: readonly ErrorPoint[]): ErrorPoint | null {
  return curve.reduce<ErrorPoint | null>((best, p) => (!best || p.val < best.val ? p : best), null);
}

/** What happened once someone looked at the test set. */
export interface Peek {
  degree: number;
  lambda: number;
  nTrain: number;
  test: number;
  val: number;
}

export function peekAtTest(split: Split, degree: number, lambda: number): Peek | null {
  const f = fitPoly(split.train, degree, lambda);
  if (!f.ok) return null;
  return { degree, lambda, nTrain: split.train.length, test: mseOf(f.coeffs, TEST_SET), val: mseOf(f.coeffs, split.val) };
}

export interface Settings {
  degree: number;
  nTrain: number;
  /** 0 = no ridge. */
  lambda: number;
}

export type PresetId = 'underfit' | 'good' | 'overfit' | 'fixedByLambda' | 'fixedByData';

export const PRESET_LABELS: Record<PresetId, string> = {
  underfit: 'Underfit (degree 1)',
  good: 'Good fit',
  overfit: 'Overfit (degree 12, 20 points)',
  fixedByLambda: 'Fixed by λ',
  fixedByData: 'Fixed by data',
};
export const PRESET_IDS: PresetId[] = ['underfit', 'good', 'overfit', 'fixedByLambda', 'fixedByData'];

const BASE_N = 30;
/**
 * 20, not the 15 first planned: at 15 points the degree-12 normal matrix has κ ≈ 10¹³ and
 * core/vec's solver calls it singular on some splits. At 20 it solves on every split tried.
 */
export const OVERFIT_N = 20;

/** Presets that pick a "best" pick it from validation error on the current split, like a real workflow. */
export function presetSettings(id: PresetId, splitSeed: number): Settings {
  switch (id) {
    case 'underfit':
      return { degree: 1, nTrain: BASE_N, lambda: 0 };
    case 'good':
      return { degree: bestBy(degreeCurve(makeSplit(BASE_N, splitSeed), 0))!.at, nTrain: BASE_N, lambda: 0 };
    case 'overfit':
      return { degree: MAX_DEGREE, nTrain: OVERFIT_N, lambda: 0 };
    case 'fixedByLambda':
      return { degree: MAX_DEGREE, nTrain: OVERFIT_N, lambda: bestBy(lambdaCurve(makeSplit(OVERFIT_N, splitSeed), MAX_DEGREE))!.at };
    case 'fixedByData':
      return { degree: MAX_DEGREE, nTrain: MAX_TRAIN, lambda: 0 };
  }
}
