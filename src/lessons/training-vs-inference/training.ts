/**
 * Scenes 1 and 4: real tiny models from core/nn. Scene 1 trains a 2-8-1 network over seeded blobs in minibatches and
 * counts its cost in multiply-adds from the layer shapes (a model-based number, never a wall-clock reading). Scene 4
 * trains a classifier on standardised features and serves it with the same, a missing or a different preprocessing.
 */
import { blobs } from '../../core/fixtures/datasets';
import { createMlp, createSgd, type Mlp, type MlpBatch } from '../../core/nn';
import { mulberry32, shuffle } from '../../core/random';

// ── Scene 1: the training loop ──────────────────────────────────────────────

export const LOOP_STAGES = ['forward', 'loss', 'backward', 'update'] as const;
export const TRAIN_SEED = 1;
export const TRAIN_POINTS_PER_CLASS = 20;
export const TRAIN_HIDDEN = 8;
export const TRAIN_RATE = 0.5;
export const TRAIN_STEPS = 80;
export const BATCH_SIZES = [8, 20, 40] as const;
/** A toy device, in multiply-adds per second: slow on purpose so one training step takes a visible moment. Illustrative. */
export const DEVICE_MACS_PER_SECOND = 5000;
/** A backward pass costs about twice a forward pass (a rule of thumb: from memory, verify). */
export const BACKWARD_OVER_FORWARD = 2;

/** The training set, in a fixed shuffled order (batches taken in order must mix the two classes). */
const trainingPoints = () =>
  shuffle(blobs({ seed: 3, centers: [[-1.2, -0.8], [1.2, 0.8]], n: TRAIN_POINTS_PER_CLASS, spread: 0.7 }), mulberry32(11));

/** Multiply-adds of one forward pass of one sample, counted from the layer sizes: sum of fan-in x fan-out. */
export function forwardMacs(sizes: readonly number[]): number {
  let total = 0;
  for (let l = 0; l + 1 < sizes.length; l++) total += sizes[l] * sizes[l + 1];
  return total;
}

/** Multiply-adds of one training step on `batch` samples: forward plus backward, per sample. */
export const stepMacs = (sizes: readonly number[], batch: number): number => (1 + BACKWARD_OVER_FORWARD) * forwardMacs(sizes) * batch;

export interface TrainingRun {
  /** Loss after each step (entry 0 is untrained). */
  loss: number[];
  sizes: readonly number[];
  batch: number;
  stepSeconds: number;
  samplesPerSecond: number;
  stepsPerEpoch: number;
}

/** Train `steps` minibatch steps, the batches taken in order round the dataset. */
export function trainLoop(batch: number, steps = TRAIN_STEPS, seed = TRAIN_SEED): TrainingRun {
  const points = trainingPoints();
  const xs = points.map((p) => [p.x, p.y]);
  const ys = points.map((p) => p.label);
  const net = createMlp({ inputs: 2, hidden: [TRAIN_HIDDEN], activation: 'tanh', seed });
  const sgd = createSgd({ learningRate: TRAIN_RATE });
  const full: MlpBatch = { xs, ys };
  const loss = [net.loss(full)];
  for (let step = 0; step < steps; step++) {
    const start = (step * batch) % xs.length;
    const idx = Array.from({ length: batch }, (_, i) => (start + i) % xs.length);
    sgd.step(net, { xs: idx.map((i) => xs[i]), ys: idx.map((i) => ys[i]) });
    loss.push(net.loss(full));
  }
  const seconds = stepMacs(net.sizes, batch) / DEVICE_MACS_PER_SECOND;
  return { loss, sizes: net.sizes, batch, stepSeconds: seconds, samplesPerSecond: batch / seconds, stepsPerEpoch: xs.length / batch };
}

/** Training steps finished after `seconds` of the clock when the machine was frozen for `stalledSeconds` of it. */
export const stepsDone = (seconds: number, stalledSeconds: number, stepSeconds: number, limit: number): number =>
  Math.min(limit, Math.floor(Math.max(0, seconds - stalledSeconds) / stepSeconds + 1e-9));

// ── Scene 4: train-serve skew ───────────────────────────────────────────────

