/**
 * etl-orchestration, scene 5: schedule semantics. A daily run's logical date names the interval of data it processes, and the run
 * happens after that interval has closed. All dates are fixed in the lesson and in UTC. A pause that spans several closed
 * intervals either creates every missed run when it ends (catchup on) or only the run for the latest closed interval (off). The pause
 * starts and ends mid-day, so no interval closes at the instant it starts or ends and "the latest closed interval at the resume" is unambiguous.
 */

export const SCHEDULE_START = '2026-02-25T00:00:00Z';
export const SCHEDULE_DAYS = 12;
/** The pipeline is paused from PAUSE_FROM up to PAUSE_TO (hours since SCHEDULE_START), both at 09:00. */
export const PAUSE_FROM = 24 * 4 + 9;
export const PAUSE_TO = 24 * 8 + 9;
export const DAY_MS = 86_400_000;
export const BACKFILL_MAX_DAYS = 14;

const startMs = Date.parse(SCHEDULE_START);
export const isoDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
/** The logical date of day index d. */
export const logicalDate = (d: number): string => isoDate(startMs + d * DAY_MS);

/** Hours since SCHEDULE_START at which the interval of logical date `iso` closes: the next midnight, by calendar arithmetic. */
export function eligibleHour(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return (Date.UTC(y, m - 1, d + 1) - startMs) / 3_600_000;
}

export interface Trigger {
  day: number;
  date: string;
  /** Hours since start at which the run is created; null when the run is skipped. */
  at: number | null;
  kind: 'on-time' | 'caught-up' | 'skipped';
}

/** Every day's trigger under the pause, with or without catchup. A day whose interval closes inside the pause is "missed"; without catchup only the latest missed one (the latest closed interval at the resume) gets a run. */
export function triggers(paused: boolean, catchup: boolean): Trigger[] {
  const closes = (d: number) => 24 * (d + 1);
  const missed = (d: number) => paused && closes(d) >= PAUSE_FROM && closes(d) < PAUSE_TO;
  const days = Array.from({ length: SCHEDULE_DAYS }, (_, d) => d);
  const lastMissed = Math.max(...days.filter(missed), -1);
  return days.map((day) => {
    const date = logicalDate(day);
    if (!missed(day)) return { day, date, at: closes(day), kind: 'on-time' as const };
    return catchup || day === lastMissed ? { day, date, at: PAUSE_TO, kind: 'caught-up' as const } : { day, date, at: null, kind: 'skipped' as const };
  });
}

/** Runs that exist by `now` (hours since start). */
export const createdBy = (now: number, paused: boolean, catchup: boolean): Trigger[] => triggers(paused, catchup).filter((t) => t.at !== null && t.at <= now);

/** The inclusive list of ISO dates from `from` to `to`; refuses a backwards range and one longer than BACKFILL_MAX_DAYS. */
export function backfillDates(from: string, to: string): string[] {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) throw new RangeError('a backfill needs two dates');
  if (a > b) throw new RangeError('the start date is after the end date');
  const n = Math.round((b - a) / DAY_MS) + 1;
  if (n > BACKFILL_MAX_DAYS) throw new RangeError(`a backfill covers at most ${BACKFILL_MAX_DAYS} days`);
  return Array.from({ length: n }, (_, i) => isoDate(a + i * DAY_MS));
}
