import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { findEnding, findNode, ledger, type Scenario, type Walk } from '../../core/scenario';
import {
  ACK_MIN, ACTION_SHORT, CAUSE_LABEL, DETECT_MIN, FAILED, MINUTES, TRAFFIC, TRUST, choiceIdsOf, failedBy, rateAt, timelineOf,
  type Action, type Cause, type OutcomeRow, type Timeline,
} from './model';

const fmt = (n: number) => n.toLocaleString('en-US');

/** Scene 1: the decision in front of the learner, or the ending with what it cost, all read from the walk. */
export function responseCaption(s: Scenario, cause: Cause, w: Walk): ReactNode {
  const ending = findEnding(s, w.at);
  if (ending) {
    const tl = timelineOf(cause, choiceIdsOf(w));
    const where = tl.resolvedAt !== null ? `The errors were gone at minute ${tl.resolvedAt}` : tl.mitigatedAt !== null ? `You cut the errors at minute ${tl.mitigatedAt} and left some failing` : 'The errors were never reduced';
    return (
      <>
        <b>{ending.title}.</b> {where}, after {fmt(w.meters[FAILED])} failed requests; customer trust ended at {w.meters[TRUST]}.
      </>
    );
  }
  const node = findNode(s, w.at)!;
  const rows = ledger(s, w);
  const last = rows[rows.length - 1];
  return last ? (
    <>
      You chose <b>&quot;{last.choice.label}&quot;</b>. {last.choice.because} Now at minute {w.meters[MINUTES]} with {fmt(w.meters[FAILED])} failed requests: {node.prompt}
    </>
  ) : (
    <>{node.prompt}</>
  );
}

const startOf = (tl: Timeline, t: number) => tl.segments.find((s) => s.start === t);
const endOf = (tl: Timeline, t: number) => tl.segments.find((s) => s.end === t);

/** Scene 2: what has happened by minute `t`, with the failed requests so far from the timeline. */
export function momentCaption(tl: Timeline, t: number): ReactNode {
  const failed = fmt(failedBy(tl, t));
  if (t === DETECT_MIN) return <>Minute {t}: the symptom alert fires. Users have been failing for {plural(t, 'minute')} already: {failed} failed requests.</>;
  if (t === ACK_MIN) return <>Minute {t}: the on-call acknowledges the page, {plural(ACK_MIN - DETECT_MIN, 'minute')} after it fired. {failed} requests have failed.</>;
  const ended = endOf(tl, t);
  if (ended) {
    const what = ended.kind === 'delay' ? 'The conflicting actions are sorted out' : ended.kind === 'escalate' ? 'The hand-off is done' : `${ACTION_SHORT[ended.kind]} ${ended.kind === 'investigate' ? 'reports' : 'takes effect'}`;
    const result = ended.outcome === 'fixed' ? 'errors drop to 0' : ended.outcome === 'partial' ? `errors drop from ${ended.rateBefore} to ${ended.rateAfter} per ${fmt(TRAFFIC)}` : ended.outcome === 'nothing' ? `it changes nothing: still ${ended.rateAfter} per ${fmt(TRAFFIC)}` : null;
    return <>Minute {t}: {what}{result ? `: ${result}` : ''}. {failed} requests have failed.</>;
  }
  const started = startOf(tl, t);
  if (started) return <>Minute {t}: {started.kind === 'escalate' ? 'handing the rest over' : started.kind === 'delay' ? 'two responders collide' : `starting: ${ACTION_SHORT[started.kind]}`}. {failed} requests have failed so far.</>;
  return <>Minute {t}: {rateAt(tl, t)} of every {fmt(TRAFFIC)} requests are failing. {failed} so far.</>;
}

/** Scene 2's first and last frames. */
export const replayIntro = (tl: Timeline): ReactNode => (
  <>Minute 0: a deploy finishes and {rateAt(tl, 0)} of every {fmt(TRAFFIC)} checkout requests start failing. Nobody knows yet.</>
);

export function replaySummary(tl: Timeline): ReactNode {
  return (
    <>
      Minute {tl.end}: {fmt(failedBy(tl, tl.end))} requests failed in all. Detected at minute {DETECT_MIN}, acknowledged at minute {ACK_MIN},{' '}
      {tl.mitigatedAt === null ? 'never mitigated' : `mitigated at minute ${tl.mitigatedAt}`}, {tl.resolvedAt === null ? 'not resolved' : `resolved at minute ${tl.resolvedAt}`}.
    </>
  );
}

/** Scene 3: the best and worst first action for the chosen cause, read from the sorted table. */
export function outcomeCaption(rows: readonly OutcomeRow[], cause: Cause, mine: Action | null): ReactNode {
  const forCause = rows.filter((r) => r.cause === cause).sort((a, b) => a.failed - b.failed);
  const best = forCause[0];
  const worst = forCause[forCause.length - 1];
  const yours = mine ? forCause.find((r) => r.first === mine) : undefined;
  return (
    <>
      For <b>{CAUSE_LABEL[cause].toLowerCase()}</b> the best first action is to {ACTION_SHORT[best.first]}: {fmt(best.failed)} failed requests. The worst is to {ACTION_SHORT[worst.first]}: {fmt(worst.failed)}, which is{' '}
      {fmt(worst.failed - best.failed)} more.{yours && yours !== best && <> Your own first move, to {ACTION_SHORT[yours.first]}, cost {fmt(yours.failed - best.failed)} more than the best.</>}
      {yours === best && <> Your own first move was the best one.</>}
    </>
  );
}
