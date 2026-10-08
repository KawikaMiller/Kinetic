import type { ReactNode } from 'react';
import type { SequenceActor, SequenceMessage } from '../../components/SequenceDiagram';
import type { Tone } from '../../core/tone';
import type { Frame } from '../../core/types';
import {
  PROVIDER_TIMEOUT_S, SHOWN_ATTEMPTS, TRUTH, attemptTimes, type Delivered, type FastRun, type FastStep, type Ordering, type ReceiveStep,
} from './model';
import { TOLERANCE_S, type Inspection, type Reject } from './signature';

const minutes = (s: number) => `${Math.round(s / 60)} min`;

// ── Signature ───────────────────────────────────────────────────────────

export const SIGNATURE_ACTORS: SequenceActor[] = [
  { id: 'provider', label: 'Provider' },
  { id: 'queue', label: 'Delivery queue', tone: 'info' },
  { id: 'receiver', label: 'Your endpoint' },
];

export const REJECT_TEXT: Record<Reject, string> = {
  malformed: 'malformed headers',
  'bad-signature': 'signature does not match',
  stale: 'timestamp too old',
  future: 'timestamp too far ahead',
};

/** Short forms for the ladder's notes: a long note shrinks the whole drawing on a phone. */
const SHORT_REJECT: Record<Reject, string> = { malformed: 'malformed', 'bad-signature': 'no match', stale: 'too old', future: 'too far ahead' };

export function signatureLadder(r: Inspection, edited: boolean, ageS: number): SequenceMessage[] {
  const ok = r.verdict.ok;
  return [
    { id: 's0', from: 'provider', to: 'queue', label: 'enqueue payment.succeeded', note: 'evt_1001', tone: 'info' },
    { id: 's1', from: 'queue', to: 'queue', label: 'sign timestamp.body', note: 'HMAC-SHA-256', tone: 'muted' },
    { id: 's2', from: 'queue', to: 'receiver', label: 'POST /webhooks', tone: 'info',
      note: [edited ? 'edited' : null, ageS > 0 ? `${minutes(ageS)} old` : null].filter(Boolean).join(' · ') || undefined },
    { id: 's3', from: 'receiver', to: 'receiver', label: 'verify', tone: ok ? 'ok' : 'bad', note: ok ? 'verified' : SHORT_REJECT[(r.verdict as { reason: Reject }).reason] },
    { id: 's4', from: 'receiver', to: 'queue', label: ok ? '200 OK' : '400 Bad Request', tone: ok ? 'ok' : 'bad' },
  ];
}

export function signatureCaption(r: Inspection, edited: boolean): ReactNode {
  const v = r.verdict;
  if (v.ok)
    return <><span className="hl ok">Verified</span>: the recomputed HMAC matches and the timestamp is {minutes(r.ageS!)} old (limit {minutes(TOLERANCE_S)}), so the receiver accepts and answers 200.</>;
  switch (v.reason) {
    case 'bad-signature':
      return <><span className="hl bad">Rejected</span>: the receiver's HMAC differs from the one sent in {r.differing} of 64 hex digits{edited ? <>, from a one-character edit to the body: an HMAC changes completely, not slightly</> : null}. It answers 400.</>;
    case 'stale':
      return <><span className="hl bad">Rejected as stale</span>: the signature is valid, but the timestamp is {minutes(r.ageS!)} old, past the {minutes(TOLERANCE_S)} tolerance. A recorded delivery re-sent later fails here, because the timestamp is inside the signature and can't be changed.</>;
    case 'future':
      return <><span className="hl bad">Rejected</span>: the timestamp is further ahead than the {minutes(TOLERANCE_S)} tolerance allows.</>;
    case 'malformed':
      return <><span className="hl bad">Rejected</span>: the signature or timestamp header isn't well-formed.</>;
  }
}

// ── Retries ─────────────────────────────────────────────────────────────

export const retryActors = (down: boolean): SequenceActor[] => [
  { id: 'queue', label: 'Provider queue', tone: 'info' },
  { id: 'receiver', label: down ? 'Your endpoint (down)' : 'Your endpoint', tone: down ? 'bad' : undefined, waiting: down },
];

