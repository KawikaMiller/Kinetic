/**
 * stream-windowing: what the timelines are given to draw. Pure.
 */
import { plainTone, type Tone } from '../../core/tone';
import type { Win } from './engine';
import { KEYS, type Evt, type Key } from './events';
import type { Span } from './windows';

/** Smallest text on the timelines, px in drawing units: what `minWidthForText` is given. */
export const PLOT_FONT = 10;

/** A key's hue: three of the four plain categorical tones. */
export const keyTone = (key: Key): Tone => plainTone(KEYS.indexOf(key));

export interface DrawnWindow extends Span {
  count: number;
  fired: boolean;
  tone: Tone;
  late: boolean;
}

export const drawnFrom = (windows: readonly Win[], toneOf: (w: Win, i: number) => Tone): DrawnWindow[] =>
  windows.map((w, i) => ({ key: w.key, start: w.start, end: w.end, count: w.ids.length, fired: w.fired, tone: toneOf(w, i), late: w.lateCount > 0 }));

export interface DotSpec {
  event: Evt;
  tone: Tone;
  hollow: boolean;
}
