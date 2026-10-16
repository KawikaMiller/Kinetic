import { useMemo, useState, type ReactNode } from 'react';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { cartCaption } from './captions';
import { dollars, ITEMS_MAX, ITEMS_MIN, makeCart, MODES, RATE_MAX_BP, RATE_STEP_BP, subtotal, taxView, type Granularity, type Mode, type Representation } from './cart';
import { LONG_RECEIPT, OPENING } from './opening';

const MODE_TONE: Record<Mode, 'amber' | 'pink' | 'sky'> = { 'half-up': 'amber', 'half-even': 'pink', truncate: 'sky' };
const percent = (bp: number) => `${(bp / 100).toFixed(2)}%`;
const drift = (d: number) => (d === 0 ? '0' : d > 0 ? `+${d}` : String(d));

/** Scene 3: tax on a seeded cart, in float64 dollars and in integer cents, against exact rational arithmetic. */
export function CartScene({ picker }: { picker: ReactNode }) {
  const [items, setItems] = useState(OPENING.cents.items);
  const [bp, setBp] = useState(OPENING.cents.bp);
  const [mode, setMode] = useState<Mode>(OPENING.cents.mode);
  const [granularity, setGranularity] = useState<Granularity>(OPENING.cents.granularity);
  const [representation, setRepresentation] = useState<Representation>(OPENING.cents.representation);
  const [seed, setSeed] = useState(OPENING.cents.seed);

  const cart = useMemo(() => makeCart(items, seed), [items, seed]);
  const view = useMemo(() => taxView(cart, bp, mode, granularity, representation), [cart, bp, mode, granularity, representation]);
  const table = useMemo(() => MODES.map((m) => ({ mode: m, float: taxView(cart, bp, m.id, granularity, 'float'), cents: taxView(cart, bp, m.id, granularity, 'cents') })), [cart, bp, granularity]);

  return (
    <StageFrame
      height={480}
      intro={cartCaption(view, mode, granularity)}
      introKey={`${items}-${seed}-${bp}-${mode}-${granularity}-${representation}`}
      stats={
        <Stats>
          <Stat label="Subtotal" value={`$${dollars(subtotal(cart))}`} sub={`${items} items, made-up prices`} />
          <Stat label="Tax" value={`$${dollars(view.tax)}`} color="var(--info)" sub={representation === 'float' ? 'float64 dollars' : 'integer cents'} />
          <Stat label="Exact tax" value={`$${dollars(view.exact)}`} color="var(--info)" sub="BigInt rational arithmetic" />
          <Stat label="Drift" value={`${drift(view.drift)} ${Math.abs(view.drift) === 1 ? 'cent' : 'cents'}`} color={view.drift === 0 ? 'var(--ok)' : 'var(--bad)'} sub="against the exact answer" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'no drift', shape: 'square' }, { color: 'var(--bad)', label: 'drifted from the exact answer', shape: 'square' }, { color: 'var(--amber)', label: 'half up', shape: 'square' }, { color: 'var(--pink)', label: 'half to even', shape: 'square' }, { color: 'var(--sky)', label: 'truncate', shape: 'square' }]} />}
      controls={[
        picker,
        <>
          <Segmented label="Representation" value={representation} onChange={setRepresentation} options={[{ value: 'float', label: 'float64 dollars' }, { value: 'cents', label: 'integer cents' }]} />
          <Toggle label="Round" value={granularity === 'total'} onChange={(v) => setGranularity(v ? 'total' : 'line')} off="each line" on="the total" />
        </>,
        <>
          <span className="np-label">Rounding</span>
          {MODES.map((m) => (
            <ChipButton key={m.id} tone={MODE_TONE[m.id]} on={mode === m.id} onClick={() => setMode(m.id)}>{m.label}</ChipButton>
          ))}
        </>,
        <>
          <Slider label="Items" value={items} min={ITEMS_MIN} max={ITEMS_MAX} onChange={setItems} />
          <Slider label="Tax rate" value={bp} min={0} max={RATE_MAX_BP} step={RATE_STEP_BP} onChange={setBp} format={percent} />
          <SeedField seed={seed} onSeed={setSeed} />
          <ChipButton tone="violet" on={items === LONG_RECEIPT.items && bp === LONG_RECEIPT.bp} onClick={() => { setItems(LONG_RECEIPT.items); setBp(LONG_RECEIPT.bp); }}>Tax on a long receipt</ChipButton>
        </>,
      ]}
    >
      <div className="np-stage stage-pad">
        <table className="data-table np-table">
          <caption>Drift in cents against exact arithmetic, rounding {granularity === 'line' ? 'each line' : 'the total'}</caption>
          <thead>
            <tr><th>Rounding</th><th>float64 dollars</th><th>integer cents</th></tr>
          </thead>
          <tbody>
            {table.map((row) => (
              <tr key={row.mode.id} className={row.mode.id === mode ? 'np-current' : undefined}>
                <td style={{ color: `var(--${MODE_TONE[row.mode.id]})` }}>{row.mode.label}</td>
                <td style={{ color: row.float.drift === 0 ? 'var(--ok)' : 'var(--bad)' }}>{drift(row.float.drift)}</td>
                <td style={{ color: row.cents.drift === 0 ? 'var(--ok)' : 'var(--bad)' }}>{drift(row.cents.drift)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="np-facts" aria-label="Single cases in real JavaScript">
          <li><code>0.1 + 0.2</code> is <code>{String(0.1 + 0.2)}</code></li>
          <li><code>(1.005).toFixed(2)</code> is <code>{JSON.stringify((1.005).toFixed(2))}</code></li>
          <li><code>Math.round(1.005 * 100)</code> is <code>{Math.round(1.005 * 100)}</code></li>
        </ul>
        <p className="np-note">
          Half up and half to even differ only when the amount is exactly halfway between two cents, and a float cannot always tell that it is. The Money, Ledgers &amp; Double-Entry Bookkeeping lesson shows what a ledger does with the remainder.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the float64 results and the single-case facts are real JavaScript</Provenance>
        <Provenance kind="illustrative">the cart's prices and quantities are made up from a seed</Provenance>
        <ClaimLabel kind="standard">IEEE 754's default rounding is to nearest with ties to even (from memory: verify the clause before citing it)</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