export const SKEW_RATE = 0.5;
export const SKEW_EPOCHS = 300;
export const SKEW_HIDDEN = 4;
const SKEW_CENTRES = [[3, 1], [6, 2]] as const;
export const DRIFT_RANGE = { min: -3, max: 3, step: 0.25 } as const;
export const DRIFT_STEPS: readonly number[] = Array.from({ length: (DRIFT_RANGE.max - DRIFT_RANGE.min) / DRIFT_RANGE.step + 1 }, (_, i) => DRIFT_RANGE.min + i * DRIFT_RANGE.step);
/** The "different statistics" variant: the scaler's mean is off by this much in the first feature, its spread by this factor. */
export const STALE_SHIFT = 1.5;
export const STALE_SPREAD = 1.5;

export type Preprocessing = 'matching' | 'missing' | 'different';

type Pair = readonly [number, number];
interface Scaler {
  mean: Pair;
  sd: Pair;
}

const labelled = (seed: number, n: number) => blobs({ seed, centers: SKEW_CENTRES, n, spread: 1 }).map((p) => ({ x: [p.x, p.y] as Pair, y: p.label }));

const column = (rows: readonly Pair[], k: 0 | 1): number => rows.reduce((s, r) => s + r[k], 0) / rows.length;
const spread = (rows: readonly Pair[], mean: Pair, k: 0 | 1): number => Math.sqrt(rows.reduce((s, r) => s + (r[k] - mean[k]) ** 2, 0) / rows.length);

function fitScaler(rows: readonly Pair[]): Scaler {
  const mean: Pair = [column(rows, 0), column(rows, 1)];
  const sd: Pair = [spread(rows, mean, 0), spread(rows, mean, 1)];
  return { mean, sd };
}

const standardise = (row: Pair, { mean, sd }: Scaler): number[] => [(row[0] - mean[0]) / sd[0], (row[1] - mean[1]) / sd[1]];

export interface SkewModel {
  net: Mlp;
  scaler: Scaler;
  test: { x: Pair; y: number }[];
}

let skew: SkewModel | null = null;

/** The classifier of scene 4, trained once on standardised features (cached; same seeds, same weights). */
export function skewModel(): SkewModel {
  if (skew) return skew;
  const train = labelled(1, 60);
  const scaler = fitScaler(train.map((r) => r.x));
  const net = createMlp({ inputs: 2, hidden: [SKEW_HIDDEN], activation: 'tanh', seed: 1 });
  const batch: MlpBatch = { xs: train.map((r) => standardise(r.x, scaler)), ys: train.map((r) => r.y) };
  const sgd = createSgd({ learningRate: SKEW_RATE });
  for (let e = 0; e < SKEW_EPOCHS; e++) sgd.step(net, batch);
  skew = { net, scaler, test: labelled(2, 200) };
  return skew;
}

/** The features the served model receives for a raw row under a preprocessing choice. */
export function served(row: Pair, how: Preprocessing, m: SkewModel = skewModel()): number[] {
  if (how === 'matching') return standardise(row, m.scaler);
  if (how === 'missing') return [row[0], row[1]];
  const stale: Scaler = { mean: [m.scaler.mean[0] + STALE_SHIFT, m.scaler.mean[1]], sd: [m.scaler.sd[0] * STALE_SPREAD, m.scaler.sd[1] * STALE_SPREAD] };
  return standardise(row, stale);
}

/** Accuracy on the fresh test set when the live data's first feature has moved by `drift` (in raw units) before preprocessing. */
export function servedAccuracy(how: Preprocessing, drift = 0, m: SkewModel = skewModel()): number {
  const right = m.test.filter(({ x, y }) => (m.net.predict(served([x[0] + drift, x[1]], how, m)) > 0.5 ? 1 : 0) === y).length;
  return right / m.test.length;
}

/** The accuracy the offline evaluation reports: the training pipeline applied to the test set. */
export function evaluationAccuracy(m: SkewModel = skewModel()): number {
  const right = m.test.filter(({ x, y }) => (m.net.predict(standardise(x, m.scaler)) > 0.5 ? 1 : 0) === y).length;
  return right / m.test.length;
}
