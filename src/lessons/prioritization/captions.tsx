import type { ReactNode } from 'react';
import { plural, sig } from '../../core/format';
import { findEnding, redMeters, type Scenario, type Walk } from '../../core/scenario';
import { ITEMS, RULES, orderBy, valueBy, type Dependency, type Item, type Line, type RankStats, type Rule, type Swap } from './model';
import { METER } from './scenario';

const label = (id: string, items: readonly Item[] = ITEMS) => items.find((i) => i.id === id)!.label;
const joinNames = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export type Quadrant = 'quick' | 'big' | 'fill' | 'pit';
export const QUADRANT_WORD: Record<Quadrant, string> = { quick: 'quick win', big: 'big bet', fill: 'fill-in', pit: 'money pit' };
/** Split at 5 weeks of effort and 5 of impact (invented line, common practice). */
export const quadrantOf = (impact: number, effort: number): Quadrant => (impact >= 5 ? (effort < 5 ? 'quick' : 'big') : effort < 5 ? 'fill' : 'pit');

/** Scene 1: who comes first under each rule, and what each has delivered by the chosen week. */
export function planeCaption(items: readonly Item[], week: number): ReactNode {
  const first = (rule: Rule) => label(orderBy(items, rule)[0], items);
  const value = (rule: Rule) => valueBy(items, orderBy(items, rule), week);
  const best = RULES.map((r) => ({ r, v: value(r.value) })).sort((a, b) => b.v - a.v)[0];
  return (
    <>
      First in line: {first('impact')} by impact, {first('effort')} by effort, {first('ratio')} by impact over effort. By week {week} the three orders have delivered {sig(value('impact'), 3)}, {sig(value('effort'), 3)} and {sig(value('ratio'), 3)}
      {' '}units of value; the best of them is &quot;{best.r.label.toLowerCase()}&quot;. The 2 by 2 sorts items into groups, it does not give an order.
    </>
  );
}

export interface CostReading {
  yourCost: number | null;
  bestCost: number;
  broken: Dependency | null;
  swaps: readonly Swap[];
  dependencyOn: boolean;
}

/** Scene 2: the learner's order against the best one. */
export function costCaption(r: CostReading): ReactNode {
  if (r.broken) return <>This order puts {label(r.broken.after)} before {label(r.broken.before)}, which it needs first, so it is not allowed. The best allowed order costs {r.bestCost}, found by trying every allowed order.</>;
  const extra = (r.yourCost ?? 0) - r.bestCost;
  return (
    <>
      Your order costs {r.yourCost} (cost of delay times finish week, added up); the best {r.dependencyOn ? 'allowed ' : ''}order costs {r.bestCost}.{' '}
      {extra === 0 ? <>Yours is as cheap as any.</> : <>You pay {extra} extra, and {plural(r.swaps.length, 'adjacent swap')} of neighbours would remove it, one at a time.</>}
      {r.dependencyOn ? <> With the dependency on, the ratio rule alone does not give an allowed order.</> : null}
    </>
  );
}

/** Scene 3: how close the top of the ranking is. */
export function rangesCaption(stats: RankStats, top: { top: string; second: string; gap: number; close: boolean }, sigma: number): ReactNode {
  return (
    <>
      With each impact and effort spread by {sigma}, {label(top.top)} ranks first in {Math.round(stats.first[top.top] * 100)}% of runs and {label(top.second)} in {Math.round(stats.first[top.second] * 100)}%.{' '}
      {top.close ? <>These two are within noise: the order between them is not worth agonising over (one view).</> : <>The gap is {Math.round(top.gap * 100)} points, wider than noise at this spread.</>}
    </>
  );
}

/** Scene 4: what the line cuts. */
export function lineCaption(line: Line, capacity: number, chosen: number, total: number): ReactNode {
  return (
    <>
      {chosen} of {total} items fit in {plural(capacity, 'week')}: {plural(line.used, 'week')} of work, {line.value} a week of value once live.{' '}
      {line.used > capacity ? <>That is {line.used - capacity} over capacity. </> : null}
      The {total - chosen} items left out cost {line.cutCost} a week in delay: that is the price of &quot;not this quarter&quot;.
    </>
  );
}

/** Scene 5: where the conversation stands. */
export function storyCaption(s: Scenario, w: Walk): ReactNode {
  const ending = findEnding(s, w.at);
  const red = redMeters(s, w.meters).map((m) => m.label.toLowerCase());
  return (
    <>
      {ending ? <>{ending.title}. </> : null}
      Value delivered {w.meters[METER.value]}, trust {w.meters[METER.trust]} of 10, {w.meters[METER.load]} weeks committed, {plural(w.meters[METER.changed], 'committed item')} moved or dropped.
      {red.length ? <> In the red: {joinNames(red)}.</> : <> Nothing is in the red.</>}
    </>
  );
}
