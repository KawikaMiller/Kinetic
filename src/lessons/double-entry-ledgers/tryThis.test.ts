import { describe, expect, it } from 'vitest';
import lesson from './index';
import {
  RECONCILE_ENTRIES, START_ENTRIES, TEMPLATES, REFUSALS, balances, bisectStep, bisectionBound, bisectionDone, correctAmount, postAll, postEntry, startBisection, trialBalance, unbalancedEntries,
} from './ledger';
import { draftOf, entryFromDraft } from './draft';
import { parseMoney, splitBill, sumPayments } from './money';

/** Default state: scene 1 on a JavaScript number, 10,000 payments, $100.00 in 3 ways, 10%; scene 2 with the first template as the draft; scene 3 on the cheque ledger. */
describe('the try-this prompts work from the default state, as written', () => {
  it('has five prompts', () => {
    expect(lesson.tryThis).toHaveLength(5);
  });

  it('try-this 1: the default float sum fails the balance check, and integer cents are exactly $1,000.00', () => {
    expect(sumPayments('float', 10_000).equal).toBe(false);
    expect(sumPayments('cents', 10_000)).toMatchObject({ equal: true, shown: '$1,000.00' });
  });

  it('try-this 2: $100.00 in 3 ways is $99.99 rounded alone and $100.00 by largest remainder', () => {
    const s = splitBill(10_000n, 3);
    expect([s.naiveSum, s.fairSum]).toEqual([9_999n, 10_000n]);
  });

  it('try-this 3: the default draft with the second line at 99.00 is refused, debits higher by $1.00', () => {
    const typed = parseMoney('99.00');
    if (!typed.ok) throw new Error(typed.error);
    const lines = TEMPLATES[0].lines.map((l, i) => (i === 1 ? { ...l, cents: typed.value } : l));
    expect(TEMPLATES[0].lines.map((l) => l.cents)).toEqual([10_000n, 10_000n]);
    const r = postEntry(postAll(START_ENTRIES), { id: 'T-1004', memo: 'x', lines });
    expect(r).toEqual({ ok: false, error: 'Nothing was posted: debits are higher by $1.00 (debits $100.00, credits $99.00).' });
  });

  it('try-this 4: from a fresh load, 99.00 on the second line plus bypassed validation posts T-1004, out by $1.00, found in 2 checks among 4', () => {
    // Fresh state: the default draft, validation on, T-1004 next. The steps are the ones the prompt names, in order.
    const fresh = draftOf(TEMPLATES[0].lines);
    const edited = fresh.map((d, i) => (i === 1 ? { ...d, text: '99.00' } : d));
    const typed = entryFromDraft(edited, 'T-1004', TEMPLATES[0].memo);
    if (!typed.ok) throw new Error(typed.error);
    const start = postAll(START_ENTRIES);
    expect(postEntry(start, typed.entry, false).ok).toBe(false);
    const r = postEntry(start, typed.entry, true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ledger.entries).toHaveLength(4);
    expect(trialBalance(r.ledger).difference).toBe(100n);
    let b = startBisection(r.ledger);
    while (!bisectionDone(b)) b = bisectStep(r.ledger, b);
    expect(r.ledger.entries[b.hi - 1].id).toBe('T-1004');
    expect(b.steps).toBe(2);
    expect(bisectionBound(4)).toBe(2);
  });

  it('try-this 4 does not work without the edit: bypassing alone posts a balanced entry and nothing is found', () => {
    const typed = entryFromDraft(draftOf(TEMPLATES[0].lines), 'T-1004', 'x');
    if (!typed.ok) throw new Error(typed.error);
    const r = postEntry(postAll(START_ENTRIES), typed.entry, true);
    if (!r.ok) throw new Error(r.error);
    expect(trialBalance(r.ledger).difference).toBe(0n);
    expect(unbalancedEntries(r.ledger)).toEqual([]);
  });

  it('try-this 5: correcting T-1004 to $90.00 adds a reversal and a corrected entry, and an edit is refused', () => {
    const ledger = postAll(RECONCILE_ENTRIES);
    const r = correctAmount(ledger, 'T-1004', 9_000n);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ledger.entries.map((e) => e.id).slice(-2)).toEqual(['T-1004-R', 'T-1004-C']);
    expect(balances(r.ledger).find((b) => b.account.id === 'cash')?.balance).toBe(100_000n + 9_000n - 8_000n);
    expect(trialBalance(r.ledger).difference).toBe(0n);
    expect(REFUSALS.edit).toContain('cannot be edited');
  });
});
