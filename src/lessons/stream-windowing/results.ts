/**
 * stream-windowing, scene 3: the streamed answer against the offline one, per window, split into what the stream counted,
 * what it dropped and what has not arrived yet. Pure.
 */
import type { Stream } from './engine';
import type { Evt } from './events';
import { offlineWindows, sameSpan, type Span } from './windows';

export interface ResultRow {
  span: Span;
  truth: number;
  streamed: number;
  /** Events a window refused (tumbling and sliding only: a session's refusal is judged against a candidate window, not a final one). */
  dropped: number;
  /** Events of this window still to arrive. */
  pending: number;
  /** The stream has a window with exactly this range. */
  produced: boolean;
}

/** One row per window of the offline answer over `events`. */
export function resultRows(s: Stream, events: readonly Evt[]): ResultRow[] {
  const arrived = new Set(s.arrivals.slice(0, s.k).map((e) => e.id));
  return offlineWindows(events, s.cfg.spec).map((t) => {
    const mine = s.windows.find((w) => sameSpan(w, t));
    const dropped = s.cfg.spec.kind === 'session' ? 0 : s.refusals.filter((r) => sameSpan(r.span, t)).length;
    return {
      span: { key: t.key, start: t.start, end: t.end },
      truth: t.ids.length,
      streamed: mine?.ids.length ?? 0,
      dropped,
      pending: t.ids.filter((id) => !arrived.has(id)).length,
      produced: mine !== undefined,
    };
  });
}
