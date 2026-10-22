/**
 * The noisy-count scene's model: a counting query answered with Laplace noise of scale 1/epsilon (the sensitivity
 * of a count is 1), and a privacy budget that each answer spends. Laplace noise is a signed exponential sample.
 * Everything is seeded, so the same seed and the same questions give the same answers.
 */
import { exponential } from '../../core/distributions';
import { mulberry32, type Rnd } from '../../core/random';
import { makeTable, type Condition } from './kanon';

/** The condition the counting query asks about: the same invented table as the k-anonymity scene. */
export const QUERY_CONDITION: Condition = 'C';
/** The true count the query protects: how many of the invented table's people have `QUERY_CONDITION`, computed from the table, never typed. */
export const TRUE_COUNT = makeTable().filter((p) => p.condition === QUERY_CONDITION).length;
/** The smallest epsilon the slider offers, so the noise scale 1/epsilon stays finite. */
export const MIN_EPSILON = 0.1;
export const MAX_EPSILON = 2;
export const EPSILON_STEP = 0.1;
/** The privacy budget, in units of epsilon, illustrative. */
export const BUDGET = 10;
/** Most answers the scene keeps (the budget ends it sooner at all but the smallest epsilon). */
export const MAX_ANSWERS = 120;
export const NOISE_SEED = 28;

/** The sensitivity of a count: one person changes it by at most one. */
export const SENSITIVITY = 1;

export const noiseScale = (epsilon: number): number => SENSITIVITY / epsilon;

/** One Laplace sample with the given scale: a random sign times an exponential with mean `scale`. */
export function laplace(rnd: Rnd, scale: number): number {
  const sign = rnd() < 0.5 ? -1 : 1;
  return sign * exponential(rnd, 1 / scale);
}

/** The noisy answer to the k-th question (0-based) asked at `epsilon`, from its own stream of the seed. */
export function answerAt(seed: number, k: number, epsilon: number, truth: number = TRUE_COUNT): number {
  return truth + laplace(mulberry32(seed * 7919 + k * 104729 + 1), noiseScale(epsilon));
}

export interface Question {
  epsilon: number;
}

export interface Answers {
  values: number[];
  /** Budget spent so far, in epsilon. */
  spent: number;
  /** The next question would overspend the budget. */
  exhausted: boolean;
}

/** Ask the questions in order; one that would overspend the budget is refused and so is everything after it. */
export function answersFor(seed: number, questions: readonly Question[], budget: number = BUDGET): Answers {
  const values: number[] = [];
  let spent = 0;
  for (const q of questions) {
    if (spent + q.epsilon > budget + 1e-9) return { values, spent, exhausted: true };
    values.push(answerAt(seed, values.length, q.epsilon));
    spent += q.epsilon;
  }
  return { values, spent, exhausted: false };
}

export const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** Whole-number bins of the answers across [lo, hi]; answers outside land in the first and last bin. */
export function histogram(values: readonly number[], lo: number, hi: number): { x0: number; x1: number; y: number }[] {
  const bins = Array.from({ length: hi - lo + 1 }, (_, i) => ({ x0: lo + i - 0.5, x1: lo + i + 0.5, y: 0 }));
  for (const v of values) bins[Math.min(bins.length - 1, Math.max(0, Math.round(v) - lo))].y++;
  return bins;
}

/** The questions asked after `count` more tries at `epsilon`: stops at the budget or at MAX_ANSWERS. */
export function ask(asked: readonly number[], epsilon: number, count: number, budget: number = BUDGET): number[] {
  const out = [...asked];
  let spent = out.reduce((a, b) => a + b, 0);
  for (let i = 0; i < count && out.length < MAX_ANSWERS && spent + epsilon <= budget + 1e-9; i++) {
    out.push(epsilon);
    spent += epsilon;
  }
  return out;
}
