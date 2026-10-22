/**
 * A synthetic lending-style data set in two NEUTRAL groups (A and B), and the fairness criteria computed on it for
 * real. Everything is invented and seeded: no real group, product or data set is described. A transparent scorer
 * (logistic regression by gradient descent from core/fit) turns a score into a probability of repaying.
 */
import { normal } from '../../core/distributions';
import { gradientStep, sigmoid } from '../../core/fit';
import { mulberry32, type Rnd } from '../../core/random';
import { classificationMetrics, confusionAt, type Confusion } from '../../core/stats';

export const N_TOTAL = 2000;
export const MIN_GROUP = 100;
export const RATE_A = 0.7;
export const GROUPS = ['A', 'B'] as const;
export type Group = 0 | 1;

export interface Params {
  /** Applicants in group B; group A gets the rest of N_TOTAL. */
  nB: number;
  /** How much lower group B's repay rate is than A's (0.7). */
  gap: number;
  /** How far B's scores sit below A's for the same outcome, in score units. */
  shift: number;
  /** Distance between the mean score of those who repay and those who do not. 1.2 is an imperfect scorer. */
  separation: number;
  /** How strongly a second feature reveals the group (0 is pure noise). */
  proxy: number;
  seed: number;
}

export const DEFAULT: Params = { nB: 800, gap: 0.2, shift: 0.5, separation: 1.2, proxy: 0, seed: 3 };
export const RANGES = {
  nB: { min: MIN_GROUP, max: N_TOTAL - MIN_GROUP, step: 50 },
  gap: { min: 0, max: 0.4, step: 0.05 },
  shift: { min: 0, max: 1, step: 0.1 },
  proxy: { min: 0, max: 3, step: 0.5 },
};

export interface Row {
  group: Group;
  /** 1 if the applicant repaid. */
  repaid: 0 | 1;
  score: number;
  /** A second feature: the group scaled by `proxy`, plus noise. */
  proxy: number;
}

export function generate(p: Params, n = N_TOTAL): Row[] {
  const rnd: Rnd = mulberry32(p.seed);
  const nB = Math.round((n * p.nB) / N_TOTAL);
  return Array.from({ length: n }, (_, i) => {
    const group: Group = i < n - nB ? 0 : 1;
    const rate = group === 0 ? RATE_A : RATE_A - p.gap;
    const repaid: 0 | 1 = rnd() < rate ? 1 : 0;
    const score = (repaid ? p.separation / 2 : -p.separation / 2) - (group === 1 ? p.shift : 0) + normal(rnd);
    return { group, repaid, score, proxy: p.proxy * group + 0.5 * normal(rnd) };
  });
}

// ---------------------------------------------------------------- the scorer

export type Features = 'score' | 'aware' | 'unaware';

/** Which columns each model sees: the score; score and group; score and the proxy (the group column dropped). */
export const featuresOf = (row: Row, f: Features): number[] =>
  f === 'score' ? [row.score] : f === 'aware' ? [row.score, row.group] : [row.score, row.proxy];

export const FIT = { steps: 600, rate: 0.8 };

const linear = (params: readonly number[], x: readonly number[]) => params[0] + x.reduce((s, v, i) => s + params[i + 1] * v, 0);

/** Weighted mean log-loss gradient for p = sigmoid(b + w x), params [b, ...w]. */
export function weightedGradient(params: readonly number[], xs: readonly number[][], ys: readonly number[], ws: readonly number[]): number[] {
  const g = params.map(() => 0);
  let total = 0;
  xs.forEach((x, k) => {
    const err = (sigmoid(linear(params, x)) - ys[k]) * ws[k];
    total += ws[k];
    g[0] += err;
    x.forEach((v, i) => (g[i + 1] += err * v));
  });
  return g.map((v) => v / total);
}

/** Mean weighted log-loss, the function weightedGradient is the gradient of. */
export function weightedLoss(params: readonly number[], xs: readonly number[][], ys: readonly number[], ws: readonly number[]): number {
  let loss = 0;
  let total = 0;
  xs.forEach((x, k) => {
    const p = Math.min(1 - 1e-12, Math.max(1e-12, sigmoid(linear(params, x))));
    loss += -ws[k] * (ys[k] * Math.log(p) + (1 - ys[k]) * Math.log(1 - p));
    total += ws[k];
  });
  return loss / total;
}

export interface Model {
  features: Features;
  params: number[];
}

/** Gradient descent from zeros: the same rows give the same model every time. */
export function fitModel(rows: readonly Row[], features: Features, labels: readonly number[] = rows.map((r) => r.repaid), weights?: readonly number[]): Model {
  const xs = rows.map((r) => featuresOf(r, features));
  const ws = weights ?? rows.map(() => 1);
  let params = new Array<number>(xs[0].length + 1).fill(0);
  for (let i = 0; i < FIT.steps; i++) params = gradientStep(params, weightedGradient(params, xs, labels, ws), FIT.rate);
  return { features, params };
}

