/** The entry a learner types in the journal scene: text fields turned into an entry, with the refusal wording for a bad amount. */

import type { AccountId, Entry, Line, Side } from './ledger';
import { parseMoney } from './money';

export interface Draft {
  account: AccountId;
  side: Side;
  text: string;
}

export const draftOf = (lines: readonly Line[]): Draft[] =>
  lines.map((l) => ({ account: l.account, side: l.side, text: `${l.cents / 100n}.${(l.cents % 100n).toString().padStart(2, '0')}` }));

export type DraftResult = { ok: true; entry: Entry } | { ok: false; error: string };

/** Parse every line's amount; the first bad one refuses the whole entry. */
export function entryFromDraft(draft: readonly Draft[], id: string, memo: string): DraftResult {
  const lines: Line[] = [];
  for (const [i, d] of draft.entries()) {
    const amount = parseMoney(d.text);
    if (!amount.ok) return { ok: false, error: `Line ${i + 1}: ${amount.error} Nothing was posted.` };
    lines.push({ account: d.account, side: d.side, cents: amount.value });
  }
  return { ok: true, entry: { id, memo: memo || 'Entry', lines } };
}
