// One ordered partition feeding one consumer. Pure, tick-based and deterministic: the same
// scenario and settings always play out the same way, so model.test.ts can pin every claim.
// Rates and delays are illustrative.

/** One tick of simulated time. */
export const TICK = 0.05;
/** The consumer handles at most one attempt per tick (20 a second). */
export const CONSUMER_RATE = 1 / TICK;
/** Backoff delays: BASE after the first failure, doubling, never more than MAX (seconds). */
export const BACKOFF_BASE = 1;
export const BACKOFF_MAX = 8;
/** The most attempts the learner can ask for. */
export const MAX_ATTEMPTS_LIMIT = 6;

export type Policy = 'forever' | 'max-attempts' | 'drop';
/** validation: the message itself is bad (poison). timeout: the dependency is unavailable (transient). */
export type ErrorKind = 'validation' | 'timeout';
/** Where a bad message breaks: before any side effect, or after the handler already did its work. */
export type FailsAt = 'validate' | 'after-effect';

export interface Settings {
  policy: Policy;
  /** Attempts before a message is parked (max-attempts only). */
  maxAttempts: number;
  /** Wait between attempts (forever and max-attempts): doubling from one second. */
  backoff: boolean;
  /** Route a validation error straight to the DLQ instead of retrying it (max-attempts only). */
  classify: boolean;
  /** Stop consuming while the dependency is down, instead of failing every message. */
  pauseWhenDown: boolean;
  /** The consumer remembers which message ids it already did the work for. */
  dedupe: boolean;
  /** Poison messages now succeed (the bug is fixed). */
  bugFixed: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  policy: 'forever', maxAttempts: 3, backoff: false, classify: false, pauseWhenDown: false, dedupe: false, bugFixed: false,
};

export interface Scenario {
  /** Messages already waiting when the run starts, ids 1..backlog. */
  backlog: number;
  /** New messages per second (after the backlog). */
  rate: number;
  /** Stop producing after this many messages in all, or keep going. */
  total: number | null;
  /** Bad messages by id. */
  poison: ReadonlyMap<number, FailsAt>;
  /** The dependency is down for this window, in seconds from the start. */
  outage: readonly [from: number, to: number] | null;
}

export interface Message {
  id: number;
  /** Tick it entered the partition. */
  born: number;
  /** 1 for the first delivery, 2 after a redrive. */
  delivery: number;
  /** The handler already did its work for this delivery (in-process retries reuse it). */
  worked: boolean;
}

export interface DlqEntry {
  id: number;
  error: ErrorKind;
  attempts: number;
  /** Tick it was parked. */
  at: number;
  /** The failure that parked it was before any work (validate) or after it (after-effect). */
  failsAt: FailsAt | null;
}

export type SimEvent =
  | { kind: 'failed'; id: number; error: ErrorKind; attempt: number }
  | { kind: 'parked'; id: number; error: ErrorKind; attempts: number }
  | { kind: 'dropped'; id: number }
  | { kind: 'outage-start' }
  | { kind: 'outage-end' }
  | { kind: 'paused' }
  | { kind: 'resumed' }
  | { kind: 'redriven'; ids: number[] };

export interface World {
  scenario: Scenario;
  settings: Settings;
  tick: number;
  queue: Message[];
  /** Ids in the order they were processed successfully. */
  processed: number[];
  /** Ids processed again after a redrive, to tell them apart in the history. */
  redrivenProcessed: Set<number>;
  dlq: DlqEntry[];
  /** Ids dropped without a trace. */
  dropped: number[];
  /** Messages produced so far. */
  produced: number;
  /** Attempts made on the message at the head, and the tick it may be tried again. */
  headAttempts: number;
  headReadyAt: number;
  /** Every attempt ever made, for the whole run. */
  attemptsOf: Map<number, number>;
  /** Fractional message carried between ticks by the producer. */
  carry: number;
  /** How many times each message's side effect has run. */
  effects: Map<number, number>;
  /** Side effects that ran again for a message that had already had them run. */
  duplicates: number;
  events: SimEvent[];
  /** Whether the consumer is currently paused by the dependency being down. */
  paused: boolean;
  /** Last tick the lag was over zero and whether the dependency was down, for event edges. */
  wasDown: boolean;
}

