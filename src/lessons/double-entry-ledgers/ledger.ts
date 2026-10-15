/**
 * Scenes 2 and 3 of double-entry-ledgers: a tiny chart of accounts, journal entries that post only if
 * debits equal credits, T-accounts and a trial balance, bisection to find a bad entry, an append-only
 * ledger corrected by reversing entries, and a bank reconciliation. All amounts are BigInt cents.
 *
 * Simplified bookkeeping: no currencies beyond a refusal, no periods, tax or controls.
 */

import { formatMoney } from './money';

export type AccountId = 'cash' | 'receivable' | 'inventory' | 'payable' | 'revenue' | 'expenses' | 'equity';
export type Kind = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type Side = 'debit' | 'credit';

export interface Account {
  id: AccountId;
  label: string;
  kind: Kind;
  /** The side an increase goes on (the standard convention). */
  normal: Side;
}

const acct = (id: AccountId, label: string, kind: Kind): Account => ({ id, label, kind, normal: kind === 'asset' || kind === 'expense' ? 'debit' : 'credit' });

export const ACCOUNTS: Account[] = [
  acct('cash', 'Cash', 'asset'),
  acct('receivable', 'Accounts Receivable', 'asset'),
  acct('inventory', 'Inventory', 'asset'),
  acct('payable', 'Accounts Payable', 'liability'),
  acct('revenue', 'Revenue', 'revenue'),
  acct('expenses', 'Expenses', 'expense'),
  acct('equity', 'Equity', 'equity'),
];
export const accountById = (id: string) => ACCOUNTS.find((a) => a.id === id);

export interface Line {
  account: AccountId;
  side: Side;
  cents: bigint;
}

export interface Entry {
  /** The transaction id: posting the same one twice is refused. */
  id: string;
  memo: string;
  lines: Line[];
  /** The id of the entry this one reverses. */
  reverses?: string;
}

export interface Ledger {
  entries: Entry[];
}

export const MAX_ENTRIES = 500;
export const MAX_LINES = 8;

export const sumSide = (lines: readonly Line[], side: Side) => lines.filter((l) => l.side === side).reduce((s, l) => s + l.cents, 0n);
/** Debits minus credits: zero for a balanced entry. */
export const imbalance = (lines: readonly Line[]) => sumSide(lines, 'debit') - sumSide(lines, 'credit');

export type PostResult = { ok: true; ledger: Ledger } | { ok: false; error: string };

/**
 * Post an entry, or refuse it with a reason and leave the ledger as it was. An entry posts only when its
 * debits equal its credits. `bypass` is the bug in scene 2: it skips that one check.
 */
export function postEntry(ledger: Ledger, entry: Entry, bypass = false): PostResult {
  if (ledger.entries.length >= MAX_ENTRIES) return { ok: false, error: `The ledger is full at ${MAX_ENTRIES} entries.` };
  if (ledger.entries.some((e) => e.id === entry.id)) return { ok: false, error: `Transaction ${entry.id} is already posted: posting it again would count the money twice.` };
  if (entry.lines.length === 0) return { ok: false, error: 'An entry with no lines posts nothing.' };
  if (entry.lines.length === 1) return { ok: false, error: 'An entry needs at least two lines: money leaves one account and arrives in another.' };
  if (entry.lines.length > MAX_LINES) return { ok: false, error: `At most ${MAX_LINES} lines to an entry.` };
  for (const l of entry.lines) {
    if (!accountById(l.account)) return { ok: false, error: `${l.account} is not an account in this chart.` };
    if (l.cents <= 0n) return { ok: false, error: 'Every line needs an amount above zero: the side says which way it goes.' };
  }
  const diff = imbalance(entry.lines);
  if (diff !== 0n && !bypass) {
    const side = diff > 0n ? 'debits are higher' : 'credits are higher';
    return { ok: false, error: `Nothing was posted: ${side} by ${formatMoney(diff < 0n ? -diff : diff)} (debits ${formatMoney(sumSide(entry.lines, 'debit'))}, credits ${formatMoney(sumSide(entry.lines, 'credit'))}).` };
  }
  return { ok: true, ledger: { entries: [...ledger.entries, entry] } };
}

/** Post a list of entries in order; throws on a refusal, for building a starting ledger. */
export function postAll(entries: readonly Entry[]): Ledger {
  let ledger: Ledger = { entries: [] };
  for (const e of entries) {
    const r = postEntry(ledger, e);
    if (!r.ok) throw new Error(r.error);
    ledger = r.ledger;
  }
  return ledger;
}

