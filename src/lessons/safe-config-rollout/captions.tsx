import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { FLEET, GATE_THRESHOLD, HUMAN_DETECT_MIN, REGIONS, TIMEOUT_RANGE, statusAt, type Change, type Plan, type Result } from './model';

const fmt = (n: number) => n.toLocaleString('en-US');

/** How many servers are failing at minute `now`. */
export const failingAt = (r: Result, now: number): number => Array.from({ length: FLEET }, (_, s) => statusAt(r, s, now)).filter((x) => x === 'failing').length;
const reachedAt = (r: Result, now: number): number => Array.from({ length: FLEET }, (_, s) => statusAt(r, s, now)).filter((x) => x !== 'unreached').length;

/** The sentence about whether staging helped, computed from the plan and what happened. */
function stagingVerdict(c: Change, plan: Plan, r: Result): ReactNode {
  if (plan.stages.length < 2) return null;
  if (r.reached > plan.stages[0] && c.delay > plan.bake && r.detectedBy !== 'gate') {
    return <> Each bake ({plan.bake} min) is shorter than the {c.delay} minutes this change takes to show itself, so staging only helps if each bake is longer than the change takes to show itself: all {r.reached} servers that were going to get it had it before the gate could see a problem.</>;
  }
  if (r.detectedBy === 'gate' && r.reached < FLEET) return <> The gate stopped the rollout after {plural(r.reached, 'server')}, so {FLEET - r.reached} never received it.</>;
  return null;
}

/** The whole outcome, said at the last frame and in the stats. */
export function summaryCaption(c: Change, plan: Plan, r: Result, staged: boolean): ReactNode {
  if (r.refused) {
    return <>Validation refused it: {c.what}, and the schema allows {fmt(TIMEOUT_RANGE.min)} to {fmt(TIMEOUT_RANGE.max)}. Nothing shipped and no server was touched: a refusal is not an outage.</>;
  }
  if (r.detectedAt === null) return <>No server fails with this change, so nothing is rolled back and the blast radius is 0 server-minutes.</>;
  const by = r.detectedBy === 'gate' ? `the health gate saw it at minute ${r.detectedAt}` : `a person noticed at minute ${r.detectedAt}`;
  return (
    <>
      <b>{fmt(r.serverMinutes)} server-minutes affected</b>: {plural(r.reached, 'server')} got the change, {r.peakFailing} failed at most, {by}, and the rollback finished at minute {r.revertAt}.
      {staged && stagingVerdict(c, plan, r)}
    </>
  );
}

/** A frame at minute `now`: what has landed, what is failing, and the event at this minute if there is one. */
export function momentCaption(c: Change, plan: Plan, r: Result, now: number, staged: boolean): ReactNode {
  if (r.refused) return summaryCaption(c, plan, r, staged);
  const failing = failingAt(r, now);
  const reached = reachedAt(r, now);
  const stage = r.stages.find((s) => s.start === now);
  const status = <>{plural(reached, 'server')} {reached === 1 ? 'has' : 'have'} the change, {failing} failing.</>;
  if (r.revertAt !== null && now >= r.revertAt) return <>Minute {now}: the rollback is complete and no server runs the change. {status}</>;
  if (r.detectedAt !== null && now === r.detectedAt) {
    return r.detectedBy === 'gate' ? (
      <>Minute {now}: the gate sees more than {Math.round(GATE_THRESHOLD * 100)}% of the reached servers failing, stops the rollout and starts the rollback. {status}</>
    ) : (
      <>Minute {now}: a person notices, {HUMAN_DETECT_MIN} minutes after the first failure, and starts the rollback. {status}</>
    );
  }
  if (stage) return <>Minute {now}: {staged ? `stage ${r.stages.indexOf(stage) + 1} lands` : 'the push lands everywhere'}, {plural(stage.size, 'server')} in all. {status}</>;
  if (failing > 0 && Array.from({ length: FLEET }, (_, s) => r.failAt[s]).some((f) => f === now)) return <>Minute {now}: servers start failing. {status}</>;
  return <>Minute {now}: {status}</>;
}

/** Scene 3: how the stages line up against each region's peak window. */
export function scheduleCaption(plan: Plan, r: Result, inPeak: { stage: number; region: number }[]): ReactNode {
  if (r.refused) return <>Validation refused the change, so there is no schedule: nothing ships.</>;
  const first = inPeak[0];
  return (
    <>
      {plural(r.stages.length, 'stage')} of {plan.bake} minutes each, reaching {plural(r.reached, 'server')}.
      {first ? (
        <> {plural(inPeak.length, 'stage landing')} inside a region’s peak window, for example stage {first.stage + 1} on {REGIONS[first.region]}: a riskier time to ship, as a common practice, though this model does not simulate load.</>
      ) : (
        <> No stage lands inside a region’s peak window at this start time.</>
      )}
    </>
  );
}
