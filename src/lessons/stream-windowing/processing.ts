/**
 * stream-windowing, scene 4: counting per minute by when an event arrived (processing time) against when it happened (event time).
 * The event-time column keeps every event until the stream ends, so it does not depend on arrival order. Pure.
 */
import { DEFAULT_DELAY, MINUTE, generate, reversedArrival, type Evt } from './events';

export interface MinuteRow {
  start: number;
  end: number;
  /** Events that arrived in this minute. */
  processing: number;
  /** Events that happened in this minute. */
  event: number;
}

/** One-minute rows from 0 to the last minute either clock reaches. */
export function perMinute(events: readonly Evt[], size = MINUTE): MinuteRow[] {
  const last = Math.max(0, ...events.flatMap((e) => [e.time, e.arrival]));
  const rows: MinuteRow[] = Array.from({ length: Math.floor(last / size) + 1 }, (_, i) => ({ start: i * size, end: (i + 1) * size, processing: 0, event: 0 }));
  for (const e of events) {
    rows[Math.floor(e.arrival / size)].processing++;
    rows[Math.floor(e.time / size)].event++;
  }
  return rows;
}

export const disagreeing = (rows: readonly MinuteRow[]): MinuteRow[] => rows.filter((r) => r.processing !== r.event);

/** The rows of the same events replayed backwards. */
export const replayed = (events: readonly Evt[]): MinuteRow[] => perMinute(reversedArrival(events));

/** The lowest seed below `limit` whose processing-time minutes disagree with the event-time ones under delay bound `maxDelay`, or null. */
export function lowestDisagreeingSeed(maxDelay: number, limit: number): number | null {
  for (let seed = 0; seed < limit; seed++) if (disagreeing(perMinute(generate(seed, maxDelay).events)).length > 0) return seed;
  return null;
}

/** The seed scene 4 opens on: the lowest one whose processing-time minutes disagree at the default delay bound (the test proves it). */
export const BROKEN_SEED = 0;
export const BROKEN_DELAY = DEFAULT_DELAY;
