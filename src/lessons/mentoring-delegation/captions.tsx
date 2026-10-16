import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { findEnding, redMeters, type Scenario, type Walk } from '../../core/scenario';
import { CAPACITY_HOURS, QUEUE_WARN, TASKS, TEAM, WEEKS, type Hours, type Payback, type Run } from './model';
import { METER } from './scenario';

const joinNames = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export interface PaybackRow {
  taskId: string;
  personId: string;
  payback: Payback;
}

/** Scene 1: the eight weeks in one paragraph, every number read off the run. */
export function boardCaption(run: Run, paybacks: readonly PaybackRow[]): ReactNode {
  const last = run.weeks[run.weeks.length - 1];
  const backlog = TEAM.reduce((sum, p) => sum + last.personQueues[p.id], 0);
  const peak = Math.max(...run.weeks.map((w) => w.queue));
  const slowest = paybacks.length ? paybacks.reduce((a, b) => ((b.payback.reps ?? Infinity) > (a.payback.reps ?? Infinity) ? b : a)) : null;
  const slowTask = slowest ? TASKS.find((t) => t.id === slowest.taskId)!.label.toLowerCase() : '';
  const slowPerson = slowest ? TEAM.find((p) => p.id === slowest.personId)!.name : '';
  return (
    <>
      Over {WEEKS} weeks the team finished {run.totals.completed} tasks and {run.totals.bounced} bounced back to you; your queue ends at {plural(last.queue, 'task')}
      {peak > QUEUE_WARN ? <>, peaking at {peak}: your hours stay within {CAPACITY_HOURS} a week, so the overflow shows up as queue, not extra hours</> : null}.
      {backlog > 0 ? <> {plural(backlog, 'task')} still wait with teammates.</> : null}
      {run.totals.unstarted > 0 ? <> {plural(run.totals.unstarted, 'task')} had no assignee and never started.</> : null}
      {slowest ? (
        slowest.payback.reps === null
          ? <> Delegating {slowTask} to {slowPerson} does not pay back within {slowest.payback.perRep.length} repetitions.</>
          : <> The slowest pay-back is {slowTask} with {slowPerson}: {plural(slowest.payback.reps, 'repetition')}.</>
      ) : null}
    </>
  );
}

/** Scene 2: where the conversation stands. */
export function feedbackCaption(s: Scenario, w: Walk): ReactNode {
  const ending = findEnding(s, w.at);
  const red = redMeters(s, w.meters).map((m) => m.label.toLowerCase());
  return (
    <>
      {ending ? <>{ending.title}. </> : null}
      Clarity {w.meters[METER.clarity]}, their trust {w.meters[METER.trust]}, their ownership {w.meters[METER.ownership]} (each of 10), your hours spent {w.meters[METER.hours]}, delivered this week {w.meters[METER.delivery]}.
      {red.length ? <> In the red: {joinNames(red)}.</> : <> Nothing is in the red.</>}
    </>
  );
}

/** Scene 3: what the placement moves. */
export function matrixCaption(h: Hours, movedCount: number, total: number): ReactNode {
  return (
    <>
      {plural(movedCount, 'item')} of {total} sit on the low side of &quot;your unique contribution&quot;. That moves {h.moved} hours a week to others and returns {h.returned} to you after you keep a share for review; you keep {h.kept} hours of your own work.
      The load added to others is the {h.added} hours.
    </>
  );
}
