// Pure maths for classification-metrics: weighted confusion counts at a threshold, ROC and
// precision-recall points over every distinct threshold (ties grouped), and the cost-minimising
// threshold (AUC lives in core/rocAuc). A score ≥ threshold is predicted positive.
import { twoClassScores } from '../../core/fixtures/datasets';
import { confusionAt, type Confusion } from '../../core/stats';

export type Example = { score: number; label: 0 | 1 };

/** Drawn per class: the strip always shows 30 positives and 30 negatives. */
export const PER_CLASS = 30;

/**
 * Imbalance stops: each drawn negative stands for `k` real negatives, so the positive rate is
 * exactly 1 / (1 + k): 50%, 20%, 10%, 5%, 2%, 1%. Weighting a stratified sample like this
 * changes no within-class rate (TPR, FPR), only the class mix.
 */
export const NEGATIVE_WEIGHTS = [1, 4, 9, 19, 49, 99] as const;
export const positiveRate = (k: number) => 1 / (1 + k);

export const dataset = (seed: number, separation: number): Example[] =>
  twoClassScores({ seed, positives: PER_CLASS, negatives: PER_CLASS, separation });

/** Confusion counts with every negative counted k times. */
export function weighted(examples: readonly Example[], threshold: number, k: number): Confusion {
  const c = confusionAt(examples, threshold);
  return { tp: c.tp, fn: c.fn, fp: c.fp * k, tn: c.tn * k };
}

/** Threshold that predicts nobody positive: above every possible score. Drawn at the right edge. */
export const NONE = Number.POSITIVE_INFINITY;
/** Where a threshold is drawn: NONE sits at the top of the score axis. */
export const drawnAt = (t: number) => Math.min(t, 1);

/** Every threshold that gives a different confusion matrix: each distinct score, plus NONE. Ascending. */
export function candidates(examples: readonly Example[]): number[] {
  return [...new Set(examples.map((e) => e.score)), NONE].sort((a, b) => a - b);
}

/** Arrow-key step: the next candidate threshold above (dir 1) or below (dir −1) t, or t itself at the end. */
export function stepThreshold(examples: readonly Example[], t: number, dir: 1 | -1): number {
  const c = candidates(examples);
  if (dir === 1) return c.find((v) => v > t) ?? t;
  return [...c].reverse().find((v) => v < t) ?? t;
}

export interface CurvePoint {
  threshold: number;
  fpr: number;
  tpr: number;
  /** NaN when nothing is predicted positive. */
  precision: number;
}

/**
 * One point per distinct threshold, from NONE (0, 0) down to the lowest score (1, 1). Equal
 * scores move together, so a tie between a positive and a negative is one diagonal step.
 */
export function curve(examples: readonly Example[], k: number): CurvePoint[] {
  const P = examples.filter((e) => e.label === 1).length;
  const N = examples.length - P;
  return [...candidates(examples)].reverse().map((threshold) => {
    const c = confusionAt(examples, threshold);
    const predicted = c.tp + c.fp * k;
    return { threshold, fpr: N ? c.fp / N : NaN, tpr: P ? c.tp / P : NaN, precision: predicted ? c.tp / predicted : NaN };
  });
}

/**
 * The precision-recall curve as steps: each point's precision holds from the previous recall
 * to its own. Straight lines between PR points would overstate precision, so they aren't used.
 */
export function prSteps(points: readonly CurvePoint[]): [number, number][] {
  const out: [number, number][] = [];
  let prevRecall = 0;
  for (const p of points) {
    if (Number.isNaN(p.precision)) continue;
    out.push([prevRecall, p.precision], [p.tpr, p.precision]);
    prevRecall = p.tpr;
  }
  return out;
}

export interface Costs {
  fp: number;
  fn: number;
}

export const totalCost = (c: Confusion, costs: Costs) => c.fp * costs.fp + c.fn * costs.fn;

/** The cheapest threshold among all candidates; ties go to the higher threshold (fewer positives flagged). */
export function cheapest(examples: readonly Example[], k: number, costs: Costs): { threshold: number; cost: number } {
  let best = { threshold: NONE, cost: Infinity };
  for (const t of candidates(examples)) {
    const cost = totalCost(weighted(examples, t, k), costs);
    if (cost <= best.cost) best = { threshold: t, cost };
  }
  return best;
}

export interface CostPreset {
  id: string;
  label: string;
  costs: Costs;
  /** Index into NEGATIVE_WEIGHTS. */
  imbalance: number;
  /** What one unit of each mistake stands for, for the caption. */
  fpMeans: string;
  fnMeans: string;
}

export const COST_PRESETS: readonly CostPreset[] = [
  { id: 'fraud', label: 'Fraud check', costs: { fp: 5, fn: 200 }, imbalance: 5, fpMeans: 'a manual review', fnMeans: 'a chargeback' },
  { id: 'alert', label: 'Alerting rule', costs: { fp: 1, fn: 50 }, imbalance: 4, fpMeans: 'a wasted page', fnMeans: 'a missed incident' },
  { id: 'medical', label: 'Medical screen', costs: { fp: 100, fn: 5000 }, imbalance: 3, fpMeans: 'a follow-up test', fnMeans: 'a missed case' },
];

export const MAX_COST = 1_000_000;

/** Costs are whole numbers from 0 to 1,000,000; anything else is refused and the last valid cost kept. */
export const COST_FIELD = {
  min: 0,
  max: MAX_COST,
  thousands: true,
  messages: {
    empty: 'Type a cost.',
    invalid: () => 'Use a whole number, like 50.',
    negative: "Costs can't be negative.",
    tooBig: () => 'Keep it at most 1,000,000.',
  },
};
