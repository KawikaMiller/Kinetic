import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { alpha, TOKENS } from '../core/palette';
import {
  axisTickValues, clampPoint, type DragSource, equalAspectHeight, fitLabel, nudgePoint, PLOT_FONT, plotFrame, plotMargin, plotTextBoost, rovingPointTarget, sampleCurve, sampleHeat, tickText,
  type AxisSpec, type Point,
} from '../core/plot';
import type { Tone } from '../core/tone';
import { paintImage } from './canvasImage';
import { useDragPoint } from './useDragPoint';
import { PlotContext, usePlot } from './plotContext';

export type { AxisSpec, Point } from '../core/plot';
export { Area, Band, Steps } from './PlotAreas';

const FONT = PLOT_FONT;

/**
 * The text growth factor that keeps every plot label at or above the 8px floor however far the SVG is
 * shrunk (`max-width: 100%` scales the whole drawing, text included). Published as `--plot-text-boost`
 * for the plot font rules in kit.css; 1 (no style at all) whenever the text is already large enough.
 */
function usePlotTextBoost(ref: RefObject<SVGSVGElement | null>, viewBoxWidth: number): number {
  const [boost, setBoost] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const rendered = el.getBoundingClientRect().width;
      if (rendered > 0) setBoost(plotTextBoost(rendered / viewBoxWidth));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, viewBoxWidth]);
  return boost;
}

/**
 * A 2-D plot on core/scale axes (linear or log), with tick labels, axis titles and a grid.
 * Layers are children, drawn in order, all in data coordinates: Heat (put it first: it's
 * a canvas underneath), Bars, Area, Band, Polygon, Curve, Steps, Segments, VLine/HLine, Arrow, Points.
 * The default 356 × 240 fits a phone at 390 with 10 px tick labels; `aspect="equal"`
 * picks the height that draws x and y units the same length (a square box for equal
 * domains). Custom layers read the scales with usePlot() from ./plotContext.
 */
