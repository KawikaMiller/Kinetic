import type { LogRow } from '../../components/logRows';
import { SERVICE_TONE, type Level, type Service } from './model';
import { rowTone } from './rowTone';

/** The stream scrolls past this height, and says this when nothing is kept. */
export const STREAM_MAX_HEIGHT_PX = 300;
export const EMPTY_STREAM = 'No lines kept at this level.';

/** One line of the lesson's stream, before it is handed to the shared LogStream. */
export interface StreamRow {
  key: number;
  service: Service;
  level: Level;
  /** Text before the service tag (the clock and level in free text); empty for JSON. */
  head: string;
  /** The service name as shown: `[orders]` in free text, the plain name beside JSON. */
  tag: string;
  body: string;
  /** Whether a search or filter matches this line; null while none is active. */
  match: boolean | null;
  /** A card-shaped secret in the line (`secret`) or one that was masked (`redacted`). */
  flag?: 'secret' | 'redacted';
}

/** The shared LogStream's rows: the head is the muted timestamp, the tag the service in its colour. */
export const toLogRows = (rows: readonly StreamRow[]): LogRow[] =>
  rows.map((r) => ({ id: r.key, at: r.head || undefined, tone: rowTone(r) ?? undefined, source: r.tag, sourceTone: SERVICE_TONE[r.service], text: r.body }));

/**
 * LogStream's `highlight`: a line the filter ruled out is dimmed; a secret, a mask or a match is what
 * the stream scrolls to; nothing is highlighted while no search is active.
 */
export function streamHighlight(rows: readonly StreamRow[]): (row: LogRow) => boolean | null {
  const marks = new Map(rows.map((r) => [r.key, r.match === false ? false : r.flag || r.match ? true : r.match] as const));
  return (row) => marks.get(Number(row.id)) ?? null;
}
