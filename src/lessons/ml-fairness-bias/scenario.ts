/**
 * Scene 5: an invented product team must pick the fairness criterion to report. Each branch applies the matching
 * adjustment to the scorer on this lesson's own synthetic data and reads the meters off the result; trust is an
 * invented number. No ending is marked correct, and every one lists what it gives up.
 */
import type { Ending, Meter, Node, Scenario } from '../../core/scenario';
import { GRID, DEFAULT, equaliseB, equaliseBExact, fitModel, gapsOf, generate, groupStats, predict, type Criterion, type Gaps } from './model';
import { BASE_THRESHOLD } from './options';

const rows = generate(DEFAULT);
const probs = predict(fitModel(rows, 'aware'), rows);

export interface Outcome {
  tB: number;
  /** Share of group B approved, in percent. */
  approvedB: number;
  /** Creditworthy applicants denied, across both groups. */
  deniedInError: number;
  /** Applicants who then default but were approved, across both groups. */
  defaultersApproved: number;
  gaps: Gaps;
}

function outcomeAt(tB: number): Outcome {
  const a = groupStats(rows, probs, BASE_THRESHOLD, 0);
  const b = groupStats(rows, probs, tB, 1);
  return { tB, approvedB: Math.round(b.selection * 100), deniedInError: a.confusion.fn + b.confusion.fn, defaultersApproved: a.confusion.fp + b.confusion.fp, gaps: gapsOf(a, b) };
}

/** The group-B cut-off on the grid that makes true-positive and false-positive rates closest together (equalised odds). */
function equalisedOddsThreshold(): number {
  const a = groupStats(rows, probs, BASE_THRESHOLD, 0);
  let best = GRID[0];
  let bestScore = Infinity;
  for (const t of GRID) {
    const g = gapsOf(a, groupStats(rows, probs, t, 1));
    const score = g.tpr + g.fpr;
    if (!Number.isNaN(score) && score < bestScore) [best, bestScore] = [t, score];
  }
  return best;
}

export const CHOICES = [
  { id: 'parity', criterion: 'selection' as Criterion, label: 'Report demographic parity: equal approval rates', tB: equaliseBExact(rows, probs, BASE_THRESHOLD, 'selection') },
  { id: 'opportunity', criterion: 'tpr' as Criterion, label: 'Report equal opportunity: equal approval of creditworthy applicants', tB: equaliseBExact(rows, probs, BASE_THRESHOLD, 'tpr') },
  { id: 'odds', criterion: 'fpr' as Criterion, label: 'Report equalised odds: equal rates for creditworthy and for defaulting applicants', tB: equalisedOddsThreshold() },
  { id: 'precision', criterion: 'precision' as Criterion, label: 'Report predictive parity: an approval means the same in both groups', tB: equaliseB(rows, probs, BASE_THRESHOLD, 'precision')! },
];

export const START: Outcome = outcomeAt(BASE_THRESHOLD);
export const OUTCOMES: Record<string, Outcome> = Object.fromEntries(CHOICES.map((c) => [c.id, outcomeAt(c.tB)]));

/** Invented: how the team's standing moves with how easy the metric is to explain. */
export const TRUST: Record<string, number> = { parity: 1, opportunity: 0, odds: -1, precision: 0 };

export const METER = { approved: 'approved', denied: 'denied', defaulters: 'defaulters', trust: 'trust' } as const;
export const METERS: readonly Meter[] = [
  { id: METER.approved, label: 'Group B applicants approved', start: START.approvedB, min: 0, max: 100, bad: { below: START.approvedB }, unit: '%' },
  { id: METER.denied, label: 'Creditworthy applicants denied in error', start: START.deniedInError, min: 0, max: rows.length, bad: { above: START.deniedInError } },
  { id: METER.defaulters, label: 'Defaulting applicants approved', start: START.defaultersApproved, min: 0, max: rows.length, bad: { above: START.defaultersApproved + 25 } },
  { id: METER.trust, label: 'Trust in the report', start: 5, min: 0, max: 10, bad: { below: 4 }, unit: ' of 10' },
];

const pct = (x: number) => (Number.isNaN(x) ? '–' : `${Math.round(x * 100)} points`);
const gapsText = (g: Gaps, except: Criterion) =>
  (['selection', 'tpr', 'fpr', 'precision'] as Criterion[])
    .filter((c) => c !== except)
    .map((c) => `${{ selection: 'approval rate', tpr: 'approval of creditworthy applicants', fpr: 'approval of defaulters', precision: 'precision' }[c]} ${pct(g[c])}`)
    .join(', ');

const node: Node = {
  id: 'pick',
  prompt: 'A product team has a scorer that sees the score and the group, and must say which fairness criterion it reports. The groups have different repay rates and the scorer is imperfect, so the criteria cannot all hold at once. Which do you report?',
  choices: CHOICES.map((c) => {
    const o = OUTCOMES[c.id];
    return {
      id: c.id, label: c.label, to: `end-${c.id}`,
      effects: { [METER.approved]: o.approvedB - START.approvedB, [METER.denied]: o.deniedInError - START.deniedInError, [METER.defaulters]: o.defaultersApproved - START.defaultersApproved, [METER.trust]: TRUST[c.id] },
      because: `Group B gets a cut-off of ${o.tB.toFixed(2)} against ${BASE_THRESHOLD}: ${o.approvedB}% of group B is approved (was ${START.approvedB}%) and ${o.deniedInError} creditworthy applicants are denied in error (was ${START.deniedInError}) while ${o.defaultersApproved} applicants who default are approved (was ${START.defaultersApproved}). Trust moves by an invented ${TRUST[c.id]}.`,
    };
  }),
};

const endings: Ending[] = CHOICES.map((c) => ({
  id: `end-${c.id}`,
  title: `You reported ${c.label.split(':')[0].replace('Report ', '')}`,
  text: `That criterion now holds. What it gives up, measured on the same data: ${gapsText(OUTCOMES[c.id].gaps, c.criterion)} still differ between the groups. Which gap matters most is a values and legal question, not a maths one.`,
}));

export const CHOOSE: Scenario = { start: 'pick', meters: METERS, nodes: [node], endings };

export const PROVENANCE_NOTE = 'an invented product team on synthetic data: the approval and denial counts are computed from this lesson\'s own data, and the trust effects are made-up numbers';
