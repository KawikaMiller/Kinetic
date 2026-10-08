import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import {
  ALERT_RATE, ALERT_WINDOW, ANALYSIS_THRESHOLD_PCT, DEPLOY_START, REPLICAS, REQ_PER_TICK, analysisWindow, canarySchedule, resolveFenceposts,
  served, type Run, type Strategy, type TickState, type Window,
} from './model';
import { share } from './view';

export interface DeployFrame extends Frame {
  t: number;
}

const pct = (n: number, d: number) => (d === 0 ? 'no requests' : `${((100 * n) / d).toFixed(1)}%`);

/** "5/17 (29.4%)" style evidence for the analysis caption. */
const evidence = (errors: number, n: number) => `${errors} of ${plural(n, 'request')} (${pct(errors, n)})`;

function analysisSays(w: Window, blocked: boolean): ReactNode {
  const diff = w.canaryN === 0 ? 0 : (100 * w.canaryErrors) / w.canaryN - (w.baseN === 0 ? 0 : (100 * w.baseErrors) / w.baseN);
  return (
    <>
      Canary analysis over the bake window: the canary failed {evidence(w.canaryErrors, w.canaryN)}, the baseline {evidence(w.baseErrors, w.baseN)}, a difference of {diff.toFixed(1)} points.{' '}
      {w.fails ? (
        <>
          That is more than {ANALYSIS_THRESHOLD_PCT} points, so the analysis <span className="hl orange">{blocked ? 'wants to roll back' : 'rolls back automatically'}</span>.
        </>
      ) : (
        <>
          Within {ANALYSIS_THRESHOLD_PCT} points, so the analysis <span className="hl ok">passes</span> and the canary moves on.
        </>
      )}
    </>
  );
}

/** What the strategy does the minute the deploy starts. */
function startSays(run: Run): ReactNode {
  const { cfg } = run;
  switch (cfg.strategy) {
    case 'recreate':
      return <>Recreate: every v1 server is stopped at once and the v2 servers start. Nothing can serve until they are ready, and that gap is the outage.</>;
    case 'bluegreen':
      return <>Blue-green: a whole second fleet, green, starts beside blue, which keeps serving. For now that is {REPLICAS * 2} servers, double the cost.</>;
    case 'canary':
      return <>Canary: a single v2 server starts. Traffic will shift in steps, 1%, 10%, 50%, then everyone, with a bake time at each to watch it.</>;
    case 'rolling': {
      const f = resolveFenceposts(REPLICAS, cfg.surgePct, cfg.unavailablePct);
      return (
        <>
          Rolling update: maxSurge {cfg.surgePct}% of {REPLICAS} rounds up to {f.surge} extra servers, maxUnavailable {cfg.unavailablePct}% rounds down to {f.unavailable} missing, so at most {REPLICAS + f.surge}{' '}
          servers run and at least {REPLICAS - f.unavailable} serve at any moment.
          {f.apiRejects && <> Kubernetes rejects 0% and 0%, so this run uses maxUnavailable 1.</>}
        </>
      );
    }
  }
}

/** What undoing a deploy takes, per strategy. */
function rollbackSays(strategy: Strategy, v1Left: number): ReactNode {
  switch (strategy) {
    case 'recreate': return <>Undoing a recreate is another recreate: stop everything, start v1, and another outage.</>;
    case 'bluegreen': return <>Blue is still running, so the switch just flips back at once.</>;
    case 'canary':
      return v1Left > 0
        ? <>The weight on v2 goes back to 0% straight away and v1 servers are restored.</>
        : <>The canary was already at 100% with no v1 servers left, so undoing it is a rolling update back to v1 and users on v2 stay on it until the last v2 server is gone.</>;
    case 'rolling': return <>Undoing a rolling update is another rolling update, so users on v2 stay on it until the last v2 server is gone.</>;
  }
}

