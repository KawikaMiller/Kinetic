import { useId, useMemo, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { alpha, TOKENS } from '../core/palette';
import {
  clampPoint, formatTick, nudgePoint, plotFrame, sampleCurve, sampleHeat, type AxisSpec, type Point,
} from '../core/plot';
import { linearScale, logScale } from '../core/scale';
import type { Tone } from '../core/tone';
import { paintImage } from './canvasImage';
import { PlotContext, usePlot } from './plotContext';

export type { AxisSpec, Point } from '../core/plot';

const TICK_CHAR_W = 6;
const FONT = 10;

/**
 * A 2-D plot on core/scale axes (linear or log), with tick labels, axis titles and a grid.
 * Layers are children, drawn in order, all in data coordinates: Heat (put it first: it's
 * a canvas underneath), Bars, Polygon, Curve, Segments, VLine/HLine, Arrow, Points.
 * The default 356 × 240 fits a phone at 390 with 10 px tick labels. Custom layers read
 * the scales with usePlot() from ./plotContext.
 */
export function Plot2D({
  x, y, width = 356, height = 240, grid = true, ariaLabel, className = '', children,
}: {
  x: AxisSpec;
  y: AxisSpec;
  width?: number;
  height?: number;
  grid?: boolean;
  ariaLabel: string;
  className?: string;
  children?: ReactNode;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const clip = useId();
  const xTickLabels = axisTicks(x);
  const yTickLabels = axisTicks(y);
  const margin = {
    top: 10,
    right: 14,
    bottom: FONT + 12 + (x.label ? FONT + 8 : 0),
    left: Math.max(24, Math.max(...yTickLabels.map((t) => t.text.length)) * TICK_CHAR_W + 10) + (y.label ? FONT + 8 : 0),
  };
  const frame = plotFrame(width, height, margin, x, y);
  const { xs, ys, box } = frame;
  const toData = (clientX: number, clientY: number): Point | null => {
    const m = svg.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return clampPoint([xs.invert(p.x), ys.invert(p.y)], xs, ys);
  };

  const xTicks = xTickLabels.map((t) => ({ ...t, at: xs.map(t.v) }));
  const yTicks = yTickLabels.map((t) => ({ ...t, at: ys.map(t.v) }));

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      className={`plot2d ${className}`}
      role="group"
      aria-label={ariaLabel}
    >
      <defs>
        <clipPath id={clip}>
          <rect x={box.x} y={box.y} width={box.width} height={box.height} />
        </clipPath>
      </defs>
      <g className="plot-grid" aria-hidden="true">
        {grid && xTicks.map((t) => <line key={`x${t.v}`} x1={t.at} x2={t.at} y1={box.y} y2={box.y + box.height} />)}
        {grid && yTicks.map((t) => <line key={`y${t.v}`} x1={box.x} x2={box.x + box.width} y1={t.at} y2={t.at} />)}
        <rect className="plot-frame" x={box.x} y={box.y} width={box.width} height={box.height} />
      </g>
      <PlotContext.Provider value={{ ...frame, clip, toData }}>{children}</PlotContext.Provider>
      <g className="plot-axes" aria-hidden="true">
        {xTicks.map((t) => (
          <text key={`x${t.v}`} className="plot-tick" x={t.at} y={box.y + box.height + FONT + 6} textAnchor="middle">
            {t.text}
          </text>
        ))}
        {yTicks.map((t) => (
          <text key={`y${t.v}`} className="plot-tick" x={box.x - 6} y={t.at + FONT * 0.35} textAnchor="end">
            {t.text}
          </text>
        ))}
        {x.label && (
          <text className="plot-title" x={box.x + box.width / 2} y={height - 4} textAnchor="middle">
            {x.label}
          </text>
        )}
        {y.label && (
          <text className="plot-title" transform={`translate(${FONT + 2} ${box.y + box.height / 2}) rotate(-90)`} textAnchor="middle">
            {y.label}
          </text>
        )}
      </g>
    </svg>
  );
}

/** Tick values and labels; ticks depend only on the domain, so a unit range is enough. */
function axisTicks(a: AxisSpec) {
  const scale = (a.log ? logScale : linearScale)(a.domain[0], a.domain[1], 0, 1);
  return scale.ticks(a.ticks ?? 5).map((v) => ({ v, text: a.format ? a.format(v) : formatTick(v, a.log) }));
}

/* ---------- layers ---------- */

const toneClass = (t: Tone | undefined, fallback: Tone) => `tone-${t ?? fallback}`;

/** A line through points or a sampled function y = fn(x); breaks where fn isn't finite. */
export function Curve({ fn, points, tone, dashed = false, width }: {
  fn?: (x: number) => number;
  points?: readonly Point[];
  tone?: Tone;
  dashed?: boolean;
  width?: number;
}) {
  const { xs, ys, clip } = usePlot();
  const runs = points ? [points] : fn ? sampleCurve(fn, xs) : [];
  const d = runs.map((run) => run.map(([px, py], i) => `${i ? 'L' : 'M'}${xs.map(px).toFixed(2)} ${ys.map(py).toFixed(2)}`).join('')).join('');
  return (
    <path
      className={`plot-curve ${toneClass(tone, 'info')} ${dashed ? 'is-dashed' : ''}`}
      d={d}
      clipPath={`url(#${clip})`}
      style={width ? { strokeWidth: width } : undefined}
    />
  );
}

/** Independent line segments (residuals, a decision boundary, k-means assignments). */
export function Segments({ segments, tone, dashed = false }: {
  segments: readonly { from: Point; to: Point; tone?: Tone }[];
  tone?: Tone;
  dashed?: boolean;
}) {
  const { xs, ys, clip } = usePlot();
  return (
    <g className={`plot-segments ${dashed ? 'is-dashed' : ''}`} clipPath={`url(#${clip})`}>
      {segments.map((s, i) => (
        <line key={i} className={toneClass(s.tone ?? tone, 'dim')} x1={xs.map(s.from[0])} y1={ys.map(s.from[1])} x2={xs.map(s.to[0])} y2={ys.map(s.to[1])} />
      ))}
    </g>
  );
}

/** Bars from x0 to x1 rising from `base` (default 0, or the bottom of a log axis). See barsFromHistogram. */
export function Bars({ bars, tone, base }: {
  bars: readonly { x0: number; x1: number; y: number; tone?: Tone }[];
  tone?: Tone;
  base?: number;
}) {
  const { xs, ys, clip } = usePlot();
  const [lo, hi] = [Math.min(...ys.domain), Math.max(...ys.domain)];
  const b = ys.map(base ?? (lo <= 0 && hi >= 0 ? 0 : lo));
  return (
    <g className="plot-bars" clipPath={`url(#${clip})`}>
      {bars.map((bar, i) => {
        const x0 = xs.map(bar.x0);
        const x1 = xs.map(bar.x1);
        const top = ys.map(bar.y);
        return (
          <rect
            key={i}
            className={toneClass(bar.tone ?? tone, 'info')}
            x={Math.min(x0, x1) + 0.5}
            width={Math.max(0, Math.abs(x1 - x0) - 1)}
            y={Math.min(top, b)}
            height={Math.abs(b - top)}
          />
        );
      })}
    </g>
  );
}

/** A vertical rule at x = at, labelled at the top (a threshold, n, the mean). */
export function VLine({ at, label, tone, dashed = true }: { at: number; label?: ReactNode; tone?: Tone; dashed?: boolean }) {
  const { xs, box } = usePlot();
  const x = xs.map(at);
  const flip = x > box.x + box.width * 0.75;
  return (
    <g className={`plot-rule ${toneClass(tone, 'hi')} ${dashed ? 'is-dashed' : ''}`}>
      <line x1={x} x2={x} y1={box.y} y2={box.y + box.height} />
      {label != null && (
        <text x={x + (flip ? -4 : 4)} y={box.y + FONT + 2} textAnchor={flip ? 'end' : 'start'}>
          {label}
        </text>
      )}
    </g>
  );
}

/** A horizontal rule at y = at, labelled at the right (an expected value, a target). */
export function HLine({ at, label, tone, dashed = true }: { at: number; label?: ReactNode; tone?: Tone; dashed?: boolean }) {
  const { ys, box } = usePlot();
  const y = ys.map(at);
  const below = y < box.y + FONT + 6;
  return (
    <g className={`plot-rule ${toneClass(tone, 'hi')} ${dashed ? 'is-dashed' : ''}`}>
      <line x1={box.x} x2={box.x + box.width} y1={y} y2={y} />
      {label != null && (
        <text x={box.x + box.width - 4} y={below ? y + FONT + 2 : y - 4} textAnchor="end">
          {label}
        </text>
      )}
    </g>
  );
}

const HEAD = 9;

/** A vector from `from` (default the origin) to `to`, with an arrowhead and an optional label. */
export function Arrow({ from = [0, 0], to, tone, label }: { from?: Point; to: Point; tone?: Tone; label?: ReactNode }) {
  const { xs, ys, clip } = usePlot();
  const [x0, y0, x1, y1] = [xs.map(from[0]), ys.map(from[1]), xs.map(to[0]), ys.map(to[1])];
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 0.5) return null;
  const [ux, uy] = [(x1 - x0) / len, (y1 - y0) / len];
  const head = Math.min(HEAD, len * 0.6);
  const [bx, by] = [x1 - ux * head, y1 - uy * head];
  const w = head * 0.5;
  return (
    <g className={`plot-arrow ${toneClass(tone, 'info')}`} clipPath={`url(#${clip})`}>
      <line x1={x0} y1={y0} x2={bx} y2={by} />
      <polygon points={`${x1},${y1} ${bx - uy * w},${by + ux * w} ${bx + uy * w},${by - ux * w}`} />
      {label != null && (
        <text x={x1 + ux * 6 + (ux >= 0 ? 2 : -2)} y={y1 + uy * 6 + 4} textAnchor={ux >= 0 ? 'start' : 'end'}>
          {label}
        </text>
      )}
    </g>
  );
}

