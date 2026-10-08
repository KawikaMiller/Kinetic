import { useMemo, useState, type ReactNode } from 'react';
import { Toggle } from '../../components/ui';
import { LIFETIME_SCHEDULE, MANUAL_LIFETIME_DAYS, manualScenario } from './model';
import { ScenarioView } from './ScenarioView';

/** Five days before notAfter, so the first thing to drag is the cursor across the deadline. */
const START_DAY = MANUAL_LIFETIME_DAYS - 5;
const SLOW_CA_LIMIT_DAYS = LIFETIME_SCHEDULE[0].maxDays;

export function ManualScene({ picker }: { picker: ReactNode }) {
  const [ownerLeft, setOwnerLeft] = useState(true);
  const scenario = useMemo(() => manualScenario(ownerLeft), [ownerLeft]);
  return (
    <ScenarioView
      picker={picker}
      scenario={scenario}
      initialDay={START_DAY}
      controls={<Toggle label="The person who set this up" value={ownerLeft} onChange={setOwnerLeft} off="Still on the team" on="Left the team" />}
      tail={ownerLeft ? 'The reminder went to someone who is gone: drag Today past notAfter.' : 'The owner is still here and renews by hand when the reminder arrives.'}
      hint={
        <>
          Scripted timeline for a fictional service: a {MANUAL_LIFETIME_DAYS}-day certificate issued by hand (public CAs could issue up to {SLOW_CA_LIMIT_DAYS} days before 15 March 2026). Validity is checked in UTC, from notBefore
          through notAfter inclusive (RFC 5280), so clients in every time zone fail at the same instant; only the wall-clock time they see differs.
        </>
      }
    />
  );
}
