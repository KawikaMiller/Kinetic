import type { ReactNode } from 'react';
import { pad2 } from '../../core/format';
import { pctText, sig } from '../distributions/fmt';
import {
  INSTANCE_RPS, desiredCount, MINUTES_PER_DAY, POLICY_NAME, PRESET_NAME, PRICE_PER_INSTANCE_HOUR, VIOLATION_PCT, type Bill, type Controller, type FleetRun, type FleetSummary, type MinuteRow, type Policy,
  type Preset,
} from './model';

export const rps = (x: number): string => `${sig(x, 4)}/s`;

/** The clock time of a minute of the run, as day 1 or day 2. */
export function clockText(minute: number): string {
  const day = Math.floor(minute / MINUTES_PER_DAY) + 1;
  const m = minute % MINUTES_PER_DAY;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)} on day ${day}`;
}

export const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "a", "a and b", "a, b and c". */
export const joinList = (items: readonly string[]): string => (items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

export const money =(x: number): string => `$${x.toFixed(2)}`;

/** What the controller saw and did in one minute, from that minute's own row. */
export function minuteCaption(row: MinuteRow, c: Controller, run: FleetRun): ReactNode {
  const capacity = row.ready * INSTANCE_RPS;
  const current = c.warmingCounts ? row.ready + row.warming : row.ready;
  const formula = desiredCount(current, row.utilPct, c.targetPct);
  const acted =
    row.change > 0 ? <> It launched {row.change}, which serve after {c.warmupMin + 1} {c.warmupMin + 1 === 1 ? 'minute' : 'minutes'}.</>
    : row.change < 0 ? <> It removed {-row.change}.</>
    : <> It changed nothing.</>;
  const sees = c.policy === 'predictive' && row.minute + 1 >= MINUTES_PER_DAY
    ? <>It is provisioning from yesterday&apos;s load, and wants {row.desired} instances.</>
    : <>Utilisation reads {row.utilPct}% against a {c.targetPct}% target, so ⌈{current} × {row.utilPct} ÷ {c.targetPct}⌉ = {formula}{formula === row.desired ? '' : `, held to ${row.desired} by the minimum, the maximum or the schedule`}.</>;
  return (
    <>
      At {clockText(row.minute)} the load is {rps(row.load)} against {row.ready} ready {row.ready === 1 ? 'instance' : 'instances'} ({rps(capacity)}), with {row.warming} warming.{' '}
      {row.dropped > 0 ? <><span className="hl bad">{rps(row.dropped)} is dropped.</span></> : row.violation ? <><span className="hl bad">Everything is served but the fleet is over {VIOLATION_PCT}% busy.</span></> : <>Everything is served.</>}{' '}
      {sees}{acted} Over day 2 this run has <span className="hl">{run.summary.violationMinutes}</span> violation minutes.
    </>
  );
}

/** Whether a cell of the policy table is the cheapest one in its column that has no violations. */
export function cheapestClean(table: Record<Policy, Record<Preset, FleetSummary>>, policy: Policy, preset: Preset): boolean {
  const clean = (Object.keys(table) as Policy[]).filter((p) => table[p][preset].violationMinutes === 0);
  if (!clean.includes(policy)) return false;
  return clean.every((p) => table[policy][preset].instanceMinutes <= table[p][preset].instanceMinutes);
}

export function policyCaption(table: Record<Policy, Record<Preset, FleetSummary>>, policy: Policy, preset: Preset): ReactNode {
  const cell = table[policy][preset];
  const policies = Object.keys(table) as Policy[];
  const fewest = Math.min(...policies.map((p) => table[p][preset].violationMinutes));
  const best = policies.filter((p) => table[p][preset].violationMinutes === fewest);
  return (
    <>
      {capitalise(POLICY_NAME[policy])} on the {PRESET_NAME[preset]} has <span className={`hl ${cell.violationMinutes > 0 ? 'bad' : 'ok'}`}>{cell.violationMinutes}</span> violation minutes on day 2
      for {sig(cell.instanceMinutes)} instance-minutes. On this load the fewest violation minutes ({fewest}) belong to {joinList(best.map((p) => POLICY_NAME[p]))}.
      {preset === 'noisy' && policy !== 'reactive' && (
        <> Noise does not repeat, so this is not forecasting: {policy === 'predictive' ? 'it provisions for the highest load of the previous day over the next few minutes' : 'it keeps a raised minimum whatever the noise does'}, which is padding. The reactive loop has {table.reactive.noisy.violationMinutes} violation minutes for {sig(table.reactive.noisy.instanceMinutes)} instance-minutes.</>
      )}
    </>
  );
}

export function billCaption(preset: Preset, b: Bill): ReactNode {
  return (
    <>
      On the {PRESET_NAME[preset]} the autoscaled fleet used {sig(b.autoHours)} instance-hours against {sig(b.staticHours)} for a fixed fleet of {b.staticInstances} sized for the busiest minute:
      {b.saving === null ? ' no saving to report' : <> <span className="hl ok">{pctText(b.saving, 0)}</span> saved</>}, at the price of{' '}
      <span className={`hl ${b.violationMinutes > 0 ? 'bad' : 'ok'}`}>{b.violationMinutes}</span> violation minutes.
    </>
  );
}

export const priceNote = `${money(PRICE_PER_INSTANCE_HOUR)} per instance-hour`;
