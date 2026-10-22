/** Scene 4: three small TOYS on where bias comes from: representation, label bias and a feedback loop. Invented and seeded. */
import { normal } from '../../core/distributions';
import { mulberry32 } from '../../core/random';
import { createTickSim } from '../../core/simTick';
import { DEFAULT, N_TOTAL, fitModel, generate, predict, type Group, type Params, type Row } from './model';

const CUT = 0.5;
const TEST_SEED_OFFSET = 1000;

// ---------------------------------------------------------------- representation

export const SHARES = { min: 0.05, max: 0.5, step: 0.05, default: 0.1 };
const TEST_ROWS = 4000;

export interface GroupError {
  a: number;
  b: number;
}

/** Share of a group's test applicants the model gets wrong at the cut-off. */
export function errorsByGroup(rows: readonly Row[], probs: readonly number[]): GroupError {
  const err = (g: Group) => {
    const idx = rows.map((_, i) => i).filter((i) => rows[i].group === g);
    return idx.filter((i) => (probs[i] >= CUT ? 1 : 0) !== rows[i].repaid).length / idx.length;
  };
  return { a: err(0), b: err(1) };
}

/** In this toy the outcome turns on the same feature but group A's cut sits at 0 and group B's at CUT_B: one line cannot fit both. */
export const CUT_B = 1;
const TRAIN_ROWS = 1000;
const NOISE = 0.5;

export function toyRows(n: number, shareB: number, seed: number): Row[] {
  const rnd = mulberry32(seed);
  const nB = Math.round(n * shareB);
  return Array.from({ length: n }, (_, i) => {
    const group: Group = i < n - nB ? 0 : 1;
    const feature = normal(rnd);
    const repaid: 0 | 1 = feature + NOISE * normal(rnd) > (group === 1 ? CUT_B : 0) ? 1 : 0;
    return { group, repaid, score: feature, proxy: 0 };
  });
}

/** Train on a set where group B is the given share of the rows; test on a balanced fresh set. */
export function representation(shareB: number, seed: number): GroupError {
  const train = toyRows(TRAIN_ROWS, shareB, seed);
  const test = toyRows(TEST_ROWS, 0.5, seed + TEST_SEED_OFFSET);
  return errorsByGroup(test, predict(fitModel(train, 'score'), test));
}

// ---------------------------------------------------------------- label bias

export const LABEL_NOISE = { a: 0.05, b: { min: 0, max: 0.4, step: 0.05, default: 0.25 } };

export interface LabelReading {
  /** Accuracy of the model against the labels it was trained on (the biased ones) and against what really happened, per group. */
  apparent: GroupError;
  actual: GroupError;
}

/** Labels for group B are a noisier proxy for the real outcome: each is flipped with probability `noiseB` (A: LABEL_NOISE.a). */
export function labelBias(noiseB: number, seed: number, base: Params = DEFAULT): LabelReading {
  const flip = (rows: readonly Row[], salt: number) => {
    const rnd = mulberry32(seed + salt);
    return rows.map((r) => (rnd() < (r.group === 0 ? LABEL_NOISE.a : noiseB) ? 1 - r.repaid : r.repaid));
  };
  const train = generate({ ...base, seed });
  const test = generate({ ...base, nB: N_TOTAL / 2, seed: seed + TEST_SEED_OFFSET }, TEST_ROWS);
  const probs = predict(fitModel(train, 'score', flip(train, 1)), test);
  const biased = flip(test, 2);
  const accuracy = (labels: readonly number[]): GroupError => {
    const acc = (g: Group) => {
      const idx = test.map((_, i) => i).filter((i) => test[i].group === g);
      return idx.filter((i) => (probs[i] >= CUT ? 1 : 0) === labels[i]).length / idx.length;
    };
    return { a: acc(0), b: acc(1) };
  };
  return { apparent: accuracy(biased), actual: accuracy(test.map((r) => r.repaid)) };
}

// ---------------------------------------------------------------- feedback loop

export const ROUNDS = 10;
export const LOOP = { startRows: 1000, startShareB: 0.4, batch: 400, batchShareB: 0.4, seed: 7 };

export interface LoopState {
  train: Row[];
  /** Share of group B in the training data at the start of the round. */
  shareB: number;
  approvalA: number;
  approvalB: number;
}

const shareOfB = (rows: readonly Row[]) => rows.filter((r) => r.group === 1).length / rows.length;

/** Each round: fit on what has been observed, approve p >= 0.5 among a new batch, and observe only the approved outcomes. */
export function feedbackLoop(seed: number = LOOP.seed, base: Params = DEFAULT) {
  return createTickSim<LoopState>({
    seed,
    init: (rnd) => {
      const train = generate({ ...base, nB: Math.round(LOOP.startShareB * N_TOTAL), seed: Math.floor(rnd() * 2 ** 31) }, LOOP.startRows);
      return { train, shareB: shareOfB(train), approvalA: NaN, approvalB: NaN };
    },
    step: (s, rnd) => {
      const batch = generate({ ...base, nB: Math.round(LOOP.batchShareB * N_TOTAL), seed: Math.floor(rnd() * 2 ** 31) }, LOOP.batch);
      const probs = predict(fitModel(s.train, 'score'), batch);
      const approved = batch.filter((_, i) => probs[i] >= CUT);
      const rate = (g: Group) => {
        const idx = batch.map((_, i) => i).filter((i) => batch[i].group === g);
        return idx.filter((i) => probs[i] >= CUT).length / idx.length;
      };
      const train = [...s.train, ...approved];
      return { train, shareB: shareOfB(train), approvalA: rate(0), approvalB: rate(1) };
    },
  });
}
