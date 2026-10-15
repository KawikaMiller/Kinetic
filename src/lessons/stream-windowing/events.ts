/**
 * stream-windowing: the seeded click events. Event times depend only on the seed; the delay slider only scales how late each one
 * arrives, so moving it never reshuffles who clicked when. Times are whole seconds. Pure.
 */
import { exponential } from '../../core/distributions';
import { mulberry32 } from '../../core/random';

export const EVENT_COUNT = 40;
export const KEYS = ['A', 'B', 'C'] as const;
export type Key = (typeof KEYS)[number];
export const MIN_DELAY = 0;
export const MAX_DELAY = 30;
export const DEFAULT_DELAY = 20;
/** The one-minute windows of scenes 1 and 4. */
export const MINUTE = 60;
/** The seed each scene opens on. The test proves the second and third are the lowest seeds that show their scene's point at its defaults. */
export const TIME_SEED = 3;
/** The lowest seed where two sessions merge at the default gap and delay bound. */
export const WINDOWS_SEED = 6;
/** The lowest seed where the default watermark settings drop an event and a straggler is dropped, then counted once there is room. */
export const WATERMARK_SEED = 0;

/** Mean gap between clicks inside a burst and between bursts, seconds. */
const BURST_GAP_MEAN = 3;
const PAUSE_GAP_MEAN = 25;
const PAUSE_SHARE = 0.2;
/** A delay is the event's own exponential draw (mean 1) times D/3, cut at D: a short typical delay and a tail. */
const DELAY_MEAN_SHARE = 3;
const DELAY_STREAM = 0x3c6ef372;

export interface Evt {
  /** Numbered in event-time order, from 1. */
  id: number;
  key: Key;
  /** When it happened, seconds. */
  time: number;
  /** How late it arrives, seconds (0 to D). */
  delay: number;
  /** When it reaches the processor: time + delay. */
  arrival: number;
}

export interface Fixture {
  seed: number;
  /** The delay bound D these arrivals were drawn under. */
  maxDelay: number;
  /** In event-time order (ids ascending). */
  events: Evt[];
}

/** The events of a seed under delay bound `maxDelay`: same times and keys for every D. */
export function generate(seed: number, maxDelay: number, count = EVENT_COUNT): Fixture {
  const rnd = mulberry32(seed);
  const delays = mulberry32(seed ^ DELAY_STREAM);
  let time = 0;
  const events: Evt[] = Array.from({ length: count }, (_, i) => {
    time += Math.round(exponential(rnd, 1 / (rnd() < PAUSE_SHARE ? PAUSE_GAP_MEAN : BURST_GAP_MEAN)));
    const key = KEYS[Math.floor(rnd() * KEYS.length)];
    const delay = Math.min(maxDelay, Math.round((exponential(delays, 1) * maxDelay) / DELAY_MEAN_SHARE));
    return { id: i + 1, key, time, delay, arrival: time + delay };
  });
  return { seed, maxDelay, events };
}

/** The events in the order they reach the processor: by arrival, ties by id. */
export const arrivalOrder = (events: readonly Evt[]): Evt[] => [...events].sort((a, b) => a.arrival - b.arrival || a.id - b.id);

/** Longest delay actually drawn. */
export const longestDelay = (events: readonly Evt[]): number => Math.max(0, ...events.map((e) => e.delay));

/**
 * A replay of the log read backwards: the arrival times mirrored inside the same span, so the event that arrived last arrives
 * first and every gap between neighbours is kept. Only `arrival` changes (the original `delay` no longer describes it).
 */
export function reversedArrival(events: readonly Evt[]): Evt[] {
  const arrivals = events.map((e) => e.arrival);
  const mirror = Math.min(...arrivals) + Math.max(...arrivals);
  return events.map((e) => ({ ...e, arrival: mirror - e.arrival }));
}
