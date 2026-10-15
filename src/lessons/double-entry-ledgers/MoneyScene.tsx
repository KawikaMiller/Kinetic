import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { moneyCaption } from './captions';
import {
  PAYMENT_CENTS, PAYMENT_COUNTS, REPRESENTATIONS, TAX_LINES, TAX_RATES, addMoney, formatMoney, parseMoney, splitBill, sumPayments, taxRounding, type Currency, type Representation,
} from './money';

const PARTS = [2, 3, 4, 5, 6, 7] as const;
const START_TOTAL = '100.00';
const SECOND_FROM = 500n;
const REP_OPTIONS = REPRESENTATIONS.map((r) => ({ value: r.value, label: r.label }));
const COUNT_OPTIONS = PAYMENT_COUNTS.map((n) => ({ value: n, label: n.toLocaleString('en-US') }));
const PART_OPTIONS = PARTS.map((p) => ({ value: p, label: String(p) }));
const RATE_OPTIONS = TAX_RATES.map((r) => ({ value: r.bp, label: r.label }));
const CURRENCIES: { value: Currency; label: string }[] = [
  { value: 'USD', label: '$5.00 USD' },
  { value: 'EUR', label: '€5.00 EUR' },
];

export function MoneyScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [rep, setRep] = useState<Representation>('float');
  const [n, setN] = useState<number>(10_000);
  const [totalText, setTotalText] = useState(START_TOTAL);
  const [total, setTotal] = useState(10_000n);
  const [totalError, setTotalError] = useState<string | null>(null);
  const [parts, setParts] = useState<number>(3);
  const [bp, setBp] = useState(1000);
  const [second, setSecond] = useState<Currency>('EUR');

  const sum = useMemo(() => sumPayments(rep, n), [rep, n]);
  const split = splitBill(total, parts);
  const tax = taxRounding(TAX_LINES, bp);
  const added = addMoney({ cents: SECOND_FROM, currency: 'USD' }, { cents: SECOND_FROM, currency: second });
  const code = REPRESENTATIONS.find((r) => r.value === rep)!.code;

  const caption = useMemo(() => moneyCaption(rep, n, total, parts, bp), [rep, n, total, parts, bp]);
  useEffect(() => {
    setCaption(caption, { quiet: true });
  }, [caption, setCaption]);

  const editTotal = (text: string) => {
    setTotalText(text);
    const r = parseMoney(text);
    setTotalError(r.ok ? null : r.error);
    if (r.ok) setTotal(r.value);
  };
  const diff = tax.difference < 0n ? -tax.difference : tax.difference;

  return (
    <StageFrame
      height={560}
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'drift, or a sum that is not the total' },
            { color: 'var(--ok)', label: 'exact' },
            { color: 'var(--info)', label: 'a share' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Represent money as" value={rep} onChange={setRep} options={REP_OPTIONS} />
        </>,
        <Segmented key="n" label="Payments of $0.10" value={n} onChange={setN} options={COUNT_OPTIONS} />,
        <>
          <span className="dl-field">
            <TextField label="Bill to split" value={totalText} onChange={editTotal} width={130} spellCheck={false} maxLength={20} />
            {totalError && <span className="dl-error" role="alert">{totalError}</span>}
          </span>
          <Segmented label="Ways" value={parts} onChange={setParts} options={PART_OPTIONS} />
          <Segmented label="Tax rate" value={bp} onChange={setBp} options={RATE_OPTIONS} />
          <Segmented label="Add $5.00 USD to" value={second} onChange={setSecond} options={CURRENCIES} />
        </>,
      ]}
    >
      <div className="stage-pad dl">
        <Box className="dl-card">
          <SectionTitle weight="regular" hint="a real loop, run now">{`Add up ${n.toLocaleString('en-US')} ${n === 1 ? 'payment' : 'payments'}`}</SectionTitle>
          <CodePanel lines={[code]} gutter="none" />
          <Stats>
            <Stat label="The program holds" value={sum.shown} color={sum.equal ? 'var(--ok)' : 'var(--bad)'} />
            <Stat label="Exact total" value={formatMoney(BigInt(n) * BigInt(PAYMENT_CENTS))} />
            <Stat label="Drift, in dollars" value={sum.drift} color={sum.equal ? 'var(--ok)' : 'var(--bad)'} />
          </Stats>
          <span className={`chip tone-${sum.equal ? 'ok' : 'bad'}`}>{sum.equal ? 'balance check passes' : 'balance check fails: sum is not the expected total'}</span>
        </Box>

        <div className="dl-pair">
          <Box className="dl-card">
            <SectionTitle weight="regular" hint={`${formatMoney(total)} in ${parts} ways`}>Split the bill</SectionTitle>
            <p className="dl-label">Rounding each share on its own</p>
            <div className="dl-shares">{split.naive.map((s, i) => <span key={i} className="chip tone-info">{formatMoney(s)}</span>)}</div>
            <span className={`chip tone-${split.naiveSum === total ? 'ok' : 'bad'}`}>adds up to {formatMoney(split.naiveSum)}</span>
            <p className="dl-label">Largest remainder</p>
            <div className="dl-shares">{split.fair.map((s, i) => <span key={i} className="chip tone-info">{formatMoney(s)}</span>)}</div>
            <span className={`chip tone-${split.fairSum === total ? 'ok' : 'bad'}`}>adds up to {formatMoney(split.fairSum)}</span>
          </Box>

          <Box className="dl-card">
            <SectionTitle weight="regular" hint="three lines of $0.35">Tax rounding</SectionTitle>
            <p className="dl-label">Rounded on each line: {tax.perLine.taxes.map(formatMoney).join(' + ')}</p>
            <span className="chip tone-info">tax {formatMoney(tax.perLine.tax)}, total {formatMoney(tax.perLine.total)}</span>
            <p className="dl-label">Rounded once on the subtotal</p>
            <span className="chip tone-info">tax {formatMoney(tax.perTotal.tax)}, total {formatMoney(tax.perTotal.total)}</span>
            <p className={diff === 0n ? 'muted' : 'dl-note'}>{diff === 0n ? 'The same at this rate.' : `They differ by ${plural(Number(diff), 'cent')}. Which step is rounded is a business rule, not a fact of arithmetic.`}</p>
          </Box>

          <Box className="dl-card">
            <SectionTitle weight="regular">Two currencies</SectionTitle>
            {added.ok ? <span className="chip tone-ok">{formatMoney(added.value.cents)} {added.value.currency}</span> : <span className="chip tone-bad wrap" role="alert">{added.error}</span>}
          </Box>
        </div>
        <div className="dl-chips">
          <Provenance kind="real">real JavaScript arithmetic runs here</Provenance>
          <Provenance kind="simulated">the payments, the bill and the lines are invented</Provenance>
        </div>
        <Hint block>Simplified bookkeeping, not accounting or legal advice. Real systems add currencies, tax, periods and controls; many jurisdictions expect an audit trail, so check yours.</Hint>
      </div>
    </StageFrame>
  );
}
