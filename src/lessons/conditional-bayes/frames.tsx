import type { ReactNode } from 'react';
import { NA } from '../../core/format';
import { POPULATION, groupCounts, posterior, probText, rateText, toNumber, type Rates } from './model';

const fmt = (n: number) => n.toLocaleString('en-US');

/** The grid's own ratio TP / (TP + FP), from rounded people; NA when nobody tests positive. */
export function gridRatio(r: Rates, tests = 1): { caught: number; positives: number; text: string } {
  const c = groupCounts(r, tests);
  const positives = c.tp + c.fp;
  return { caught: c.tp, positives, text: positives ? probText(c.tp / positives) : NA };
}

/**
 * The main caption: who tests positive, how many of them really have it, from the grid
 * (rounded people) and exactly (the formula), always labelled which is which.
 */
export function bayesCaption(r: Rates, labels: { positive: string; negative: string }, tests = 1): ReactNode {
  const c = groupCounts(r, tests);
  const g = gridRatio(r, tests);
  const ratio = posterior(r, tests);
  const exact = toNumber(ratio);
  const who = tests === 1
    ? <>Of {fmt(POPULATION)} people, {fmt(c.tp + c.fn)} {c.tp + c.fn === 1 ? 'is' : 'are'} {labels.positive} ({rateText(r.prevalence)}).</>
    : <>Test {tests}: everyone here already tested positive {tests - 1} {tests === 2 ? 'time' : 'times'}, so the prior is the last posterior.</>;
  const grid = g.positives
    ? <>{fmt(g.positives)} test positive and {fmt(g.caught)} of them {g.caught === 1 ? 'is' : 'are'} really {labels.positive}: the grid gives {fmt(g.caught)}/{fmt(g.positives)} = {g.text}.</>
    : <>Nobody in the rounded grid tests positive.</>;
  // Compared exactly: 2·num against den, so 50% is never "better than a coin flip" by rounding.
  const twice = 2n * ratio.num;
  const verdict = twice < ratio.den
    ? <> Most positives are false alarms.</>
    : twice === ratio.den
      ? <> A positive is exactly a coin flip.</>
      : exact < 0.9 ? <> A positive is better than a coin flip, but far from certain.</> : <> Now a positive is strong evidence.</>;
  return <>{who} {grid} Exact: P({labels.positive} | positive) = <span className="hl">{probText(exact)}</span>.{verdict}</>;
}

export function filterCaption(r: Rates, labels: { positive: string; negative: string }, tests = 1): ReactNode {
  const g = gridRatio(r, tests);
  return <>Only the positives are left: {fmt(g.positives)} people, {fmt(g.caught)} of them really {labels.positive}. That fraction is
    P({labels.positive} | positive): {g.text} in the rounded grid, <span className="hl">{probText(toNumber(posterior(r, tests)))}</span> exactly.</>;
}
