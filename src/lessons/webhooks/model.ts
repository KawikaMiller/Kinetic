// Webhook delivery, simulated: the provider's retry schedule, a receiver that dedupes by event id
// and handles ordering three ways, and the "ack fast, work later" timing. Pure: model.test.ts
// tests the schedule, every ordering of three events, seeded duplicate streams and the timing.
// Delivery is at least once and unordered in every scene; nothing here claims exactly-once.
import { mulberry32, shuffle } from '../../core/random';

// ── Retries ─────────────────────────────────────────────────────────────

/** Minutes the provider waits before retry 1, 2, 3, 4 (illustrative: real providers document their own). */
export const RETRY_DELAYS_MIN = [1, 5, 30, 120] as const;

/** When each attempt goes out, in minutes: the first at `createdAt`, then one per delay. */
export function attemptTimes(createdAt: number, delays: readonly number[] = RETRY_DELAYS_MIN): number[] {
  const out = [createdAt];
  for (const d of delays) out.push(out[out.length - 1] + d);
  return out;
}

export interface FeedEvent {
  id: string;
  type: string;
  /** Minutes after the first event was created. */
  at: number;
}
export const FEED: readonly FeedEvent[] = [
  { id: 'evt_1001', type: 'payment.succeeded', at: 0 },
  { id: 'evt_1002', type: 'payment.refunded', at: 3 },
  { id: 'evt_1003', type: 'payment.succeeded', at: 5 },
];

export interface Attempt {
  t: number;
  ok: boolean;
}
export interface Delivered {
  event: FeedEvent;
  attempts: Attempt[];
  /** When the receiver finally got it (an attempt that succeeded), or null. */
  deliveredAt: number | null;
  /** Every attempt failed: the provider stops retrying (it would show the failure in its dashboard). */
  gaveUp: boolean;
}

/** The receiver is down from the start until `upAt` minutes; an attempt at or after that succeeds, and the retries for that event stop. */
export function deliverAll(events: readonly FeedEvent[], upAt: number, delays: readonly number[] = RETRY_DELAYS_MIN): Delivered[] {
  return events.map((event) => {
    const attempts: Attempt[] = [];
    let deliveredAt: number | null = null;
    for (const t of attemptTimes(event.at, delays)) {
      const ok = t >= upAt;
      attempts.push({ t, ok });
      if (ok) {
        deliveredAt = t;
        break;
      }
    }
    return { event, attempts, deliveredAt, gaveUp: deliveredAt === null };
  });
}

/** The latest attempt of any event: the schedule's end. */
export const scheduleEnd = (events: readonly FeedEvent[] = FEED, delays: readonly number[] = RETRY_DELAYS_MIN) =>
  Math.max(...events.map((e) => attemptTimes(e.at, delays)[delays.length]));

export interface PolicyRow {
  answer: string;
  provider: string;
  note: string;
}
/** An example provider policy; providers differ, so the lesson shows it as a table to read, not a rule. */
export const POLICY: readonly PolicyRow[] = [
  { answer: '2xx (200, 201, 202, 204)', provider: 'Success: stops retrying', note: 'Reply 2xx as soon as the event is safely stored.' },
  { answer: '3xx', provider: 'Usually a failure', note: 'Most providers don\'t follow redirects.' },
  { answer: '4xx (400, 401, 404…)', provider: 'Failure: keeps retrying', note: 'Some providers stop on 410 Gone. A 400 for a bad signature will retry too.' },
  { answer: '429 or 5xx', provider: 'Failure: keeps retrying', note: 'Backing off on 429 is polite; many providers honour Retry-After.' },
  { answer: 'No answer before the timeout', provider: 'Failure: keeps retrying', note: 'The receiver may still have processed it: that is how duplicates happen.' },
];

// ── Duplicates and ordering ─────────────────────────────────────────────

