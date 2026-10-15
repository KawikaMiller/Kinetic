import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { appendCaption, journalCaption, moneyCaption } from './captions';
import { RECONCILE_ENTRIES, START_ENTRIES, postAll, postEntry, reconcile, trialBalance, type Ledger } from './ledger';
import { PAYMENT_COUNTS, REPRESENTATIONS, TAX_LINES, TAX_RATES, formatMoney, splitBill, sumPayments, taxRounding } from './money';

describe('money captions state the numbers the cards show', () => {
  it('for every representation, count, rate and number of ways', () => {
    for (const { value: rep } of REPRESENTATIONS) {
      for (const n of PAYMENT_COUNTS) {
        for (const { bp } of TAX_RATES) {
          for (const parts of [2, 3, 7]) {
            const text = expectCaption(moneyCaption(rep, n, 10_000n, parts, bp));
            const sum = sumPayments(rep, n);
            expect(text, `${rep} ${n}`).toContain(`the program holds ${sum.shown}`);
            expect(text.includes('the balance check fails'), `${rep} ${n}`).toBe(!sum.equal);
            const split = splitBill(10_000n, parts);
            expect(text).toContain(`${formatMoney(split.naiveSum)} when each share is rounded alone and ${formatMoney(split.fairSum)} by largest remainder`);
            const diff = taxRounding(TAX_LINES, bp).difference;
            expect(text.includes('comes out the same either way'), `${bp}`).toBe(diff === 0n);
          }
        }
      }
    }
  });

  it('pins the default sentence', () => {
    const sum = sumPayments('float', 10_000);
    expect(moneyCaption('float', 10_000, 10_000n, 3, 1000)).toBe(
      `10,000 payments of $0.10 as a JavaScript number: the program holds ${sum.shown} but the exact total is $1,000.00: it is off by ${sum.drift} dollars, so the balance check fails. $100.00 split 3 ways comes to $99.99 when each share is rounded alone and $100.00 by largest remainder; tax at 10% differs by 1 cent between rounding per line and per total.`,
    );
  });

  it('says exact for integer cents', () => {
    expect(moneyCaption('cents', 10, 10_000n, 3, 2000)).toContain('the program holds $1.00 and the exact total is $1.00: they match');
    expect(moneyCaption('bigint', 10_000_000, 10_000n, 3, 2000)).toContain('$1,000,000.00 and the exact total is $1,000,000.00: they match');
  });
});

describe('journal captions follow the books', () => {
  const start = postAll(START_ENTRIES);
  const bad = (): Ledger => {
    const r = postEntry(start, { id: 'BAD', memo: 'bad', lines: [{ account: 'cash', side: 'debit', cents: 100n }, { account: 'equity', side: 'credit', cents: 60n }] }, true);
    if (!r.ok) throw new Error(r.error);
    return r.ledger;
  };

  it('says agrees when balanced and out by the difference when not, with the number of checks that will find it', () => {
    expect(journalCaption(start, null, false)).toBe('The trial balance agrees: debits $1,650.00 and credits $1,650.00.');
    const text = expectCaption(journalCaption(bad(), 'Posted BAD, out of balance by $0.40.', true));
    expect(text).toBe(
      'Posted BAD, out of balance by $0.40. The validation bug is on: an unbalanced entry will be posted. The trial balance is out by $0.40: debits $1,651.00 and credits $1,650.60. About 2 checks will find the bad entry among 4.',
    );
    expect(trialBalance(bad()).difference).toBe(40n);
  });

  it('keeps the bug warning only while the bug is on', () => {
    expect(journalCaption(start, null, true)).toContain('The validation bug is on');
    expect(journalCaption(start, null, false)).not.toContain('validation bug');
  });
});

describe('append captions follow the reconciliation', () => {
  const ledger = postAll(RECONCILE_ENTRIES);
  it('state the entry count, the trial balance and the difference', () => {
    const rec = reconcile(ledger, new Set(['T-1001', 'T-1004']));
    expect(appendCaption(ledger, rec, null)).toBe(
      "The ledger has 5 entries and the trial balance agrees; the bank shows $75.00 more than the ledger's Cash, which is the 2 outstanding items added up.",
    );
    const same = reconcile(ledger, new Set(['T-1001', 'T-1004', 'T-1005']));
    expect(same.difference).toBe(-500n);
  });

  it('says they agree when the difference is zero', () => {
    const fee = postEntry(ledger, { id: 'FEE-1', memo: 'Bank fee', lines: [{ account: 'expenses', side: 'debit', cents: 500n }, { account: 'cash', side: 'credit', cents: 500n }] });
    if (!fee.ok) throw new Error(fee.error);
    const rec = reconcile(fee.ledger, new Set(['T-1001', 'T-1004', 'T-1005']));
    expect(rec.difference).toBe(0n);
    expect(appendCaption(fee.ledger, rec, 'Done.')).toBe('Done. The ledger has 6 entries and the trial balance agrees; the bank and the ledger agree on Cash.');
  });
});