/** The minute's own news, in order; empty when nothing changed. */
function news(run: Run, t: number): ReactNode[] {
  const out: ReactNode[] = [];
  const cur = run.ticks[t];
  const prev = run.ticks[t - 1];
  const { cfg, trigger } = run;
  if (t === DEPLOY_START) out.push(startSays(run));
  if (prev && !served(cur)) {
    const undoing = trigger && !trigger.blocked && t > trigger.tick;
    out.push(<>No server is up, so all {REQ_PER_TICK} requests fail. {undoing ? 'v1 is being redeployed from scratch.' : 'That is the planned outage, not a bug.'}</>);
  }
  if (prev && served(cur) && cur.weight > prev.weight && cur.phase !== 'rollback' && t !== trigger?.tick) {
    if (cfg.strategy === 'bluegreen') out.push(<>The switch: all traffic moves to green at once, so <span className="hl violet">100% of users are on v2</span> from this minute.</>);
    else if (cfg.strategy === 'recreate') out.push(<>The v2 servers are ready and take all the traffic: <span className="hl violet">100% on v2</span>.</>);
    else if (cfg.strategy === 'canary') out.push(<>The traffic weight moves to <span className="hl violet">{share(cur.weight)}</span> on v2, on {plural(cur.v2, 'server')}.</>);
    else out.push(<>{plural(cur.v2, 'v2 server')} ready: <span className="hl violet">{share(cur.weight)} of requests</span> now reach v2.</>);
  }
  if (cfg.strategy === 'canary' && cfg.analysis && (!trigger || t <= trigger.tick)) {
    const stage = canarySchedule(cfg.bakeTicks).find((s) => s.bakeEnd === t);
    if (stage && trigger?.window?.to !== t) out.push(analysisSays(analysisWindow(run.tallies, stage.ready, t), false));
  }
  if (trigger && t === trigger.tick) {
    if (trigger.kind === 'analysis' && trigger.window) out.push(analysisSays(trigger.window, trigger.blocked));
    else {
      out.push(
        <>
          The alert fires: the overall error rate has been at least {ALERT_RATE * 100}% for {ALERT_WINDOW} minutes in a row, with {share(cur.weight)} of requests on v2.
        </>,
      );
    }
    if (trigger.blocked) out.push(<>There is no rollback: v1 cannot read the migrated schema, so the only way out is forward.</>);
  }
  if (trigger && !trigger.blocked && t === trigger.tick + 1) {
    out.push(<><span className="hl orange">Rollback starts.</span> {rollbackSays(cfg.strategy, run.ticks[trigger.tick].v1)}</>);
  }
  if (run.rolledBackAt === t) out.push(<>Back on v1: no traffic reaches v2 any more.</>);
  if (run.completedAt === t && !trigger) out.push(<>The deploy is complete: every server runs v2.</>);
  return out;
}

function tail(run: Run, t: number): ReactNode {
  const tl = run.tallies[t];
  const failed = tl.failed1 + tl.failed2 + tl.outage;
  const parts = [
    tl.bug && `${tl.bug} from the bug`,
    tl.schema && `${tl.schema} from the schema`,
    tl.outage && `${tl.outage} in the outage`,
    tl.natural && `${tl.natural} background`,
  ].filter(Boolean);
  return (
    <>
      Minute {t}: {failed} of {REQ_PER_TICK} requests failed{parts.length ? ` (${parts.join(', ')})` : ''}
      {tl.dropped > 0 && <>, plus {plural(tl.dropped, 'in-flight request')} dropped by servers killed without draining</>}.
    </>
  );
}

/** The caption for minute `t`: what changed, then what the requests did, all from the run. */
export function sayFor(run: Run, t: number): ReactNode {
  const cur: TickState = run.ticks[t];
  const items = t === 0 ? [<>All {REPLICAS} servers run v1 behind the load balancer. Each dot below is one of this minute&apos;s {REQ_PER_TICK} requests.</>] : news(run, t);
  const mix = served(cur) ? <> {share(cur.weight)} of requests go to v2.</> : null;
  return (
    <>
      {items.map((n, i) => (
        <span key={i}>{n} </span>
      ))}
      {items.length === 0 && mix}
      {tail(run, t)}
    </>
  );
}

export function deployFrames(run: Run): DeployFrame[] {
  return run.ticks.map((tick) => ({ t: tick.t, say: sayFor(run, tick.t) }));
}
