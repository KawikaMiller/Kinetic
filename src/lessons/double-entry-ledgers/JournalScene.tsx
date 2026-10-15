import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, TextField, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { journalCaption } from './captions';
import {
  ACCOUNTS, MAX_LINES, START_ENTRIES, TEMPLATES, balances, bisectStep, bisectionBound, bisectionDone, imbalance, middle, postAll, postEntry, prefixImbalance, startBisection, trialBalance,
  type AccountId, type Bisection, type Entry, type Ledger, type Line, type Side,
} from './ledger';
import { formatMoney, parseMoney } from './money';

interface Draft {
  account: AccountId;
  side: Side;
  text: string;
}

const draftOf = (lines: readonly Line[]): Draft[] => lines.map((l) => ({ account: l.account, side: l.side, text: `${l.cents / 100n}.${(l.cents % 100n).toString().padStart(2, '0')}` }));
const START_DRAFT = draftOf(TEMPLATES[0].lines);
const FIRST_NEW_ID = 1004;

type Notice = { tone: 'ok' | 'bad'; text: string } | null;

const absolute = (v: bigint) => (v < 0n ? -v : v);

export function JournalScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [ledger, setLedger] = useState<Ledger>(() => postAll(START_ENTRIES));
  const [draft, setDraft] = useState<Draft[]>(START_DRAFT);
  const [memo, setMemo] = useState(TEMPLATES[0].memo);
  const [bypass, setBypass] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [nextId, setNextId] = useState(FIRST_NEW_ID);
  const [bisected, setBisected] = useState<Bisection | null>(null);
  const [lastCheck, setLastCheck] = useState<string | null>(null);

  const t = trialBalance(ledger);
  const n = ledger.entries.length;
  const bis = bisected ?? startBisection(ledger);
  const done = bisectionDone(bis);
  const out = t.difference !== 0n;

  const caption = useMemo(() => journalCaption(ledger, notice?.text ?? null, bypass), [ledger, notice, bypass]);
  useEffect(() => {
    setCaption(caption, { quiet: true });
  }, [caption, setCaption]);

  const post = () => {
    const lines: Line[] = [];
    for (const [i, d] of draft.entries()) {
      const amount = parseMoney(d.text);
      if (!amount.ok) {
        setNotice({ tone: 'bad', text: `Line ${i + 1}: ${amount.error} Nothing was posted.` });
        return;
      }
      lines.push({ account: d.account, side: d.side, cents: amount.value });
    }
    const entry: Entry = { id: `T-${nextId}`, memo: memo || 'Entry', lines };
    const r = postEntry(ledger, entry, bypass);
    if (!r.ok) {
      setNotice({ tone: 'bad', text: r.error });
      return;
    }
    setLedger(r.ledger);
    setNextId((x) => x + 1);
    setBisected(null);
    setLastCheck(null);
    setNotice({ tone: 'ok', text: `Posted ${entry.id}${imbalance(lines) !== 0n ? `, out of balance by ${formatMoney(absolute(imbalance(lines)))}` : ''}.` });
  };
  const load = (label: string) => {
    const tpl = TEMPLATES.find((x) => x.label === label)!;
    setDraft(draftOf(tpl.lines));
    setMemo(tpl.memo);
  };
  const check = () => {
    const mid = middle(bis);
    const balanced = prefixImbalance(ledger, mid) === 0n;
    setLastCheck(`Up to entry ${mid} the books ${balanced ? 'balance' : 'are out of balance'}.`);
    setBisected(bisectStep(ledger, bis));
  };
  const edit = (i: number, patch: Partial<Draft>) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <StageFrame
      height={600}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'debit side' },
            { color: 'var(--violet)', label: 'credit side' },
            { color: 'var(--ok)', label: 'balanced' },
            { color: 'var(--bad)', label: 'out of balance, or the bad entry' },
            { color: 'var(--hi)', label: 'the range still being searched' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <div className="dl-chips" role="group" aria-label="Entry templates">
            {TEMPLATES.map((x) => <ChipButton key={x.label} tone="info" onClick={() => load(x.label)}>{x.label}</ChipButton>)}
          </div>
        </>,
        <>
          <Toggle label="Validation" value={bypass} onChange={setBypass} off="checks debits = credits" on="bypassed (bug)" />
          <Button variant="primary" onClick={post}>Post entry</Button>
        </>,
      ]}
    >
      <div className="stage-pad dl">
        <Box className="dl-card">
          <SectionTitle weight="regular" hint={`entry T-${nextId}`}>The entry you are writing</SectionTitle>
          <TextField label="Memo" value={memo} onChange={setMemo} width={220} maxLength={40} />
          <ul className="dl-draft">
            {draft.map((d, i) => (
              <li key={i} className="dl-draftrow">
                <select className="dl-select" aria-label={`Line ${i + 1} account`} value={d.account} onChange={(e) => edit(i, { account: e.target.value as AccountId })}>
                  {ACCOUNTS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
                <ChipButton tone={d.side === 'debit' ? 'info' : 'violet'} ariaLabel={`Line ${i + 1} side: ${d.side}. Press to switch`} onClick={() => edit(i, { side: d.side === 'debit' ? 'credit' : 'debit' })}>{d.side === 'debit' ? 'Dr' : 'Cr'}</ChipButton>
                <TextField ariaLabel={`Line ${i + 1} amount`} value={d.text} onChange={(text) => edit(i, { text })} width={110} spellCheck={false} maxLength={20} />
                <ChipButton tone="bad" ariaLabel={`Remove line ${i + 1}`} onClick={() => setDraft((x) => x.filter((_, j) => j !== i))}>remove</ChipButton>
              </li>
            ))}
          </ul>
          <Button disabled={draft.length >= MAX_LINES} onClick={() => setDraft((d) => [...d, { account: 'cash', side: 'debit', text: '0.00' }])}>Add a line</Button>
          {notice && <span className={`chip tone-${notice.tone} wrap`} role="status">{notice.text}</span>}
        </Box>

        <div className="dl-taccounts">
          {balances(ledger).map((b) => (
            <Box key={b.account.id} className="dl-t">
              <SectionTitle weight="regular" hint={`${b.account.normal}s raise it`}>{b.account.label}</SectionTitle>
              <div className="dl-tcols">
                <ul className="tone-info">{ledger.entries.flatMap((e) => e.lines.flatMap((l, k) => (l.account === b.account.id && l.side === 'debit' ? [<li key={`${e.id}-${k}`}>{formatMoney(l.cents)}</li>] : [])))}</ul>
                <ul className="tone-violet">{ledger.entries.flatMap((e) => e.lines.flatMap((l, k) => (l.account === b.account.id && l.side === 'credit' ? [<li key={`${e.id}-${k}`}>{formatMoney(l.cents)}</li>] : [])))}</ul>
              </div>
              <b className="dl-balance">{formatMoney(b.balance)} <span className="muted">{b.account.normal === 'debit' ? 'Dr' : 'Cr'}</span></b>
            </Box>
          ))}
        </div>

        <Box className="dl-card">
          <SectionTitle weight="regular" hint="debit balances left, credit balances right">Trial balance</SectionTitle>
          <div className="dl-trial">
            <span className="chip tone-info">debits {formatMoney(t.debitColumn)}</span>
            <span className="chip tone-violet">credits {formatMoney(t.creditColumn)}</span>
            <span className={`chip tone-${out ? 'bad' : 'ok'}`}>{out ? `out by ${formatMoney(absolute(t.difference))}` : 'balanced'}</span>
          </div>
        </Box>

        <Box className="dl-card">
          <SectionTitle weight="regular" hint={`${n} entries: at most ${bisectionBound(n)} checks`}>Find the bad entry</SectionTitle>
          {!out && <p className="muted">The books balance, so there is nothing to find. Turn the validation off and post an unbalanced entry to try it.</p>}
          {out && !done && (
            <>
              <p className="dl-note">The books balance up to entry {bis.lo} and are out up to entry {bis.hi}. Check the middle.</p>
              <Button variant="primary" onClick={check}>{`Check the books up to entry ${middle(bis)}`}</Button>
            </>
          )}
          {out && done && (
            <span className="chip tone-bad wrap">Entry {bis.hi}, {ledger.entries[bis.hi - 1].id}, is out of balance by {formatMoney(absolute(imbalance(ledger.entries[bis.hi - 1].lines)))}: found in {bis.steps} {bis.steps === 1 ? 'check' : 'checks'}.</span>
          )}
          {lastCheck && <p className="muted">{lastCheck}</p>}
          {out && bisected && <Button onClick={() => { setBisected(null); setLastCheck(null); }}>Start over</Button>}
        </Box>

        <Box className="dl-card">
          <SectionTitle weight="regular">The ledger</SectionTitle>
          <ul className="dl-ledger">
            {ledger.entries.map((e, i) => {
              const inRange = out && !done && i + 1 > bis.lo && i + 1 <= bis.hi;
              const culprit = out && done && i + 1 === bis.hi;
              return (
                <li key={e.id} className={`log-row tone-${culprit ? 'bad' : inRange ? 'hi' : 'muted'}`}>
                  <b>{i + 1}. {e.id}</b> {e.memo}:{' '}
                  {e.lines.map((l, k) => <span key={k} className={`dl-line tone-${l.side === 'debit' ? 'info' : 'violet'}`}>{l.side === 'debit' ? 'Dr' : 'Cr'} {ACCOUNTS.find((a) => a.id === l.account)!.label} {formatMoney(l.cents)}</span>)}
                </li>
              );
            })}
          </ul>
        </Box>
        <div className="dl-chips">
          <Provenance kind="simulated">an invented company and chart of accounts</Provenance>
          <Provenance kind="real">the posting rule and the trial balance run here on BigInt cents</Provenance>
        </div>
        <Hint block>Simplified bookkeeping, not accounting or legal advice. A debit raises an asset or an expense and lowers a liability, equity or revenue; a credit does the opposite.</Hint>
      </div>
    </StageFrame>
  );
}
