import { linearScale, logScale, type Scale } from './scale';

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
  const delta: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
  const step = delta[key];
  if (!step) return null;
  const px = xs.map(p[0]) + step[0];
  const py = ys.map(p[1]) + step[1];
  return clampPoint([xs.invert(px), ys.invert(py)], xs, ys);
}

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

/** `{ edges, counts }` from core/stats `histogram` → one bar per bin. */
export function barsFromHistogram(h: { edges: readonly number[]; counts: readonly number[] }): { x0: number; x1: number; y: number }[] {
  return h.counts.map((y, i) => ({ x0: h.edges[i], x1: h.edges[i + 1], y }));
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
