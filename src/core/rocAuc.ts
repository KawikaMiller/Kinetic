// K4-11 rocAuc: area under the ROC curve two independent ways, extracted from classification-metrics
// so a second lesson (feature-stores-skew) shares them. A score >= threshold is predicted positive.

export interface ScoredExample {
  score: number;
  label: 0 | 1;
}

/** One ROC point: false-positive rate on x, true-positive rate on y. */
export interface RocPoint {
  fpr: number;
  tpr: number;
}

/**
 * The ROC points over every distinct threshold, ascending in fpr: from (0, 0) (nothing predicted
 * positive) to (1, 1). Equal scores move together, so a tie between a positive and a negative is one
 * diagonal step. NaN rates when a class is empty.
 */
export function rocPoints(examples: readonly ScoredExample[]): RocPoint[] {
  const positives = examples.filter((e) => e.label === 1).length;
  const negatives = examples.length - positives;
  const scores = [...new Set(examples.map((e) => e.score))].sort((a, b) => b - a);
  const points: RocPoint[] = [{ fpr: negatives ? 0 : NaN, tpr: positives ? 0 : NaN }];
  for (const threshold of scores) {
    const tp = examples.filter((e) => e.label === 1 && e.score >= threshold).length;
    const fp = examples.filter((e) => e.label === 0 && e.score >= threshold).length;
    points.push({ fpr: negatives ? fp / negatives : NaN, tpr: positives ? tp / positives : NaN });
  }
  return points;
}

/** Area under the ROC points by the trapezoid rule. */
export function aucTrapezoid(points: readonly RocPoint[]): number {
  let area = 0;
  for (let i = 1; i < points.length; i++) area += ((points[i].fpr - points[i - 1].fpr) * (points[i].tpr + points[i - 1].tpr)) / 2;
  return area;
}

/** AUC as the Mann-Whitney count: P(random positive outscores random negative), ties half. */
export function aucPairs(examples: readonly ScoredExample[]): number {
  const pos = examples.filter((e) => e.label === 1);
  const neg = examples.filter((e) => e.label === 0);
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p.score > n.score ? 1 : p.score === n.score ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}
