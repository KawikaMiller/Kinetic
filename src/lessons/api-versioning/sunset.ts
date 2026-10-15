/**
 * Scene 3 of api-versioning: an announcement, a sunset date and four invented clients that migrate at
 * their own authored lags. Dates are UTC calendar days, counted as whole days since the announcement.
 *
 * Everything here is illustrative: the lags, who notices a brownout and how fast they react are
 * authored numbers, not data about real clients.
 */

import type { ClientId } from './api';

export const ANNOUNCE_DATE = '2026-11-02';
export const WINDOW = { min: 30, max: 730, initial: 90 } as const;
const MS_PER_DAY = 86_400_000;
const HOURS_PER_DAY = 24;

/** Whole UTC days from the Unix epoch to an ISO `yyyy-mm-dd` date. */
export function dayNumber(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`not a yyyy-mm-dd date: ${iso}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY;
}

export const addDays = (iso: string, days: number): string => new Date((dayNumber(iso) + days) * MS_PER_DAY).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string): number => dayNumber(to) - dayNumber(from);

/** The `Sunset` header's value: an HTTP date at the start of the sunset day, in GMT (RFC 8594, from memory). */
export const sunsetHeaderValue = (iso: string): string => new Date(dayNumber(iso) * MS_PER_DAY).toUTCString();

/** The `Deprecation` header's value: a Structured Field Date, `@` and Unix seconds at the start of the day (RFC 9745). */
export const deprecationHeaderValue = (iso: string): string => `@${dayNumber(iso) * (MS_PER_DAY / 1000)}`;

export interface SunsetClient {
  id: ClientId;
  /** Days after the announcement that it finishes migrating; null means it never does (nobody owns it). */
  lag: number | null;
  /** Reads a brownout as a warning and reacts to it. */
  noticesBrownouts: boolean;
}

export const SUNSET_CLIENTS: SunsetClient[] = [
  { id: 'mobile', lag: 45, noticesBrownouts: true },
  { id: 'partner', lag: 120, noticesBrownouts: true },
  { id: 'web', lag: 20, noticesBrownouts: true },
  { id: 'batch', lag: null, noticesBrownouts: false },
];

export type Choice = 'break' | 'extend' | 'brownout';
export const CHOICES: { id: Choice; label: string }[] = [
  { id: 'break', label: 'Break them' },
  { id: 'extend', label: 'Extend the sunset' },
  { id: 'brownout', label: 'Run a brownout first' },
];

/** Extending moves the sunset this many days. */
export const EXTENSION_DAYS = 60;
/** Brownouts happen this many days before the sunset, one each, and last an hour. */
export const BROWNOUT_LEADS = [14, 7] as const;
export const BROWNOUT_HOURS = 1;
/** A client that notices a brownout finishes migrating this many days after the first one. */
export const REACTION_DAYS = 7;

export interface ClientOutcome {
  id: ClientId;
  /** Day (since the announcement) it is on the new version, or null. */
  migratedAt: number | null;
  /** Still on the old version when it is switched off. */
  onOldAtSunset: boolean;
}

export interface Outcome {
  windowDays: number;
  /** The day the old version is switched off (after any extension). */
  sunsetDay: number;
  /** The sunset the announcement promised. */
  announcedSunsetDay: number;
  brownoutDays: number[];
  clients: ClientOutcome[];
  /** Hours of planned failure: each brownout hits every client still on the old version. */
  plannedClientHours: number;
  /** Clients that find the old version gone. */
  brokenAtSunset: number;
}

export function simulate(windowDays: number, choice: Choice): Outcome {
  const sunsetDay = windowDays + (choice === 'extend' ? EXTENSION_DAYS : 0);
  const brownoutDays = choice === 'brownout' ? BROWNOUT_LEADS.map((lead) => windowDays - lead) : [];
  const firstBrownout = brownoutDays[0];
  const clients = SUNSET_CLIENTS.map((c): ClientOutcome => {
    const reacts = c.noticesBrownouts && firstBrownout !== undefined && (c.lag === null || c.lag > firstBrownout);
    const migratedAt = reacts ? Math.min(c.lag ?? Infinity, firstBrownout + REACTION_DAYS) : c.lag;
    return { id: c.id, migratedAt, onOldAtSunset: migratedAt === null || migratedAt > sunsetDay };
  });
  const plannedClientHours = brownoutDays.reduce(
    (hours, day) => hours + clients.filter((c) => c.migratedAt === null || c.migratedAt > day).length * BROWNOUT_HOURS,
    0,
  );
  return {
    windowDays,
    sunsetDay,
    announcedSunsetDay: windowDays,
    brownoutDays,
    clients,
    plannedClientHours,
    brokenAtSunset: clients.filter((c) => c.onOldAtSunset).length,
  };
}

/** A day count as the hours the Gantt calendar axis uses. */
export const dayToHours = (day: number) => day * HOURS_PER_DAY;
