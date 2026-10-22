import { arrowStep } from './geometry';
import { linearScale, logScale, type Scale } from './scale';
import type { Tone } from './tone';

/**
 * The maths behind Plot2D: the plot frame (two scales over an inner box), the samplers
 * for curves and heat layers, and the clamping used when a point is dragged.
 */

export interface AxisSpec {
  domain: readonly [number, number];
  log?: boolean;
  /** Axis title. */
  label?: string;
  /** About how many ticks (default 5). */
  ticks?: number;
  /**
   * Exactly these ticks instead of the automatic ones (values outside the domain are dropped).
   * For a log axis over a huge range whose automatic powers land unevenly: [1, 1e25, 1e50, 1e75, 1e100].
   */
  tickValues?: readonly number[];
  /** Tick label text (default: formatTick). */
  format?: (v: number) => string;
}

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PlotFrame {
  /** Data x → drawing x. */
  xs: Scale;
  /** Data y → drawing y (top of the box is the high end). */
  ys: Scale;
  /** The inner plotting box in drawing units. */
  box: { x: number; y: number; width: number; height: number };
}

export type Point = readonly [number, number];

export function plotFrame(width: number, height: number, margin: Margin, x: AxisSpec, y: AxisSpec): PlotFrame {
  const box = { x: margin.left, y: margin.top, width: width - margin.left - margin.right, height: height - margin.top - margin.bottom };
  const scale = (a: AxisSpec, r0: number, r1: number) => (a.log ? logScale : linearScale)(a.domain[0], a.domain[1], r0, r1);
  return { xs: scale(x, box.x, box.x + box.width), ys: scale(y, box.y + box.height, box.y), box };
}

/** Tick label size and the approximate advance of one tick glyph (10px mono), in drawing units. */
export const PLOT_FONT = 10;

/** The smallest text a plot may render, in screen pixels (the phone smoke's scene-text floor). */
export const MIN_PLOT_TEXT_PX = 8;

/**
 * How much to grow plot text (in viewBox units) so it never renders below MIN_PLOT_TEXT_PX when the
 * SVG is shrunk to `scale` screen pixels per viewBox unit. 1 while the smallest text (PLOT_FONT) is
 * already large enough, so plots drawn at a readable width look exactly as before.
 */
export function plotTextBoost(scale: number): number {
  if (!(scale > 0)) return 1;
  const boost = MIN_PLOT_TEXT_PX / (PLOT_FONT * scale);
  return boost > 1 ? Math.ceil(boost * 1000) / 1000 : 1;
}
const TICK_CHAR_W = 6;

/** A tick's label text: the axis's own `format`, else formatTick. */
export const tickText = (a: AxisSpec, v: number) => (a.format ? a.format(v) : formatTick(v, a.log));

/**
 * Plot2D's margins: room for the tick labels (the y axis's widest one sets the left side)
 * and for each axis title.
 */
export function plotMargin(x: AxisSpec, y: AxisSpec): Margin {
  const yWidest = Math.max(...axisTickValues(y).map((v) => tickText(y, v).length));
  return {
    top: 10,
    right: 14,
    bottom: PLOT_FONT + 12 + (x.label ? PLOT_FONT + 8 : 0),
    left: Math.max(24, yWidest * TICK_CHAR_W + 10) + (y.label ? PLOT_FONT + 8 : 0),
  };
}

/** An axis's extent in screen-even units: its data span, or its span in decades on a log axis. */
const axisSpan = (a: AxisSpec) => Math.abs(a.log ? Math.log10(a.domain[1]) - Math.log10(a.domain[0]) : a.domain[1] - a.domain[0]);

/**
 * The height at which a plot `width` wide draws one unit of x as long as one unit of y
 * (`aspect="equal"`): equal domains give a square inner box, so circles stay round and
 * right angles look right. On a log axis a "unit" is a decade.
 */
export function equalAspectHeight(width: number, x: AxisSpec, y: AxisSpec): number {
  const m = plotMargin(x, y);
  const boxW = width - m.left - m.right;
  return m.top + m.bottom + (boxW * axisSpan(y)) / axisSpan(x);
}

/**
 * Roving focus between draggable points (the arrow keys already move a point): Page Down
 * or ] picks the next, Page Up or [ the previous, Home and End the first and last. Null
 * for other keys; never wraps.
 */
export function rovingPointTarget(key: string, i: number, n: number): number | null {
  if (n <= 0) return null;
  const to: Record<string, number> = { PageDown: i + 1, ']': i + 1, PageUp: i - 1, '[': i - 1, Home: 0, End: n - 1 };
  if (!(key in to)) return null;
  return Math.min(n - 1, Math.max(0, to[key]));
}

/** The axis's tick values: `tickValues` inside the domain when given, else the scale's own ticks. */
export function axisTickValues(a: AxisSpec): number[] {
  const [lo, hi] = [Math.min(...a.domain), Math.max(...a.domain)];
  if (a.tickValues) return a.tickValues.filter((v) => v >= lo && v <= hi);
  return (a.log ? logScale : linearScale)(a.domain[0], a.domain[1], 0, 1).ticks(a.ticks ?? 5);
}

/** Keep a data point inside both domains. */
export function clampPoint([x, y]: Point, xs: Scale, ys: Scale): Point {
  return [clampTo(x, xs.domain), clampTo(y, ys.domain)];
}

function clampTo(v: number, [a, b]: readonly [number, number]) {
  return Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b));
}

/** Drawing units an arrow key moves a dragged point (Shift moves BIG_NUDGE). */
export const NUDGE = 4;
export const BIG_NUDGE = 20;