// ── Balances and the trial balance ──────────────────────────────────────

export interface AccountBalance {
  account: Account;
  debits: bigint;
  credits: bigint;
  /** Debits minus credits. */
  net: bigint;
  /** The balance in the account's normal direction: positive when it has grown the usual way. */
  balance: bigint;
}

export function balances(ledger: Ledger): AccountBalance[] {
  return ACCOUNTS.map((account) => {
    const lines = ledger.entries.flatMap((e) => e.lines).filter((l) => l.account === account.id);
    const debits = sumSide(lines, 'debit');
    const credits = sumSide(lines, 'credit');
    const net = debits - credits;
    return { account, debits, credits, net, balance: account.normal === 'debit' ? net : -net };
  });
}

export interface TrialBalance {
  /** Accounts with a debit balance go in this column, the rest in the other. */
  debitColumn: bigint;
  creditColumn: bigint;
  /** Debit column minus credit column: zero when the books balance. */
  difference: bigint;
}

export function trialBalance(ledger: Ledger): TrialBalance {
  let debitColumn = 0n;
  let creditColumn = 0n;
  for (const b of balances(ledger)) {
    if (b.net >= 0n) debitColumn += b.net;
    else creditColumn += -b.net;
  }
  return { debitColumn, creditColumn, difference: debitColumn - creditColumn };
}

// ── Finding a bad entry by bisection ────────────────────────────────────

/** Debits minus credits over the first k entries: zero when the books balanced after entry k. */
export const prefixImbalance = (ledger: Ledger, k: number): bigint => ledger.entries.slice(0, k).reduce((s, e) => s + imbalance(e.lines), 0n);

export interface Bisection {
  /** The books balanced up to this many entries. */
  lo: number;
  /** The books are out of balance up to this many entries. */
  hi: number;
  steps: number;
}

export const startBisection = (ledger: Ledger): Bisection => ({ lo: 0, hi: ledger.entries.length, steps: 0 });
export const bisectionDone = (b: Bisection) => b.hi - b.lo <= 1;
export const middle = (b: Bisection) => Math.floor((b.lo + b.hi) / 2);

/** Check the books up to the middle entry and keep the half that still holds the imbalance. */
export function bisectStep(ledger: Ledger, b: Bisection): Bisection {
  if (bisectionDone(b)) return b;
  const mid = middle(b);
  return prefixImbalance(ledger, mid) === 0n ? { ...b, lo: mid, steps: b.steps + 1 } : { ...b, hi: mid, steps: b.steps + 1 };
}

/** The most steps bisection needs over n entries: ceil(log2 n). */
export const bisectionBound = (n: number) => Math.ceil(Math.log2(Math.max(1, n)));

// ── Append-only: corrections ────────────────────────────────────────────

export const REVERSAL_SUFFIX = '-R';
export const CORRECTION_SUFFIX = '-C';

/** An entry that undoes another: the same lines with every side swapped. */
export const reversalOf = (e: Entry): Entry => ({
  id: `${e.id}${REVERSAL_SUFFIX}`,
  memo: `Reversal of ${e.id}: ${e.memo}`,
  reverses: e.id,
  lines: e.lines.map((l) => ({ ...l, side: l.side === 'debit' ? 'credit' : 'debit' })),
});

export const REFUSALS = {
  edit: 'A posted entry cannot be edited: the ledger only grows. Post a reversing entry, then the right one.',
  remove: 'A posted entry cannot be deleted: history stays, and a correction is a new entry.',
} as const;

/** Fix an entry's amount without touching it: post its reversal, then the same two accounts at the right amount. Two-line entries only. */
export function correctAmount(ledger: Ledger, id: string, cents: bigint): PostResult {
  const original = ledger.entries.find((e) => e.id === id);
  if (!original) return { ok: false, error: `There is no entry ${id}.` };
  if (original.lines.length !== 2) return { ok: false, error: 'This lesson corrects two-line entries.' };
  const reversed = postEntry(ledger, reversalOf(original));
  if (!reversed.ok) return reversed;
  return postEntry(reversed.ledger, {
    id: `${id}${CORRECTION_SUFFIX}`,
    memo: `Correction of ${id}: ${original.memo}`,
    lines: original.lines.map((l) => ({ ...l, cents })),
  });
}

// ── Bank reconciliation ─────────────────────────────────────────────────

export const FEE_ENTRY_ID = 'FEE-1';
export const BANK_FEE_CENTS = 500n;

