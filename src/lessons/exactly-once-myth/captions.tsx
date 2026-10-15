import type { ReactNode } from 'react';
import { pctText } from '../distributions/fmt';
import type { Counters, DeliveryMode } from './delivery';
import { CRASH_LABEL, type CrashPoint, type DedupeDesign, type Outcome as DedupeOutcome } from './dedupe';
import { pBoth, pDisagree, pNobody, type Outcome } from './generals';

const OUTCOME_TEXT: Record<Outcome, ReactNode> = {
  both: <span className="hl ok">both generals attack</span>,
  disagree: <span className="hl bad">only one general attacks</span>,
  nobody: <span className="hl dim">nobody attacks</span>,
};

/** Scene 1: the closed forms for the chosen depth and capture chance, and what this seeded run did. */
export function generalsCaption(a: { k: number; p: number; outcome: Outcome; seed: number }): ReactNode {
  if (a.p === 0) return <>A perfect link needs no protocol, and no real link is perfect. With p = 0 every messenger arrives and {OUTCOME_TEXT.both} at any depth.</>;
  const nobody = pNobody(a.k, a.p);
  return (
    <>
      Depth {a.k} with p = {a.p}: the generals disagree with probability p(1 − p)^{a.k - 1} = {pctText(pDisagree(a.k, a.p), 2)}, both attack with (1 − p)^{a.k} = {pctText(pBoth(a.k, a.p), 2)}, and
      nobody attacks the other {pctText(nobody, 2)}. Seed {a.seed} ran this way: {OUTCOME_TEXT[a.outcome]}.
      {a.p === 1 && a.k >= 2 ? ' Every messenger is captured, so nobody attacks.' : ''} Of the 2^{a.k} delivery patterns exactly one, everything delivered except the last message, leaves the generals disagreeing.
    </>
  );
}

const MODE_TEXT: Record<DeliveryMode, string> = {
  'at-most-once': 'sends once and forgets',
  'at-least-once': 'retries until it hears an ack',
  'exactly-once': 'retries, and confirms every ack',
};

/** Scene 2: the counters of one run. */
export function deliveryCaption(a: { mode: DeliveryMode; loss: number; seed: number; c: Counters; messages: number }): ReactNode {
  const { c } = a;
  return (
    <>
      The broker {MODE_TEXT[a.mode]}; the link loses {pctText(a.loss, 0)} of messages, seed {a.seed}. It sent {c.sent} deliveries, {c.delivered} arrived, so {a.messages} messages were processed {c.duplicates === 0 ? 'once each' : `${a.messages + c.duplicates} times in all`}:{' '}
      {c.duplicates > 0 ? <span className="hl orange wrap">{c.duplicates} duplicate {c.duplicates === 1 ? 'processing' : 'processings'}</span> : <span className="hl ok">no duplicates</span>},{' '}
      {c.lost > 0 ? <span className="hl bad">{c.lost} {c.lost === 1 ? 'message' : 'messages'} lost</span> : <span className="hl ok">nothing lost</span>}.
    </>
  );
}

/** Scene 3: one crash point against one design. */
export function dedupeCaption(a: { design: DedupeDesign; point: CrashPoint; outcome: DedupeOutcome }): ReactNode {
  const twice = a.outcome.applied > 1;
  return (
    <>
      Crash {CRASH_LABEL[a.point]}, id recorded {a.design === 'atomic' ? 'in the same step as the effect' : 'in a step of its own'}: the effect was applied{' '}
      <span className={`hl ${twice ? 'bad' : 'ok'}`}>{a.outcome.applied} {a.outcome.applied === 1 ? 'time' : 'times'}</span> and the balance ended at {a.outcome.balance}.{' '}
      {twice ? 'The retry found no recorded id, so it applied the effect again.' : a.design === 'atomic' && a.point === 'gap' ? 'The effect and the id are one step, so there is no gap to fall into.' : 'The retry either found the id or found nothing applied.'}
    </>
  );
}
