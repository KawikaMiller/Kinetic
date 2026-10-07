import type { ReactNode } from 'react';
import { NA, pct } from '../../core/format';
import { classificationMetrics } from '../../core/stats';
import { NONE, cheapest, positiveRate, weighted, type Costs, type Example } from './model';

const fmt = (n: number) => n.toLocaleString('en-US');
/** A metric that may be undefined (0/0): '–', never 0 or NaN. */
export const metric = (v: number) => (Number.isNaN(v) ? NA : pct(v, 1));
export const thresholdText = (t: number) => (t >= NONE ? 'above every score' : t.toFixed(3));

/** What the current threshold does, every number from the counts. */
export function thresholdCaption(examples: readonly Example[], t: number, k: number): ReactNode {
  const c = weighted(examples, t, k);
  const m = classificationMetrics(c);
  const flagged = c.tp + c.fp;
  const per = k > 1 ? <> (each drawn negative stands for {k}, so {c.fp / k} false-alarm dots count {fmt(c.fp)})</> : null;
  if (!flagged) {
    return <>Threshold {thresholdText(t)}: nothing is predicted positive, so precision is undefined ({NA}), recall is 0 and accuracy is{' '}
      {metric(m.accuracy)}. Lower the threshold to start catching positives.</>;
  }
  return <>Threshold {thresholdText(t)}: {fmt(flagged)} predicted positive. {c.tp} of {c.tp + c.fn} real positives caught (recall{' '}
    <span className="hl">{metric(m.recall)}</span>), {fmt(c.fp)} false alarms{per}, so precision is <span className="hl">{metric(m.precision)}</span>.
    {' '}Raising the threshold can only lower recall; precision usually rises, but not always.</>;
}

/** The accuracy paradox at the chosen class mix. */
export function imbalanceCaption(examples: readonly Example[], t: number, k: number): ReactNode {
  const rate = positiveRate(k);
  const never = classificationMetrics(weighted(examples, NONE, k));
  const now = classificationMetrics(weighted(examples, t, k));
  return <>{pct(rate, 0)} positives: "always say negative" scores <span className="hl bad">{metric(never.accuracy)}</span> accuracy with recall 0.
    {' '}The ROC curve doesn&apos;t move, because TPR and FPR are each measured inside one class, but precision at this threshold is now{' '}
    <span className="hl">{metric(now.precision)}</span>.</>;
}

/** Where the cost-minimising threshold sits, and what it costs. */
export function costCaption(examples: readonly Example[], k: number, costs: Costs, t: number): ReactNode {
  const best = cheapest(examples, k, costs);
  const here = weighted(examples, t, k);
  const hereCost = here.fp * costs.fp + here.fn * costs.fn;
  return <>With a false alarm costing {fmt(costs.fp)} and a miss costing {fmt(costs.fn)}, the cheapest threshold is{' '}
    <span className="hl ok">{thresholdText(best.threshold)}</span> at a total of {fmt(best.cost)}.
    {' '}{hereCost === best.cost ? 'The current threshold costs the same.' : `The current threshold costs ${fmt(hereCost)}.`}</>;
}