export type PayStatus = 'pending' | 'succeeded' | 'refunded';
export interface PayEvent {
  id: string;
  type: 'payment.created' | 'payment.succeeded' | 'payment.refunded';
  /** The payment status after this event. */
  status: PayStatus;
  /** When it happened at the provider, as minutes past 09:00 (the event's own timestamp). */
  created: number;
}
export const PAY_EVENTS: readonly PayEvent[] = [
  { id: 'evt_2001', type: 'payment.created', status: 'pending', created: 0 },
  { id: 'evt_2002', type: 'payment.succeeded', status: 'succeeded', created: 1 },
  { id: 'evt_2003', type: 'payment.refunded', status: 'refunded', created: 7 },
];
/** What the provider holds after all three happened. */
export const TRUTH: PayStatus = 'refunded';

export type Ordering = 'arrival' | 'timestamp' | 'refetch';
export const ORDERINGS: { id: Ordering; label: string }[] = [
  { id: 'arrival', label: 'Arrival order' },
  { id: 'timestamp', label: 'Compare event timestamps' },
  { id: 'refetch', label: 'Fetch current state' },
];

export interface ReceiveOpts {
  dedupe: boolean;
  ordering: Ordering;
}
export type Action = 'applied' | 'dropped-duplicate' | 'ignored-stale' | 'no-change';
export interface ReceiveStep {
  event: PayEvent;
  action: Action;
  /** This id was seen before. */
  duplicate: boolean;
  /** A first delivery that arrives after a newer event: it is out of order. */
  outOfOrder: boolean;
  /** The receiver's payment status after this delivery (null before any). */
  state: PayStatus | null;
  /** Everything the receiver has done so far, in order. */
  effects: string[];
  /** Ids in the seen table so far. */
  seen: string[];
}

const EFFECT: Record<PayStatus, string | null> = { pending: null, succeeded: 'receipt email', refunded: 'refund email' };

/**
 * The receiver's handler over a stream of deliveries. With `dedupe`, an id already seen is
 * dropped. Ordering: `arrival` sets the status from each event as it comes (wrong when one is
 * late); `timestamp` applies an event only if it is newer than the last one applied; `refetch`
 * ignores the payload and reads the provider's current state (the simulation assumes all three
 * events have already happened by then). Effects fire whenever a handler sets the status.
 */
export function receive(stream: readonly PayEvent[], { dedupe, ordering }: ReceiveOpts): ReceiveStep[] {
  const seen: string[] = [];
  const effects: string[] = [];
  let state: PayStatus | null = null;
  let lastCreated = -Infinity;
  let newest = -Infinity;
  return stream.map((event) => {
    const duplicate = seen.includes(event.id);
    const outOfOrder = !duplicate && event.created < newest;
    let action: Action;
    const set = (s: PayStatus) => {
      state = s;
      const e = EFFECT[s];
      if (e) effects.push(e);
      action = 'applied';
    };
    if (dedupe && duplicate) action = 'dropped-duplicate';
    else if (ordering === 'arrival') set(event.status);
    else if (ordering === 'timestamp') {
      if (event.created > lastCreated) {
        lastCreated = event.created;
        set(event.status);
      } else action = 'ignored-stale';
    } else if (state !== TRUTH) set(TRUTH);
    else action = 'no-change';
    if (!duplicate) seen.push(event.id);
    newest = Math.max(newest, event.created);
    return { event, action: action!, duplicate, outOfOrder, state, effects: [...effects], seen: [...seen] };
  });
}

/** All 6 orders of the three events. */
export function permutations(): PayEvent[][] {
  const out: PayEvent[][] = [];
  const walk = (rest: readonly PayEvent[], acc: PayEvent[]) => {
    if (!rest.length) return void out.push(acc);
    rest.forEach((e, i) => walk([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, e]));
  };
  walk(PAY_EVENTS, []);
  return out;
}

export const orderLabel = (order: readonly PayEvent[]) => order.map((e) => e.type.replace('payment.', '')).join(' → ');

export const DUPLICATE_SEED = 5;
/** Two of the events are delivered a second time, later in the stream (a retry after a lost ack). Seeded. */
export function withDuplicates(order: readonly PayEvent[], seed = DUPLICATE_SEED): PayEvent[] {
  const rnd = mulberry32(seed);
  const out = [...order];
  const picks = shuffle([...order], rnd).slice(0, 2);
  for (const e of picks) {
    const first = out.indexOf(e);
    out.splice(first + 1 + Math.floor(rnd() * (out.length - first)), 0, e);
  }
  return out;
}