/** A filled shape (a transformed unit square, a confidence band). */
export function Polygon({ points, tone, dashed = false }: { points: readonly Point[]; tone?: Tone; dashed?: boolean }) {
  const { xs, ys, clip } = usePlot();
  return (
    <polygon
      className={`plot-polygon ${toneClass(tone, 'violet')} ${dashed ? 'is-dashed' : ''}`}
      points={points.map(([px, py]) => `${xs.map(px).toFixed(2)},${ys.map(py).toFixed(2)}`).join(' ')}
      clipPath={`url(#${clip})`}
    />
  );
}

export interface PlotPoint {
  x: number;
  y: number;
  tone?: Tone;
  hollow?: boolean;
}

/**
 * Dots in data space. `hollow` draws held-out (validation) data. With `onDrag` each
 * point is draggable by pointer and focusable: arrow keys nudge it 4 units (Shift: 20),
 * always clamped to the domain.
 */
export function Points({ data, tone, r = 4.5, hollow = false, onDrag, pointLabel }: {
  data: readonly PlotPoint[];
  tone?: Tone;
  r?: number;
  hollow?: boolean;
  onDrag?: (i: number, p: Point) => void;
  /** Screen-reader name of a draggable point (default "point i"). */
  pointLabel?: (i: number) => string;
}) {
  const { xs, ys, toData } = usePlot();
  const dragging = useRef<number | null>(null);

  const onPointerDown = (e: PointerEvent<SVGGElement>, i: number) => {
    dragging.current = i;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
  };
  const onPointerMove = (e: PointerEvent<SVGGElement>, i: number) => {
    if (dragging.current !== i) return;
    const p = toData(e.clientX, e.clientY);
    if (p) onDrag?.(i, p);
  };
  const onKeyDown = (e: KeyboardEvent<SVGGElement>, i: number) => {
    const p = nudgePoint([data[i].x, data[i].y], e.key, xs, ys, e.shiftKey);
    if (!p) return;
    e.preventDefault();
    onDrag?.(i, p);
  };

  return (
    <g className="plot-points">
      {data.map((d, i) => {
        const cx = xs.map(d.x);
        const cy = ys.map(d.y);
        const cls = `plot-point ${toneClass(d.tone ?? tone, 'info')} ${(d.hollow ?? hollow) ? 'is-hollow' : ''}`;
        if (!onDrag) return <circle key={i} className={cls} cx={cx} cy={cy} r={r} />;
        return (
          <g
            key={i}
            className={`${cls} is-draggable`}
            role="button"
            tabIndex={0}
            aria-roledescription="draggable point"
            aria-label={`${pointLabel?.(i) ?? `point ${i + 1}`} at ${num(d.x)}, ${num(d.y)}. Arrow keys move it.`}
            onPointerDown={(e) => onPointerDown(e, i)}
            onPointerMove={(e) => onPointerMove(e, i)}
            onPointerUp={() => (dragging.current = null)}
            onPointerCancel={() => (dragging.current = null)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <circle className="plot-hit" cx={cx} cy={cy} r={Math.max(r + 8, 14)} />
            <circle cx={cx} cy={cy} r={r + 1.5} />
          </g>
        );
      })}
    </g>
  );
}

const num = (v: number) => String(Number(v.toPrecision(3)));

const HEAT_SCALE = 2;

export type HeatValue = number | { tone: Tone; intensity?: number } | null;

/**
 * A field painted on a canvas under the other layers: contours of a loss surface, the
 * regions a classifier assigns. `fn(x, y)` is sampled at `resolution` columns (rows to
 * match the box's aspect; memoise fn, it repaints when it changes); or pass `grid` (row 0 at the top) to paint precomputed values.
 * A number is an intensity 0..1 of `tone`; an object picks its own tone (a region).
 */
export function Heat({ fn, grid, tone = 'info', resolution = 64, max = 0.85 }: {
  fn?: (x: number, y: number) => HeatValue;
  grid?: readonly (readonly HeatValue[])[];
  tone?: Tone;
  resolution?: number;
  /** Opacity of a full-intensity cell, so lines on top stay readable. */
  max?: number;
}) {
  const frame = usePlot();
  const { box } = frame;
  const cols = grid ? (grid[0]?.length ?? 0) : resolution;
  const rows = grid ? grid.length : Math.max(1, Math.round((resolution * box.height) / box.width));
  const image = useMemo(() => {
    const samples = grid
      ? grid.flatMap((row, r) => row.map((value, c) => ({ col: c, row: r, value })))
      : fn
        ? sampleHeat(fn, frame, cols, rows)
        : [];
    const cw = box.width / Math.max(1, cols);
    const ch = box.height / Math.max(1, rows);
    // Cell edges snap to whole device pixels: no gaps, and no overlaps doubling the alpha.
    const snap = (v: number) => Math.round(v * HEAT_SCALE) / HEAT_SCALE;
    return paintImage(
      box.width,
      box.height,
      (ctx) =>
        samples.forEach(({ col, row, value }) => {
          const fill = heatFill(value, tone, max);
          if (!fill) return;
          const [x0, x1, y0, y1] = [snap(col * cw), snap((col + 1) * cw), snap(row * ch), snap((row + 1) * ch)];
          ctx.fillStyle = fill;
          ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        }),
      HEAT_SCALE,
    );
    // The frame is rebuilt each render; its box and domains are what the pixels depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, grid, tone, cols, rows, max, box.width, box.height, frame.xs.domain[0], frame.xs.domain[1], frame.ys.domain[0], frame.ys.domain[1]]);
  if (!image) return null;
  return <image className="plot-heat" href={image} x={box.x} y={box.y} width={box.width} height={box.height} preserveAspectRatio="none" />;
}

function heatFill(v: HeatValue, tone: Tone, max: number): string | null {
  if (v == null) return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v <= 0) return null;
    return alpha(TOKENS[tone], Math.min(1, v) * max);
  }
  return alpha(TOKENS[v.tone], Math.min(1, v.intensity ?? 0.35) * max);
}
