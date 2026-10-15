import { describe, expect, it } from 'vitest';
import { mulberry32, pick, randInt, type Rnd } from '../../core/random';
import {
  ACCOUNTS, BANK_FEE_CENTS, FEE_ENTRY_ID, MAX_ENTRIES, MAX_LINES, RECONCILE_ENTRIES, REFUSALS, START_ENTRIES, TEMPLATES, balances, bisectStep, bisectionBound, bisectionDone, cashEffect,
  correctAmount, feeEntry, imbalance, postAll, postEntry, prefixImbalance, reconcile, reversalOf, startBisection, sumSide, trialBalance, unbalancedEntries, type AccountId, type Entry, type Ledger, type Line,
} from './ledger';

const books = () => postAll(START_ENTRIES);
const balanceOf = (l: Ledger, id: AccountId) => balances(l).find((b) => b.account.id === id)!;
const entry = (id: string, lines: Line[]): Entry => ({ id, memo: id, lines });
const dr = (account: AccountId, cents: bigint): Line => ({ account, side: 'debit', cents });
const cr = (account: AccountId, cents: bigint): Line => ({ account, side: 'credit', cents });

describe('the starting books', () => {
  it('post cleanly and every template is itself a balanced pair', () => {
    expect(books().entries).toHaveLength(3);
    for (const t of TEMPLATES) expect(imbalance(t.lines), t.label).toBe(0n);
    for (const e of RECONCILE_ENTRIES) expect(imbalance(e.lines), e.id).toBe(0n);
  });

  it('show each account in its normal column, worked by hand', () => {
    const b = (id: AccountId) => balanceOf(books(), id).balance;
    // Cash 1,000 (owner), Inventory 400, Receivable 250 grew on the debit side; Payable 400, Revenue 250, Equity 1,000 grew on the credit side.
    expect([b('cash'), b('inventory'), b('receivable'), b('payable'), b('revenue'), b('equity'), b('expenses')]).toEqual([100_000n, 40_000n, 25_000n, 40_000n, 25_000n, 100_000n, 0n]);
    for (const a of ACCOUNTS) expect(a.normal).toBe(['asset', 'expense'].includes(a.kind) ? 'debit' : 'credit');
  });

  it('balance: debits equal credits, 1,650.00 on each side of the trial balance', () => {
    expect(trialBalance(books())).toEqual({ debitColumn: 165_000n, creditColumn: 165_000n, difference: 0n });
  });
});

describe('what a debit does depends on the account', () => {
  it('a customer paying a $100 invoice debits Cash (up) and credits Accounts Receivable (down)', () => {
    const paid = postEntry(books(), entry('T-2000', [dr('cash', 10_000n), cr('receivable', 10_000n)]));
    expect(paid.ok).toBe(true);
    if (paid.ok) {
      expect(balanceOf(paid.ledger, 'cash').balance).toBe(110_000n);
      expect(balanceOf(paid.ledger, 'receivable').balance).toBe(15_000n);
    }
  });

  it('a debit to a liability reduces it, and a credit to revenue raises it', () => {
    const paid = postEntry(books(), entry('T-2001', [dr('payable', 8_000n), cr('cash', 8_000n)]));
    if (paid.ok) expect(balanceOf(paid.ledger, 'payable').balance).toBe(32_000n);
    const sale = postEntry(books(), entry('T-2002', [dr('cash', 5_000n), cr('revenue', 5_000n)]));
    if (sale.ok) expect(balanceOf(sale.ledger, 'revenue').balance).toBe(30_000n);
    expect(paid.ok && sale.ok).toBe(true);
  });
});

