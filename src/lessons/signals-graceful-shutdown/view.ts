import type { GanttBar, GanttMarker } from '../../components/GanttLanes';
import type { LineState } from '../../components/CodePanel';
import { SIGTERM_AT, type RequestRun, type ShutdownRun } from './model';
import type { Phase } from './frames';

/** Refused and redirected requests are drawn as a short stub at their arrival. */
const STUB = 0.6;

/**
 * Request bars at time `now`: in flight --info, finished before the deploy grey, finished
 * after SIGTERM --ok, cut --bad, refused (an error at the LB) --bad stub, sent to another
 * replica a --dim stub.
 */
export function requestBars(run: ShutdownRun, now: number): GanttBar[] {
  return run.requests.flatMap((r: RequestRun): GanttBar[] => {
    if (r.start > now) return [];
    const base = { id: r.id, lane: r.id };
    if (r.fate === 'elsewhere') return [{ ...base, start: r.start, end: r.start + STUB, tone: 'dim', kind: 'blocked', label: 'other replica' }];
    if (r.fate === 'refused') return [{ ...base, start: r.start, end: r.start + STUB, tone: 'bad', label: 'error' }];
    const end = Math.min(r.end, now);
    const over = now >= r.end;
    const tone = !over ? 'info' : r.fate === 'cut' ? 'bad' : r.fate === 'drained' ? 'ok' : 'muted';
    return [{ ...base, start: r.start, end: Math.max(end, r.start + 0.05), tone, label: over && r.fate === 'cut' ? 'cut' : r.label }];
  });
}

export function shutdownMarkers(run: ShutdownRun, now: number): GanttMarker[] {
  const m: GanttMarker[] = [];
  if (now >= SIGTERM_AT) m.push({ at: SIGTERM_AT, label: 'SIGTERM', tone: 'hi' });
  if (now >= run.lbRemoved) m.push({ at: run.lbRemoved, label: 'LB removes', tone: 'violet' });
  // The grace deadline: a --hi marker counting down, --bad once it's reached (SIGKILL).
  // Once the process has exited on its own, the countdown no longer matters.
  const countdown = now >= SIGTERM_AT && (run.killed || now < run.exitAt);
  if (countdown) m.push({ at: SIGTERM_AT + run.grace, label: run.killed && now >= run.exitAt ? 'SIGKILL' : 'deadline', tone: run.killed && now >= run.exitAt ? 'bad' : 'hi' });
  if (now >= run.exitAt && !run.killed && run.mode !== 'none') m.push({ at: run.exitAt, label: 'exit 0', tone: 'ok' });
  return m;
}

/** Seconds left on the grace countdown at `now`: null before SIGTERM, and once the process has exited before the deadline. */
export const graceLeft = (run: ShutdownRun, now: number) =>
  now < SIGTERM_AT || (!run.killed && now >= run.exitAt) ? null : Math.max(0, SIGTERM_AT + run.grace - now);

export const HANDLER = [
  "process.on('SIGTERM', shutdown);",
  'async function shutdown() {',
  '  if (shuttingDown) return;   // a second signal is a no-op',
  '  shuttingDown = true;',
  '  ready = false;              // readiness fails: the LB drains us',
  '  await sleep(LB_DELAY);      // keep serving until it notices',
  '  server.close();             // stop accepting, finish in-flight',
  '  await allRequestsDone();',
  '  await db.end();             // close the pool',
  '  process.exit(0);',
  '}',
];

/** Which handler lines are running in each phase. */
const ACTIVE: Record<Phase, number[]> = { running: [0], sigterm: [2, 3, 4], lb: [5, 6], drain: [7], exit: [8, 9] };

/** The handler line that was running when SIGKILL landed: still waiting for the LB, or waiting for the drain. */
export const killedAtLine = (run: ShutdownRun) => (run.exitAt < run.lbRemoved ? 5 : 7);

/**
 * Line states for the handler panel at `now`. Once the process is dead the panel freezes:
 * after a clean exit every line ran; after SIGKILL the line it was on is struck through and
 * nothing after it ran. A dead process never shows a "now" line.
 */
export function handlerState(phase: Phase, run: ShutdownRun, now: number) {
  if (now >= run.exitAt) {
    const cutAt = killedAtLine(run);
    return (i: number): LineState => (run.killed ? (i === cutAt ? 'cut' : i < cutAt ? 'past' : 'idle') : i <= 9 ? 'past' : 'idle');
  }
  const active = ACTIVE[phase];
  const reached = Math.max(...active);
  return (i: number): LineState => {
    if (active.includes(i)) return 'now';
    return i < reached && phase !== 'running' ? 'past' : 'idle';
  };
}
