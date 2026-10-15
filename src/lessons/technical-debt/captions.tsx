import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { outcome, type Outcome, type Plan } from './model';
import { byInterest, byPayback, leaveIt, monthlyInterest, paybackMonths, paybackText, type Item } from './register';
import { CARDS, isArguable, matches, placed, type Placements } from './quadrant';

const whole = (v: number) => Math.round(v).toLocaleString('en-US');

/** Scene 1's caption: every number is read off the outcome that fills the stats and plots. */
export function interestCaption(plan: Plan, horizon: number, o: Outcome = outcome(plan, horizon)): ReactNode {
  const sprints = plural(horizon, 'sprint');
  const debt = <>{whole(o.finalDebt)} points of debt left against {whole(o.baselineFinalDebt)}</>;
  const rushed = plan.rush ? <> The rushing team took extra shortcuts in {o.rushedSprints} of {horizon} sprints.</> : null;
  if (plan.paydownShare === 0) {
    return (
      <>
        <b>No paydown planned</b>, so the plan and the dashed baseline are one line: {whole(o.total)} features over {sprints} and{' '}
        {whole(o.finalDebt)} points of debt at the end.{rushed}
      </>
    );
  }
  if (o.breakEven === null) {
    return (
      <>
        Within {sprints} the paydown <b>has not paid for itself</b>: {whole(o.total)} features against {whole(o.baselineTotal)} without it, with {debt}.
        Debt is not always wrong; at this interest and horizon the capacity spent costs more than the interest saved.{rushed}
      </>
    );
  }
  return (
    <>
      Paying down costs velocity first, then <b>overtakes the no-paydown plan at sprint {o.breakEven}</b>. By sprint {horizon}: {whole(o.total)} features against{' '}
      {whole(o.baselineTotal)}, with {debt}.{rushed}
    </>
  );
}

/** Scene 2's caption for the selected item and the register around it. */
export function priceCaption(items: readonly Item[], selected: Item, horizonMonths: number): ReactNode {
  const interest = monthlyInterest(selected);
  const painOrder = byInterest(items);
  const returnOrder = byPayback(items);
  const painRank = painOrder.findIndex((i) => i.id === selected.id) + 1;
  const returnRank = returnOrder.findIndex((i) => i.id === selected.id) + 1;
  if (interest === 0) {
    return (
      <>
        <b>{selected.name}</b> costs {selected.fixDays} days to fix and nobody works there, so its interest is 0 and its payback is <b>never</b>. A mess nobody touches charges nothing.
      </>
    );
  }
  return (
    <>
      <b>{selected.name}</b>: {plural(selected.touches, 'touch', 'touches')} a month at {selected.extraDays} extra {selected.extraDays === 1 ? 'day' : 'days'} each is {interest} days a month of interest. Fixing it takes {selected.fixDays} days, so it pays back in{' '}
      <b>{paybackText(paybackMonths(selected))}</b>
      {leaveIt(selected, horizonMonths) ? <> (beyond your {horizonMonths}-month horizon: leave it)</> : null}. It ranks {painRank} of {items.length} on pain and {returnRank} of {items.length} on return.
    </>
  );
}

/** The two orders disagree whenever the register's leaders differ: say who leads each. */
export function disagreement(items: readonly Item[]): { pain: Item; ret: Item; agree: boolean } {
  const pain = byInterest(items)[0];
  const ret = byPayback(items)[0];
  return { pain, ret, agree: pain.id === ret.id };
}

/** Scene 3's caption: placements so far, and the score only once the learner checks. */
export function classifyCaption(placements: Placements, checked: boolean): ReactNode {
  const n = placed(placements);
  if (!checked) return <>{n} of {CARDS.length} cards placed. Pick a box for each, then check your sorting against the lesson's key, which is one opinion.</>;
  const arguable = CARDS.filter((c) => isArguable(c) && placements[c.id] !== undefined).length;
  return (
    <>
      <b>{matches(placements)} of {n}</b> placed cards match the key, which is the lesson&apos;s opinion, not a standard.
      {arguable > 0 ? <> Arguable cards accept two boxes and show both.</> : null}
    </>
  );
}