export const toTicks = (seconds: number) => Math.round(seconds / TICK);
export const toSeconds = (ticks: number) => ticks * TICK;

/** The wait after the n-th failed attempt (n from 1), in seconds. */
export const backoffDelay = (n: number) => Math.min(BACKOFF_BASE * 2 ** (n - 1), BACKOFF_MAX);

export function createWorld(scenario: Scenario, settings: Settings = DEFAULT_SETTINGS): World {
  const w: World = {
    scenario, settings: { ...settings }, tick: 0, queue: [], processed: [], redrivenProcessed: new Set(), dlq: [], dropped: [],
    produced: 0, headAttempts: 0, headReadyAt: 0, attemptsOf: new Map(), carry: 0, effects: new Map(), duplicates: 0, events: [], paused: false, wasDown: false,
  };
  for (let i = 0; i < scenario.backlog; i++) produce(w);
  return w;
}

function produce(w: World) {
  if (w.scenario.total !== null && w.produced >= w.scenario.total) return;
  w.produced += 1;
  w.queue.push({ id: w.produced, born: w.tick, delivery: 1, worked: false });
}

/** Whether the dependency is down at `tick`. */
export const isDown = (scenario: Scenario, tick: number) => {
  if (!scenario.outage) return false;
  const [from, to] = scenario.outage;
  return tick >= toTicks(from) && tick < toTicks(to);
};

/** Advance one tick: the producer adds messages, then the consumer makes at most one attempt. */
export function tick(w: World): void {
  w.tick += 1;
  const down = isDown(w.scenario, w.tick);
  if (down !== w.wasDown) {
    w.events.push({ kind: down ? 'outage-start' : 'outage-end' });
    w.wasDown = down;
  }
  w.carry += w.scenario.rate * TICK;
  while (w.carry >= 1) {
    w.carry -= 1;
    produce(w);
  }
  const head = w.queue[0];
  if (!head) return;
  const shouldPause = w.settings.pauseWhenDown && down;
  if (shouldPause !== w.paused) {
    w.paused = shouldPause;
    w.events.push({ kind: shouldPause ? 'paused' : 'resumed' });
  }
  if (shouldPause || w.tick < w.headReadyAt) return;
  attempt(w, head, down);
}

function attempt(w: World, head: Message, down: boolean) {
  const { settings } = w;
  w.headAttempts += 1;
  w.attemptsOf.set(head.id, (w.attemptsOf.get(head.id) ?? 0) + 1);
  const poisonKind = w.scenario.poison.get(head.id);
  const poisoned = poisonKind !== undefined && !settings.bugFixed;
  // The handler does its work once per delivery (in-process retries reuse it) unless validation rejects the
  // message first. A redriven message is a new delivery: it repeats the work unless the consumer dedupes by id.
  const doesWork = poisonKind !== 'validate' || settings.bugFixed;
  if (doesWork && !down && !head.worked) {
    head.worked = true;
    const before = w.effects.get(head.id) ?? 0;
    if (before > 0 && settings.dedupe) {
      // already done for this id: skip the work
    } else {
      if (before > 0) w.duplicates += 1;
      w.effects.set(head.id, before + 1);
    }
  }
  const failure: ErrorKind | null = down ? 'timeout' : poisoned ? 'validation' : null;
  if (failure === null) {
    w.processed.push(head.id);
    if (head.delivery > 1) w.redrivenProcessed.add(head.id);
    finishHead(w);
    return;
  }
  w.events.push({ kind: 'failed', id: head.id, error: failure, attempt: w.headAttempts });
  if (settings.policy === 'drop') {
    w.dropped.push(head.id);
    w.events.push({ kind: 'dropped', id: head.id });
    finishHead(w);
    return;
  }
  const classified = settings.policy === 'max-attempts' && settings.classify && failure === 'validation';
  if (classified || (settings.policy === 'max-attempts' && w.headAttempts >= settings.maxAttempts)) {
    w.dlq.push({ id: head.id, error: failure, attempts: w.headAttempts, at: w.tick, failsAt: poisonKind ?? null });
    w.events.push({ kind: 'parked', id: head.id, error: failure, attempts: w.headAttempts });
    finishHead(w);
    return;
  }
  w.headReadyAt = w.tick + (settings.backoff ? toTicks(backoffDelay(w.headAttempts)) : 1);
}

