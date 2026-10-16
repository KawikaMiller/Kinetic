/**
 * Matrix factorisation by stochastic gradient descent on core/nn: r-hat(u, i) = mean + p_u . q_i, one rating
 * per update in a freshly shuffled order each epoch. Train and held-out RMSE are measured after every epoch.
 */
import { createFactorisation, createSgd, type Factorisation, type Rating } from '../../core/nn';
import { mulberry32, shuffle } from '../../core/random';
import { ITEMS } from './data';
import { TOTAL_USERS, type Problem } from './problem';

export interface MfConfig {
  factors: number;
  lambda: number;
  learningRate: number;
  epochs: number;
  seed: number;
}

export interface MfRun {
  model: Factorisation;
  /** RMSE after 0, 1, ... epochs. */
  train: number[];
  test: number[];
  /** Epoch (0-based count) with the lowest held-out RMSE. */
  bestEpoch: number;
  predict: (user: number, item: number) => number;
}

export const centred = (ratings: readonly Rating[], mean: number): Rating[] => ratings.map((r) => ({ ...r, rating: r.rating - mean }));

export function runMf(problem: Problem, cfg: MfConfig, users = TOTAL_USERS, items = ITEMS): MfRun {
  const model = createFactorisation({ users, items, factors: cfg.factors, seed: cfg.seed, lambda: cfg.lambda });
  const sgd = createSgd({ learningRate: cfg.learningRate });
  const train = centred(problem.train, problem.mean);
  const test: Rating[] = problem.test.map((t) => ({ user: t.user, item: t.item, rating: t.truth - problem.mean }));
  const trainRmse = [model.rmse(train)];
  const testRmse = [model.rmse(test)];
  for (let epoch = 0; epoch < cfg.epochs; epoch++) {
    for (const r of shuffle(train, mulberry32(cfg.seed * 131 + epoch))) sgd.step(model, [r]);
    trainRmse.push(model.rmse(train));
    testRmse.push(model.rmse(test));
  }
  const bestEpoch = testRmse.reduce((best, v, i) => (v < testRmse[best] ? i : best), 0);
  return { model, train: trainRmse, test: testRmse, bestEpoch, predict: (u, i) => problem.mean + model.predict(u, i) };
}

/** What the factorisation does on a fully observed matrix: the same SGD, every cell a training rating. */
export function fitFull(matrix: readonly (readonly number[])[], cfg: MfConfig): { model: Factorisation; rmse: number } {
  const ratings: Rating[] = matrix.flatMap((row, user) => row.map((rating, item) => ({ user, item, rating })));
  const model = createFactorisation({ users: matrix.length, items: matrix[0].length, factors: cfg.factors, seed: cfg.seed, lambda: cfg.lambda });
  const sgd = createSgd({ learningRate: cfg.learningRate });
  for (let epoch = 0; epoch < cfg.epochs; epoch++) for (const r of shuffle(ratings, mulberry32(cfg.seed * 131 + epoch))) sgd.step(model, [r]);
  return { model, rmse: model.rmse(ratings) };
}
