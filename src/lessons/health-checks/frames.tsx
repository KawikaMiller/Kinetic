import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import { HORIZON, type ProbeKind, type Run } from './model';
import { CHECK_PHRASE, PROBE_LABEL } from './view';

export interface HealthFrame extends Frame {
  /** Seconds of the run shown so far: 0 is before anything happened. */
  shown: number;
}

export interface SecondEvents {
  restarts: { pod: number; cause: ProbeKind }[];
  becameReady: number[];
  becameUnready: number[];
  startupPassed: number[];
  dbWentDown: boolean;
  dbCameBack: boolean;
  hungNow: number | null;
}

/** What changed in second t, read from the run. */
export function describeSecond(run: Run, t: number): SecondEvents {
  const now = run.seconds[t];
  const before = t > 0 ? run.seconds[t - 1] : null;
  const pods = now.pods.map((p, pod) => ({ p, pod }));
  const { deadlock } = run.scenario;
  return {
    restarts: pods.filter(({ p }) => p.restarted).map(({ p, pod }) => ({ pod, cause: p.restartCause! })),
    becameReady: pods.filter(({ p, pod }) => p.ready && !(before?.pods[pod].ready ?? false)).map(({ pod }) => pod),
    becameUnready: pods.filter(({ p, pod }) => p.up && !p.restarted && !p.ready && (before?.pods[pod].ready ?? false)).map(({ pod }) => pod),
    startupPassed: pods.filter(({ p }) => p.results.startup === 'pass').map(({ pod }) => pod),
    dbWentDown: before !== null && before.dbUp && !now.dbUp,
    dbCameBack: before !== null && !before.dbUp && now.dbUp,
    hungNow: deadlock !== null && deadlock.at === t ? deadlock.pod : null,
  };
}

const podList = (pods: number[]) => (pods.length === 1 ? `pod ${pods[0] + 1}` : `pods ${pods.map((p) => p + 1).join(', ')}`);
const times = (n: number) => (n === 1 ? '1 time' : `${n} times`);

/** The caption for second t: the notable events, or the traffic when nothing changed. Every claim is read from the run. */
export function secondCaption(run: Run, t: number): ReactNode {
  const e = describeSecond(run, t);
  const { config } = run;
  const parts: ReactNode[] = [];
  if (e.hungNow !== null) {
    parts.push(<span key="hung">Pod {e.hungNow + 1}'s handler hangs: its port still accepts connections, but nothing answers.</span>);
  }
  if (e.dbWentDown) parts.push(<span key="down">The database becomes unreachable.</span>);
  if (e.dbCameBack) parts.push(<span key="up">The database is reachable again.</span>);
  for (const cause of ['startup', 'liveness'] as const) {
    const pods = e.restarts.filter((r) => r.cause === cause).map((r) => r.pod);
    if (pods.length === 0) continue;
    parts.push(
      <span key={`r-${cause}`}>
        <span className="hl orange">{podList(pods)} restarted</span>: the {PROBE_LABEL[cause]} probe ({CHECK_PHRASE[config[cause].check]}) failed {times(config[cause].threshold)} in a row.
      </span>,
    );
  }
  if (e.becameUnready.length > 0) {
    parts.push(
      <span key="unready">
        <span className="hl bad">{podList(e.becameUnready)} left rotation</span>: readiness ({CHECK_PHRASE[config.readiness.check]}) failed {times(config.readiness.threshold)} in a row. The
        container keeps running.
      </span>,
    );
  }
  if (e.startupPassed.length > 0) {
    parts.push(<span key="startup">The startup probe passed on {podList(e.startupPassed)}: liveness and readiness probes start now.</span>);
  }
  if (e.becameReady.length > 0) {
    parts.push(
      <span key="ready">
        <span className="hl ok">{podList(e.becameReady)} Ready</span>: in rotation.
      </span>,
    );
  }
  if (parts.length === 0) {
    const r = run.seconds[t].requests;
    return (
      <>
        Nothing changed this second. Requests: {r.ok} ok, {r.slow} slow, {r.error} errors{r.unrouted > 0 ? ` (${plural(r.unrouted, 'request')} found no pod in rotation)` : ''}.
      </>
    );
  }
  return <>{parts.flatMap((p, i) => (i === 0 ? [p] : [' ', p]))}</>;
}

function introCaption(run: Run): ReactNode {
  const s = run.scenario;
  switch (s.id) {
    case 'slow-boot':
      return <>Each app takes {s.bootS} s to load before its handler answers. Press play to see what the probes make of that.</>;
    case 'db-outage':
      return <>The database will be unreachable from {s.dbDown[0][0]} s to {s.dbDown[0][1]} s. Press play to see what each probe does about it.</>;
    case 'deadlock':
      return <>At {s.deadlock?.at} s pod {(s.deadlock?.pod ?? 0) + 1} will hang: its port stays open but its handler stops answering. Press play.</>;
    case 'early-ready':
      return <>The handler answers {s.bootS} s after start, but the cache needs {s.cacheS} s more to warm. Press play to see who gets the cold requests. All four pods start together, so a cache check leaves nothing in rotation for the first {s.bootS + s.cacheS} s.</>;
    case 'flapping':
      return <>The database will blip {s.dbDown.length} times for {s.dbDown[0][1] - s.dbDown[0][0]} s each. Press play to see how readiness reacts.</>;
  }
}

export function healthFrames(run: Run): HealthFrame[] {
  const frames: HealthFrame[] = [{ shown: 0, say: introCaption(run) }];
  for (let t = 0; t < HORIZON; t++) frames.push({ shown: t + 1, say: secondCaption(run, t), quiet: true });
  return frames;
}
