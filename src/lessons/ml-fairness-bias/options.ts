/** Scene 3: five ways to respond to a gap, each computed on the same data, with who gains and who pays shown as numbers. */
import {
  equaliseBExact, fitModel, gapsOf, generate, groupStats, overallAccuracy, predict, reweighingWeights, type Gaps, type GroupStats, type Params, type Row,
} from './model';

export type OptionId = 'one' | 'tpr' | 'selection' | 'reweigh' | 'unaware';

/** The cut-off every option starts from. */
export const BASE_THRESHOLD = 0.5;

export interface OptionResult {
  id: OptionId;
  label: string;
  /** How it works, in a phrase. */
  how: string;
  /** Group A's and group B's thresholds on this option's probabilities. */
  thresholds: [number, number];
  a: GroupStats;
  b: GroupStats;
  gaps: Gaps;
  accuracy: number;
}

export interface Options {
  rows: Row[];
  options: OptionResult[];
}

const NAMES: Record<OptionId, { label: string; how: string }> = {
  one: { label: 'One threshold for everyone', how: 'the plain scorer, which sees the score and the group column, with the same cut-off for both groups' },
  tpr: { label: 'Group thresholds that equalise the true-positive rate', how: 'post-processing: group B gets the cut-off that matches group A\'s true-positive rate' },
  selection: { label: 'Group thresholds that equalise the selection rate', how: 'post-processing: group B gets the cut-off that approves the same share as group A' },
  reweigh: { label: 'Reweigh the training data', how: 'pre-processing: weight each group-and-outcome cell so the weighted repay rate matches across groups, then one cut-off' },
  unaware: { label: 'Drop the group column', how: '"unawareness": the model never sees the group, only the score and a second feature' },
};

function result(id: OptionId, rows: readonly Row[], probs: readonly number[], thresholds: [number, number]): OptionResult {
  const a = groupStats(rows, probs, thresholds[0], 0);
  const b = groupStats(rows, probs, thresholds[1], 1);
  return { id, ...NAMES[id], thresholds, a, b, gaps: gapsOf(a, b), accuracy: overallAccuracy(rows, probs, thresholds) };
}

export function runOptions(params: Params, t0 = BASE_THRESHOLD): Options {
  const rows = generate(params);
  const base = predict(fitModel(rows, 'aware'), rows);
  const reweighed = predict(fitModel(rows, 'aware', undefined, reweighingWeights(rows)), rows);
  const unaware = predict(fitModel(rows, 'unaware'), rows);
  return {
    rows,
    options: [
      result('one', rows, base, [t0, t0]),
      result('tpr', rows, base, [t0, equaliseBExact(rows, base, t0, 'tpr')]),
      result('selection', rows, base, [t0, equaliseBExact(rows, base, t0, 'selection')]),
      result('reweigh', rows, reweighed, [t0, t0]),
      result('unaware', rows, unaware, [t0, t0]),
    ],
  };
}

const pct = (x: number) => (Number.isNaN(x) ? '–' : `${Math.round(x * 100)}%`);

/** Who gains and who pays against the plain scorer, as numbers (never a verdict): each group's true-positive and false-positive rate before and after. */
export function whoLine(base: OptionResult, o: OptionResult): string {
  if (o.id === 'one') return 'The reference: each group meets the same cut-off, and the rates below are what it produces.';
  const move = (name: string, before: GroupStats, after: GroupStats) =>
    `${name}: creditworthy approved ${pct(before.tpr)} to ${pct(after.tpr)}, defaulters approved ${pct(before.fpr)} to ${pct(after.fpr)}`;
  return `${move('Group A', base.a, o.a)}; ${move('Group B', base.b, o.b)}.`;
}
