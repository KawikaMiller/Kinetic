import type { ReactNode } from 'react';
import { pctText } from '../distributions/fmt';
import type { Counters, DeliveryMode } from './delivery';
import { CRASH_LABEL, type CrashPoint, type DedupeDesign, type Outcome as DedupeOutcome } from './dedupe';
import { DEPTH, LOSS_MAX, pBoth, pDisagree, pNobody, type Outcome } from './generals';

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
      {a.p === LOSS_MAX ? ` At the slider's end, ${pctText(nobody, 2)} of the time nobody attacks.` : ''} Of the 2^{a.k} delivery patterns exactly one, everything delivered except the last message, leaves the generals disagreeing.
    </>
  );
}

/** Scene 1, under the plot: what deleting the last message does to the numbers, from the same closed form as the stats. */
export function removalNote(k: number, p: number): ReactNode {
  if (k <= DEPTH.min) return <>At depth 1 there is one message and nothing left to delete: it can be captured, so the protocol cannot be certain. This is where the argument ends.</>;
  return (
    <>
      Delete the last message of this depth-{k} protocol: depth {k - 1} disagrees {pctText(pDisagree(k - 1, p), 2)} of the time instead of {pctText(pDisagree(k, p), 2)}, and the last message might be captured anyway, so a protocol that always agreed at depth {k} would have to agree at depth {k - 1} too. Repeat down to depth 1, where it cannot.
    </>
  );
}

const MODE_TEXT: Record<DeliveryMode, string> = {
  'at-most-once': 'sends once and forgets',
  'at-least-once': 'retries until it hears an ack',
  'exactly-once': 'retries, and confirms every ack',
};

/** Scene 2: the counters of one run. */
export function deliveryCaption(a: { mode: DeliveryMode; loss: number; seed: number; c: Counters; messages: number; at: number; ended: boolean; unsure: number }): ReactNode {
  const { c } = a;
  return (
    <>
      The broker {MODE_TEXT[a.mode]}; the link loses {pctText(a.loss, 0)} of messages, seed {a.seed}, {a.ended ? 'the whole run' : `replayed to ${a.at} ms`}. It sent {c.sent} deliveries, {c.delivered} arrived, so {a.messages - c.lost} of {a.messages} published messages were processed {c.duplicates === 0 ? 'once each' : `${a.messages - c.lost + c.duplicates} times in all`}:{' '}
      {c.duplicates > 0 ? <span className="hl orange wrap">{c.duplicates} duplicate {c.duplicates === 1 ? 'processing' : 'processings'}</span> : <span className="hl ok">no duplicates</span>},{' '}
      {!a.ended ? <span className="hl">{c.lost} not processed yet</span> : c.lost > 0 ? <span className="hl bad">{c.lost} {c.lost === 1 ? 'message' : 'messages'} lost</span> : <span className="hl ok">nothing lost</span>}.
      {a.mode === 'exactly-once' ? <> The confirms add messages but not certainty: {a.unsure === 0 ? 'every processed message has its confirm in this run, yet the last confirm could have been the one the link dropped' : `${a.unsure} processed ${a.unsure === 1 ? 'message has' : 'messages have'} no confirm yet, so the consumer cannot tell whether the broker knows`}.</> : null}
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