/** The first event's attempts as a ladder: each failed attempt is lost at the down receiver, then the one that gets through. */
export function retryLadder(d: Delivered): SequenceMessage[] {
  const out: SequenceMessage[] = d.attempts.map((a, i) => ({
    id: `r${i}`, from: 'queue', to: 'receiver', label: `POST /webhooks${i ? ` (retry ${i})` : ''}`, note: `minute ${a.t}`, lost: !a.ok, tone: a.ok ? 'ok' : 'orange',
  }));
  if (d.deliveredAt !== null) out.push({ id: 'r-ok', from: 'receiver', to: 'queue', label: '200 OK', note: 'retries stop', tone: 'ok' });
  return out;
}

export function retryCaption(all: readonly Delivered[], upAt: number): ReactNode {
  const gave = all.filter((d) => d.gaveUp);
  const failedAttempts = all.reduce((n, d) => n + d.attempts.filter((a) => !a.ok).length, 0);
  const last = Math.max(...all.map((d) => d.deliveredAt ?? 0));
  if (upAt === 0) return <>The receiver is up: every event is delivered on its first attempt, so there are no retries.</>;
  return <>The receiver is <span className="hl bad">down until minute {upAt}</span>: {failedAttempts} attempts fail, and each is <span className="hl orange">retried</span> after a longer wait.{' '}
    {gave.length === 0
      ? <>Once it is back the backlog drains: all {all.length} events arrive by minute {last}.</>
      : gave.length === all.length
        ? <>It stays down past the whole schedule (the last attempt is at minute {Math.max(...all.map((d) => attemptTimes(d.event.at)[attemptTimes(d.event.at).length - 1]))}), so the provider gives up on all {all.length}: the events must be replayed some other way.</>
        : <>{all.length - gave.length} of {all.length} events arrive by minute {last}; {gave.length} run out of attempts first and are given up.</>}</>;
}

// ── Duplicates and ordering ─────────────────────────────────────────────

export interface OrderFrame extends Frame {
  /** Index of the current delivery; -1 before the first; steps.length for the summary. */
  at: number;
}

const clock = (created: number) => `09:${String(created).padStart(2, '0')}`;
const what = (s: ReceiveStep) => `${s.event.id} ${s.event.type}`;

function orderCaption(s: ReceiveStep, ordering: Ordering, dedupe: boolean): ReactNode {
  const arrives = s.duplicate ? <>{what(s)} arrives <span className="hl">again</span></>
    : s.outOfOrder ? <>{what(s)} arrives <span className="hl violet">out of order</span> (it happened at {clock(s.event.created)}, before one already seen)</>
      : <>{what(s)} arrives</>;
  const fx = s.action === 'applied' && s.effects.length ? s.effects[s.effects.length - 1] : null;
  switch (s.action) {
    case 'dropped-duplicate':
      return <>{arrives}: its id is already in the seen table, so it is <span className="hl dim">dropped</span> and nothing runs twice.</>;
    case 'ignored-stale':
      return <>{arrives}: it is not newer than the last event applied, so it is ignored{s.duplicate ? ' (a repeat is never newer, so this rule quietly drops duplicates too)' : ''}. The status stays {s.state}.</>;
    case 'no-change':
      return <>{arrives}. The receiver ignores its payload and reads the provider's current state: {TRUTH}, which it already has (this scene assumes all three events have already happened at the provider). Nothing to do{s.duplicate ? ', so the repeat is harmless' : ''}.</>;
    case 'applied': {
      const how = ordering === 'refetch' ? <>The receiver reads the provider's current state instead of trusting the payload: <b>{s.state}</b> (this scene assumes all three events have already happened at the provider)</>
        : <>Status becomes <b>{s.state}</b></>;
      return <>{arrives}{s.duplicate && !dedupe ? <>, and nothing recognises it</> : null}. {how}{fx ? <>; effect: <b>{fx}</b>{s.duplicate ? ', sent again' : ''}</> : null}.</>;
    }
  }
}