export const predict = (m: Model, rows: readonly Row[]): number[] => rows.map((r) => sigmoid(linear(m.params, featuresOf(r, m.features))));

/** Reweighing (Kamiran and Calders, from memory): weight (group, outcome) by P(group) P(outcome) / P(group, outcome). */
export function reweighingWeights(rows: readonly Row[]): number[] {
  const n = rows.length;
  const count = (g: Group, y: 0 | 1) => rows.filter((r) => r.group === g && r.repaid === y).length;
  const gShare = (g: Group) => rows.filter((r) => r.group === g).length / n;
  const yShare = (y: 0 | 1) => rows.filter((r) => r.repaid === y).length / n;
  return rows.map((r) => (gShare(r.group) * yShare(r.repaid)) / (count(r.group, r.repaid) / n));
}

// ---------------------------------------------------------------- criteria

export interface GroupStats {
  group: Group;
  n: number;
  positives: number;
  confusion: Confusion;
  /** Share approved. */
  selection: number;
  tpr: number;
  fpr: number;
  precision: number;
  accuracy: number;
}

export function groupStats(rows: readonly Row[], probs: readonly number[], threshold: number, group: Group): GroupStats {
  const idx = rows.map((_, i) => i).filter((i) => rows[i].group === group);
  const examples = idx.map((i) => ({ score: probs[i], label: rows[i].repaid }));
  const c = confusionAt(examples, threshold);
  const m = classificationMetrics(c);
  const n = idx.length;
  return { group, n, positives: c.tp + c.fn, confusion: c, selection: n ? (c.tp + c.fp) / n : NaN, tpr: m.recall, fpr: m.fpr, precision: m.precision, accuracy: m.accuracy };
}

export type Criterion = 'selection' | 'tpr' | 'fpr' | 'precision';
export const CRITERIA: { id: Criterion; label: string; name: string }[] = [
  { id: 'selection', label: 'Selection rate', name: 'demographic parity' },
  { id: 'tpr', label: 'True-positive rate', name: 'equal opportunity' },
  { id: 'fpr', label: 'False-positive rate', name: 'with the true-positive rate, equalised odds' },
  { id: 'precision', label: 'Precision', name: 'predictive parity' },
];
/** Two rates are called equal when they differ by no more than this: a chosen tolerance, not a statistical test (the sampling noise of a gap between two rates at about 1,000 per group is roughly 1.5 to 3 points). */
export const HOLD_TOLERANCE = 0.03;

export type Gaps = Record<Criterion, number>;

/** Absolute gap between the groups on each rate; NaN when either side is undefined. */
export const gapsOf = (a: GroupStats, b: GroupStats): Gaps => ({
  selection: Math.abs(a.selection - b.selection),
  tpr: Math.abs(a.tpr - b.tpr),
  fpr: Math.abs(a.fpr - b.fpr),
  precision: Math.abs(a.precision - b.precision),
});

export const holds = (gap: number): boolean => !Number.isNaN(gap) && gap <= HOLD_TOLERANCE;

export interface Bin {
  lo: number;
  hi: number;
  n: number;
  meanPredicted: number;
  observed: number;
}

export const BINS = 10;

/** Reliability: within each probability bin, the mean predicted chance against the share who repaid. */
export function reliability(rows: readonly Row[], probs: readonly number[], group: Group, bins = BINS): Bin[] {
  return Array.from({ length: bins }, (_, b) => {
    const lo = b / bins;
    const hi = (b + 1) / bins;
    const idx = rows.map((_, i) => i).filter((i) => rows[i].group === group && probs[i] >= lo && (probs[i] < hi || (b === bins - 1 && probs[i] <= hi)));
    const n = idx.length;
    return {
      lo, hi, n,
      meanPredicted: n ? idx.reduce((s, i) => s + probs[i], 0) / n : NaN,
      observed: n ? idx.reduce((s, i) => s + rows[i].repaid, 0) / n : NaN,
    };
  });
}

/** Calibration error of a group: the bins' gaps between predicted and observed repay rate, weighted by bin size. */
export function calibrationError(rows: readonly Row[], probs: readonly number[], group: Group): number {
  const bins = reliability(rows, probs, group);
  const n = bins.reduce((s, b) => s + b.n, 0);
  return bins.reduce((s, b) => s + (b.n ? b.n * Math.abs(b.meanPredicted - b.observed) : 0), 0) / n;
}

/**
 * How much calibration error sampling noise alone would produce for this group and these bin sizes, if the scorer were
 * perfectly calibrated: in each bin the observed repay rate is a sum of independent yes/no outcomes, so it wanders around
 * the predicted rate by a standard deviation of sqrt(sum p(1-p)) / n, and the mean absolute wander of a normal is that
 * times sqrt(2/pi). Weighted by bin size like `calibrationError`.
 */
