import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { listKeyTarget } from '../core/radio';
import { lastRows, rowTabStop, rowTone, type LogRow } from './logRows';

/** Breathing room above the first highlighted row when the stream scrolls to it. */
const SCROLL_MARGIN_PX = 4;
/** Within this many px of the end counts as "at the end" for `follow`. */
const AT_END_PX = 8;

/**
 * A log: monospace rows in a scrolling live region, each a `.log-row` tinted by its tone, with an
 * optional muted timestamp, a bold level and source, then the text. It wraps at 390.
 *
 * - `max` keeps only the newest rows. `maxHeight` (px) makes it scroll (and a tab stop, so the
 *   keyboard can scroll it); `follow` then keeps the newest row in view until the learner scrolls up.
 * - `highlight(row)`: false dims the row, true is what the stream scrolls to; null (or no function)
 *   means nothing is highlighted. The row's colour stays the lesson's call (`tone`).
 * - `live`: how a screen reader hears new rows. The region is always mounted, empty or not, so
 *   the first row is announced (default 'polite'; 'off' for a log the learner scrubs).
 *
 * - `onRowClick(row)` makes the rows selectable: each is a button (click, Enter or Space), the list has ONE
 *   tab stop (the selected row, else the one last focused, else the first) and Up/Down/Home/End move
 *   focus between rows. `selectedId` marks the chosen row (`aria-pressed`, `.is-selected`). The region then
 *   is no tab stop of its own: the rows are, and focus scrolls them into view.
 *
 * Rows need a unique `id`. Extracted from structured-logging, cert-lifecycle, resource-exhaustion,
 * dom-events and infrastructure-as-code.
 */
export function LogStream({
  rows, label, max, maxHeight, follow = false, highlight, onRowClick, selectedId, live = 'polite', empty = 'Nothing logged yet.', className = '',
}: {
  rows: readonly LogRow[];
  /** Accessible name of the log region. */
  label: string;
  max?: number;
  maxHeight?: number;
  follow?: boolean;
  highlight?: (row: LogRow) => boolean | null;
  onRowClick?: (row: LogRow) => void;
  selectedId?: LogRow['id'] | null;
  live?: 'off' | 'polite';
  /** Shown inside the region while there are no rows ('' for nothing). */
  empty?: string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  const shown = lastRows(rows, max);
  const highlighted = highlight !== undefined;
  const marks = highlight ? shown.map(highlight) : null;
  const firstId = marks ? shown.find((_, i) => marks[i] === true)?.id : undefined;

  const [stopId, setStopId] = useState<LogRow['id'] | null>(null);
  const selectable = onRowClick !== undefined;
  const wanted = selectedId ?? stopId;
  const stopIndex = rowTabStop(shown, wanted);

  const onRowKey = (e: KeyboardEvent<HTMLDivElement>, row: LogRow, index: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRowClick?.(row);
      return;
    }
    const target = listKeyTarget(e.key, index, shown.length);
    if (target === null) return;
    e.preventDefault();
    setStopId(shown[target].id);
    box.current?.querySelector<HTMLElement>(`[data-row="${shown[target].id}"]`)?.focus();
  };

  const newestId = shown.at(-1)?.id;
  // Bring the first highlighted row into view; with a highlight function but nothing highlighted, the top.
  useEffect(() => {
    const el = box.current;
    if (!el || !highlighted) return;
    const row = firstId === undefined ? null : el.querySelector<HTMLElement>(`[data-row="${firstId}"]`);
    el.scrollTop = row ? row.offsetTop - SCROLL_MARGIN_PX : 0;
  }, [highlighted, firstId]);
  useEffect(() => {
    const el = box.current;
    if (el && follow && atEnd.current) el.scrollTop = el.scrollHeight;
  }, [follow, newestId, shown.length]);

  return (
    <div
      ref={box}
      className={`log-stream ${maxHeight ? 'is-scroll' : ''} ${className}`}
      style={maxHeight ? { maxHeight } : undefined}
      role="log"
      aria-label={label}
      aria-live={live}
      tabIndex={maxHeight && !selectable ? 0 : undefined}
      onScroll={follow ? (e) => { atEnd.current = e.currentTarget.scrollHeight - e.currentTarget.scrollTop - e.currentTarget.clientHeight <= AT_END_PX; } : undefined}
    >
      {shown.length === 0 && empty !== '' && <div className="empty-note">{empty}</div>}
      {shown.map((r, i) => {
        const tone = rowTone(r);
        return (
          <div
            key={r.id}
            data-row={r.id}
            className={`log-row ${tone ? `tone-${tone}` : ''} ${marks?.[i] === false ? 'is-dim' : ''} ${selectable ? 'is-pick' : ''} ${selectedId === r.id ? 'is-selected' : ''}`}
            {...(selectable && {
              role: 'button',
              tabIndex: i === stopIndex ? 0 : -1,
              'aria-pressed': selectedId === r.id,
              onClick: () => { setStopId(r.id); onRowClick(r); },
              onFocus: () => setStopId(r.id),
              onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => onRowKey(e, r, i),
            })}
          >
            {r.at != null && <><span className="log-at">{r.at}</span>{' '}</>}
            {r.level && <><b className="log-level">{r.level}</b>{' '}</>}
            {r.source && <><b className={`log-source ${r.sourceTone ? `tone-${r.sourceTone}` : ''}`}>{r.source}</b>{' '}</>}
            <span className="log-text">{r.text}</span>
          </div>
        );
      })}
    </div>
  );
}
