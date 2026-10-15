/**
 * stream-windowing, scene 3: the straggler button. Pure.
 */
import { STRAGGLER_BEHIND } from './engine';
import { EVENT_COUNT, type Evt } from './events';

export const STRAGGLER_ID = EVENT_COUNT + 1;

/**
 * The arrivals with one extra event inserted after the first `at`: a click that happened `STRAGGLER_BEHIND` seconds before the
 * watermark stood after those arrivals (cut at time 0), arriving right behind the last of them. Null before anything has arrived,
 * when there is no watermark yet.
 */
export function withStraggler(arrivals: readonly Evt[], at: number, bound: number): Evt[] | null {
  const seen = arrivals.slice(0, at);
  if (seen.length === 0) return null;
  const watermark = Math.max(...seen.map((e) => e.time)) - bound;
  const time = Math.max(0, watermark - STRAGGLER_BEHIND);
  const arrival = seen[seen.length - 1].arrival;
  const straggler: Evt = { id: STRAGGLER_ID, key: 'A', time, delay: arrival - time, arrival };
  return [...seen, straggler, ...arrivals.slice(at)];
}
