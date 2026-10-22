import type { ReactNode } from 'react';
import { integer, pct, plural, sig } from '../../core/format';
import { actualEndpoints, callMs, extraHopMs, failingAt, knownEndpoints, type CertRun, type Outage, type Split } from './mesh';
import { CRASH_AT_MS, HORIZON_MS, READY_AGAIN_MS, UNREADY_AT_MS, VICTIM, staleBound, ttlMs } from './registry';
import { emptyServices, type RegistryRun } from './run';

export const secText = (ms: number): string => `${sig(ms / 1000)} s`;
export const minText = (min: number): string => (min >= 120 ? `${sig(min / 60)} h` : `${sig(min)} min`);

/** What the registry run measured around the crash, from the run's own numbers. */
export function registryCaption(run: RegistryRun): ReactNode {
  const c = run.config;
  const empty = emptyServices(c);
  const bound = staleBound(c);
  return (
    <>
      Heartbeats every 2 s, and an eviction after {secText(ttlMs(c))} of silence.{' '}
      {empty.length > 0 && <span className="hl bad wrap">no endpoints for {empty.join(' and ')}: {integer(run.noEndpoint)} requests had nowhere to go. </span>}
      {c.crash && c.counts.orders > 0 ? (
        run.evictedAfterMs === null ? (
          <span className="hl bad wrap">{VICTIM} stopped at {secText(CRASH_AT_MS)} and the registry never evicted it: {plural(run.sentToDead, 'request')} went to the dead instance{run.lastHitAfterMs === null ? '' : `, the last ${secText(run.lastHitAfterMs)} after the crash`}</span>
        ) : (
          <>
            {VICTIM} stopped at {secText(CRASH_AT_MS)}; the registry evicted it {secText(run.evictedAfterMs)} later.{' '}
            {run.stoppedAfterMs === null ? (
              <span className="hl orange wrap">The client cache had not refreshed by the time the run ended at {secText(HORIZON_MS)}, so clients were still sending (the bound is {secText(bound)})</span>
            ) : (
              <>The client cache dropped it {secText(run.stoppedAfterMs)} after the crash, {run.stoppedAfterMs <= bound ? 'within' : 'beyond'} the {secText(bound)} bound</>
            )}
            . {plural(run.sentToDead, 'request')} went to the dead instance{run.lastHitAfterMs === null ? '' : `, the last ${secText(run.lastHitAfterMs)} after the crash`}.
          </>
        )
      ) : (
        <>Nothing crashes in this run.</>
      )}{' '}
      {run.falseEvictions > 0 ? <span className="hl orange wrap">{plural(run.falseEvictions, 'live instance')} falsely evicted after lost heartbeats</span> : <>No live instance was evicted.</>}
    </>
  );
}

export function healthCaption(run: RegistryRun): ReactNode {
  const c = run.config;
  return (
    <>
      {VICTIM} fails its readiness check at {secText(UNREADY_AT_MS)} and recovers at {secText(READY_AGAIN_MS)}, without a restart.{' '}
      {c.honourReadiness ? (
        <>The registry leaves it out of listings, so {run.unreadyStopAfterMs === null ? 'no request reached it while it was not ready' : `the last request reached it ${secText(run.unreadyStopAfterMs)} after it failed`}; {plural(run.sentWhileUnready, 'request')} went to it and {plural(run.errors, 'error answer')} came back.</>
      ) : (
        <span className="hl bad wrap">the registry ignores readiness, so {plural(run.sentWhileUnready, 'request')} went to it while it was not ready and {plural(run.errors, 'error answer')} came back</span>
      )}
    </>
  );
}

export function meshCaption(mesh: boolean, canary: Split | null, att: { expected: number; worst: number }, appRetries: number, meshRetries: number): ReactNode {
  return (
    <>
      {mesh ? `A sidecar beside each service adds ${extraHopMs(true)} ms to a ${callMs(false)} ms call: ${callMs(true)} ms.` : `No mesh: a call takes ${callMs(false)} ms and nothing sits beside the services.`}{' '}
      {canary ? <>Of {integer(canary.canary + canary.stable)} requests, {pct(canary.observedPct / 100, 1)} reached the canary against the {canary.expectedPct}% set (three standard errors is {sig(canary.threeSePct)} points). </> : null}
      With {appRetries} app {appRetries === 1 ? 'retry' : 'retries'} and {meshRetries} mesh {meshRetries === 1 ? 'retry' : 'retries'}, a failing backend sees {sig(att.expected)} calls per request on average and {att.worst} at worst
      {appRetries > 0 && meshRetries > 0 ? <>: <span className="hl orange wrap">the retries multiply</span></> : null}.
    </>
  );
}

export function controlCaption(outage: Outage, certs: CertRun, now: number): ReactNode {
  const failing = failingAt(certs, now);
  const down = now >= outage.start && now < outage.start + outage.length;
  return (
    <>
      At minute {now} the control plane is {down ? <span className="hl orange wrap">away</span> : 'up'}. Proxies know {knownEndpoints(outage, now)} of the {actualEndpoints(now)} endpoints that exist.{' '}
      {failing.length ? <span className="hl bad wrap">certificates have expired for {failing.join(', ')}: their calls fail</span> : <span className="hl ok wrap">every certificate is still valid: calls keep working</span>}
    </>
  );
}
