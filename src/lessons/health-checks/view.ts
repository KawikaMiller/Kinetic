/** What the pod cards and the timeline show at a moment of a run. Pure, so it is tested. */
import type { GanttBar, GanttLane } from '../../components/GanttLanes';
import type { Tone } from '../../core/tone';
import { PROBES, RESTART_DELAY_S, type CheckKind, type Config, type ProbeKind, type ProbeResult, type Run } from './model';

export const CHECK_LABEL: Record<CheckKind, string> = { tcp: 'TCP port', handler: 'Handler', db: 'DB', cache: 'Cache' };
export const CHECK_PHRASE: Record<CheckKind, string> = { tcp: 'TCP port open', handler: 'handler answers', db: 'DB reachable', cache: 'cache warm' };
export const PROBE_LABEL: Record<ProbeKind, string> = { startup: 'startup', liveness: 'liveness', readiness: 'readiness' };

export const RESULT_TONE: Record<ProbeResult, Tone> = { pass: 'ok', fail: 'bad', idle: 'dim' };

/** The latest result of a probe in this pod's current container, after `shown` seconds ('idle' if it has not run yet, or the container is down). */
export function lightAt(run: Run, pod: number, kind: ProbeKind, shown: number): ProbeResult {
  for (let t = shown - 1; t >= 0; t--) {
    const p = run.seconds[t].pods[pod];
    if (!p.up) return 'idle';
    if (p.results[kind] !== 'idle') return p.results[kind];
    if (p.started) return 'idle';
  }
  return 'idle';
}

export type PodStatus = 'ready' | 'not-ready' | 'restarting';

export function podStatus(run: Run, pod: number, shown: number): PodStatus {
  if (shown === 0) return 'not-ready';
  const p = run.seconds[shown - 1].pods[pod];
  if (!p.up) return 'restarting';
  return p.ready ? 'ready' : 'not-ready';
}

export const inRotation = (run: Run, shown: number) => (shown === 0 ? 0 : run.seconds[shown - 1].pods.filter((p) => p.ready).length);

export const restartsSoFar = (run: Run, pod: number, shown: number) => run.seconds.slice(0, shown).filter((s) => s.pods[pod].restarted).length;

export const laneId = (pod: number, part: 'rotation' | ProbeKind) => `p${pod}-${part}`;

/** Timeline rows: per pod, when it was in rotation (and restarted), then each enabled probe's results. */
export function timelineLanes(config: Config, pods: number): GanttLane[] {
  return Array.from({ length: pods }, (_, pod) => [
    { id: laneId(pod, 'rotation'), label: `pod ${pod + 1}` },
    ...PROBES.filter((k) => config[k].enabled).map((k) => ({ id: laneId(pod, k), label: `  ${PROBE_LABEL[k]}` })),
  ]).flat();
}

/** Bars for the first `shown` seconds: in-rotation spans, restart ticks (orange) and the wait before the container is back, and one bar per probe run. */
export function timelineBars(run: Run, shown: number): GanttBar[] {
  const bars: GanttBar[] = [];
  const seconds = run.seconds.slice(0, shown);
  run.seconds[0]?.pods.forEach((_, pod) => {
    let spanFrom: number | null = null;
    const closeSpan = (to: number) => {
      if (spanFrom !== null) bars.push({ id: `p${pod}-rot-${spanFrom}`, lane: laneId(pod, 'rotation'), start: spanFrom, end: to, tone: 'info' });
      spanFrom = null;
    };
    seconds.forEach((s, t) => {
      const p = s.pods[pod];
      if (p.ready) spanFrom ??= t;
      else closeSpan(t);
      if (p.restarted) {
        bars.push({ id: `p${pod}-restart-${t}`, lane: laneId(pod, 'rotation'), start: t, end: t + 1, tone: 'orange' });
        const downTo = Math.min(t + RESTART_DELAY_S, shown);
        if (downTo > t + 1) bars.push({ id: `p${pod}-down-${t}`, lane: laneId(pod, 'rotation'), start: t + 1, end: downTo, tone: 'dim', kind: 'blocked' });
      }
      for (const kind of PROBES) {
        const r = p.results[kind];
        if (r !== 'idle') bars.push({ id: `p${pod}-${kind}-${t}`, lane: laneId(pod, kind), start: t, end: t + 1, tone: RESULT_TONE[r] });
      }
    });
    closeSpan(seconds.length);
  });
  return bars;
}
