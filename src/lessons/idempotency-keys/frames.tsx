import type { ReactNode } from 'react';
import type { SequenceMessage } from '../../components/SequenceDiagram';
import type { Tone } from '../../core/tone';
import type { Frame } from '../../core/types';
import { BODY, REASON, TTL_H, charges, money, type Step } from './model';

export interface IkFrame extends Frame {
  /** Index of the current step; -1 before the first, steps.length for the summary. */
  at: number;
}

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
export const chargedText = (n: number) => (n === 0 ? 'not charged yet' : `charged ${times(n)}`);
const charged = (n: number) => <span className={`hl ${n > 1 ? 'bad' : 'ok'}`}>{chargedText(n)}</span>;

/** Message colour on the ladder: requests blue, a lost one red, charges green (a duplicate red), replays violet, 409/422 orange. */
export function toneOf(s: Step): Tone {
  if (s.lost && s.kind !== 'ignored') return 'bad';
  switch (s.kind) {
    case 'send': return 'info';
    case 'charged': return charges(s.server) > 1 ? 'bad' : 'ok';
    case 'respond': return 'ok';
    case 'replay': return 'violet';
    case 'reject': return 'orange';
    case 'ignored': return 'dim';
    default: return 'muted';
  }
}

export const ladder = (steps: readonly Step[]): SequenceMessage[] =>
  steps.map((s) => ({ id: s.id, from: s.from, to: s.to, label: s.label, note: s.note, lost: s.lost, tone: toneOf(s) }));

export function stepCaption(s: Step): ReactNode {
  const n = charges(s.server);
  const a = s.attempt;
  switch (s.kind) {
    case 'send':
      return s.lost
        ? <>Attempt {a}: the request is <span className="hl bad">lost on the way</span>. The server never saw it, so nothing was charged.</>
        : <>Attempt {a}: the client sends POST /payments for {money(BODY.amount)}, {s.note?.startsWith('no') ? 'with no key' : 'with its Idempotency-Key'}.</>;
    case 'check': {
      const b = s.begin!;
      if (b.kind === 'proceed')
        return s.server.lockFirst
          ? <>A new key: the server stores it as <span className="hl">in progress</span> before doing anything, so a twin request can't slip in.</>
          : <>The key isn't in the store yet, so the server goes ahead. It will only write the key down once it has finished.</>;
      if (b.kind === 'expired-proceed')
        return <>This key is older than {TTL_H} h, so the server has forgotten it: the retry looks like <span className="hl bad">a brand-new payment</span>.</>;
      if (b.kind === 'replay') return <>The key is known and finished, so the server loads <span className="hl violet">the response it stored</span>. No new charge.</>;
      if (b.kind === 'in-progress') return <>The key is still <span className="hl">in progress</span>: the first request hasn't finished. The server won't charge in parallel.</>;
      return <>Same key, different body: the key was first used for {money(BODY.amount)}, this request asks for {money(s.body!.amount)}. A reused key with a new body is a client bug.</>;
    }
    case 'charge': return <>The server charges the card: a new ledger row.</>;
    case 'charged':
      return n > 1
        ? <>Ledger row {n}: the customer is now {charged(n)} for one payment.</>
        : <>Ledger row 1: {s.resp!.payment} is stored{s.server.keys && Object.keys(s.server.keys).length ? ', and the response saved under the key in the same transaction' : ''}.</>;
    case 'respond':
      return s.lost
        ? <>The response is <span className="hl bad">lost on the way back</span>. The card was {chargedText(n)}, but the client can't tell whether it worked.</>
        : <>{s.resp!.status} {REASON[s.resp!.status]} reaches the client. So far the customer is {charged(n)}.</>;
    case 'replay':
      return s.lost
        ? <>The stored response is sent again, and lost again. Still {charged(n)}.</>
        : <>The stored 201 ({s.resp!.payment}) <span className="hl violet">is replayed</span>: the client learns its payment worked, and it was {charged(n)}.</>;
    case 'reject':
      return s.resp!.status === 409
        ? <><span className="hl orange">409 Conflict</span>: still processing, retry later. A correct refusal, not a failure.</>
        : <><span className="hl orange">422 Unprocessable Content</span>: this key belongs to a different payment, so nothing is charged.</>;
    case 'ignored':
      return <>The first request finally finishes and answers, but the client stopped waiting for that connection. Charged: {charged(n)}.</>;
    case 'timeout':
      return <>No usable answer, so the client {s.label.includes('later') ? <>waits and retries ({s.label})</> : 'retries the same payment'}.</>;
  }
}

export function summaryCaption(steps: readonly Step[]): ReactNode {
  const end = steps[steps.length - 1].server;
  const n = charges(end);
  const settled = steps.filter((s) => s.settled).length > 0;
  return <>Done: one payment, {charged(n)}{n > 1 ? ' (the duplicate is the red ledger row)' : ''}. {settled ? 'The client ended with 201 Created.' : 'The client ended without a success response.'}</>;
}

export function buildFrames(steps: readonly Step[], intro: ReactNode): IkFrame[] {
  return [
    { at: -1, say: intro },
    ...steps.map((s, i) => ({ at: i, say: stepCaption(s), hold: s.kind === 'charged' || s.lost ? 1.4 : 1 })),
    { at: steps.length, say: summaryCaption(steps), hold: 2 },
  ];
}
