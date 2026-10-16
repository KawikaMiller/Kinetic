/** What the scenes draw, as pure functions of the model, plus each scene's opening state. */
import type { GanttBar, GanttLane } from '../../components/GanttLanes';
import { humanDuration } from '../../core/format';
import { parseBoundedInt } from '../../core/parse';
import { GAP_WINDOW_H } from './window';
import {
  BAD_DEPLOY_AT, CALENDAR_START, DAY_NAMES, DEFAULT_DISASTER_AT, DEFAULT_THROUGHPUT, FULL_AT, MIN_PER_HOUR, WEEK_HOURS, WEEK_MIN, clock, fold, latestRecoverable, restore, restoreTime, seededHistory, seededGaps, snapshotsFor,
  type Op, type Restored, type RestoreInput, type State,
} from './backup';

export const HISTORY_SEED = 11;
export const TIMELINE_OPEN = { snapshotH: 24, logOn: true, logMin: 15, throughput: DEFAULT_THROUGHPUT, disasterAt: DEFAULT_DISASTER_AT, day: 3, targetText: '14:06', gap: false, gapSeed: 4 } as const;
export const PLAN_OPEN = { scenario: 'migration' as const, seed: 4 };
export const DRILL_OPEN = { seed: 3 };
export const BACKUP_DURATION_H = 1;
export const INCREMENTAL_DURATION_H = 0.5;

export const historyOf = (): Op[] => seededHistory(HISTORY_SEED, true);

export interface TimelineInput {
  snapshotH: number;
  logOn: boolean;
  logMin: number;
  gapSeed: number | null;
  disasterAt: number;
}

export function restoreInput(t: TimelineInput): RestoreInput {
  return {
    history: historyOf(),
    snapshots: snapshotsFor(t.snapshotH).filter((s) => s.t <= t.disasterAt),
    logMin: t.logOn ? t.logMin : null,
    gaps: t.logOn && t.gapSeed !== null ? seededGaps(t.gapSeed, t.logMin, BAD_DEPLOY_AT - MIN_PER_HOUR, 1, BAD_DEPLOY_AT - GAP_WINDOW_H * MIN_PER_HOUR) : new Set(),
    disasterAt: t.disasterAt,
  };
}

// ── typed target time ─────────────────────────────────────────────────

export type TargetCheck = { ok: true; minute: number } | { ok: false; error: string };

/** "14:06" through bounded integer parses of the hour and the minute. */
export function parseClock(text: string): { ok: true; minutes: number } | { ok: false; error: string } {
  const m = /^\s*(\d{1,2})\s*:\s*(\d{1,2})\s*$/.exec(text);
  if (!m) return { ok: false, error: `"${text.trim()}" isn't a time like 14:06.` };
  const h = parseBoundedInt(m[1], { min: 0, max: 23, messages: { empty: 'Type the hour.', invalid: (t) => `"${t}" isn't an hour.`, tooSmall: () => 'The hour goes from 0 to 23.', tooBig: () => 'The hour goes from 0 to 23.' } });
  const min = parseBoundedInt(m[2], { min: 0, max: 59, messages: { empty: 'Type the minutes.', invalid: (t) => `"${t}" isn't a minute.`, tooSmall: () => 'The minutes go from 0 to 59.', tooBig: () => 'The minutes go from 0 to 59.' } });
  if (!h.ok) return h;
  if (!min.ok) return min;
  return { ok: true, minutes: h.value * MIN_PER_HOUR + min.value };
}

/** The target as a minute of the week, or why it is refused: outside the history, or behind a gap the replay cannot cross. */
export function checkTarget(text: string, day: number, input: RestoreInput): TargetCheck {
  const p = parseClock(text);
  if (!p.ok) return p;
  const minute = day * 24 * MIN_PER_HOUR + p.minutes;
  if (minute > input.disasterAt) return { ok: false, error: `${clock(minute)} is after the disaster at ${clock(input.disasterAt)}: nothing was recorded then.` };
  if (minute > WEEK_MIN) return { ok: false, error: 'That is outside the week of history.' };
  const r = restore(input, minute);
  if (r.stoppedAtGap !== null) return { ok: false, error: `${clock(minute)} lies beyond a gap: ${r.reason}.` };
  return { ok: true, minute };
}

// ── gantt ─────────────────────────────────────────────────────────────

const hours = (min: number) => min / MIN_PER_HOUR;

export interface Timeline {
  lanes: GanttLane[];
  bars: GanttBar[];
  domain: [number, number];
}

