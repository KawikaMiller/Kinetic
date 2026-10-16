/**
 * Scene 4: learn to look something up. Four items whose keys are orthogonal (the unit vectors) and whose
 * values are seeded random vectors; W_q and W_k start random and are trained for real (core/nn
 * createAttentionHead, values supplied so W_v takes no part) until a query equal to a key puts its weight
 * on that key's value.
 */
import { gaussian } from '../../core/fixtures/datasets';
import { createAttentionHead, createSgd, type AttentionBatch, type AttentionHead } from '../../core/nn';
import { mulberry32 } from '../../core/random';
import type { Mat } from '../../core/vec';

export const ITEMS = 4;
export const VALUE_SEED = 77;
export const RATE = 1;
export const EPOCHS_PER_FRAME = 4;
export const MAX_EPOCHS = 600;
/** A seed "learned the lookup" when every query puts at least this weight on its own key. */
export const LEARNED_WEIGHT = 0.8;
export const ITEM_NAMES = ['A', 'B', 'C', 'D'] as const;

export const KEYS: Mat = Array.from({ length: ITEMS }, (_, i) => Array.from({ length: ITEMS }, (_, j) => (i === j ? 1 : 0)));
export const VALUES: Mat = (() => {
  const rnd = mulberry32(VALUE_SEED);
  return Array.from({ length: ITEMS }, () => Array.from({ length: ITEMS }, () => Math.round(gaussian(rnd) * 100) / 100));
})();

/** Train on all four lookups: each key as a query, its value as the target. */
export const trainingBatch = (): AttentionBatch => ({ queries: KEYS, keys: KEYS, values: VALUES, targets: VALUES });

export interface LookupRun {
  readonly seed: number;
  readonly head: AttentionHead;
  readonly lossHistory: number[];
  /** Weight each query puts on its own key, after each epoch (entry 0 is untrained). */
  readonly diagonalHistory: number[][];
  epoch: number;
  advance(epochs: number): void;
}

export const diagonal = (weights: Mat): number[] => weights.map((row, i) => row[i]);

export function createLookupRun(seed: number): LookupRun {
  const head = createAttentionHead({ inputs: ITEMS, keyDim: ITEMS, valueDim: ITEMS, seed });
  const sgd = createSgd({ learningRate: RATE });
  const batch = trainingBatch();
  const run: LookupRun = {
    seed,
    head,
    lossHistory: [head.loss(batch)],
    diagonalHistory: [diagonal(head.forward(batch).weights)],
    epoch: 0,
    advance(epochs) {
      for (let i = 0; i < epochs && run.epoch < MAX_EPOCHS; i++) {
        sgd.step(head, batch);
        run.epoch++;
        run.lossHistory.push(head.loss(batch));
        run.diagonalHistory.push(diagonal(head.forward(batch).weights));
      }
    },
  };
  return run;
}

/** The query the learner builds: item `a`'s key, blended `mix` of the way toward item `b`'s key. */
export function blendedQuery(a: number, b: number, mix: number): number[] {
  return KEYS[a].map((v, k) => (1 - mix) * v + mix * KEYS[b][k]);
}

/** What the trained head does with one query: the weights over the four items and the value it returns. */
export function lookup(head: AttentionHead, query: readonly number[]) {
  const { weights, output } = head.forward({ queries: [[...query]], keys: KEYS, values: VALUES });
  return { weights: weights[0], output: output[0] };
}

/** Does every query put LEARNED_WEIGHT or more on its own key? */
export const learned = (run: LookupRun): boolean => run.diagonalHistory[run.diagonalHistory.length - 1].every((w) => w >= LEARNED_WEIGHT);

export interface LookupSweep {
  seeds: number;
  epochs: number;
  learnedCount: number;
}

/** Train `seeds` consecutive seeds (from `first`) for `epochs` and count the ones that learned the lookup. */
export function lookupSweep(first: number, seeds = 20, epochs = 300): LookupSweep {
  let learnedCount = 0;
  for (let k = 0; k < seeds; k++) {
    const run = createLookupRun(first + k);
    run.advance(epochs);
    if (learned(run)) learnedCount++;
  }
  return { seeds, epochs, learnedCount };
}
