/**
 * The eval gate: two versions of the model, a held-out test set with two invented user segments, a
 * bootstrap interval for the accuracy difference, and a release rule. v2 is trained on more data that
 * contains fewer examples of segment B, so it is better on average and worse on that slice.
 */
import { gradientStep, linearPredict, logLossGradient, sigmoid } from '../../core/fit';
import { gaussian } from '../../core/fixtures/datasets';
import { mulberry32, type Rnd } from '../../core/random';
import { MU, SPREAD, TRAIN_ITERATIONS, TRAIN_RATE, TRUE_WEIGHTS, predict, type Model, type Vec2 } from './world';

export type Segment = 'A' | 'B';
export const SEGMENTS: readonly Segment[] = ['A', 'B'];
export const SEGMENT_LABEL: Record<Segment, string> = { A: 'Segment A (invented: long-time users)', B: 'Segment B (invented: new users)' };

/** Segment B's labels lean this much towards class 1 (a bias on the posterior's logit). */
export const SEGMENT_B_BIAS = 3;
export const TEST_POOL = 5000;
export const TEST_SEED = 77;
export const TEST_SIZES = [100, 200, 300, 500, 800, 1200, 2000, 3000, 5000] as const;
export const BOOTSTRAP_RESAMPLES = 1000;
export const BOOTSTRAP_SEED = 5;
/** A slice that falls by more than this many points blocks the strict gate. */
export const SLICE_LIMIT_POINTS = 2;

export interface Labelled {
  x: Vec2;
  y: 0 | 1;
  segment: Segment;
}

export interface Version {
  id: 'v1' | 'v2';
  label: string;
  note: string;
  trainSize: number;
  segmentBShare: number;
  seed: number;
}

export const VERSIONS: readonly Version[] = [
  { id: 'v1', label: 'v1', note: '30 training examples, 30% from segment B', trainSize: 30, segmentBShare: 0.3, seed: 8 },
  { id: 'v2', label: 'v2', note: '800 training examples, 3% from segment B', trainSize: 800, segmentBShare: 0.03, seed: 42 },
];

export function sample(rnd: Rnd, segmentBShare: number): Labelled {
  const segment: Segment = rnd() < segmentBShare ? 'B' : 'A';
  const comp = rnd() < 0.5 ? -1 : 1;
  const x: Vec2 = [comp * MU + SPREAD * gaussian(rnd), comp * MU + SPREAD * gaussian(rnd)];
  const u = rnd();
  const logit = TRUE_WEIGHTS[0] * x[0] + TRUE_WEIGHTS[1] * x[1] + (segment === 'B' ? SEGMENT_B_BIAS : 0);
  return { x, y: u < sigmoid(logit) ? 1 : 0, segment };
}

export const sampleSet = (seed: number, n: number, segmentBShare: number): Labelled[] => {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => sample(rnd, segmentBShare));
};

export function trainVersion(v: Version): Model {
  const data = sampleSet(v.seed, v.trainSize, v.segmentBShare);
  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  let params: number[] = [0, 0, 0];
  for (let i = 0; i < TRAIN_ITERATIONS; i++) params = gradientStep(params, logLossGradient(params, xs, ys), TRAIN_RATE);
  return { params };
}

/** The test examples every `n` takes the first of, so a larger n only adds examples. */
export const testPool = (): Labelled[] => sampleSet(TEST_SEED, TEST_POOL, 0.3);

export const correct = (m: Model, e: Labelled): boolean => predict(m, e.x) === e.y;

export interface Evaluation {
  n: number;
  accuracy: Record<Version['id'], number>;
  slice: Record<Segment, { n: number; accuracy: Record<Version['id'], number> }>;
  /** v2 minus v1, in points. */
  difference: number;
  interval: { lo: number; hi: number };
}

export const meanOf = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Percentile bootstrap of the mean of `values`: the 2.5th and 97.5th percentile of `resamples` resampled means. */
export function bootstrapInterval(values: readonly number[], resamples: number, seed: number): { lo: number; hi: number } {
  const rnd = mulberry32(seed);
  const n = values.length;
  const means: number[] = [];
  for (let r = 0; r < resamples; r++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += values[Math.floor(rnd() * n)];
    means.push(sum / n);
  }
  means.sort((a, b) => a - b);
  return { lo: means[Math.floor(0.025 * resamples)], hi: means[Math.ceil(0.975 * resamples) - 1] };
}

let cache: { models: Record<Version['id'], Model>; pool: Labelled[] } | null = null;
const world = () => (cache ??= { models: { v1: trainVersion(VERSIONS[0]), v2: trainVersion(VERSIONS[1]) }, pool: testPool() });

export function evaluate(n: number): Evaluation {
  const { models, pool } = world();
  const test = pool.slice(0, n);
  const acc = (m: Model, set: readonly Labelled[]) => meanOf(set.map((e) => (correct(m, e) ? 1 : 0)));
  const sliceOf = (s: Segment) => {
    const set = test.filter((e) => e.segment === s);
    return { n: set.length, accuracy: { v1: acc(models.v1, set), v2: acc(models.v2, set) } };
  };
  const diffs = test.map((e) => (correct(models.v2, e) ? 1 : 0) - (correct(models.v1, e) ? 1 : 0));
  return {
    n,
    accuracy: { v1: acc(models.v1, test), v2: acc(models.v2, test) },
    slice: { A: sliceOf('A'), B: sliceOf('B') },
    difference: meanOf(diffs) * 100,
    interval: (() => {
      const i = bootstrapInterval(diffs, BOOTSTRAP_RESAMPLES, BOOTSTRAP_SEED);
      return { lo: i.lo * 100, hi: i.hi * 100 };
    })(),
  };
}

export type GateRule = 'overall' | 'slices';

export interface GateVerdict {
  ship: boolean;
  reason: string;
}

/** `overall` blocks only if v2 is worse overall; `slices` also blocks when any slice falls by more than the limit. */
export function gate(e: Evaluation, rule: GateRule): GateVerdict {
  if (e.difference < 0) return { ship: false, reason: `v2 is ${(-e.difference).toFixed(1)} points worse overall` };
  if (rule === 'slices') {
    for (const s of SEGMENTS) {
      const drop = (e.slice[s].accuracy.v1 - e.slice[s].accuracy.v2) * 100;
      if (drop > SLICE_LIMIT_POINTS) return { ship: false, reason: `segment ${s} falls ${drop.toFixed(1)} points, above the ${SLICE_LIMIT_POINTS}-point limit` };
    }
  }
  return { ship: true, reason: rule === 'overall' ? 'v2 is no worse overall' : `no slice falls by more than ${SLICE_LIMIT_POINTS} points` };
}

export const linearProb = (m: Model, x: Vec2): number => sigmoid(linearPredict(m.params, x));