/**
 * The keyboard path for dragging: an arrow key moves the point a few drawing units
 * (so log axes step evenly too), clamped to the domain. Null for other keys.
 */
export function nudgePoint(p: Point, key: string, xs: Scale, ys: Scale, big = false): Point | null {
  const d = big ? BIG_NUDGE : NUDGE;
  const step = arrowStep(key, d);
  if (!step) return null;
  const px = xs.map(p[0]) + step[0];
  const py = ys.map(p[1]) + step[1];
  return clampPoint([xs.invert(px), ys.invert(py)], xs, ys);
}

/**
 * Snap a dragged value to a grid. An arrow key moves a few drawing units, which a grid coarser
 * than that rounds straight back to where the value was, so a key press that would not change
 * the snapped value moves it exactly one grid `step` in the pressed direction instead.
 * Pointer drags stay with the plain snap (a pointer resting inside a cell must not jump).
 */
export function snapDragged(prev: number, next: number, snap: (v: number) => number, step: number, via?: DragSource): number {
  const snapped = snap(next);
  if (via !== 'key' || snapped !== snap(prev) || Math.abs(next - prev) < AXIS_UNMOVED) return snapped;
  return snap(snap(prev) + Math.sign(next - prev) * step);
}

/** An arrow key leaves the other axis alone up to the scale's float noise (invert(map(v)) is not exactly v). */
const AXIS_UNMOVED = 1e-9;

/** What moved a draggable point: an arrow key, or (omitted) the pointer. */
export type DragSource = 'key';

/**
 * Sample y = fn(x) evenly across the drawing width (so a log x axis is sampled evenly
 * on screen). Non-finite values break the curve into separate runs instead of
 * drawing a spike through them.
 */
export function sampleCurve(fn: (x: number) => number, xs: Scale, samples = 160): Point[][] {
  const [r0, r1] = xs.range;
  const runs: Point[][] = [];
  let run: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const x = xs.invert(r0 + ((r1 - r0) * i) / samples);
    const y = fn(x);
    if (Number.isFinite(y)) run.push([x, y]);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

export interface HeatSample<T> {
  /** Column and row, row 0 at the top of the box. */
  col: number;
  row: number;
  /** The data point at the centre of the cell. */
  x: number;
  y: number;
  value: T;
}

/**
 * Evaluate fn at the centre of each cell of a cols × rows grid laid over the plot box.
 * Cells are evenly sized on screen, so log axes are covered evenly too.
 */
export function sampleHeat<T>(fn: (x: number, y: number) => T, frame: PlotFrame, cols: number, rows: number): HeatSample<T>[] {
  const { box, xs, ys } = frame;
  const out: HeatSample<T>[] = [];
  for (let row = 0; row < rows; row++) {
    const y = ys.invert(box.y + ((row + 0.5) * box.height) / rows);
    for (let col = 0; col < cols; col++) {
      const x = xs.invert(box.x + ((col + 0.5) * box.width) / cols);
      out.push({ col, row, x, y, value: fn(x, y) });
    }
  }
  return out;
}

/** A histogram bin as `barsFromHistogram` hands it to a tone function. */
export interface HistogramBin {
  index: number;
  x0: number;
  x1: number;
  count: number;
}

/**
 * `{ edges, counts }` from core/stats `histogram` (or `logHistogram`) → one bar per bin.
 * `tone(bin)` colours each bar (a tail past p95 in `bad`); undefined leaves the layer's tone.
 */
export function barsFromHistogram(
  h: { edges: readonly number[]; counts: readonly number[] },
  tone?: (bin: HistogramBin) => Tone | undefined,
): { x0: number; x1: number; y: number; tone?: Tone }[] {
  return h.counts.map((y, i) => {
    const bar = { x0: h.edges[i], x1: h.edges[i + 1], y };
    const t = tone?.({ index: i, x0: bar.x0, x1: bar.x1, count: y });
    return t ? { ...bar, tone: t } : bar;
  });
}

const SUPERSCRIPT: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/** Tick label: powers of ten as 10ⁿ on log axes, compact numbers otherwise (1.5k, 2M, 0.25). */
export function formatTick(v: number, log = false): string {
  if (v === 0) return '0';
  if (log) {
    const e = Math.log10(Math.abs(v));
    if (Math.abs(e - Math.round(e)) < 1e-9 && Math.abs(e) >= 3) {
      return `${v < 0 ? '−' : ''}10${[...String(Math.round(e))].map((ch) => SUPERSCRIPT[ch]).join('')}`;
    }
  }
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e9) return `${sign}${trim(a / 1e9)}B`;
  if (a >= 1e6) return `${sign}${trim(a / 1e6)}M`;
  if (a >= 1e4) return `${sign}${trim(a / 1e3)}k`;
  if (a < 1e-3) return `${sign}${a.toExponential(0)}`;
  return `${sign}${trim(a)}`;
}

const trim = (v: number) => String(Number(v.toPrecision(3)));

/**
 * Where a rule's label goes so it stays inside [lo, hi] (the plot box): `lefts` are the
 * candidate left edges in order of preference (the side it's drawn on, then the other side),
 * `w` its measured width. Returns the first candidate that fits, else the first one slid
 * inside (a label wider than the box starts at `lo`): which candidate, and how far to move it.
 */
export function fitLabel(lefts: readonly number[], w: number, lo: number, hi: number): { index: number; dx: number } {
  const fits = lefts.findIndex((l) => l >= lo && l + w <= hi);
  if (fits >= 0) return { index: fits, dx: 0 };
  const left = lefts[0];
  const slid = w > hi - lo ? lo : Math.min(hi - w, Math.max(lo, left));
  return { index: 0, dx: slid - left };
}
