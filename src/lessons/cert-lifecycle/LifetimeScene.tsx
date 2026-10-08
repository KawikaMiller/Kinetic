import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { DAY, LIFETIME_SCHEDULE, formatUtc, maxLifetimeDays, renewAfterDays, renewalsPerYear, utc } from './model';

const FIRST_YEAR = 2025;
const LAST_MONTH_INDEX = (2030 - FIRST_YEAR) * 12 + 11;
const DEFAULT_MONTH_INDEX = (2026 - FIRST_YEAR) * 12 + 8;
const BAR_MAX_DAYS = LIFETIME_SCHEDULE[0].maxDays;
const BAR_MAX_RENEWALS = 12;
/** More renewals than this a year is too many to do by hand (shown as the costly side). */
const MANY_RENEWALS_A_YEAR = 4;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const issueDate = (index: number) => utc(FIRST_YEAR + Math.floor(index / 12), (index % 12) + 1, 1);
const monthLabel = (index: number) => `${MONTHS[index % 12]} ${FIRST_YEAR + Math.floor(index / 12)}`;
const stepLabel = (from: number | null) => (from === null ? 'before 15 Mar 2026' : `from ${formatUtc(from).slice(0, 10)}`);

export function LifetimeScene({ picker }: { picker: ReactNode }) {
  const [month, setMonth] = useState(DEFAULT_MONTH_INDEX);
  const issued = issueDate(month);
  const days = maxLifetimeDays(issued);
  const perYear = renewalsPerYear(days);
  const lastDeadline = formatUtc(issued + days * DAY).slice(0, 10);

  useIntroCaption(
    <>
      A public certificate issued in <b>{monthLabel(month)}</b> may live at most <span className="hl info">{days} days</span>: if nobody renews it, it expires on {lastDeadline}. Renewing at two thirds of its life means a renewal every{' '}
      {Math.round(renewAfterDays(days))} days, <b>{perYear.toFixed(1)}</b> a year.
    </>,
    [month, days, perYear, lastDeadline],
  );

  return (
    <StageFrame
      height={400}
      stats={
        <Stats>
          <Stat label="Issued" value={monthLabel(month)} />
          <Stat label="Longest allowed" value={`${days} days`} color="var(--info)" />
          <Stat label="Renewals a year" value={perYear.toFixed(1)} sub="at two thirds of the life" color={perYear > MANY_RENEWALS_A_YEAR ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'the limit for the chosen issue date', shape: 'square' },
            { color: 'var(--dim)', label: 'other steps', shape: 'square' },
          ]}
        />
      }
      controls={[picker, <Slider key="m" label="Certificate issued in" value={month} min={0} max={LAST_MONTH_INDEX} onChange={setMonth} format={monthLabel} />]}
    >
      <div className="cl stage-pad">
        {LIFETIME_SCHEDULE.map((step) => {
          const active = step.maxDays === days;
          return (
            <div key={step.maxDays} className="cl-step">
              <span className="cl-step-label">{stepLabel(step.from)}</span>
              <Bar value={step.maxDays} max={BAR_MAX_DAYS} tone={active ? 'info' : 'dim'} height={14} label="longest life" trailing={`${step.maxDays} days`} ariaLabel={`Maximum lifetime ${step.maxDays} days, ${stepLabel(step.from)}`} />
              <Bar value={renewalsPerYear(step.maxDays)} max={BAR_MAX_RENEWALS} tone={active ? 'info' : 'dim'} height={8} label="renewals a year" trailing={renewalsPerYear(step.maxDays).toFixed(1)} ariaLabel={`${renewalsPerYear(step.maxDays).toFixed(1)} renewals a year`} />
            </div>
          );
        })}
        <Hint block>
          Dates are the CA/Browser Forum schedule for publicly trusted TLS certificates (Ballot SC-081v3, 2025); a private CA is not bound by it. Renewing at two thirds of the lifetime is a common convention, not a rule. A yearly
          calendar reminder does not fit a schedule like this: automate renewal and monitor the certificate the server presents.
        </Hint>
      </div>
    </StageFrame>
  );
}
