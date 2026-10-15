import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, ControlGroup, Hint, Legend, Provenance, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { plainTone } from '../../core/tone';
import { disagreement, priceCaption } from './captions';
import {
  DEFAULT_HORIZON, EXTRA_DAYS_MAX, EXTRA_DAYS_STEP, HORIZON_MAX, HORIZON_MIN, ITEMS, TOUCHES_MAX,
  businessTerms, byInterest, byPayback, leaveIt, monthlyInterest, paybackMonths, paybackText, type Item,
} from './register';

type Estimates = Record<string, Pick<Item, 'touches' | 'extraDays'>>;

const openingEstimates = (): Estimates => Object.fromEntries(ITEMS.map((i) => [i.id, { touches: i.touches, extraDays: i.extraDays }]));
const oneDecimal = (v: number) => String(Math.round(v * 10) / 10);

function RankList({ title, hint, items, detail }: { title: string; hint: string; items: readonly Item[]; detail: (i: Item) => string }) {
  return (
    <Box variant="sunken" className="td-rank">
      <SectionTitle hint={hint}>{title}</SectionTitle>
      <ol>
        {items.map((i) => (
          <li key={i.id}>
            <span>{i.name}</span> <b>{detail(i)}</b>
          </li>
        ))}
      </ol>
    </Box>
  );
}

export function PriceScene({ picker }: { picker: ReactNode }) {
  const [estimates, setEstimates] = useState<Estimates>(openingEstimates);
  const [selectedId, setSelectedId] = useState(ITEMS[0].id);
  const [horizon, setHorizon] = useState(DEFAULT_HORIZON);
  const setCaption = useSetCaption();

  const items = useMemo(() => ITEMS.map((i) => ({ ...i, ...estimates[i.id] })), [estimates]);
  const selected = items.find((i) => i.id === selectedId)!;
  const terms = useMemo(() => businessTerms(items, horizon), [items, horizon]);
  const lead = disagreement(items);

  useEffect(() => {
    setCaption(priceCaption(items, selected, horizon), { quiet: true });
  }, [setCaption, items, selected, horizon]);

  const edit = (patch: Partial<Estimates[string]>) => setEstimates({ ...estimates, [selectedId]: { ...estimates[selectedId], ...patch } });

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Interest, whole register" value={`${oneDecimal(items.reduce((s, i) => s + monthlyInterest(i), 0))} days`} color="var(--bad)" sub="lost every month" />
          <Stat label="Worth fixing" value={terms.worth.length} sub={`pay back within ${plural(horizon, 'month')}`} />
          <Stat
            label="Those items pay back in"
            value={terms.paysBackMonths === null ? 'never' : paybackText(terms.paysBackMonths)}
            color="var(--ok)"
            sub={`${oneDecimal(terms.fixDays)} days of fixing, ${oneDecimal(terms.savedPerMonth)} days a month saved`}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'selected item', shape: 'square' },
            { color: 'var(--dim)', label: 'leave it: payback beyond the horizon, or never', shape: 'square' },
            { color: 'var(--bad)', label: 'interest: days lost each month', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Horizon" value={horizon} min={HORIZON_MIN} max={HORIZON_MAX} onChange={setHorizon} format={(v) => plural(v, 'month')} />
        </>,
        <ControlGroup key="estimates" label={`Your estimates for: ${selected.name}`}>
          <Slider label="Touches a month" value={selected.touches} min={0} max={TOUCHES_MAX} onChange={(touches) => edit({ touches })} />
          <Slider
            label="Extra days lost per touch"
            value={selected.extraDays}
            min={0}
            max={EXTRA_DAYS_MAX}
            step={EXTRA_DAYS_STEP}
            onChange={(extraDays) => edit({ extraDays })}
            format={oneDecimal}
          />
        </ControlGroup>,
      ]}
    >
      <div className="td stage-pad">
        <table className="data-table td-table">
          <caption className="td-sr">Debt register: pick a row to edit its estimates</caption>
          <thead>
            <tr>
              <th>Item</th>
              <th>Fix cost</th>
              <th>Touches a month</th>
              <th>Extra days a touch</th>
              <th>Interest a month</th>
              <th>Payback</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, k) => {
              const skip = leaveIt(i, horizon);
              return (
                <tr key={i.id} className={`td-row ${i.id === selectedId ? 'is-selected' : ''} ${skip ? 'is-dim' : ''}`}>
                  <td data-label="Item">
                    <button type="button" className={`td-pick tone-${plainTone(k)}`} aria-pressed={i.id === selectedId} onClick={() => setSelectedId(i.id)}>
                      <i className="td-dot" aria-hidden="true" />
                      {i.name}
                    </button>
                  </td>
                  <td data-label="Fix cost">{i.fixDays} days</td>
                  <td data-label="Touches a month">{i.touches}</td>
                  <td data-label="Extra days a touch">{oneDecimal(i.extraDays)}</td>
                  <td data-label="Interest a month">{oneDecimal(monthlyInterest(i))} days</td>
                  <td data-label="Payback">{paybackText(paybackMonths(i))}</td>
                  <td data-label="Verdict">{skip ? <span className="chip tone-dim">leave it</span> : 'worth fixing'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="td-ranks">
          <RankList title="Biggest pain first" hint="days of interest a month" items={byInterest(items)} detail={(i) => `${oneDecimal(monthlyInterest(i))} d`} />
          <RankList title="Best return first" hint="shortest payback" items={byPayback(items)} detail={(i) => paybackText(paybackMonths(i))} />
        </div>
        <p className="td-note">
          {lead.agree ? (
            <>
              Both orders put <b>{lead.pain.name}</b> first.
            </>
          ) : (
            <>
              <b>{lead.pain.name}</b> leads on pain but <b>{lead.ret.name}</b> leads on return: the biggest pain is not always the best buy.
            </>
          )}
        </p>

        <Box className="td-business">
          <SectionTitle hint="your estimates, said for a manager">Say it in business terms</SectionTitle>
          <p>
            The register costs about <b>{oneDecimal(terms.weeksLostPerQuarter)} weeks</b> of engineering a quarter.{' '}
            {terms.paysBackMonths === null ? (
              <>Nothing in it pays back within {plural(horizon, 'month')}.</>
            ) : (
              <>
                Fixing the {plural(terms.worth.length, 'item')} that pay back within {plural(horizon, 'month')} takes {oneDecimal(terms.fixDays)} days and <b>pays back in {paybackText(terms.paysBackMonths)}</b>.
              </>
            )}
          </p>
        </Box>

        <div className="td-notes">
          <Provenance kind="illustrative">six invented items; the fix costs, touches and days lost are made up</Provenance>
          <span className="td-claim">
            <ClaimLabel kind="practice">teams estimate interest, they do not measure it like this</ClaimLabel>
          </span>
          <span className="td-claim">
            <ClaimLabel kind="view">in this model interest is only the days lost when people work there; untouched code can still carry risk that this model leaves out</ClaimLabel>
          </span>
          <Hint block>In this model, interest only accrues where people work, so an item nobody touches has none.</Hint>
        </div>
      </div>
    </StageFrame>
  );
}
