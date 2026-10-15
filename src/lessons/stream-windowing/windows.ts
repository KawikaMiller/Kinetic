/**
 * stream-windowing: which windows an event belongs to, and the offline answer (a batch group-by over every event by event time).
 * Windows are half-open, [start, end). Pure.
 *
 * Tumbling: windows of `size` that tile the line. Sliding (hopping): a window of `size` starts every `slide`, aligned to 0, so the
 * first ones start before 0; with slide > size an event can land in none. Session: a key's events whose gaps are shorter than `gap` share a window, which runs
 * from the first event to the last plus `gap`; a gap of `gap` or more starts a new one (the half-open reading of "gap exceeds").
 */
import type { Evt } from './events';

export type WindowSpec =
  | { kind: 'tumbling'; size: number }
  | { kind: 'sliding'; size: number; slide: number }
  | { kind: 'session'; gap: number };

export const SIZE_RANGE = { min: 5, max: 120, step: 5 } as const;
export const SLIDE_RANGE = { min: 5, max: 120, step: 5 } as const;
export const GAP_RANGE = { min: 5, max: 60, step: 5 } as const;
/** The key of a window that does not depend on who clicked. */
export const ANY_KEY = '*';

export type WindowKind = WindowSpec['kind'];

/** The spec of a kind from the three size controls: a kind carries only the numbers it uses, so a control it ignores cannot reach the model. */
export const specFor = (kind: WindowKind, size: number, slide: number, gap: number): WindowSpec =>
  kind === 'tumbling' ? { kind, size } : kind === 'sliding' ? { kind, size, slide } : { kind, gap };

/** The window type and the sizes its controls hold, whether or not the type uses them. */
export interface WindowControls {
  kind: WindowKind;
  size: number;
  slide: number;
  gap: number;
}

export const DEFAULT_WINDOW_CONTROLS: WindowControls = { kind: 'tumbling', size: 60, slide: 20, gap: 20 };

export const specOf = (c: WindowControls): WindowSpec => specFor(c.kind, c.size, c.slide, c.gap);

export const DEFAULT_SPEC: Record<WindowKind, WindowSpec> = {
  tumbling: { kind: 'tumbling', size: 60 },
  sliding: { kind: 'sliding', size: 60, slide: 20 },
  session: { kind: 'session', gap: 20 },
};

export interface Span {
  key: string;
  start: number;
  end: number;
}

export const sameSpan = (a: Span, b: Span): boolean => a.key === b.key && a.start === b.start && a.end === b.end;

/** The windows a time falls in under a tumbling or sliding spec (sessions are built from the events, not assigned). */
export function assign(time: number, spec: Exclude<WindowSpec, { kind: 'session' }>): Span[] {
  if (spec.kind === 'tumbling') {
    const start = Math.floor(time / spec.size) * spec.size;
    return [{ key: ANY_KEY, start, end: start + spec.size }];
  }
  const spans: Span[] = [];
  for (let j = Math.floor(time / spec.slide); j * spec.slide + spec.size > time; j--) {
    spans.push({ key: ANY_KEY, start: j * spec.slide, end: j * spec.slide + spec.size });
  }
  return spans.reverse();
}

export interface Bucket extends Span {
  ids: number[];
}

/** The offline answer: every event grouped by its event time into windows, sorted by key then start. */
export function offlineWindows(events: readonly Evt[], spec: WindowSpec): Bucket[] {
  const buckets: Bucket[] = [];
  if (spec.kind === 'session') {
    for (const key of new Set(events.map((e) => e.key))) {
      const mine = events.filter((e) => e.key === key).sort((a, b) => a.time - b.time || a.id - b.id);
      let current: Bucket | null = null;
      mine.forEach((e, i) => {
        if (current && e.time - mine[i - 1].time < spec.gap) {
          current.ids.push(e.id);
          current.end = e.time + spec.gap;
        } else {
          current = { key, start: e.time, end: e.time + spec.gap, ids: [e.id] };
          buckets.push(current);
        }
      });
    }
  } else {
    for (const e of events) {
      for (const span of assign(e.time, spec)) {
        const hit = buckets.find((b) => sameSpan(b, span));
        if (hit) hit.ids.push(e.id);
        else buckets.push({ ...span, ids: [e.id] });
      }
    }
  }
  return buckets.sort((a, b) => a.key.localeCompare(b.key) || a.start - b.start);
}

/** How many windows each event lands in: the distinct counts, ascending (a sliding spec with size a multiple of slide gives one number). */
export const membershipCounts = (events: readonly Evt[], spec: Exclude<WindowSpec, { kind: 'session' }>): number[] =>
  [...new Set(events.map((e) => assign(e.time, spec).length))].sort((a, b) => a - b);
