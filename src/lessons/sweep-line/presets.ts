import { parseBoundedDecimal } from '../../core/parse';
import { snapDragged, type DragSource } from '../../core/plot';
import type { Interval } from './intervals';
import type { HSeg, VSeg } from './segments';

export const TIME_MAX = 24;
export const MAX_INTERVALS = 10;
export const MAX_SEGMENTS = 8;
/** Dragging snaps to half an hour. */
export const SNAP = 0.5;

export interface IntervalPreset {
  id: string;
  label: string;
  intervals: Interval[];
}

const iv = (...pairs: [number, number][]): Interval[] => pairs.map(([start, end]) => ({ start, end }));

export const INTERVAL_PRESETS: IntervalPreset[] = [
  { id: 'day', label: 'A calendar day', intervals: iv([9, 10.5], [10, 11], [13, 14.5], [14, 15], [9.5, 10.5], [16, 17]) },
  { id: 'nested', label: 'Nested', intervals: iv([1, 10], [2, 5], [3, 4], [6, 8]) },
  { id: 'touching', label: 'Touching', intervals: iv([1, 3], [3, 5], [5, 7], [8, 9]) },
  { id: 'identical', label: 'Identical', intervals: iv([2, 6], [2, 6], [2, 6]) },
];

/** Where each scene opens (pure data, so a test can walk the try-this lines). */
export const OPENING = {
  merge: INTERVAL_PRESETS[0].intervals,
  rooms: iv([9, 10], [10, 11], [9.5, 10.5]),
  select: iv([1, 4], [3, 5], [0, 6], [5, 7], [3, 9], [5, 9], [6, 10], [8, 11], [8, 12], [2, 14], [12, 16]).slice(0, MAX_INTERVALS),
} as const;

export const ROOMS_PRESETS: IntervalPreset[] = [
  { id: 'meetings', label: 'The back-to-back trio', intervals: [...OPENING.rooms] },
  ...INTERVAL_PRESETS.filter((p) => p.id !== 'nested'),
];

export const SELECT_PRESETS: IntervalPreset[] = [
  { id: 'classic', label: `${OPENING.select.length} activities`, intervals: [...OPENING.select] },
  { id: 'touching', label: 'Touching', intervals: INTERVAL_PRESETS[2].intervals },
  { id: 'identical', label: 'Identical', intervals: INTERVAL_PRESETS[3].intervals },
];

export const formatIntervals = (list: readonly Interval[]): string => list.map((x) => `${x.start}-${x.end}`).join(', ');

export type IntervalParse = { ok: true; intervals: Interval[] } | { ok: false; error: string; swapOffer?: Interval[] };

const message = (what: string) => ({
  empty: `Type a ${what}.`,
  invalid: (typed: string) => `"${typed}" is not a number: use plain digits like 9 or 10.5.`,
  tooSmall: () => `A ${what} below 0 is off the timeline (0 to ${TIME_MAX}): refused, not clamped.`,
  tooBig: () => `A ${what} above ${TIME_MAX} is off the timeline (0 to ${TIME_MAX}): refused, not clamped.`,
});

/** A typed list "start-end, start-end": plain decimals, start before end, up to MAX_INTERVALS, inside the timeline. */
export function parseIntervals(text: string): IntervalParse {
  const parts = text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { ok: false, error: 'Type at least one interval like 9-10.' };
  if (parts.length > MAX_INTERVALS) return { ok: false, error: `The timeline keeps up to ${MAX_INTERVALS} intervals; you typed ${parts.length}.` };
  const out: Interval[] = [];
  for (const part of parts) {
    const m = /^([0-9.]+)\s*-\s*([0-9.]+)$/.exec(part);
    if (!m) return { ok: false, error: `"${part}" is not a pair like 9-10: type start-end with plain numbers.` };
    const s = parseBoundedDecimal(m[1], { min: 0, max: TIME_MAX, messages: message('start') });
    if (!s.ok) return { ok: false, error: `${part}: ${s.error}` };
    const e = parseBoundedDecimal(m[2], { min: 0, max: TIME_MAX, messages: message('end') });
    if (!e.ok) return { ok: false, error: `${part}: ${e.error}` };
    if (s.value === e.value) return { ok: false, error: `${part} has zero length: an interval [start, end) with start equal to end is empty, so it is refused.` };
    if (s.value > e.value) {
      const fixed = parseIntervals(parts.map((p) => (p === part ? `${e.value}-${s.value}` : p)).join(', '));
      return { ok: false, error: `${part} runs backwards: the end must come after the start. Use ${e.value}-${s.value}?`, swapOffer: fixed.ok ? fixed.intervals : undefined };
    }
    out.push({ start: s.value, end: e.value });
  }
  return { ok: true, intervals: out };
}

export const snapTime = (v: number) => Math.min(TIME_MAX, Math.max(0, Math.round(v / SNAP) * SNAP));

/**
 * One handle dragged to `time`: snapped to half an hour (an arrow key moves one half hour), and a
 * zero-length or backwards result is held half a unit from the other end.
 */
export function dragInterval(cur: Interval, end: 'start' | 'end', time: number, via?: DragSource): Interval {
  const t = snapDragged(cur[end], time, snapTime, SNAP, via);
  return end === 'start' ? { start: Math.min(t, cur.end - SNAP), end: cur.end } : { start: cur.start, end: Math.max(t, cur.start + SNAP) };
}

// ── segments ─────────────────────────────────────────────────────────────

export const GRID = 12;

/** A segment end snapped to the grid (an arrow key moves one cell). */
export function snapCell(prev: number, next: number, via?: DragSource): number {
  return snapDragged(prev, next, (v) => Math.min(GRID, Math.max(0, Math.round(v))), 1, via);
}

export interface SegSet {
  hs: HSeg[];
  vs: VSeg[];
}

export interface SegPreset {
  id: string;
  label: string;
  set: SegSet;
}

export const SEG_PRESETS: SegPreset[] = [
  {
    id: 'sparse',
    label: 'A few crossings',
    set: {
      hs: [{ y: 2, x0: 1, x1: 6 }, { y: 5, x0: 3, x1: 10 }, { y: 8, x0: 0, x1: 4 }, { y: 10, x0: 6, x1: 11 }],
      vs: [{ x: 2, y0: 1, y1: 6 }, { x: 5, y0: 4, y1: 9 }, { x: 8, y0: 3, y1: 11 }, { x: 11, y0: 0, y1: 3 }],
    },
  },
  {
    id: 'touching',
    label: 'Touches and T-junctions',
    set: {
      hs: [{ y: 3, x0: 1, x1: 5 }, { y: 6, x0: 5, x1: 9 }, { y: 9, x0: 2, x1: 7 }],
      vs: [{ x: 5, y0: 3, y1: 6 }, { x: 9, y0: 1, y1: 6 }, { x: 2, y0: 9, y1: 11 }, { x: 7, y0: 4, y1: 8 }],
    },
  },
];

export const SEG_OPEN: SegSet = SEG_PRESETS[0].set;
