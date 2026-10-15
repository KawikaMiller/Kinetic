// The domain: one bank account, stored purely as an append-only event log.

export type EventType = 'AccountOpened' | 'Deposited' | 'Withdrew';

export interface AccountEvent {
  seq: number;
  type: EventType;
  amount: number; // 0 for AccountOpened
  owner?: string;
  day: number; // day of year, for dates and monthly statements
  v: 1 | 2; // schema version: v2 added a currency field
  currency?: string;
}

export interface AccountState {
  owner: string | null;
  balance: number;
  applied: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function dateOf(day: number) {
  let d = day;
  for (let m = 0; m < 12; m++) {
    if (d <= MONTH_DAYS[m]) return { month: MONTHS[m], label: `${MONTHS[m]} ${String(d).padStart(2, '0')}` };
    d -= MONTH_DAYS[m];
  }
  return { month: 'Dec', label: 'Dec 31' };
}

export const SEED: AccountEvent[] = [
  { seq: 1, type: 'AccountOpened', amount: 0, owner: 'Ada', day: 3, v: 1 },
  { seq: 2, type: 'Deposited', amount: 500, day: 5, v: 1 },
  { seq: 3, type: 'Withdrew', amount: 120, day: 19, v: 1 },
  { seq: 4, type: 'Deposited', amount: 300, day: 33, v: 1 },
  { seq: 5, type: 'Withdrew', amount: 80, day: 45, v: 1 },
  { seq: 6, type: 'Withdrew', amount: 450, day: 58, v: 1 },
  { seq: 7, type: 'Deposited', amount: 60, day: 63, v: 1 },
];

/** Old v1 events predate the currency field; upcast them on read instead of rewriting history. */
export const upcast = (e: AccountEvent): AccountEvent => (e.v === 1 ? { ...e, v: 2, currency: 'EUR' } : e);

export function apply(state: AccountState, raw: AccountEvent): AccountState {
  const e = upcast(raw);
  switch (e.type) {
    case 'AccountOpened':
      return { owner: e.owner ?? null, balance: 0, applied: state.applied + 1 };
    case 'Deposited':
      return { ...state, balance: state.balance + e.amount, applied: state.applied + 1 };
    case 'Withdrew':
      return { ...state, balance: state.balance - e.amount, applied: state.applied + 1 };
  }
}

export const EMPTY: AccountState = { owner: null, balance: 0, applied: 0 };

/** Replay `events` on top of `from` (the empty state, or a snapshot taken part-way). */
export const foldFrom = (from: AccountState, events: readonly AccountEvent[]): AccountState => events.reduce(apply, from);

/** Current state is nothing more than a left fold over the log. */
export const fold = (events: readonly AccountEvent[], upTo = events.length): AccountState => foldFrom(EMPTY, events.slice(0, upTo));

// ── Projections (read models) ───────────────────────────────────────
export type ProjectionId = 'balance' | 'statement' | 'big';

export interface Projection {
  id: ProjectionId;
  name: string;
  color: string;
  pos: number; // how many events it has consumed
  rebuilding: boolean;
  delay: number; // sim ticks it waits before consuming the next event (its lag)
  wait: number;
}

export function statement(events: readonly AccountEvent[], upTo: number) {
  const rows = new Map<string, { month: string; inflow: number; outflow: number }>();
  for (const e of events.slice(0, upTo)) {
    const { month } = dateOf(e.day);
    const row = rows.get(month) ?? { month, inflow: 0, outflow: 0 };
    if (e.type === 'Deposited') row.inflow += e.amount;
    if (e.type === 'Withdrew') row.outflow += e.amount;
    rows.set(month, row);
  }
  return [...rows.values()];
}

export const bigWithdrawals = (events: readonly AccountEvent[], upTo: number) =>
  events.slice(0, upTo).filter((e) => e.type === 'Withdrew' && e.amount >= 100);