describe('an entry posts only if it balances', () => {
  it('refuses an unbalanced entry, says nothing was posted and by how much, and leaves the ledger alone', () => {
    const before = books();
    const r = postEntry(before, entry('T-3000', [dr('cash', 10_000n), cr('receivable', 9_900n)]));
    expect(r).toEqual({ ok: false, error: 'Nothing was posted: debits are higher by $1.00 (debits $100.00, credits $99.00).' });
    expect(before.entries).toHaveLength(3);
  });

  it('refuses an unknown account, an empty entry, a one-line entry, a zero line and an eleventh line, each with a reason', () => {
    const l = books();
    const cases: [string, Entry][] = [
      ['unknown', entry('X1', [dr('cash' as AccountId, 1n), { account: 'petty' as AccountId, side: 'credit', cents: 1n }])],
      ['empty', entry('X2', [])],
      ['one line', entry('X3', [dr('cash', 5n)])],
      ['zero', entry('X4', [dr('cash', 0n), cr('equity', 0n)])],
      ['negative', entry('X5', [dr('cash', -5n), cr('equity', -5n)])],
      ['too many', entry('X6', Array.from({ length: MAX_LINES + 1 }, (_, i) => (i % 2 ? cr('cash', 1n) : dr('cash', 1n))))],
    ];
    for (const [name, e] of cases) {
      const r = postEntry(l, e);
      expect(r.ok, name).toBe(false);
      if (!r.ok) expect(r.error.length, name).toBeGreaterThan(15);
    }
    const unknown = postEntry(l, cases[0][1]);
    expect(unknown.ok === false && unknown.error).toContain('petty is not an account');
  });

  it('stops at 500 entries', () => {
    let l: Ledger = { entries: [] };
    for (let i = 0; i < MAX_ENTRIES; i++) {
      const r = postEntry(l, entry(`E${i}`, [dr('cash', 1n), cr('equity', 1n)]));
      expect(r.ok).toBe(true);
      if (r.ok) l = r.ledger;
    }
    expect(postEntry(l, entry('one-more', [dr('cash', 1n), cr('equity', 1n)]))).toEqual({ ok: false, error: 'The ledger is full at 500 entries.' });
  });
});

function randomEntry(rnd: Rnd, id: string, balanced: boolean): Entry {
  const ids = ACCOUNTS.map((a) => a.id);
  const lines: Line[] = Array.from({ length: randInt(1, 4, rnd) }, () => ({ account: pick(ids, rnd), side: pick(['debit', 'credit'] as const, rnd), cents: BigInt(randInt(1, 50_000, rnd)) }));
  const diff = imbalance(lines);
  if (balanced && diff !== 0n) lines.push(diff > 0n ? cr(pick(ids, rnd), diff) : dr(pick(ids, rnd), -diff));
  return entry(id, lines.slice(0, MAX_LINES));
}

/** A random entry that really is out of balance and has the two lines an entry needs. */
function unbalancedEntry(rnd: Rnd, id: string): Entry {
  for (;;) {
    const e = randomEntry(rnd, id, false);
    if (e.lines.length >= 2 && imbalance(e.lines) !== 0n) return e;
  }
}

describe('the ledger invariant, on 200 seeded random sequences', () => {
  it('total debits equal total credits after every accepted post, even when unbalanced entries are attempted', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = mulberry32(seed);
      let l: Ledger = { entries: [] };
      for (let i = 0; i < 30; i++) {
        const r = postEntry(l, randomEntry(rnd, `S${seed}-${i}`, rnd() < 0.6));
        if (r.ok) l = r.ledger;
        const all = l.entries.flatMap((e) => e.lines);
        expect(sumSide(all, 'debit'), `seed ${seed} step ${i}`).toBe(sumSide(all, 'credit'));
        expect(trialBalance(l).difference).toBe(0n);
      }
      expect(l.entries.length).toBeGreaterThan(5);
    }
  });

  it('a ledger that posts without checking fails the same test: the trial balance breaks by exactly the entry\'s imbalance', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = mulberry32(seed);
      let l: Ledger = { entries: [] };
      for (let i = 0; i < 10; i++) {
        const r = postEntry(l, randomEntry(rnd, `B${seed}-${i}`, true));
        if (r.ok) l = r.ledger;
      }
      const bad = unbalancedEntry(rnd, `BAD${seed}`);
      const want = imbalance(bad.lines);
      const posted = postEntry(l, bad, true);
      expect(posted.ok).toBe(true);
      if (posted.ok) expect(trialBalance(posted.ledger).difference, `seed ${seed}`).toBe(want);
    }
  });
});

