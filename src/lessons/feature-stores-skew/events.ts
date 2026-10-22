import { normal } from '../../core/distributions';
import { mulberry32, shuffle } from '../../core/random';

/**
 * A made-up, seeded event stream: purchases per user with an event time and an arrival time. Times are in days
 * since the start of the stream; event times sit on a whole-hour grid, so an event can land exactly on a window edge.
 * Every constant is named and illustrative: nothing here is a real system's traffic.
 */

export const USERS = 40;
export const USERS_MIN = 1;
export const DAYS = 30;
export const HOURS_PER_DAY = 24;
/** Share of events that arrive after they happened. */
export const LATE_SHARE = 0.05;
/** Arrival delay of a late event, uniform between these many hours. */
export const LATE_HOURS = { min: 1, max: 48 } as const;
/** As-of times are 12:00 UTC on each of these days. */
export const FIRST_ASOF_DAY = 7;
export const LAST_ASOF_DAY = 29;
export const ASOF_HOUR = 12;
export const ROWS_PER_USER = LAST_ASOF_DAY - FIRST_ASOF_DAY + 1;
export const DEFAULT_WINDOW_DAYS = 7;
export const WINDOW_DAYS = { min: 1, max: 30 } as const;
export const DEFAULT_SEED = 4;
/** Local time is UTC minus this many hours (the day-boundary source). */
export const LOCAL_OFFSET_HOURS = 5;
/** Share of users who never buy anything (the null-handling source): a fixed count, so the source is never a no-op at 40 users. */
export const SILENT_USER_SHARE = 0.1;
/** Mean purchases per day of the log-normal rate distribution is about exp(MU + SIGMA^2 / 2). */
export const RATE_MU = -1.5;
export const RATE_SIGMA = 0.6;

export interface PurchaseEvent {
  user: number;
  /** When it happened, in days. */
  at: number;
  /** When it reached the pipelines, in days; later than `at` for a late event. */
  arrived: number;
}

export interface EventTable {
  users: number;
  events: PurchaseEvent[];
  /** Events of each user, sorted by event time. */
  byUser: PurchaseEvent[][];
}

/** Build the stream for `users` users with `lateShare` of events delayed. Same seed gives the same table. */
export function makeEvents(seed: number, users: number = USERS, lateShare: number = LATE_SHARE): EventTable {
  const rnd = mulberry32(seed);
  const events: PurchaseEvent[] = [];
  const silentUsers = new Set(shuffle(Array.from({ length: users }, (_, u) => u), rnd).slice(0, Math.round(users * SILENT_USER_SHARE)));
  for (let user = 0; user < users; user += 1) {
    const silent = silentUsers.has(user);
    const rate = silent ? 0 : Math.exp(normal(rnd, RATE_MU, RATE_SIGMA));
    for (let hour = 0; hour < DAYS * HOURS_PER_DAY; hour += 1) {
      if (rnd() < rate / HOURS_PER_DAY) {
        const at = hour / HOURS_PER_DAY;
        const late = rnd() < lateShare;
        const delay = late ? (LATE_HOURS.min + rnd() * (LATE_HOURS.max - LATE_HOURS.min)) / HOURS_PER_DAY : 0;
        events.push({ user, at, arrived: at + delay });
      }
    }
  }
  const byUser = Array.from({ length: users }, (_, u) => events.filter((e) => e.user === u));
  return { users, events, byUser };
}

/** The as-of time of a day index: 12:00 UTC on that day. */
export const asOfTime = (day: number): number => day + ASOF_HOUR / HOURS_PER_DAY;

/** "day 4 20:00" for a time in days (minutes shown only when they are not zero). */
export function dayLabel(t: number): string {
  const totalMinutes = Math.round(t * HOURS_PER_DAY * 60);
  const day = Math.floor(totalMinutes / (HOURS_PER_DAY * 60));
  const rest = totalMinutes - day * HOURS_PER_DAY * 60;
  const hh = String(Math.floor(rest / 60)).padStart(2, '0');
  const mm = String(rest % 60).padStart(2, '0');
  return `day ${day} ${hh}:${mm}`;
}