export function Plot2D({
  x, y, width = 356, height: fixedHeight = 240, aspect, grid = true, ariaLabel, className = '', children,
}: {
  x: AxisSpec;
  y: AxisSpec;
  width?: number;
  /** Ignored with aspect="equal". */
  height?: number;
  /** equal: one unit of x is as long on screen as one of y (the height follows from the width). */
  aspect?: 'equal';
  grid?: boolean;
  ariaLabel: string;
  className?: string;
  children?: ReactNode;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const clip = useId();
  const boost = usePlotTextBoost(svg, width);
  const xTickLabels = axisTicks(x);
  const yTickLabels = axisTicks(y);
  const height = aspect === 'equal' ? equalAspectHeight(width, x, y) : fixedHeight;
  const frame = plotFrame(width, height, plotMargin(x, y), x, y);
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
      style={boost > 1 ? ({ '--plot-text-boost': boost } as CSSProperties) : undefined}
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

/** Tick values and labels. */
function axisTicks(a: AxisSpec) {
  return axisTickValues(a).map((v) => ({ v, text: tickText(a, v) }));
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

/**
 * A vertical rule at x = at, labelled at the top (a threshold, n, the mean). With `onDrag`
 * it's a slider: a solid rule with a grip, dragged by pointer anywhere in the box, and
 * focusable, where the arrow keys call `onStep(±1)` (or, without onStep, nudge it a few
 * units through onDrag).
 */
export function VLine({ at, label, tone, onDrag, onStep, ariaLabel, valueText, dashed = !onDrag }: {
  at: number;
  label?: ReactNode;
  tone?: Tone;
  /** Makes the rule draggable: called with the pointer's x in data units, clamped to the domain. */
  onDrag?: (x: number) => void;
  /** Keyboard step for a draggable rule: +1 for → and ↑, −1 for ← and ↓ (e.g. to the next data point). */
  onStep?: (dir: 1 | -1) => void;
  /** The slider's accessible name (default "Threshold"). */
  ariaLabel?: string;
  /** aria-valuetext: what the value means ("threshold 0.62; arrow keys step one example"). */
  valueText?: string;
  dashed?: boolean;
}) {
  const { xs, box } = usePlot();
  const x = xs.map(at);
  const flip = x > box.x + box.width * 0.75;
  const right: LabelSpot = { x: x + RULE_LABEL_GAP, anchor: 'start' };
  const left: LabelSpot = { x: x - RULE_LABEL_GAP, anchor: 'end' };
  const text = label != null && (
    <RuleLabel spots={flip ? [left, right] : [right, left]} y={box.y + FONT + 2}>
      {label}
    </RuleLabel>
  );
  if (onDrag) {
    return (
      <DraggableRule at={at} x={x} tone={tone} dashed={dashed} onDrag={onDrag} onStep={onStep} ariaLabel={ariaLabel} valueText={valueText}>
        {text}
      </DraggableRule>
    );
  }
  return (
    <g className={`plot-rule ${toneClass(tone, 'hi')} ${dashed ? 'is-dashed' : ''}`}>
      <line x1={x} x2={x} y1={box.y} y2={box.y + box.height} />
      {text}
    </g>
  );
}

/** Space between a rule and its label. */
const RULE_LABEL_GAP = 4;

interface LabelSpot {
  x: number;
  anchor: 'start' | 'end';
}

/**
 * A rule's label, kept inside the plot box: drawn at the first spot where it fits (its own
 * side, then the other side of the rule), else slid inside. Measured after layout, so a label
 * that fits renders exactly where it always did.
 */
function RuleLabel({ spots, y, children }: { spots: readonly LabelSpot[]; y: number; children: ReactNode }) {
  const { box } = usePlot();
  const ref = useRef<SVGTextElement>(null);
  const [w, setW] = useState<number | null>(null);
  // The width depends only on the text, not where it's drawn: measure when the label changes,
  // and again once the web fonts are in (they swap in after first paint).
  useLayoutEffect(() => {
    let live = true;
    const measure = () => {
      const next = ref.current?.getBBox().width;
      if (live && next !== undefined) setW(next);
    };
    measure();
    void document.fonts?.ready.then(measure);
    return () => {
      live = false;
    };
  }, [children]);
  const lefts = spots.map((s) => (s.anchor === 'start' ? s.x : s.x - (w ?? 0)));
  const fit = w === null ? { index: 0, dx: 0 } : fitLabel(lefts, w, box.x, box.x + box.width);
  const spot = spots[fit.index];
  return (
    <text ref={ref} x={spot.x + fit.dx} y={y} textAnchor={spot.anchor}>
      {children}
    </text>
  );
}

const GRIP_W = 8;
const GRIP_H = 28;

function DraggableRule({ at, x, tone, dashed, onDrag, onStep, ariaLabel = 'Threshold', valueText, children }: {
  at: number;
  x: number;
  tone?: Tone;
  dashed: boolean;
  onDrag: (x: number) => void;
  onStep?: (dir: 1 | -1) => void;
  ariaLabel?: string;
  valueText?: string;
  children: ReactNode;
}) {
  const { xs, ys, box, toData } = usePlot();
  const dragging = useRef(false);
  const move = (e: PointerEvent<SVGGElement>) => {
    const p = toData(e.clientX, e.clientY);
    if (p) onDrag(p[0]);
  };
  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    if (onStep) onStep(dir);
    else onDrag(nudgePoint([at, ys.domain[0]], dir > 0 ? 'ArrowRight' : 'ArrowLeft', xs, ys, e.shiftKey)![0]);
  };
  const [lo, hi] = [Math.min(...xs.domain), Math.max(...xs.domain)];
  return (
    <g
      className={`plot-rule plot-rule-drag ${toneClass(tone, 'hi')} ${dashed ? 'is-dashed' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={lo}
      aria-valuemax={hi}
      aria-valuenow={Number(at.toFixed(3))}
      aria-valuetext={valueText}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => dragging.current && move(e)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onKeyDown={onKeyDown}
    >
      <rect className="plot-hit" x={box.x} y={box.y} width={box.width} height={box.height} />
      <line x1={x} x2={x} y1={box.y} y2={box.y + box.height} />
      <rect className="plot-grip" x={x - GRIP_W / 2} y={box.y + box.height / 2 - GRIP_H / 2} width={GRIP_W} height={GRIP_H} rx={GRIP_W / 2} />
      {children}
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
        <RuleLabel spots={[{ x: box.x + box.width - RULE_LABEL_GAP, anchor: 'end' }]} y={below ? y + FONT + 2 : y - 4}>
          {label}
        </RuleLabel>
      )}
    </g>
  );
}

const HEAD = 9;

/** A vector from `from` (default the origin) to `to`, with an arrowhead and an optional label; `dashed` dashes the shaft. */
export function Arrow({ from = [0, 0], to, tone, label, dashed = false }: { from?: Point; to: Point; tone?: Tone; label?: ReactNode; dashed?: boolean }) {
  const { xs, ys, clip } = usePlot();
  const [x0, y0, x1, y1] = [xs.map(from[0]), ys.map(from[1]), xs.map(to[0]), ys.map(to[1])];
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 0.5) return null;
  const [ux, uy] = [(x1 - x0) / len, (y1 - y0) / len];
  const head = Math.min(HEAD, len * 0.6);
  const [bx, by] = [x1 - ux * head, y1 - uy * head];
  const w = head * 0.5;
  return (
    <g className={`plot-arrow ${toneClass(tone, 'info')} ${dashed ? 'is-dashed' : ''}`} clipPath={`url(#${clip})`}>
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
  /** This point's radius, overriding the layer's `r` (AdaBoost's sample weights). */
  r?: number;
  /** An outline ring around the point in this tone (a misclassified sample in --bad). */
  ring?: Tone;
}

/** A point's text label: the text, drawn right of the dot unless `left`. */
export type PointLabel = string | { text: string; left?: boolean };

/** Space between a point and its ring. */
const RING_GAP = 2.5;

/**
 * Dots in data space. `hollow` draws held-out (validation) data; a point's own `r` and
 * `ring` override the layer's radius and add an outline. `labels(i)` writes text beside
 * each point (null for none), drawn after all the dots. With `onDrag` each point is
 * draggable by pointer and focusable: arrow keys nudge it 4 units (Shift: 20), always
 * clamped to the domain. `roving` makes the layer one tab stop: Page Up/Down (or [ and ])
 * and Home/End move focus between the points.
 */
export function Points({ data, tone, r = 4.5, hollow = false, onDrag, pointLabel, labels, roving = false }: {
  data: readonly PlotPoint[];
  tone?: Tone;
  r?: number;
  hollow?: boolean;
  /** `via` is 'key' for an arrow-key nudge and omitted for the pointer. */
  onDrag?: (i: number, p: Point, via?: DragSource) => void;
  /** Screen-reader name of a draggable point (default "point i"). */
  pointLabel?: (i: number) => string;
  labels?: (i: number) => PointLabel | null;
  /** Draggable points share one tab stop (for layers with many points). */
  roving?: boolean;
}) {
  const { xs, ys, toData } = usePlot();
  const [current, setCurrent] = useState(0);
  const refs = useRef(new Map<number, SVGGElement>());
  const focusIndex = Math.min(current, Math.max(0, data.length - 1));
  const drag = useDragPoint(toData, onDrag, { onGrab: setCurrent });
  const onKeyDown = (e: KeyboardEvent<SVGGElement>, i: number) => {
    const to = roving ? rovingPointTarget(e.key, i, data.length) : null;
    if (to !== null) {
      e.preventDefault();
      setCurrent(to);
      refs.current.get(to)?.focus();
      return;
    }
    const p = nudgePoint([data[i].x, data[i].y], e.key, xs, ys, e.shiftKey);
    if (!p) return;
    e.preventDefault();
    onDrag?.(i, p, 'key');
  };
  const keysHint = roving && data.length > 1 ? ' Arrow keys move it; Page Up and Page Down pick another point.' : ' Arrow keys move it.';

  return (
    <g className="plot-points">
      {data.map((d, i) => {
        const cx = xs.map(d.x);
        const cy = ys.map(d.y);
        const pr = d.r ?? r;
        const cls = `plot-point ${toneClass(d.tone ?? tone, 'info')} ${(d.hollow ?? hollow) ? 'is-hollow' : ''}`;
        const ring = d.ring && <circle className={`plot-ring tone-${d.ring}`} cx={cx} cy={cy} r={pr + RING_GAP} />;
        if (!onDrag) {
          const dot = <circle key={i} className={cls} cx={cx} cy={cy} r={pr} />;
          return ring ? <g key={i}>{ring}{dot}</g> : dot;
        }
        return (
          <g
            key={i}
            ref={(el) => {
              if (el) refs.current.set(i, el);
              else refs.current.delete(i);
            }}
            className={`${cls} is-draggable`}
            role="button"
            tabIndex={!roving || i === focusIndex ? 0 : -1}
            aria-roledescription="draggable point"
            aria-label={`${pointLabel?.(i) ?? `point ${i + 1}`} at ${num(d.x)}, ${num(d.y)}.${keysHint}`}
            onFocus={roving ? () => setCurrent(i) : undefined}
            {...drag(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {ring}
            <circle className="plot-hit" cx={cx} cy={cy} r={Math.max(pr + 8, 14)} />
            <circle cx={cx} cy={cy} r={pr + 1.5} />
          </g>
        );
      })}
      {labels && <PointLabels data={data} tone={tone} labels={labels} />}
    </g>
  );
}

const LABEL_DX = 6;

/**
 * Text beside points in data space, in each point's tone (dim points get muted text).
 * Points' `labels` draws these after its dots; use this layer directly when other layers
 * must sit between the dots and their labels.
 */
export function PointLabels({ data, tone, labels }: { data: readonly PlotPoint[]; tone?: Tone; labels: (i: number) => PointLabel | null }) {
  const { xs, ys } = usePlot();
  return (
    <g className="plot-labels" aria-hidden="true">
      {data.map((d, i) => {
        const l = labels(i);
        if (l == null) return null;
        const { text, left = false } = typeof l === 'string' ? { text: l } : l;
        return (
          <text
            key={i}
            className={`plot-label ${toneClass(d.tone ?? tone, 'info')}`}
            x={xs.map(d.x) + (left ? -LABEL_DX : LABEL_DX)}
            y={ys.map(d.y) + 4}
            textAnchor={left ? 'end' : 'start'}
          >
            {text}
          </text>
        );
      })}
    </g>
  );
}

/**
 * A transparent sheet over the plotting box that reports the pointer in data space
 * (clamped to the domain): `onDown` for click-to-add or click-to-drop, `onMove` for a
 * probe that follows the pointer. Put it under layers that take their own pointer events
 * (draggable points). It has no keyboard path of its own: pair it with a PlotCursor and a
 * button, or with draggable points.
 */
export function PointerLayer({ onDown, onMove, cursor = 'crosshair' }: {
  onDown?: (p: Point) => void;
  onMove?: (p: Point) => void;
  /** CSS cursor over the box. */
  cursor?: string;
}) {
  const { box, toData } = usePlot();
  const report = (e: PointerEvent<SVGRectElement>, fn?: (p: Point) => void) => {
    if (!fn) return;
    const p = toData(e.clientX, e.clientY);
    if (p) fn(p);
  };
  return (
    <rect
      className="plot-pointer"
      style={{ cursor }}
      x={box.x}
      y={box.y}
      width={box.width}
      height={box.height}
      onPointerDown={(e) => report(e, onDown)}
      onPointerMove={onMove ? (e) => report(e, onMove) : undefined}
      aria-hidden="true"
    />
  );
}

/**
 * The keyboard twin of a PointerLayer: a hollow grey point the learner moves with the
 * arrow keys (or drags), whose position a button then uses ("Add at cursor").
 */
export function PlotCursor({ at, onMove, label = 'Cursor' }: { at: Point; onMove: (p: Point) => void; label?: string }) {
  return <Points data={[{ x: at[0], y: at[1], tone: 'muted', hollow: true }]} r={5} onDrag={(_, p) => onMove(p)} pointLabel={() => label} />;
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
