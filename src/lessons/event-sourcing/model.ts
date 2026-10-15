/**
 * The lesson's world: an append-only log and the read models (projections) that consume it
 * asynchronously. Pure and deterministic: a tick is one step of every projection, a command
 * either appends an event or is rejected, and nothing reads a clock.
 */
import { BIG_WITHDRAWAL_MIN, fold, SEED, type AccountEvent, type Projection } from './events';

/** Each new event is dated this many days after the previous one, capped at year end. */
export const DAYS_BETWEEN_EVENTS = 5;
export const LAST_DAY = 365;
export const DEPOSIT = 100;
export const WITHDRAW = 70;
export const WITHDRAW_TOO_MUCH = 5000;

/** The projections the lesson starts with, level with the log, each with the lag (in ticks per event) it simulates. */
export const START_PROJECTIONS: readonly Projection[] = [
  { id: 'balance', name: 'Balance view', color: 'var(--violet)', pos: SEED.length, rebuilding: false, delay: 8, wait: 0 },
  { id: 'statement', name: 'Monthly statement', color: 'var(--pink)', pos: SEED.length, rebuilding: false, delay: 12, wait: 0 },
];
/** The projection "+ New projection" adds: it starts empty and replays the whole log. */
export const BIG_WITHDRAWALS: Projection = {
  id: 'big', name: `Big withdrawals ≥ ${BIG_WITHDRAWAL_MIN}`, color: 'var(--orange)', pos: 0, rebuilding: true, delay: 8, wait: 0,
};

export interface Sim {
  events: readonly AccountEvent[];
  projections: readonly Projection[];
}

export const initialSim = (): Sim => ({ events: SEED, projections: START_PROJECTIONS });

/** True while some projection has events left to consume (the clock only needs to run then). */
export const isBehind = (s: Sim): boolean => s.projections.some((p) => p.pos < s.events.length);

/** The projection with the most events left to consume. */
const furthestBehind = (s: Sim): Projection => s.projections.reduce((a, b) => (s.events.length - b.pos > s.events.length - a.pos ? b : a));

/** Events the furthest-behind projection has yet to consume. */
export const lagOf = (s: Sim): number => s.events.length - furthestBehind(s).pos;

/** The lag stat's sub-label: a rebuild replays history, which is not the same thing as a read model falling behind. */
export function lagLabel(s: Sim): string {
  const lag = lagOf(s);
  if (lag === 0) return 'caught up';
  if (furthestBehind(s).rebuilding) return lag === 1 ? 'event to replay' : 'events to replay';
  return lag === 1 ? 'event behind' : 'events behind';
}

/**
 * One tick. A normal projection waits its own `delay` ticks per event (that is its visible lag); a
 * rebuilding one replays history one event per tick, with no wait, and stops rebuilding once level.
 */
export function tick(s: Sim): Sim {
  return {
    ...s,
    projections: s.projections.map((p) => {
      if (p.pos >= s.events.length) return p.rebuilding ? { ...p, rebuilding: false, wait: 0 } : p;
      if (p.rebuilding) return { ...p, pos: p.pos + 1 };
      if (p.wait + 1 < p.delay) return { ...p, wait: p.wait + 1 };
      return { ...p, pos: p.pos + 1, wait: 0 };
    }),
  };
}

export type CommandResult =
  | { ok: true; sim: Sim; event: AccountEvent }
  | { ok: false; sim: Sim; balance: number };

/**
 * A command is a request. A withdrawal of more than the live balance is rejected and writes nothing;
 * anything else is appended as an event, which records a fact that has already happened.
 */
export function runCommand(s: Sim, type: 'Deposited' | 'Withdrew', amount: number): CommandResult {
  const balance = fold(s.events).balance;
  if (type === 'Withdrew' && amount > balance) return { ok: false, sim: s, balance };
  const last = s.events[s.events.length - 1];
  const event: AccountEvent = { seq: last.seq + 1, type, amount, day: Math.min(LAST_DAY, last.day + DAYS_BETWEEN_EVENTS), v: 2, currency: 'EUR' };
  return { ok: true, sim: { ...s, events: [...s.events, event] }, event };
}

export const hasBigProjection = (s: Sim): boolean => s.projections.some((p) => p.id === 'big');

/** Add the big-withdrawals projection (once): it begins at the start of the log. */
export const addBigProjection = (s: Sim): Sim => (hasBigProjection(s) ? s : { ...s, projections: [...s.projections, { ...BIG_WITHDRAWALS }] });
