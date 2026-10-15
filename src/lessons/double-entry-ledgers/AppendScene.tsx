import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, Stat, Stats, TextField } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { appendCaption } from './captions';
import {
  ACCOUNTS, FEE_ENTRY_ID, RECONCILE_ENTRIES, REFUSALS, cashEffect, correctAmount, feeEntry, postAll, postEntry, reconcile, trialBalance, type Ledger,
} from './ledger';
import { formatMoney, parseMoney } from './money';

type Notice = { tone: 'ok' | 'bad'; text: string } | null;
const START_CLEARED = ['T-1001', 'T-1004'];
const START_SELECTED = 'T-1004';
const START_CORRECTION = '90.00';

const absolute = (v: bigint) => (v < 0n ? -v : v);

export function AppendScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [ledger, setLedger] = useState<Ledger>(() => postAll(RECONCILE_ENTRIES));
  const [selected, setSelected] = useState(START_SELECTED);
  const [amountText, setAmountText] = useState(START_CORRECTION);
  const [cleared, setCleared] = useState<ReadonlySet<string>>(new Set(START_CLEARED));
  const [notice, setNotice] = useState<Notice>(null);

  const rec = useMemo(() => reconcile(ledger, cleared), [ledger, cleared]);
  const t = trialBalance(ledger);
  const entry = ledger.entries.find((e) => e.id === selected) ?? ledger.entries[0];
  const feeRecorded = ledger.entries.some((e) => e.id === FEE_ENTRY_ID);

  const caption = useMemo(() => appendCaption(ledger, rec, notice?.text ?? null), [ledger, rec, notice]);
  useEffect(() => {
    setCaption(caption, { quiet: true });
  }, [caption, setCaption]);

  const refuse = (text: string) => setNotice({ tone: 'bad', text });
  const correct = () => {
    const amount = parseMoney(amountText);
    if (!amount.ok) return refuse(amount.error);
    const r = correctAmount(ledger, entry.id, amount.value);
    if (!r.ok) return refuse(r.error);
    setLedger(r.ledger);
    setNotice({ tone: 'ok', text: `${entry.id} stays as it was; a reversing entry and a corrected one were added.` });
  };
  const again = () => {
    const r = postEntry(ledger, entry);
    if (!r.ok) refuse(r.error);
  };
  const recordFee = () => {
    const r = postEntry(ledger, feeEntry());
    if (r.ok) {
      setLedger(r.ledger);
      setNotice({ tone: 'ok', text: 'The bank fee is recorded: Expenses up, Cash down.' });
    } else refuse(r.error);
  };
  const toggleCleared = (id: string) =>
    setCleared((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const reset = () => {
    setLedger(postAll(RECONCILE_ENTRIES));
    setCleared(new Set(START_CLEARED));
    setSelected(START_SELECTED);
    setNotice(null);
  };

  return (
    <StageFrame
      height={600}
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'a reversing entry' },
            { color: 'var(--hi)', label: 'the selected entry' },
            { color: 'var(--ok)', label: 'agrees' },
            { color: 'var(--bad)', label: 'refused, or a difference' },
          ]}
        />
      }
      stats={
        <Stats>
          <Stat label="Ledger Cash" value={formatMoney(rec.ledgerCash)} />
          <Stat label="Bank balance" value={formatMoney(rec.bankBalance)} />
          <Stat label="Difference" value={formatMoney(rec.difference)} color={rec.difference === 0n ? 'var(--ok)' : 'var(--bad)'} sub={rec.difference === 0n ? 'reconciled' : 'the outstanding items, added up'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Button onClick={() => { setNotice({ tone: 'bad', text: REFUSALS.edit }); }}>Edit entry</Button>
          <Button onClick={() => { setNotice({ tone: 'bad', text: REFUSALS.remove }); }}>Delete entry</Button>
          <Button onClick={again}>Post the same transaction again</Button>
        </>,
        <>
          <span className="dl-field">
            <TextField label="Corrected amount" value={amountText} onChange={setAmountText} width={120} spellCheck={false} maxLength={20} />
          </span>
          <Button variant="primary" onClick={correct}>Correct the selected entry</Button>
          <Button disabled={feeRecorded} onClick={recordFee}>Record the bank fee</Button>
          <Button onClick={reset}>Reset</Button>
        </>,
      ]}
    >
      <div className="stage-pad dl">
        {notice && <span className={`chip tone-${notice.tone} wrap`} role="status">{notice.text}</span>}
        <Box className="dl-card">
          <SectionTitle weight="regular" hint="select a row; the ledger only grows">The ledger</SectionTitle>
          <ul className="dl-ledger">
            {ledger.entries.map((e, i) => (
              <li key={e.id} className={`log-row tone-${e.id === entry.id ? 'hi' : e.reverses ? 'orange' : 'muted'}`}>
                <button type="button" className="dl-pick" aria-pressed={e.id === entry.id} onClick={() => setSelected(e.id)}>
                  <b>{i + 1}. {e.id}</b> {e.memo}
                </button>
                <span className="dl-lines">
                  {e.lines.map((l, k) => <span key={k} className={`dl-line tone-${l.side === 'debit' ? 'info' : 'violet'}`}>{l.side === 'debit' ? 'Dr' : 'Cr'} {ACCOUNTS.find((a) => a.id === l.account)!.label} {formatMoney(l.cents)}</span>)}
                </span>
              </li>
            ))}
          </ul>
          <span className={`chip tone-${t.difference === 0n ? 'ok' : 'bad'}`}>{t.difference === 0n ? 'trial balance agrees' : 'trial balance is out'}</span>
        </Box>

        <Box className="dl-card">
          <SectionTitle weight="regular" hint="which ledger rows has the bank processed?">Bank reconciliation</SectionTitle>
          <ul className="dl-ledger">
            {ledger.entries.filter((e) => cashEffect(e) !== 0n).map((e) => (
              <li key={e.id} className="dl-recrow">
                <span>{e.id} {e.memo}: {formatMoney(cashEffect(e))} on Cash</span>
                {e.id === FEE_ENTRY_ID ? (
                  <span className="chip tone-ok">on the bank statement</span>
                ) : (
                  <ChipButton tone="ok" on={cleared.has(e.id)} onClick={() => toggleCleared(e.id)}>{cleared.has(e.id) ? 'cleared by the bank' : 'not cleared yet'}</ChipButton>
                )}
              </li>
            ))}
          </ul>
          <p className="dl-note">
            {rec.bankOnly.length ? `On the bank statement but not in the ledger: ${rec.bankOnly.map((b) => `${b.id} ${formatMoney(b.cents)}`).join(', ')}. ` : ''}
            {rec.ledgerOnly.length ? `In the ledger but not yet on the statement: ${rec.ledgerOnly.map((b) => `${b.id} ${formatMoney(b.cents)}`).join(', ')}. ` : ''}
            {rec.bankOnly.length + rec.ledgerOnly.length === 0 ? 'Nothing is outstanding. ' : ''}
            {`Bank-only items minus ledger-only items is ${formatMoney(rec.outstanding)}, and the bank is ${formatMoney(absolute(rec.difference))} ${rec.difference < 0n ? 'below' : 'above'} the ledger.`}
          </p>
        </Box>
        <div className="dl-chips">
          <Provenance kind="illustrative">an invented company and bank</Provenance>
          <Provenance kind="real">posting, reversal and reconciliation run here on BigInt cents</Provenance>
        </div>
        <Hint block>Simplified bookkeeping, not accounting or legal advice. A correction is a reversing entry then the right one, so history is kept; the id check is the same idea as an idempotency key.</Hint>
      </div>
    </StageFrame>
  );
}
