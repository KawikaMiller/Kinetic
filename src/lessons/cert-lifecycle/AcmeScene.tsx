import { useMemo, useState, type ReactNode } from 'react';
import { Segmented, Slider } from '../../components/ui';
import { ACME_LIFETIME_DAYS, ACME_START, DAY, acmeScenario, alertsBeforeFix, renewAfterDays, type RenewalProblem } from './model';
import { ScenarioView } from './ScenarioView';

const FIX_MIN_DAY = 55;
const FIX_MAX_DAY = 100;
/** After the 90-day certificate has expired, so the default shows the whole story: alerts, expiry, recovery. */
const DEFAULT_FIX_DAY = 93;
const START_DAY = 100;
const PROBLEMS: { value: RenewalProblem; label: string }[] = [
  { value: 'none', label: 'Working' },
  { value: 'dns', label: 'DNS challenge broken' },
  { value: 'rate-limit', label: 'Rate limited' },
];

export function AcmeScene({ picker }: { picker: ReactNode }) {
  const [problem, setProblem] = useState<RenewalProblem>('dns');
  const [fixDay, setFixDay] = useState(DEFAULT_FIX_DAY);
  const scenario = useMemo(() => acmeScenario({ problem, fixedAt: ACME_START + fixDay * DAY, reload: true }), [problem, fixDay]);
  const window = renewAfterDays(ACME_LIFETIME_DAYS);
  return (
    <ScenarioView
      picker={picker}
      scenario={scenario}
      initialDay={START_DAY}
      controls={
        <>
          <Segmented label="Renewal job" value={problem} onChange={setProblem} options={PROBLEMS} />
          {problem !== 'none' && (
            <Slider label="Problem fixed on day" value={fixDay} min={FIX_MIN_DAY} max={FIX_MAX_DAY} onChange={setFixDay} format={(d) => (d <= ACME_LIFETIME_DAYS ? `day ${d}` : `day ${d}, after expiry`)} />
          )}
        </>
      }
      tail={
        problem === 'none'
          ? `The job renews on day ${window} of ${ACME_LIFETIME_DAYS}, long before anything is at risk.`
          : fixDay <= window
            ? `Fixed on day ${fixDay}, before the first renewal try on day ${window}: the job renews on its first try, so no try fails and no alert fires.`
            : fixDay <= ACME_LIFETIME_DAYS
            ? `Fixed on day ${fixDay}, still inside the window: ${alertsBeforeFix(fixDay)} of the 3 alerts fired and nobody was hurt.`
            : `Fixed on day ${fixDay}, after the certificate expired: handshakes fail until then.`
      }
      hint={
        <>
          Scripted timeline for a fictional service. The {ACME_LIFETIME_DAYS}-day lifetime and renewing when a third is left (day {window}) are common ACME conventions, not rules; the job tries once a day here, and the error
          wording is paraphrased. Alerts count down to the certificate the server actually presents, typically at 30, 14 and 7 days left.
        </>
      }
    />
  );
}