export function orderSummary(steps: readonly ReceiveStep[]): ReactNode {
  const end = steps[steps.length - 1];
  const wrong = end.state !== TRUTH;
  const repeats = end.effects.length - new Set(end.effects).size;
  return <>Done: the receiver ends at <span className={`hl ${wrong ? 'bad' : 'ok'}`}>{end.state}</span>; the provider's truth is {TRUTH}.{' '}
    {wrong ? 'A late event overwrote a newer one.' : null}
    {end.effects.length ? <> Effects run: {end.effects.join(', ')}{repeats > 0 ? <> (<span className="hl bad">{repeats} repeated</span>)</> : null}.</> : ' No effects ran.'}</>;
}

export function orderFrames(steps: readonly ReceiveStep[], opts: { ordering: Ordering; dedupe: boolean }, intro: ReactNode): OrderFrame[] {
  return [
    { at: -1, say: intro },
    ...steps.map((s, i) => ({ at: i, say: orderCaption(s, opts.ordering, opts.dedupe), hold: s.action === 'applied' ? 1.2 : 1 })),
    { at: steps.length, say: orderSummary(steps), hold: 2 },
  ];
}

// ── Respond fast ────────────────────────────────────────────────────────

export interface FastFrame extends Frame {
  at: number;
}

export const FAST_ACTORS: SequenceActor[] = [
  { id: 'queue', label: 'Provider queue', tone: 'info' },
  { id: 'receiver', label: 'Your endpoint' },
  { id: 'worker', label: 'Your worker', tone: 'violet' },
];

export function fastTone(s: FastStep): Tone {
  switch (s.kind) {
    case 'post': return s.attempt > 1 ? 'orange' : 'info';
    case 'retry': return 'orange';
    case 'enqueue': return 'violet';
    case 'reply': return 'ok';
    case 'lost-reply': return 'bad';
    case 'work': return 'muted';
  }
}

export const fastLadder = (run: FastRun): SequenceMessage[] =>
  run.steps.map((s) => ({ id: s.id, from: s.from, to: s.to, label: s.label, note: s.note, lost: s.lost, tone: fastTone(s) }));

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

function fastCaption(s: FastStep, workS: number): ReactNode {
  const runs = <span className={`hl ${s.workRuns > 1 ? 'bad' : 'ok'}`}>run {times(s.workRuns)}</span>;
  switch (s.kind) {
    case 'post': return <>{s.attempt > 1 ? <span className="hl orange">Attempt {s.attempt}</span> : 'Attempt 1'}: the provider delivers the event.</>;
    case 'enqueue': return <>The endpoint only stores the event in its own queue: milliseconds, no real work yet.</>;
    case 'work': return s.from === 'worker'
      ? <>The worker does the {workS} s of work on its own time. The provider is long gone, and the work has {runs}.</>
      : <>The endpoint does the {workS} s of work before replying. So far the work has {runs}.</>;
    case 'reply': return <><span className="hl ok">200 OK</span> {s.note}: the provider has its 2xx and stops retrying.</>;
    case 'lost-reply': return <>The work finished, but the provider hung up at {PROVIDER_TIMEOUT_S} s, so its <span className="hl bad">200 never counts</span>. The work has {runs}, yet the provider thinks the delivery failed.</>;
    case 'retry': return <>No 2xx, so the provider <span className="hl orange">retries</span>. The next attempt carries the same event.</>;
  }
}

export function fastSummary(run: FastRun, workS: number): ReactNode {
  if (run.acked)
    return <>Done: the 2xx came {run.steps.find((x) => x.kind === 'reply')!.note} on attempt {run.attempts}, and the {workS} s of work has run {times(run.workRuns)}. Retries stopped.</>;
  return <>After {run.attempts} attempts the provider still has no 2xx and keeps retrying, but the work has already run <span className="hl bad">{times(run.workRuns)}</span> for one event (the ladder shows the first {SHOWN_ATTEMPTS}). Slow work before the reply turns a timeout into duplicates.</>;
}

export function fastFrames(run: FastRun, workS: number, intro: ReactNode): FastFrame[] {
  return [
    { at: -1, say: intro },
    ...run.steps.map((s, i) => ({ at: i, say: fastCaption(s, workS), hold: s.kind === 'lost-reply' ? 1.5 : 1 })),
    { at: run.steps.length, say: fastSummary(run, workS), hold: 2 },
  ];
}
