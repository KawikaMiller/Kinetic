import type { ReactNode } from 'react';
import { calendarLabel } from '../../core/gantt';
import {
  FAILURE_NAME, LOG_DEPLOYMENTS, LOG_START, LOG_WEEKS, RESTORE_END_NAME, SPLIT_FACTOR, leadTimeLabel, type Definitions, type DeliveryMetrics, type Gaming, type LogMetrics,
  type Pipeline, type Reported,
} from './model';
import { pctText, sig } from '../../core/format';

export const hours = (x: number): string => `${sig(x)} h`;
export const minutes = (x: number): string => `${sig(x)} min`;
export const perWeek = (x: number): string => `${sig(x)}/week`;
const NO_RESTORE = 'no failures, so nothing to restore from';

/** "Mon 09:00" for a number of hours since the log's start (a Monday, UTC). */
export const logClock = (hoursSinceStart: number): string => calendarLabel(Date.parse(LOG_START) + hoursSinceStart * 3_600_000, 'hour');

const releaseRule = (p: Pipeline): string => (p.mode === 'batch' ? `${p.batch} ${p.batch === 1 ? 'change' : 'changes'} to a release` : `a release every ${p.cadenceDays} working ${p.cadenceDays === 1 ? 'day' : 'days'}`);

export function pipelineCaption(p: Pipeline, m: DeliveryMetrics, shown: Reported, gaming: Gaming): ReactNode {
  const restore = m.restoreMedianMin === null ? NO_RESTORE : `a median ${minutes(m.restoreMedianMin)} to restore`;
  const lead = m.leadHoursMedian === null ? 'no release yet' : `a median ${hours(m.leadHoursMedian)} from merge to live`;
  return (
    <>
      {p.changesPerDay} changes a day, {releaseRule(p)}: <span className="hl">{sig(m.deploymentsPerWeek)} releases a week</span>, {lead} (working hours),{' '}
      {m.failureRate === null ? 'no releases to fail' : <>{pctText(m.failureRate, 0)} of releases failing</>}, {restore}.
      {gaming === 'split' && <> Splitting each change into {SPLIT_FACTOR} deploys reports <span className="hl orange">{perWeek(shown.deploymentsPerWeek)}</span>, while the merge-to-live time for a change stays {m.leadHoursMedian === null ? 'the same' : hours(m.leadHoursMedian)}.</>}
      {gaming === 'rollbacks-only' && m.failureRate !== null && shown.failureRate !== null && m.failures === m.rollbacks && (
        <> Counting only rollbacks changes nothing here: no failure was fixed forward, so there is nothing to hide.</>
      )}
      {gaming === 'rollbacks-only' && m.failureRate !== null && shown.failureRate !== null && m.failures !== m.rollbacks && (
        <> Counting only rollbacks reports <span className="hl orange">{pctText(shown.failureRate, 0)}</span> against the real <span className="hl info">{pctText(m.failureRate, 0)}</span>: {m.failures - m.rollbacks} fixed-forward {m.failures - m.rollbacks === 1 ? 'failure vanishes' : 'failures vanish'} and nothing improved.</>
      )}
    </>
  );
}

export function logCaption(m: LogMetrics, d: Definitions): ReactNode {
  const skew = m.leadMean / m.leadMedian;
  return (
    <>
      Of {LOG_DEPLOYMENTS} deployments in {LOG_WEEKS} weeks, lead time ({leadTimeLabel(d.leadStart)}) has a median of <span className="hl">{hours(m.leadMedian)}</span> and a mean of {hours(m.leadMean)}, {sig(skew, 2)}× the median
      {skew > 1.05 ? ': a few slow changes pull the mean up' : ''}. A failure is {FAILURE_NAME[d.failure]}: {m.failures} of {LOG_DEPLOYMENTS}, <span className="hl">{pctText(m.failureRate, 0)}</span>.{' '}
      {m.restoreMedian === null
        ? <>There is no failure, so there is no time to restore.</>
        : <>Restore time ends at {RESTORE_END_NAME[d.restoreEnd]}: median <span className="hl">{minutes(m.restoreMedian)}</span>, mean {minutes(m.restoreMean!)}.</>}
    </>
  );
}