/** The effect of an entry on Cash: debits to Cash minus credits to Cash. */
export const cashEffect = (e: Entry): bigint => e.lines.filter((l) => l.account === 'cash').reduce((s, l) => s + (l.side === 'debit' ? l.cents : -l.cents), 0n);

export interface Reconciliation {
  ledgerCash: bigint;
  bankBalance: bigint;
  /** Bank balance minus the ledger's Cash. */
  difference: bigint;
  /** Entries the ledger has and the bank has not shown yet (a cheque not cashed), with their effect on Cash. */
  ledgerOnly: { id: string; cents: bigint }[];
  /** Bank lines the ledger lacks: the fee, until it is recorded. */
  bankOnly: { id: string; cents: bigint }[];
  /** Bank-only items minus ledger-only items: what the difference must equal. */
  outstanding: bigint;
}

/** Match the ledger's Cash against a bank statement made of the cleared entries and a monthly fee. `cleared` names the ledger entries the bank has processed. */
export function reconcile(ledger: Ledger, cleared: ReadonlySet<string>): Reconciliation {
  const cashEntries = ledger.entries.filter((e) => cashEffect(e) !== 0n);
  const onBank = (e: Entry) => cleared.has(e.id) || e.id === FEE_ENTRY_ID;
  const feeRecorded = ledger.entries.some((e) => e.id === FEE_ENTRY_ID);
  const ledgerCash = cashEntries.reduce((s, e) => s + cashEffect(e), 0n);
  const bankOnly = feeRecorded ? [] : [{ id: FEE_ENTRY_ID, cents: -BANK_FEE_CENTS }];
  const ledgerOnly = cashEntries.filter((e) => !onBank(e)).map((e) => ({ id: e.id, cents: cashEffect(e) }));
  const bankBalance = cashEntries.filter(onBank).reduce((s, e) => s + cashEffect(e), 0n) + bankOnly.reduce((s, x) => s + x.cents, 0n);
  const outstanding = bankOnly.reduce((s, x) => s + x.cents, 0n) - ledgerOnly.reduce((s, x) => s + x.cents, 0n);
  return { ledgerCash, bankBalance, difference: bankBalance - ledgerCash, ledgerOnly, bankOnly, outstanding };
}

/** Posting the bank fee: money leaves Cash into Expenses. */
export const feeEntry = (): Entry => ({
  id: FEE_ENTRY_ID,
  memo: 'Bank fee',
  lines: [
    { account: 'expenses', side: 'debit', cents: BANK_FEE_CENTS },
    { account: 'cash', side: 'credit', cents: BANK_FEE_CENTS },
  ],
});

// ── Entry templates and the starting books ──────────────────────────────

const pair = (dr: AccountId, cr: AccountId, cents: bigint): Line[] => [{ account: dr, side: 'debit', cents }, { account: cr, side: 'credit', cents }];
const two = (id: string, memo: string, dr: AccountId, cr: AccountId, cents: bigint): Entry => ({ id, memo, lines: pair(dr, cr, cents) });

export const TEMPLATES: { label: string; memo: string; lines: Line[] }[] = [
  { label: 'Customer pays an invoice', memo: 'Customer pays an invoice', lines: pair('cash', 'receivable', 10_000n) },
  { label: 'Sale on credit', memo: 'Sale on credit', lines: pair('receivable', 'revenue', 25_000n) },
  { label: 'Pay a supplier', memo: 'Pay a supplier', lines: pair('payable', 'cash', 8_000n) },
  { label: 'Buy supplies with cash', memo: 'Buy supplies with cash', lines: pair('expenses', 'cash', 3_000n) },
];

/** The books scene 2 starts from: the owner puts in cash, stock is bought on credit, a sale is made on credit. */
export const START_ENTRIES: Entry[] = [
  two('T-1001', 'Owner invests', 'cash', 'equity', 100_000n),
  two('T-1002', 'Buy inventory on credit', 'inventory', 'payable', 40_000n),
  two('T-1003', 'Sale on credit', 'receivable', 'revenue', 25_000n),
];

/** Scene 3's books: the same, plus a customer payment and a supplier cheque. */
export const RECONCILE_ENTRIES: Entry[] = [
  ...START_ENTRIES,
  two('T-1004', 'Customer pays an invoice', 'cash', 'receivable', 10_000n),
  two('T-1005', 'Pay a supplier by cheque', 'payable', 'cash', 8_000n),
];
