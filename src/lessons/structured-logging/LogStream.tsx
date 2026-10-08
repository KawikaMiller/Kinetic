import { useEffect, useRef } from 'react';
import type { Tone } from '../../core/tone';
import { SERVICE_TONE, type Level, type Service } from './model';

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

/** Errors and warnings keep their own colour, a matching line is the current-request yellow, and a line the filter ruled out is dimmed. */
const rowTone = (r: StreamRow): Tone | null => (r.flag === 'secret' ? 'bad' : r.flag === 'redacted' ? 'ok' : r.level === 'ERROR' ? 'bad' : r.level === 'WARN' ? 'orange' : r.match ? 'hi' : null);

/** Breathing room above the first highlighted line when the stream scrolls to it. */
const SCROLL_MARGIN_PX = 4;

export function LogStream({ rows, label, empty = 'No lines kept at this level.' }: { rows: readonly StreamRow[]; label: string; empty?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const firstKey = rows.find((r) => r.flag || r.match)?.key;
  // Bring the first matching (or secret-bearing) line into view; nothing highlighted means the top.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const line = firstKey === undefined ? null : el.querySelector<HTMLElement>(`[data-key="${firstKey}"]`);
    el.scrollTop = line ? line.offsetTop - SCROLL_MARGIN_PX : 0;
  }, [firstKey]);
  if (rows.length === 0) return <div className="empty-note">{empty}</div>;
  return (
    <div ref={box} className="sl-stream" role="log" aria-label={label} tabIndex={0}>
      {rows.map((r) => {
        const tone = rowTone(r);
        return (
          <div key={r.key} data-key={r.key} className={['log-row', 'sl-row', tone && `tone-${tone}`, r.match === false && 'sl-dim'].filter(Boolean).join(' ')}>
            {r.head && <span className="sl-head">{r.head} </span>}
            <span className={`sl-tag tone-${SERVICE_TONE[r.service]}`}>{r.tag}</span> <span className="sl-body">{r.body}</span>
          </div>
        );
      })}
    </div>
  );
}