export function timeline(input: RestoreInput, target: number | null, throughput: number): Timeline {
  const bars: GanttBar[] = [];
  for (const s of input.snapshots) {
    if (s.kind === 'full') bars.push({ id: `f${s.t}`, lane: 'full', start: hours(s.t), end: hours(s.t) + BACKUP_DURATION_H, tone: 'info', label: 'full' });
    else bars.push({ id: `i${s.t}`, lane: 'incr', start: hours(s.t), end: hours(s.t) + INCREMENTAL_DURATION_H, tone: 'info', label: 'incr' });
  }
  if (input.logMin !== null) {
    const L = input.logMin;
    const gaps = [...input.gaps].sort((a, b) => a - b);
    let from = 0;
    const shipped = Math.floor(input.disasterAt / L) * L;
    for (const g of gaps) {
      if (g * L > shipped) break;
      if (g * L > from) bars.push({ id: `l${from}`, lane: 'log', start: hours(from), end: hours(g * L), tone: 'info', label: 'archived' });
      bars.push({ id: `g${g}`, lane: 'log', start: hours(g * L), end: hours((g + 1) * L), tone: 'bad', label: 'gap' });
      from = (g + 1) * L;
    }
    if (shipped > from) bars.push({ id: `l${from}`, lane: 'log', start: hours(from), end: hours(shipped), tone: 'info', label: 'archived' });
  }
  const reached = latestRecoverable(input);
  const base = restore(input, input.disasterAt).base?.t ?? 0;
  bars.push({ id: 'rec', lane: 'outcome', start: hours(base), end: hours(reached), tone: 'ok', label: 'recoverable' });
  if (input.disasterAt > reached) bars.push({ id: 'lost', lane: 'outcome', start: hours(reached), end: hours(input.disasterAt), tone: 'bad', label: 'lost' });
  const t = target ?? reached;
  const down = restoreTime(input, t, throughput).totalS / 3600;
  bars.push({ id: 'down', lane: 'outcome', start: hours(input.disasterAt), end: Math.min(WEEK_HOURS, hours(input.disasterAt) + down), tone: 'orange', label: 'restoring' });
  bars.push({ id: 'bad', lane: 'events', start: hours(BAD_DEPLOY_AT), end: hours(BAD_DEPLOY_AT), tone: 'bad', label: 'drop table' });
  bars.push({ id: 'disaster', lane: 'events', start: hours(input.disasterAt), end: hours(input.disasterAt), tone: 'hi', label: 'disaster' });
  if (target !== null) bars.push({ id: 'target', lane: 'events', start: hours(target), end: hours(target), tone: 'ok', label: 'target' });
  const lanes: GanttLane[] = [{ id: 'full', label: 'Weekly full' }, { id: 'incr', label: 'Incrementals' }, { id: 'log', label: 'Log archive' }, { id: 'outcome', label: 'Outcome' }, { id: 'events', label: 'Events' }];
  return { lanes, bars, domain: [0, WEEK_HOURS] };
}

export const axis = { calendar: { start: CALENDAR_START, unit: 'day' as const } };

// ── texts ─────────────────────────────────────────────────────────────

export const keysText = (s: State) => `${Object.keys(s).length} ${Object.keys(s).length === 1 ? 'key' : 'keys'}`;
export const minutesText = (m: number) => (m < 1 ? '0 min' : m < 90 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`);
export const secondsText = humanDuration;

export function matchesOracle(history: readonly Op[], r: Restored): boolean {
  const a = fold(history, r.reached);
  const keys = new Set([...Object.keys(a), ...Object.keys(r.state)]);
  return [...keys].every((k) => a[Number(k)] === r.state[Number(k)]);
}

export function timelineCaption(input: RestoreInput, target: number | null, throughput: number): string {
  const lost = input.disasterAt - latestRecoverable(input);
  const base = `Disaster at ${clock(input.disasterAt)}: the plan can recover to ${clock(latestRecoverable(input))}, so ${minutesText(lost)} of data is lost.`;
  if (target === null) return `${base} Type a target time to restore to.`;
  const r = restore(input, target);
  const t = restoreTime(input, target, throughput);
  return `${base} Restoring to ${clock(target)} reaches ${clock(r.reached)}${input.logMin === null ? ' (no log archive, so the nearest point is the last snapshot)' : ''} and takes ${minutesText(t.totalS / 60)}: ${secondsText(t.restoreS)} to restore ${t.restoreGB} GB, ${secondsText(t.replayS)} to replay ${t.replayGB.toFixed(0)} GB of log.`;
}

export const DAY_OPTIONS = DAY_NAMES.map((d, i) => ({ value: i, label: d }));
export const FIRST_FULL = FULL_AT;
