import type { ReactNode } from 'react';
import { pctText, sig } from '../distributions/fmt';
import {
  RULES, RULE_NAME, ruleDetail, ruleValue, countAbove, type CoverageRun, type FleetReport, type Interval, type Rule, type Statistic,
} from './model';

/** p written the way a person says it: 99 → "p99", 99.9 → "p99.9". */
export const pLabel = (pct: number): string => `p${Number(pct.toFixed(2))}`;

export interface RuleView {
  sorted: readonly number[];
  pct: number;
  rule: Rule;
}

export function ruleCaption({ sorted, pct, rule }: RuleView): ReactNode {
  const n = sorted.length;
  const value = ruleValue(rule, sorted, pct);
  if (value === null) return <>No samples yet, so there is no {pLabel(pct)} to read.</>;
  const others = RULES.filter((r) => r !== rule).map((r) => ({ rule: r, value: ruleValue(r, sorted, pct)! }));
  const agree = others.every((o) => o.value === value);
  return (
    <>
      {pLabel(pct)} of {n.toLocaleString('en-US')} samples by <span className="hl">{RULE_NAME[rule]}</span> is <span className="hl">{sig(value, 5)}</span>{' '}
      ({ruleDetail(rule, n, pct)}); {countAbove(sorted, value)} of {n.toLocaleString('en-US')} samples lie above it.{' '}
      {agree
        ? 'The other two rules give the same value here.'
        : <>The other two give {others.map((o) => `${sig(o.value, 5)} (${RULE_NAME[o.rule]})`).join(' and ')}.</>}
    </>
  );
}

export function fleetCaption(r: FleetReport): ReactNode {
  if (r.average === null || r.merged === null || r.gap === null || r.gapPct === null) {
    return <>No host has any traffic, so there is nothing to average or to merge. Give a host a share.</>;
  }
  const verdict = Math.abs(r.gapPct) <= 0.01 ? 'matches' : r.gap < 0 ? 'understates' : 'overstates';
  return (
    <>
      The average of the host p99s is <span className="hl bad">{sig(r.average)} ms</span>; the true p99 of all {r.total.toLocaleString('en-US')} requests is{' '}
      <span className="hl ok">{sig(r.merged)} ms</span>.{' '}
      {verdict === 'matches'
        ? 'Here the average lands within 1% of it, by luck rather than by any rule.'
        : <>The average {verdict} the fleet p99 by {sig(Math.abs(r.gap))} ms ({pctText(Math.abs(r.gapPct), 0)}).</>}
      {r.buckets && <> Merged buckets read {sig(r.buckets.value)} ms, in the bucket from {sig(r.buckets.lo)} to {sig(r.buckets.hi)} ms.</>}
    </>
  );
}

export interface IntervalView {
  stat: Statistic;
  n: number;
  interval: Interval | null;
  truth: number;
  expectedAbove: number;
}

const STAT_NAME: Record<Statistic, string> = { mean: 'mean', p99: 'p99' };

export function intervalCaption(v: IntervalView): ReactNode {
  const name = STAT_NAME[v.stat];
  if (v.interval === null) return <>With {v.n} sample the interval is undefined: you need at least two values to measure spread.</>;
  const { estimate, lo, hi } = v.interval;
  const covers = lo <= v.truth && v.truth <= hi;
  return (
    <>
      This sample&apos;s {name} is {sig(estimate)}, with a 95% {v.stat === 'mean' ? 't' : 'bootstrap'} interval of {sig(lo)} to {sig(hi)} (width {sig(hi - lo)}). The true{' '}
      {name} is {sig(v.truth)}: this interval <span className={`hl ${covers ? 'ok' : 'bad'}`}>{covers ? 'contains' : 'misses'}</span> it.
      {v.stat === 'p99' && <> With n = {v.n.toLocaleString('en-US')} only about {sig(v.expectedAbove, 2)} samples sit above p99.</>}
    </>
  );
}

/** How the measured coverage compares with the 95% promised: within two standard errors, below, or above. */
export function coverageVerdict(coverage: number, experiments: number): 'near' | 'short' | 'over' {
  const se = Math.sqrt((0.95 * 0.05) / experiments);
  if (Math.abs(coverage - 0.95) <= 2 * se) return 'near';
  return coverage < 0.95 ? 'short' : 'over';
}

export function coverageCaption(run: CoverageRun, stat: Statistic, n: number): ReactNode {
  const verdict = coverageVerdict(run.coverage, run.experiments);
  const says = {
    near: 'about the 95% the interval promises.',
    short: 'short of the 95% the interval promises.',
    over: 'above the 95% the interval promises.',
  }[verdict];
  return (
    <>
      Of {run.experiments.toLocaleString('en-US')} experiments at n = {n.toLocaleString('en-US')}, {run.covered.toLocaleString('en-US')} intervals contained the true{' '}
      {STAT_NAME[stat]} of {sig(run.truth)}: <span className={`hl ${verdict === 'short' ? 'bad' : 'ok'}`}>{pctText(run.coverage)}</span>, {says}
    </>
  );
}
