/**
 * stream-windowing: where things sit on the time axis and which row a window is drawn in. Pure.
 */
import { linearScale } from '../../core/scale';
import { KEYS, type Evt } from './events';
import type { Span, WindowSpec } from './windows';

/** Drawing width of every timeline, and the space kept for the row labels on the left and a margin on the right. */
export const PLOT_W = 720;
export const LABEL_W = 74;
export const MARGIN_R = 14;
const AXIS_STEP = 30;

/** The last time the axis shows: past every event time and arrival, in whole AXIS_STEPs. */
export const horizonOf = (events: readonly Evt[]): number =>
  Math.max(AXIS_STEP, Math.ceil((Math.max(0, ...events.flatMap((e) => [e.time, e.arrival])) + 1) / AXIS_STEP) * AXIS_STEP);

export const xScale = (horizon: number) => linearScale(0, horizon, LABEL_W, PLOT_W - MARGIN_R);

/** m:ss for a number of seconds. */
export const clockLabel = (s: number): string => `${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, '0')}`;

export interface Lanes {
  labels: string[];
  rowOf: (w: Span) => number;
}

/** Rows of window bars: windows that overlap never share a row. */
export function lanesFor(spec: WindowSpec): Lanes {
  if (spec.kind === 'session') return { labels: [...KEYS], rowOf: (w) => Math.max(0, KEYS.indexOf(w.key as (typeof KEYS)[number])) };
  if (spec.kind === 'tumbling') return { labels: ['windows'], rowOf: () => 0 };
  const rows = Math.max(1, Math.ceil(spec.size / spec.slide));
  return { labels: Array.from({ length: rows }, (_, i) => `row ${i + 1}`), rowOf: (w) => (((Math.round(w.start / spec.slide) % rows) + rows) % rows) };
}
