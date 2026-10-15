import { plural } from '../../core/format';
import { bisectionBound, trialBalance, unbalancedEntries, type Ledger, type Reconciliation } from './ledger';
import { PAYMENT_CENTS, TAX_LINES, TAX_RATES, formatMoney, splitBill, sumPayments, taxRounding, type Representation } from './money';

/** Captions as plain text, computed from the same numbers the cards show. */

export function moneyCaption(rep: Representation, n: number, total: bigint, parts: number, bp: number): string {
  const sum = sumPayments(rep, n);
  const exact = formatMoney(BigInt(n) * BigInt(PAYMENT_CENTS));
  const sumText = sum.equal
    ? `the program holds ${sum.shown} and the exact total is ${exact}: they match`
    : `the program holds ${sum.shown} but the exact total is ${exact}: it is off by ${sum.drift} dollars, so the balance check fails`;
  const split = splitBill(total, parts);
  const splitText = `${formatMoney(total)} split ${parts} ways comes to ${formatMoney(split.naiveSum)} when each share is rounded alone and ${formatMoney(split.fairSum)} by largest remainder`;
  const tax = taxRounding(TAX_LINES, bp);
  const rate = TAX_RATES.find((r) => r.bp === bp)!.label;
  const diff = tax.difference < 0n ? -tax.difference : tax.difference;
  const taxText = diff === 0n ? `tax at ${rate} comes out the same either way` : `tax at ${rate} differs by ${plural(Number(diff), 'cent')} between rounding per line and per total`;
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'payment' : 'payments'} of $0.10 as ${rep === 'float' ? 'a JavaScript number' : rep === 'cents' ? 'integer cents' : 'BigInt cents'}: ${sumText}. ${splitText}; ${taxText}.`;
}

/** What the "Find the bad entry" card says about the books: the trial balance is evidence, not proof. */
export function badEntryNote(ledger: Ledger): string {
  const t = trialBalance(ledger);
  const bad = unbalancedEntries(ledger);
  if (t.difference === 0n && bad.length === 0) {
    return 'The trial balance agrees, so there is no unbalanced entry to search for. That does not prove every entry is right: a posting to the wrong account, a wrong amount on both sides, or two mistakes that offset each other still balance. Turn the validation off and post an unbalanced entry to try the search.';
  }
  if (t.difference === 0n) {
    return `The trial balance agrees, yet ${plural(bad.length, 'entry', 'entries')} (${bad.map((e) => e.id).join(', ')}) ${bad.length === 1 ? 'is' : 'are'} out of balance on their own and the errors cancel. The trial balance cannot see that, so the search has nothing to follow.`;
  }
  if (bad.length > 1) return `${bad.length} entries are out of balance. Each check halves the range and ends on one of them, not necessarily the first; the search assumes the books balanced before the first bad entry.`;
  return '';
}

export function journalCaption(ledger: Ledger, notice: string | null, bypass: boolean): string {
  const t = trialBalance(ledger);
  const bad = unbalancedEntries(ledger);
  const out = t.difference < 0n ? -t.difference : t.difference;
  const books =
    t.difference === 0n
      ? `The trial balance agrees: debits ${formatMoney(t.debitColumn)} and credits ${formatMoney(t.creditColumn)}. ${bad.length === 0 ? 'That does not prove every entry is right.' : `Yet ${plural(bad.length, 'entry', 'entries')} ${bad.length === 1 ? 'is' : 'are'} out of balance and the errors cancel.`}`
      : `The trial balance is out by ${formatMoney(out)}: debits ${formatMoney(t.debitColumn)} and credits ${formatMoney(t.creditColumn)}. About ${plural(bisectionBound(ledger.entries.length), 'check')} will find ${bad.length > 1 ? 'one of the bad entries' : 'the bad entry'} among ${ledger.entries.length}.`;
  return `${notice ? `${notice} ` : ''}${bypass ? 'The validation bug is on: an unbalanced entry will be posted. ' : ''}${books}`;
}

export function appendCaption(ledger: Ledger, rec: Reconciliation, notice: string | null): string {
  const t = trialBalance(ledger);
  const diff = rec.difference < 0n ? `${formatMoney(-rec.difference)} less` : `${formatMoney(rec.difference)} more`;
  const where = rec.difference === 0n ? 'the bank and the ledger agree on Cash' : `the bank shows ${diff} than the ledger's Cash, which is the ${plural(rec.ledgerOnly.length + rec.bankOnly.length, 'outstanding item')} added up`;
  return `${notice ? `${notice} ` : ''}The ledger has ${plural(ledger.entries.length, 'entry', 'entries')} and the trial balance ${t.difference === 0n ? 'agrees' : 'is out'}; ${where}.`;
}
