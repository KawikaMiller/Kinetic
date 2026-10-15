/** The Gantt replay's lanes and bars, from the timeline of a path. Pure, so a test can read them. */
import type { GanttBar, GanttLane } from '../../components/GanttLanes';
import { pct } from '../../core/format';
import type { Tone } from '../../core/tone';
import { ACK_MIN, ACTION_SHORT, DETECT_MIN, TRAFFIC, hasComms, type Action, type Outcome, type Segment, type Timeline } from './model';

export const LANES: GanttLane[] = [
  { id: 'detect', label: 'Detect' },
  { id: 'ack', label: 'Acknowledge' },
  { id: 'mitigate', label: 'Mitigate' },
  { id: 'resolve', label: 'Resolve' },
  { id: 'comms', label: 'Comms' },
];

/** A finished action's colour: worked `ok`, did nothing for this cause `orange`, a finding `info`. */
const DONE_TONE: Record<Outcome, Tone> = { fixed: 'ok', partial: 'ok', nothing: 'orange', info: 'info', delay: 'orange' };

const nameOf = (s: Segment) => (s.kind === 'delay' ? 'conflicting actions' : s.kind === 'escalate' ? 'hand-off' : ACTION_SHORT[s.kind as Action]);

function effectLabel(s: Segment): string {
  if (s.outcome === 'fixed') return `${nameOf(s)}: errors 0%`;
  if (s.outcome === 'partial') return `${nameOf(s)}: errors ${pct(s.rateAfter / TRAFFIC)}`;
  return `${nameOf(s)}: no effect`;
}

/** Every bar and instant of the replay at minute `now`; pass the result through `barsAt` to reveal them as time goes on. */
export function timelineBars(tl: Timeline, now: number): GanttBar[] {
  const bars: GanttBar[] = [
    { id: 'undetected', lane: 'detect', start: 0, end: DETECT_MIN, tone: 'bad', label: 'failing, not yet detected' },
    { id: 'alert', lane: 'detect', start: DETECT_MIN, end: DETECT_MIN, tone: 'info', label: 'alert fired' },
    { id: 'waiting', lane: 'ack', start: DETECT_MIN, end: ACK_MIN, tone: 'info', label: 'page waiting' },
    { id: 'acked', lane: 'ack', start: ACK_MIN, end: ACK_MIN, tone: 'info', label: 'page acked' },
  ];
  tl.segments.forEach((s, i) => {
    const running = now < s.end;
    bars.push({ id: `seg-${i}`, lane: 'mitigate', start: s.start, end: s.end, tone: running ? 'hi' : DONE_TONE[s.outcome], kind: s.kind === 'delay' ? 'blocked' : 'work', label: nameOf(s) });
    if (s.kind !== 'delay') bars.push({ id: `begin-${i}`, lane: 'mitigate', start: s.start, end: s.start, tone: 'hi', label: 'started' });
    if (s.outcome === 'fixed' || s.outcome === 'partial' || s.outcome === 'nothing') {
      bars.push({ id: `effect-${i}`, lane: 'resolve', start: s.end, end: s.end, tone: DONE_TONE[s.outcome], label: effectLabel(s) });
    }
    if (hasComms(tl.roles)) bars.push({ id: `update-${i}`, lane: 'comms', start: s.end, end: s.end, tone: 'info', label: 'update' });
  });
  return bars;
}

/** The four readouts at minute `now`: a minute once it has happened, null before. */
export function readouts(tl: Timeline, now: number): { detect: number | null; acknowledge: number | null; mitigate: number | null; resolve: number | null } {
  const seen = (t: number | null) => (t !== null && t <= now ? t : null);
  return { detect: seen(DETECT_MIN), acknowledge: seen(ACK_MIN), mitigate: seen(tl.mitigatedAt), resolve: seen(tl.resolvedAt) };
}