export function calibrationNoise(rows: readonly Row[], probs: readonly number[], group: Group, bins = BINS): number {
  let total = 0;
  let n = 0;
  for (let b = 0; b < bins; b++) {
    const lo = b / bins;
    const hi = (b + 1) / bins;
    let count = 0;
    let variance = 0;
    rows.forEach((r, i) => {
      if (r.group === group && probs[i] >= lo && (probs[i] < hi || (b === bins - 1 && probs[i] <= hi))) {
        count++;
        variance += probs[i] * (1 - probs[i]);
      }
    });
    if (count) total += Math.sqrt(variance) * Math.sqrt(2 / Math.PI);
    n += count;
  }
  return n ? total / n : NaN;
}

/** Calibration is called out of line when the error is this many times what noise alone gives. */
export const CALIBRATION_MARGIN = 1.5;

export interface CalibrationCheck {
  /** Calibration error of each group, and the error sampling noise alone would give at that group size. */
  error: [number, number];
  noise: [number, number];
  holds: boolean;
}

/** Calibration within groups, judged against the noise level of the bins rather than a fixed number of points. */
export function calibrationCheck(rows: readonly Row[], probs: readonly number[]): CalibrationCheck {
  const error: [number, number] = [calibrationError(rows, probs, 0), calibrationError(rows, probs, 1)];
  const noise: [number, number] = [calibrationNoise(rows, probs, 0), calibrationNoise(rows, probs, 1)];
  return { error, noise, holds: error.every((e, g) => e <= CALIBRATION_MARGIN * noise[g]) };
}

/** The accuracy over everyone at one threshold per group. */
export function overallAccuracy(rows: readonly Row[], probs: readonly number[], thresholds: readonly [number, number]): number {
  return rows.reduce((s, r, i) => s + ((probs[i] >= thresholds[r.group] ? 1 : 0) === r.repaid ? 1 : 0), 0) / rows.length;
}

// ---------------------------------------------------------------- the grid of group thresholds

export const GRID_STEP = 0.025;
export const GRID = Array.from({ length: Math.round(1 / GRID_STEP) + 1 }, (_, i) => Math.round(i * GRID_STEP * 1000) / 1000);

export interface PairGaps {
  tA: number;
  tB: number;
  gaps: Gaps;
  tprA: number;
  tprB: number;
}

/** Pairs worth comparing: each group approves at least this share of its creditworthy applicants. Near the top of the range nobody is approved and every precision tends to 1. */
export const MEANINGFUL_TPR = 0.5;
export const isMeaningful = (p: PairGaps): boolean => p.tprA >= MEANINGFUL_TPR && p.tprB >= MEANINGFUL_TPR;

/** Every pair of group thresholds on the grid with its gaps. */
export function thresholdGrid(rows: readonly Row[], probs: readonly number[]): PairGaps[] {
  const a = GRID.map((t) => groupStats(rows, probs, t, 0));
  const b = GRID.map((t) => groupStats(rows, probs, t, 1));
  return a.flatMap((sa, i) => b.map((sb, j) => ({ tA: GRID[i], tB: GRID[j], gaps: gapsOf(sa, sb), tprA: sa.tpr, tprB: sb.tpr })));
}

/** How close any worthwhile pair gets to making TPR, FPR and precision all equal: the smallest largest-gap, over meaningful pairs where all are defined. */
export function smallestWorstGap(grid: readonly PairGaps[]): number {
  return Math.min(...grid.filter(isMeaningful).map((p) => Math.max(p.gaps.tpr, p.gaps.fpr, p.gaps.precision)).filter((v) => !Number.isNaN(v)));
}

/** The group-B threshold that brings one criterion closest to equal, given group A's threshold; candidates are the grid. Null when the criterion is undefined at every candidate (for example precision when group A approves nobody). */
export function equaliseB(rows: readonly Row[], probs: readonly number[], tA: number, criterion: Criterion): number | null {
  const a = groupStats(rows, probs, tA, 0);
  let best: number | null = null;
  let bestGap = Infinity;
  for (const t of GRID) {
    const gap = gapsOf(a, groupStats(rows, probs, t, 1))[criterion];
    if (!Number.isNaN(gap) && gap < bestGap) [best, bestGap] = [t, gap];
  }
  return best;
}

/** Finer search for scene 3: every distinct probability in group B is a candidate threshold, so the gap is as small as the data allows. */
export function equaliseBExact(rows: readonly Row[], probs: readonly number[], tA: number, criterion: 'selection' | 'tpr'): number {
  const a = groupStats(rows, probs, tA, 0);
  const candidates = [...new Set(rows.map((_, i) => i).filter((i) => rows[i].group === 1).map((i) => probs[i]))].sort((x, y) => x - y);
  let best = candidates[0];
  let bestGap = Infinity;
  for (const t of candidates) {
    const gap = gapsOf(a, groupStats(rows, probs, t, 1))[criterion];
    if (gap < bestGap) [best, bestGap] = [t, gap];
  }
  return best;
}
