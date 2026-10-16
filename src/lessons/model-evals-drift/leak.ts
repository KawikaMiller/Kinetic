/** Leakage: a nearest-neighbour memoriser and the logistic model, scored on a test set and on fresh data. */
import { gradientStep, logLossGradient } from '../../core/fit';
import { TRAIN_ITERATIONS, TRAIN_RATE, dayBatch, predict, type Example, type Model, type Vec2 } from './world';

export const LEAK_TRAIN = 200;
export const LEAK_TEST = 200;
export const LEAK_FRESH = 2000;
const TRAIN_SEED = 900;
const TEST_SEED = 901;
const FRESH_SEED = 902;

const dist2 = (a: Vec2, b: Vec2) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/** 1-nearest-neighbour: the label of the closest training point (the earlier one on a tie). A pure memoriser. */
export function nearestLabel(train: readonly Example[], x: Vec2): 0 | 1 {
  let best = train[0];
  let bestD = dist2(best.x, x);
  for (const t of train) {
    const d = dist2(t.x, x);
    if (d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return best.y;
}

export function fitLogistic(train: readonly Example[]): Model {
  const xs = train.map((e) => e.x);
  const ys = train.map((e) => e.y);
  let params: number[] = [0, 0, 0];
  for (let i = 0; i < TRAIN_ITERATIONS; i++) params = gradientStep(params, logLossGradient(params, xs, ys), TRAIN_RATE);
  return { params };
}

const share = (set: readonly Example[], right: (e: Example) => boolean) => set.filter(right).length / set.length;

export interface LeakResult {
  trainSize: number;
  memoriser: { test: number; fresh: number };
  logistic: { test: number; fresh: number };
}

export function leakExperiment(leaked: boolean): LeakResult {
  const train = dayBatch(TRAIN_SEED, 1, null, LEAK_TRAIN);
  const test = dayBatch(TEST_SEED, 1, null, LEAK_TEST);
  const fresh = dayBatch(FRESH_SEED, 1, null, LEAK_FRESH);
  const fitOn = leaked ? [...train, ...test] : train;
  const model = fitLogistic(fitOn);
  const knn = (e: Example) => nearestLabel(fitOn, e.x) === e.y;
  const lr = (e: Example) => predict(model, e.x) === e.y;
  return {
    trainSize: fitOn.length,
    memoriser: { test: share(test, knn), fresh: share(fresh, knn) },
    logistic: { test: share(test, lr), fresh: share(fresh, lr) },
  };
}