function finishHead(w: World) {
  w.queue.shift();
  w.headAttempts = 0;
  w.headReadyAt = 0;
}

/** Move every DLQ entry to the back of the main queue as a new delivery. */
export function redrive(w: World): number[] {
  const ids = w.dlq.map((e) => e.id);
  for (const entry of w.dlq) {
    w.queue.push({ id: entry.id, born: w.tick, delivery: 2, worked: false });
  }
  w.dlq = [];
  if (ids.length) w.events.push({ kind: 'redriven', ids });
  return ids;
}

export interface Stats {
  /** Messages waiting, including the one being handled. */
  lag: number;
  /** How long the message at the head has been waiting, seconds. */
  oldestAge: number;
  processed: number;
  dlq: number;
  dropped: number;
  duplicates: number;
  /** Processed messages that came after a higher id (an ordering break). */
  outOfOrder: number;
}

/** Processed messages that were processed after some message with a higher id. */
export function outOfOrderCount(order: readonly number[]): number {
  let max = 0;
  let count = 0;
  for (const id of order) {
    if (id < max) count += 1;
    max = Math.max(max, id);
  }
  return count;
}

export function stats(w: World): Stats {
  return {
    lag: w.queue.length,
    oldestAge: w.queue[0] ? toSeconds(w.tick - w.queue[0].born) : 0,
    processed: w.processed.length,
    dlq: w.dlq.length,
    dropped: w.dropped.length,
    duplicates: w.duplicates,
    outOfOrder: outOfOrderCount(w.processed),
  };
}

/** Run `ticks` ticks. */
export function run(w: World, ticks: number): World {
  for (let i = 0; i < ticks; i++) tick(w);
  return w;
}

/** Run until the partition is empty (and nothing more will be produced), or `limit` ticks pass. */
export function runUntilDrained(w: World, limit = 20_000): World {
  for (let i = 0; i < limit && (w.queue.length > 0 || (w.scenario.total !== null && w.produced < w.scenario.total)); i++) tick(w);
  return w;
}

// ── The three scenarios ────────────────────────────────────────────────────

/** Messages in the redrive scene's first batch. */
export const REDRIVE_BATCH = 12;

/** One malformed message among a steady stream. */
export const POISON_SCENARIO: Scenario = { backlog: 10, rate: 10, total: null, poison: new Map([[4, 'validate']]), outage: null };
/** A dependency that is down for 20 seconds: every message fails, none of them is bad. */
export const OUTAGE_SCENARIO: Scenario = { backlog: 0, rate: 10, total: null, poison: new Map(), outage: [5, 25] };
/** A batch of 12, three of them bad: one fails before any work, two after the work was done. */
export const REDRIVE_SCENARIO: Scenario = {
  backlog: 0, rate: 3, total: REDRIVE_BATCH, poison: new Map<number, FailsAt>([[3, 'after-effect'], [5, 'validate'], [8, 'after-effect']]), outage: null,
};

/**
 * The redrive scene's starting point: the batch has been through max-attempts and every bad message
 * is parked in the DLQ. New messages keep arriving afterwards, so a redrive lands behind them.
 */
export function redriveStart(settings: Partial<Settings> = {}): World {
  // The batch always fails first: a fix the learner has already switched on applies to the redrive, not to the history.
  const w = createWorld(REDRIVE_SCENARIO, { ...DEFAULT_SETTINGS, policy: 'max-attempts', maxAttempts: 3, ...settings, bugFixed: false });
  runUntilDrained(w);
  w.scenario = { ...REDRIVE_SCENARIO, total: null };
  w.settings = { ...w.settings, bugFixed: settings.bugFixed ?? false };
  w.events.length = 0;
  return w;
}