/** What a stream does to the receiver's state, ignoring effects. */
export const finalState = (steps: readonly ReceiveStep[]): PayStatus | null => (steps.length ? steps[steps.length - 1].state : null);

// ── Respond fast ────────────────────────────────────────────────────────

/** Seconds the provider waits for an answer before it counts the delivery as failed (illustrative). */
export const PROVIDER_TIMEOUT_S = 10;
/** Attempts the ladder shows (the real schedule goes on). */
export const SHOWN_ATTEMPTS = 3;
export const ACK_MS = 20;

export type ReplyMode = 'after-work' | 'ack-first';
export type FastKind = 'post' | 'enqueue' | 'work' | 'reply' | 'lost-reply' | 'retry';
export interface FastStep {
  id: string;
  kind: FastKind;
  from: 'queue' | 'receiver' | 'worker';
  to: 'queue' | 'receiver' | 'worker';
  label: string;
  note?: string;
  lost?: boolean;
  attempt: number;
  /** Times the handler's work has run, after this step. */
  workRuns: number;
  /** The provider has a 2xx for this delivery, after this step. */
  acked: boolean;
}

export interface FastRun {
  steps: FastStep[];
  attempts: number;
  workRuns: number;
  acked: boolean;
}

/**
 * One delivery whose handler needs `workS` seconds. `after-work`: reply when the work is done.
 * If that takes longer than the provider's timeout, the provider hangs up, retries, and the
 * receiver (unless it cancels on disconnect) finishes the work again each time. `ack-first`:
 * store the event in an internal queue, answer 2xx in milliseconds, work later.
 */
export function fastScript(workS: number, mode: ReplyMode): FastRun {
  const steps: FastStep[] = [];
  let runs = 0;
  let acked = false;
  const add = (s: Omit<FastStep, 'id' | 'workRuns' | 'acked'>) => steps.push({ ...s, id: `f${steps.length}`, workRuns: runs, acked });
  const label = (a: number) => `POST /webhooks${a > 1 ? ` (attempt ${a})` : ''}`;
  if (mode === 'ack-first') {
    add({ kind: 'post', from: 'queue', to: 'receiver', label: label(1), attempt: 1 });
    add({ kind: 'enqueue', from: 'receiver', to: 'worker', label: 'enqueue event', attempt: 1 });
    acked = true;
    add({ kind: 'reply', from: 'receiver', to: 'queue', label: '200 OK', note: `after ${ACK_MS} ms`, attempt: 1 });
    runs = 1;
    add({ kind: 'work', from: 'worker', to: 'worker', label: 'do the work', note: `${workS} s, off the request`, attempt: 1 });
    return { steps, attempts: 1, workRuns: runs, acked };
  }
  let attempts = 0;
  for (let a = 1; a <= SHOWN_ATTEMPTS && !acked; a++) {
    attempts = a;
    add({ kind: 'post', from: 'queue', to: 'receiver', label: label(a), attempt: a });
    runs++;
    if (workS <= PROVIDER_TIMEOUT_S) {
      acked = true;
      add({ kind: 'work', from: 'receiver', to: 'receiver', label: 'do the work', note: `${workS} s`, attempt: a });
      add({ kind: 'reply', from: 'receiver', to: 'queue', label: '200 OK', note: `after ${workS} s`, attempt: a });
    } else {
      add({ kind: 'work', from: 'receiver', to: 'receiver', label: 'do the work', note: `${workS} s`, attempt: a });
      add({ kind: 'lost-reply', from: 'receiver', to: 'queue', label: '200 OK', lost: true, note: `provider hung up at ${PROVIDER_TIMEOUT_S} s`, attempt: a });
      if (a < SHOWN_ATTEMPTS) add({ kind: 'retry', from: 'queue', to: 'queue', label: 'timed out: retry later', attempt: a });
    }
  }
  return { steps, attempts, workRuns: runs, acked };
}