describe('finding a bad entry by bisection', () => {
  it('finds an injected entry in at most ceil(log2 n) steps on 200 seeds, whatever its position', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = mulberry32(seed);
      const n = randInt(2, 60, rnd);
      let l: Ledger = { entries: [] };
      const at = randInt(0, n - 1, rnd);
      for (let i = 0; i < n; i++) {
        const r = postEntry(l, i === at ? entry(`BAD${seed}`, [dr('cash', 700n), cr('equity', 400n)]) : randomEntry(rnd, `G${seed}-${i}`, true), i === at);
        if (r.ok) l = r.ledger;
      }
      const total = l.entries.length;
      let b = startBisection(l);
      while (!bisectionDone(b)) b = bisectStep(l, b);
      expect(l.entries[b.hi - 1].id, `seed ${seed}`).toBe(`BAD${seed}`);
      expect(b.steps, `seed ${seed} n ${total}`).toBeLessThanOrEqual(bisectionBound(total));
      expect(prefixImbalance(l, b.lo)).toBe(0n);
      expect(prefixImbalance(l, b.hi)).not.toBe(0n);
    }
  });

  it('on the lesson\'s ledger a bad fourth entry is found by checking the middle twice', () => {
    let l = books();
    const bad = postEntry(l, entry('BAD', [dr('cash', 100n), cr('equity', 60n)]), true);
    if (bad.ok) l = bad.ledger;
    expect(l.entries).toHaveLength(4);
    let b = startBisection(l);
    b = bisectStep(l, b);
    expect(b.steps).toBe(1);
    while (!bisectionDone(b)) b = bisectStep(l, b);
    expect(b.hi).toBe(4);
    expect(b.steps).toBe(bisectionBound(4));
  });

  it('two bypassed entries that offset each other leave the trial balance agreeing while both are unbalanced', () => {
    let l = books();
    for (const [id, credit] of [['UP', 400n], ['DOWN', 600n]] as const) {
      const r = postEntry(l, entry(id, [dr('cash', 500n), cr('equity', credit)]), true);
      if (r.ok) l = r.ledger;
    }
    expect(trialBalance(l).difference).toBe(0n);
    expect(unbalancedEntries(l).map((e) => e.id)).toEqual(['UP', 'DOWN']);
  });

  it('with two bad entries the search still ends on an unbalanced entry, which need not be the first', () => {
    // Imbalances +100, -100, 0, 0, 0, +100: every prefix check up to entry 5 reads zero, so the search skips A and B and ends on F.
    const lines: [string, bigint, bigint][] = [['A', 600n, 500n], ['B', 400n, 500n], ['C', 500n, 500n], ['D', 500n, 500n], ['E', 500n, 500n], ['F', 600n, 500n]];
    let l: Ledger = { entries: [] };
    for (const [id, d, c] of lines) {
      const r = postEntry(l, entry(id, [dr('cash', d), cr('equity', c)]), true);
      if (r.ok) l = r.ledger;
    }
    expect(trialBalance(l).difference).toBe(100n);
    let b = startBisection(l);
    while (!bisectionDone(b)) b = bisectStep(l, b);
    const found = l.entries[b.hi - 1];
    expect(imbalance(found.lines)).not.toBe(0n);
    expect(unbalancedEntries(l).map((e) => e.id)).toContain(found.id);
    expect(found.id).toBe('F');
    expect(unbalancedEntries(l).map((e) => e.id)).toEqual(['A', 'B', 'F']);
    expect(prefixImbalance(l, b.lo)).toBe(0n);
  });

  it('the bound is ceil(log2 n)', () => {
    expect([1, 2, 3, 4, 5, 8, 9, 500].map(bisectionBound)).toEqual([0, 1, 2, 2, 3, 3, 4, 9]);
  });
});

describe('append-only, with corrections', () => {
  it('has a refusal for an edit and for a delete, each saying what to do instead', () => {
    expect(REFUSALS.edit).toContain('reversing entry');
    expect(REFUSALS.remove).toContain('new entry');
  });

  it('a reversing entry swaps every side and names what it reverses', () => {
    const e = books().entries[0];
    const r = reversalOf(e);
    expect(r.reverses).toBe(e.id);
    expect(r.lines.map((l) => l.side)).toEqual(['credit', 'debit']);
    expect(r.lines.map((l) => l.cents)).toEqual(e.lines.map((l) => l.cents));
  });

  it('correcting a wrong amount keeps history and leaves the balances as if it had been right', () => {
    const wrong = postAll([...START_ENTRIES, entry('T-4000', [dr('cash', 12_000n), cr('receivable', 12_000n)])]);
    const right = postAll([...START_ENTRIES, entry('T-4000', [dr('cash', 10_000n), cr('receivable', 10_000n)])]);
    const fixed = correctAmount(wrong, 'T-4000', 10_000n);
    expect(fixed.ok).toBe(true);
    if (!fixed.ok) return;
    expect(fixed.ledger.entries).toHaveLength(wrong.entries.length + 2);
    expect(fixed.ledger.entries.slice(0, wrong.entries.length)).toEqual(wrong.entries);
    expect(fixed.ledger.entries.at(-2)?.reverses).toBe('T-4000');
    expect(balances(fixed.ledger).map((b) => b.balance)).toEqual(balances(right).map((b) => b.balance));
    expect(trialBalance(fixed.ledger).difference).toBe(0n);
  });

  it('refuses a correction of a missing entry, a many-line entry, and a second correction with the same id', () => {
    const l = postAll([...START_ENTRIES, entry('M', [dr('cash', 300n), dr('inventory', 200n), cr('equity', 500n)])]);
    expect(correctAmount(l, 'nope', 1n)).toEqual({ ok: false, error: 'There is no entry nope.' });
    expect(correctAmount(l, 'M', 1n)).toEqual({ ok: false, error: 'This lesson corrects two-line entries.' });
    const once = correctAmount(books(), 'T-1001', 90_000n);
    expect(once.ok).toBe(true);
    if (once.ok) expect(correctAmount(once.ledger, 'T-1001', 80_000n)).toEqual({ ok: false, error: 'T-1001 was already reversed by T-1001-R. Correct T-1001-C instead, the entry that replaced it.' });
  });

  it('the correction itself can be corrected, which is what the refusal points to', () => {
    const once = correctAmount(books(), 'T-1001', 90_000n);
    if (!once.ok) throw new Error(once.error);
    const twice = correctAmount(once.ledger, 'T-1001-C', 80_000n);
    expect(twice.ok).toBe(true);
    if (twice.ok) {
      expect(trialBalance(twice.ledger).difference).toBe(0n);
      expect(balances(twice.ledger).find((b) => b.account.id === 'cash')?.balance).toBe(80_000n);
    }
  });

  it('refuses to post a transaction id twice, so the money is not counted twice', () => {
    const l = books();
    const again = postEntry(l, l.entries[0]);
    expect(again).toEqual({ ok: false, error: 'Transaction T-1001 is already posted: posting it again would count the money twice.' });
  });
});

