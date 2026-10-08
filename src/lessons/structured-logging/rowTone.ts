import type { Tone } from '../../core/tone';
import type { Level } from './model';

/** The parts of a stream row that decide its colour. */
export interface ToneRow {
  level: Level;
  match: boolean | null;
  flag?: 'secret' | 'redacted';
}

/**
 * A secret or its mask comes first, then a line the search matched is the current-request yellow
 * (as the legend says, so a level>=WARN search shows yellow lines); only unmatched lines fall back to
 * their level colour, red for ERROR and orange for WARN. A line the filter ruled out is dimmed separately.
 */
export const rowTone = (r: ToneRow): Tone | null => {
  if (r.flag === 'secret') return 'bad';
  if (r.flag === 'redacted') return 'ok';
  if (r.match) return 'hi';
  if (r.level === 'ERROR') return 'bad';
  if (r.level === 'WARN') return 'orange';
  return null;
};
