import type { ReactNode } from 'react';
import { pctText, sig } from '../distributions/fmt';
import {
  DB_NO_LIMIT, SLO_MS, capacity, firstCrossing, kneeLoad, latencyQuantileMs, optimised, orderByMonth, planCapacity, scaledCapacity,
  serviceOnlyP99Ms, yearFactor, type Crossing, type Plan, type Service,
} from './model';

export const rps = (x: number): string => `${sig(x)}/s`;
export const msText = (x: number): string => `${sig(x)} ms`;

export function loadCaption(s: Service, level: number): ReactNode {
  const cap = capacity(s);
  const offered = level * cap;
  const knee = kneeLoad(s, SLO_MS);
  if (knee === null) {
    return (
      <>
        Even with no queue at all, this service&apos;s own p99 is <span className="hl bad">{msText(serviceOnlyP99Ms(s))}</span>, above the {SLO_MS} ms objective, so no load meets it. Make the
        requests faster, or relax the objective.
      </>
    );
  }
  const kneeText = <>The knee, the highest load that still meets the objective, is <span className="hl">{rps(knee)}</span>, {pctText(knee / cap, 0)} of the {rps(cap)} capacity.</>;
  if (level >= 1) {
    return (
      <>
        Offered {rps(offered)} is {level === 1 ? 'exactly' : pctText(level, 0) + ' of'} capacity, so there is <span className="hl bad">no steady state</span>: the workers cannot finish more than {rps(cap)},
        the queue grows for as long as the test runs and requests start to time out. {kneeText}
      </>
    );
  }
  const p99 = latencyQuantileMs(s, offered, 0.99)!;
  const within = p99 <= SLO_MS;
  return (
    <>
      At {rps(offered)}, {pctText(level, 0)} of capacity, everything is served and the p99 is <span className={`hl ${within ? 'ok' : 'bad'}`}>{msText(p99)}</span>:{' '}
      {within ? 'within' : 'over'} the {SLO_MS} ms objective. {kneeText}
    </>
  );
}

const monthText = (m: number): string => (m === 0 ? 'now' : `month ${m}`);

export function forecastCaption(plan: Plan): ReactNode {
  const cap = planCapacity(plan);
  const crossing: Crossing = firstCrossing(plan);
  const order = orderByMonth(crossing, plan.leadWeeks);
  const head = <>The plan takes {rps(cap)} after redundancy and {pctText(plan.headroom, 0)} headroom, against a peak of {rps(plan.peak)} today. </>;
  if (crossing.month === null) {
    return <>{head}With growth of {pctText(plan.growth, 0)} a month the forecast <span className="hl ok">never crosses capacity</span>.</>;
  }
  const cause = crossing.cause === 'spike' ? 'the one-month spike gets there first' : crossing.cause === 'now' ? 'it is already over' : 'the trend gets there';
  return (
    <>
      {head}The forecast crosses it in <span className="hl bad">{monthText(crossing.month)}</span> ({cause}). With {plan.leadWeeks} weeks of lead time
      {order! < 0 ? <> the order date was <span className="hl bad">{sig(-order!)} months ago</span>.</> : <> order by <span className="hl">month {sig(order!, 2)}</span>.</>}
    </>
  );
}

export function growthNote(growth: number): ReactNode {
  return (
    <>
      {pctText(growth, 0)} a month is a factor of {sig(yearFactor(growth, 'compound'), 4)} over a year compounded
      {yearFactor(growth, 'linear') > 0 ? <>, not the {sig(yearFactor(growth, 'linear'), 4)} that adding it up gives.</> : <>; adding it up instead would pass below zero, which a load cannot do.</>}
    </>
  );
}

export function scaleCaption(base: Service, cut: number, instances: number, dbLimit: number): ReactNode {
  const faster = optimised(base, cut);
  const before = kneeLoad(base, SLO_MS) ?? 0;
  const after = kneeLoad(faster, SLO_MS);
  const total = scaledCapacity(faster, instances, dbLimit);
  const capped = dbLimit < DB_NO_LIMIT && instances * (after ?? 0) > dbLimit;
  return (
    <>
      {cut === 0 ? <>Each instance meets the objective up to {rps(before)}.</> : <>Cutting service time by {pctText(cut, 0)} lifts each instance&apos;s knee from {rps(before)} to {after === null ? 'no load at all' : rps(after)}.</>}{' '}
      {instances} {instances === 1 ? 'instance takes' : 'instances take'} <span className="hl ok">{rps(total)}</span>
      {capped ? <>: capped by the shared database at {rps(dbLimit)}, so more instances would add nothing</> : <>, scaling in step with the instance count</>}.
    </>
  );
}