describe('bank reconciliation', () => {
  const ledger = postAll(RECONCILE_ENTRIES);
  const cleared = new Set(['T-1001', 'T-1004']);

  it('with the supplier cheque outstanding and the fee unrecorded, the difference is $75.00, worked by hand', () => {
    // Ledger Cash: +1,000 +100 -80 = 1,020. Bank: 1,000 + 100 - 5 fee = 1,095. Bank-only -5.00, ledger-only -80.00: -5 - (-80) = +75.
    const r = reconcile(ledger, cleared);
    expect(r.ledgerCash).toBe(102_000n);
    expect(r.bankBalance).toBe(109_500n);
    expect(r.difference).toBe(7_500n);
    expect(r.outstanding).toBe(7_500n);
    expect(r.ledgerOnly).toEqual([{ id: 'T-1005', cents: -8_000n }]);
    expect(r.bankOnly).toEqual([{ id: FEE_ENTRY_ID, cents: -BANK_FEE_CENTS }]);
  });

  it('recording the fee leaves only the outstanding cheque, and clearing the cheque brings the difference to zero', () => {
    const withFee = postEntry(ledger, feeEntry());
    expect(withFee.ok).toBe(true);
    if (!withFee.ok) return;
    expect(reconcile(withFee.ledger, cleared)).toMatchObject({ difference: 8_000n, outstanding: 8_000n, bankOnly: [] });
    expect(reconcile(withFee.ledger, new Set([...cleared, 'T-1005']))).toMatchObject({ difference: 0n, outstanding: 0n, ledgerOnly: [] });
  });

  it('the difference equals the outstanding items on 300 seeded ledgers and cleared sets', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rnd = mulberry32(seed);
      let l: Ledger = { entries: [] };
      for (let i = 0; i < randInt(1, 15, rnd); i++) {
        const r = postEntry(l, randomEntry(rnd, `R${seed}-${i}`, true));
        if (r.ok) l = r.ledger;
      }
      if (rnd() < 0.5) {
        const r = postEntry(l, feeEntry());
        if (r.ok) l = r.ledger;
      }
      const clearedIds = new Set(l.entries.filter(() => rnd() < 0.5).map((e) => e.id));
      const rec = reconcile(l, clearedIds);
      const effects = l.entries.map((e) => ({ id: e.id, cents: cashEffect(e) })).filter((x) => x.cents !== 0n);
      const ledgerOnly = effects.filter((x) => !clearedIds.has(x.id) && x.id !== FEE_ENTRY_ID).reduce((s, x) => s + x.cents, 0n);
      const feeRecorded = l.entries.some((e) => e.id === FEE_ENTRY_ID);
      const bankOnly = feeRecorded ? 0n : -BANK_FEE_CENTS;
      expect(rec.difference, `seed ${seed}`).toBe(bankOnly - ledgerOnly);
      expect(rec.outstanding).toBe(rec.difference);
    }
  });
});
