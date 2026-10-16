/**
 * The state each scene opens in (pure functions, so a test can walk through every scene and check that none leaks into
 * another), and the controls' small pure rules.
 */
import { parseBoundedInt } from '../../core/parse';
import {
  AMOUNT_RANGE, DEFAULT_OUTBOX, DESIGNS, MAX_ORDERS, faultSetup, pollingSetup, rulesBroken, type Design, type Fault, type Ordering, type OutboxSetup, type RelayMode, type RulesBroken,
} from './outbox';

export type AmountParse = { ok: true; value: number } | { ok: false; error: string };

/** An order amount: a whole number from 1 to 500. */
export function parseAmount(text: string): AmountParse {
  const r = parseBoundedInt(text, {
    min: AMOUNT_RANGE.min,
    max: AMOUNT_RANGE.max,
    messages: {
      empty: 'Type an amount: a whole number from 1 to 500.',
      invalid: (typed) => `"${typed}" is not an amount. Use plain digits, like 120.`,
      tooSmall: () => `An order is at least ${AMOUNT_RANGE.min}.`,
      tooBig: () => `An order is at most ${AMOUNT_RANGE.max}.`,
    },
  });
  return r;
}

export interface BugState {
  design: Extract<Design, 'dbfirst' | 'pubfirst'>;
  fault: Fault;
  amount: number;
  text: string;
  refusal: string | null;
}
export const DEFAULT_AMOUNT = 120;
export const initialBug = (): BugState => ({ design: 'dbfirst', fault: 'between', amount: DEFAULT_AMOUNT, text: String(DEFAULT_AMOUNT), refusal: null });
export const bugSetup = (s: BugState): OutboxSetup => faultSetup({ ...DEFAULT_OUTBOX, design: s.design, amounts: [s.amount] }, s.fault);

export interface OutboxState {
  fault: Fault;
  dedupe: boolean;
  amounts: number[];
  text: string;
  refusal: string | null;
}
export const initialOutbox = (): OutboxState => ({ fault: 'relay-mid', dedupe: false, amounts: [DEFAULT_AMOUNT], text: String(DEFAULT_AMOUNT), refusal: null });
export const outboxSetupOf = (s: OutboxState): OutboxSetup =>
  faultSetup(
    { ...DEFAULT_OUTBOX, design: 'outbox', dedupe: s.dedupe, orders: s.amounts.length, amounts: s.amounts, holds: s.amounts.map(() => 0) },
    s.fault,
  );

/** Place another order with the amount in the field; refused with the reason when the field is not an amount or 30 orders exist. */
export function addOrder(s: OutboxState): OutboxState {
  if (s.amounts.length >= MAX_ORDERS) return { ...s, refusal: `The scene holds ${MAX_ORDERS} orders: reset to start again.` };
  const a = parseAmount(s.text);
  return a.ok ? { ...s, amounts: [...s.amounts, a.value], refusal: null } : { ...s, refusal: a.error };
}

export interface PollState {
  relay: RelayMode;
  ordering: Ordering;
}
export const initialPoll = (): PollState => ({ relay: 'cursor', ordering: 't2-first' });
export const pollSetupOf = (s: PollState): OutboxSetup => pollingSetup(s.relay, s.ordering);

export interface CompareState {
  dedupe: boolean;
}
export const initialCompare = (): CompareState => ({ dedupe: false });

export const COMPARE_SEEDS = 200;

/** Every design run over the same 200 seeded schedules, once with the consumer's inbox and once without. */
export function compareAll(): { id: string; label: string; plain: RulesBroken; inbox: RulesBroken }[] {
  return DESIGNS.map((d) => ({ id: d.id, label: d.label, plain: rulesBroken(d.make(false), COMPARE_SEEDS), inbox: rulesBroken(d.make(true), COMPARE_SEEDS) }));
}

