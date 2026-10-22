import type { ReactNode } from 'react';
import { integer, plural, sig } from '../../core/format';
import { CLIENT_TIMEOUT_MS, DB_CAPACITY, EXPIRE_MS, KEYS, SIM_MS, dbKeepsUp, gapView, littleEstimate, type LogEntry, type Mitigations, type StampedeRun } from './model';

export const msText = (ms: number): string => (ms >= 1000 ? `${sig(ms / 1000)} s` : `${sig(ms)} ms`);

/** The mitigations that are on, in words. */
export function mitigationNames(m: Mitigations): string[] {
  return [m.coalesce && 'request coalescing', m.stale && 'serve stale while revalidating', m.lock && 'a lock with a timeout', m.beta > 0 && `early refresh (β ${m.beta})`].filter((x): x is string => x !== false);
}

/** What the run measured, against the Little's-law estimate. */
export function runCaption(run: StampedeRun): ReactNode {
  const { lambda, recomputeMs, mitigations } = run.config;
  const s = run.summary;
  const names = mitigationNames(mitigations);
  const estimate = littleEstimate(lambda, recomputeMs);
  const keepsUp = dbKeepsUp(lambda, recomputeMs);
  return (
    <>
      At {integer(lambda)}/s with a {msText(recomputeMs)} recompute and {names.length ? names.join(' and ') : 'no protection'}, the key expires at {msText(EXPIRE_MS)}.{' '}
      {names.length === 0 ? (
        <>
          About λ × R = {sig(estimate)} recomputes would pile up if the database kept up; {keepsUp ? 'it does' : `it cannot (it runs ${DB_CAPACITY} at full speed), so every query slows down`}, and {integer(s.herd)} started before the first finished.{' '}
        </>
      ) : (
        <>
          {integer(s.queries)} {s.queries === 1 ? 'query reached' : 'queries reached'} the database.{' '}
        </>
      )}
      {s.firstWriteMs === null ? (
        <span className="hl bad wrap">no value reached the cache inside the {SIM_MS / 1000} s run</span>
      ) : (
        <>The first value was cached at {msText(s.firstWriteMs)}; the 99th-percentile latency was {msText(s.p99Ms)}.</>
      )}{' '}
      {s.outcomes.timeout > 0 ? (
        <span className="hl orange wrap">
          {integer(s.outcomes.timeout)} timed out, {plural(s.retries, 'retry', 'retries')} added load
        </span>
      ) : (
        <>No request timed out.</>
      )}
    </>
  );
}

export const runIntro = (run: StampedeRun): ReactNode => (
  <>
    One hot key is served from a cache, and its value expires at {msText(EXPIRE_MS)}. {integer(run.config.lambda)} requests a second keep arriving. Press play to watch what the database sees.
  </>
);

export function runMilestones(run: StampedeRun): { t: number; say: ReactNode }[] {
  const s = run.summary;
  const out: { t: number; say: ReactNode }[] = [{ t: EXPIRE_MS, say: <>The key expires. From now every request misses until a fresh value is cached, so each one reaches the database.</> }];
  if (s.firstTimeoutMs !== null) out.push({ t: s.firstTimeoutMs, say: <>The first clients give up after {msText(CLIENT_TIMEOUT_MS)} and retry, which sends more queries to a database that is already behind.</> });
  if (s.firstWriteMs !== null) out.push({ t: s.firstWriteMs, say: <>The first value lands in the cache at {msText(s.firstWriteMs)}. {integer(s.herd)} queries had started before the first one finished; later requests are hits.</> });
  return out;
}

export const runSummary = (run: StampedeRun): ReactNode => runCaption(run);

const LOG_TEXT: Record<LogEntry['kind'], (q: number, prev: number) => string> = {
  start: (q) => `recompute #${q + 1} starts and takes the in-flight marker`,
  done: (q) => `recompute #${q + 1}: the database query finishes`,
  released: (q) => `recompute #${q + 1}: the marker is released, but its value is not in the cache yet`,
  written: (q) => `recompute #${q + 1}: its value lands in the cache`,
  second: (q, prev) => `recompute #${q + 1} starts while #${prev + 1} is still being written: two in flight`,
};

export const logText = (e: LogEntry): string => LOG_TEXT[e.kind](e.query, e.query - 1);

/** What the singleflight run shows: from the run's own violation and gap. */
export function singleflightCaption(run: StampedeRun, seed: number, releaseEarly: boolean): ReactNode {
  const gap = gapView(run);
  const lambda = run.config.lambda;
  if (run.violation && gap && gap.secondMs !== null) {
    return (
      <>
        Seed {seed}: the first recompute finished at {msText(gap.doneMs)} and its value was due in the cache at {msText(gap.writeMs)}. A request arrived at {msText(gap.secondMs)}, inside that gap, found no marker and no value, and started a second recompute.{' '}
        <span className="hl bad wrap">{run.violation.message}</span>
      </>
    );
  }
  return (
    <>
      Seed {seed} at {integer(lambda)}/s: {run.summary.queries} {run.summary.queries === 1 ? 'recompute' : 'recomputes'} for this expiry, never more than {run.summary.peakInFlight} in flight.{' '}
      {releaseEarly ? 'The marker is released early, but on this seed no request arrived in the gap.' : <span className="hl ok wrap">the marker is held until the value is cached</span>}
    </>
  );
}

export const jitterCaption = (busiest: number, jitterPct: number): ReactNode => (
  <>
    {jitterPct === 0 ? `All ${integer(KEYS)} keys got the same TTL at deploy time, so ${integer(busiest)} expire in the busiest second.` : `Spreading the TTLs by ±${jitterPct}% leaves at most ${integer(busiest)} of ${integer(KEYS)} keys expiring in one second.`}
  </>
);
