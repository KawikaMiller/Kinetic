// Time zone arithmetic done only through the platform: Intl.DateTimeFormat with an IANA
// timeZone turns an instant into a wall-clock reading. Nothing here hard-codes an offset;
// gaps, overlaps and offsets are all discovered by asking Intl.

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
const MINUTE = 60_000;

export type Zone = 'UTC' | 'America/New_York' | 'Europe/London' | 'Asia/Tokyo' | 'Asia/Kolkata' | 'America/Bogota';

export const ZONE_LABEL: Record<Zone, string> = {
  UTC: 'UTC',
  'America/New_York': 'New York',
  'Europe/London': 'London',
  'Asia/Tokyo': 'Tokyo',
  'Asia/Kolkata': 'Kolkata',
  'America/Bogota': 'Bogotá',
};

/** A wall-clock reading: what a clock on the wall in some zone shows. */
export interface Wall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface WallReading extends Wall {
  /** Minutes ahead of UTC at that instant (New York in winter: -300). */
  offset: number;
  weekday: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string) {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatters.set(zone, f);
  }
  return f;
}

/** The wall clock in `zone` at instant `ms`, with that instant's UTC offset. */
export function wallClock(ms: number, zone: string): WallReading {
  const parts = Object.fromEntries(formatter(zone).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const [year, month, day, hour, minute, second] = ['year', 'month', 'day', 'hour', 'minute', 'second'].map((k) => Number(parts[k]));
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = Math.round((asUtc - Math.floor(ms / 1000) * 1000) / MINUTE);
  return { year, month, day, hour, minute, offset, weekday: parts.weekday };
}

const sameWall = (a: Wall, b: Wall) =>
  a.year === b.year && a.month === b.month && a.day === b.day && a.hour === b.hour && a.minute === b.minute;

/**
 * Every instant at which `zone`'s clock reads `wall`: none inside a spring-forward gap,
 * two inside a fall-back overlap, one the rest of the time.
 */
export function instantsFor(wall: Wall, zone: string): number[] {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  // The offsets in force a day either side cover both sides of any transition.
  const offsets = new Set([guess - DAY, guess, guess + DAY].map((t) => wallClock(t, zone).offset));
  const found = [...offsets].map((off) => guess - off * MINUTE).filter((t) => sameWall(wallClock(t, zone), wall));
  return [...new Set(found)].sort((a, b) => a - b);
}

export interface Transition {
  at: number;
  from: number;
  to: number;
}

/** Offset changes in `zone` between two instants, found by stepping and bisecting to the minute. */
export function transitions(zone: string, from: number, to: number): Transition[] {
  const out: Transition[] = [];
  for (let t = from; t < to; t += HOUR) {
    const a = wallClock(t, zone).offset;
    const b = wallClock(t + HOUR, zone).offset;
    if (a === b) continue;
    let lo = t;
    let hi = t + HOUR;
    while (hi - lo > MINUTE) {
      const mid = lo + Math.floor((hi - lo) / 2 / MINUTE) * MINUTE;
      if (wallClock(mid, zone).offset === a) lo = mid;
      else hi = mid;
    }
    out.push({ at: hi, from: a, to: b });
  }
  return out;
}

/** Real hours between two local midnights: 24 on most days, 23 or 25 on DST days. */
export function hoursInDay(year: number, month: number, day: number, zone: string): number {
  const [start] = instantsFor({ year, month, day, hour: 0, minute: 0 }, zone);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const [end] = instantsFor({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour: 0, minute: 0 }, zone);
  return (end - start) / HOUR;
}

// ─── Formatting ─────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const clockText = (w: Wall) => `${pad(w.hour)}:${pad(w.minute)}`;
export const dateText = (w: Wall) => `${w.day} ${MONTHS[w.month - 1]}`;

/** "UTC-05:00", "UTC+05:30". */
export function offsetText(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const m = Math.abs(minutes);
  return `UTC${sign}${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** Parse "2026-03-08" and "09:30" typed by the learner; null if either is malformed. */
export function parseWall(date: string, time: string): Wall | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!d || !t) return null;
  const wall = { year: +d[1], month: +d[2], day: +d[3], hour: +t[1], minute: +t[2] };
  const probe = new Date(Date.UTC(wall.year, wall.month - 1, wall.day));
  const real = probe.getUTCMonth() + 1 === wall.month && probe.getUTCDate() === wall.day;
  return real && wall.hour < 24 && wall.minute < 60 ? wall : null;
}

// ─── The DST day ────────────────────────────────────────────────────────────

export type DstPreset = 'spring' | 'fall';

export interface HourCell {
  at: number;
  utc: WallReading;
  local: WallReading;
  /** First hour after a local clock jumped forward: the hour before it never happened. */
  afterGap: boolean;
  /** The local hours the jump skipped ("02:00-02:59"), on the cell right after the jump. */
  skipped: string | null;
  /** A local hour that happens twice. */
  repeated: boolean;
}

export interface DstScenario {
  id: DstPreset;
  zone: Zone;
  /** The local date of the transition. */
  date: Wall;
  /** A daily job at this local time, the way a naive scheduler stores it. */
  jobAt: { hour: number; minute: number };
}

export const DST: Record<DstPreset, DstScenario> = {
  spring: { id: 'spring', zone: 'America/New_York', date: { year: 2026, month: 3, day: 8, hour: 0, minute: 0 }, jobAt: { hour: 2, minute: 30 } },
  fall: { id: 'fall', zone: 'America/New_York', date: { year: 2026, month: 11, day: 1, hour: 0, minute: 0 }, jobAt: { hour: 1, minute: 30 } },
};

export const WINDOW_HOURS = 48;

/** 48 hourly instants centred on the transition day, read in UTC and in each zone. */
export function dstTimeline(s: DstScenario, zones: readonly Zone[]): { start: number; rows: Record<string, HourCell[]> } {
  const [midnight] = instantsFor(s.date, s.zone);
  const start = midnight - 12 * HOUR;
  const rows: Record<string, HourCell[]> = {};
  for (const zone of zones) {
    const cells: HourCell[] = [];
    for (let k = 0; k < WINDOW_HOURS; k++) {
      const at = start + k * HOUR;
      const local = wallClock(at, zone);
      const prev = wallClock(at - HOUR, zone);
      const afterGap = local.offset > prev.offset;
      const skipped = afterGap ? `${pad(prev.hour + 1)}:00-${pad(local.hour - 1)}:59` : null;
      const repeated = instantsFor(local, zone).length > 1;
      cells.push({ at, utc: wallClock(at, 'UTC'), local, afterGap, skipped, repeated });
    }
    rows[zone] = cells;
  }
  return { start, rows };
}

export interface JobRun {
  day: Wall;
  /** Instants at which the wall clock showed the job's time that day: 0 skipped, 2 twice. */
  runs: number[];
}

/** What a scheduler that fires "whenever the local clock reads HH:MM" does across three days. */
export function naiveJobRuns(s: DstScenario): JobRun[] {
  return [-1, 0, 1].map((delta) => {
    const d = new Date(Date.UTC(s.date.year, s.date.month - 1, s.date.day + delta));
    const day = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: s.jobAt.hour, minute: s.jobAt.minute };
    return { day, runs: instantsFor(day, s.zone) };
  });
}

// ─── The EU/US gap weeks ────────────────────────────────────────────────────

export interface GapDay {
  date: Wall;
  /** London's lead over New York, in hours: 5 most of the year, 4 in the gap weeks. */
  lead: number;
  /** A 09:00 New York meeting, on London's clock. */
  meetingInLondon: string;
}

/** Each day from 1 March to 5 April 2026 at 09:00 New York time. */
export function gapWeeks(): GapDay[] {
  const out: GapDay[] = [];
  for (let d = 1; d <= 36; d++) {
    const date = new Date(Date.UTC(2026, 2, d));
    const wall = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: 9, minute: 0 };
    const [at] = instantsFor(wall, 'America/New_York');
    const ny = wallClock(at, 'America/New_York');
    const london = wallClock(at, 'Europe/London');
    out.push({ date: wall, lead: (london.offset - ny.offset) / 60, meetingInLondon: clockText(london) });
  }
  return out;
}

// ─── Storing a time ─────────────────────────────────────────────────────────

/**
 * A naive "2026-03-10 09:00" with no zone, read back by servers in different zones,
 * versus the same moment stored as a UTC instant plus the IANA zone it was booked in.
 */
export function storageComparison(wall: Wall, bookedIn: Zone, servers: readonly Zone[]) {
  const [instant] = instantsFor(wall, bookedIn);
  return {
    naive: servers.map((server) => ({ server, instant: instantsFor(wall, server)[0] ?? null })),
    stored: { utc: instant === undefined ? null : new Date(instant).toISOString(), zone: bookedIn, instant: instant ?? null },
  };
}

// ─── Falsehoods ─────────────────────────────────────────────────────────────

export interface Falsehood {
  id: string;
  claim: string;
  /** Computed evidence, line by line. */
  evidence: string[];
  truth: string;
}

export function falsehoods(): Falsehood[] {
  const springDay = hoursInDay(2026, 3, 8, 'America/New_York');
  const fallDay = hoursInDay(2026, 11, 1, 'America/New_York');
  const july = Date.UTC(2026, 6, 1, 12);
  const january = Date.UTC(2026, 0, 15, 12);
  const dateOnly = new Date('2026-03-08');
  const inNy = wallClock(dateOnly.getTime(), 'America/New_York');
  const kolkata = wallClock(january, 'Asia/Kolkata').offset;
  return [
    {
      id: 'day-24h',
      claim: 'A day has 24 hours',
      evidence: [`8 Mar 2026 in New York: ${springDay} hours`, `1 Nov 2026 in New York: ${fallDay} hours`],
      truth: 'On DST days a local day is 23 or 25 hours long. Add 24 hours to "midnight" and you can land at 23:00 or 01:00.',
    },
    {
      id: 'offset-zone',
      claim: 'An offset is the same thing as a time zone',
      evidence: [
        `January: New York ${offsetText(wallClock(january, 'America/New_York').offset)}, Bogotá ${offsetText(wallClock(january, 'America/Bogota').offset)}`,
        `July: New York ${offsetText(wallClock(july, 'America/New_York').offset)}, Bogotá ${offsetText(wallClock(july, 'America/Bogota').offset)}`,
      ],
      truth: 'The same offset today can differ next month. Store the IANA zone (America/New_York), not "-05:00".',
    },
    {
      id: 'date-only',
      claim: 'new Date("2026-03-08") is local midnight',
      evidence: [`toISOString() → ${dateOnly.toISOString()}`, `in New York that's ${inNy.weekday} ${dateText(inNy)} ${clockText(inNy)}, the day before`],
      truth: 'In JavaScript a date-only ISO string parses as UTC midnight; "2026-03-08T00:00" (no Z) parses as local time. Two lookalikes, two different instants.',
    },
    {
      id: 'whole-hours',
      claim: 'Offsets are whole hours',
      evidence: [`Kolkata: ${offsetText(kolkata)}`, `Kathmandu: ${offsetText(wallClock(january, 'Asia/Kathmandu').offset)}`],
      truth: 'Offsets come in half and quarter hours too. Never store "hours from UTC" as an integer.',
    },
  ];
}
