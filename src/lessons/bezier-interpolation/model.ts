// Cubic Bézier curves (De Casteljau and the Bernstein form), CSS cubic-bezier() easing with an
// x(t) = time solver, and plain lerps of a number, an angle and a colour.
import { clamp, lerp } from '../../core/math';

export type P = readonly [number, number];
export type Cubic = readonly [P, P, P, P];

export const lerpP = (a: P, b: P, t: number): P => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/**
 * De Casteljau's construction: lerp each pair of neighbours by t, again and again. Levels are
 * [the 4 control points, 3 points, 2 points, the 1 point on the curve].
 */
export function deCasteljau(ctrl: readonly P[], t: number): P[][] {
  const levels: P[][] = [[...ctrl]];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    levels.push(prev.slice(1).map((p, i) => lerpP(prev[i], p, t)));
  }
  return levels;
}

export const pointAt = (ctrl: Cubic, t: number): P => deCasteljau(ctrl, t)[3][0];

/** The four cubic Bernstein weights at t: (1 − t)³, 3t(1 − t)², 3t²(1 − t), t³. They sum to 1. */
export const bernstein = (t: number): [number, number, number, number] => {
  const s = 1 - t;
  return [s * s * s, 3 * t * s * s, 3 * t * t * s, t * t * t];
};

/** The same point as a weighted average of the control points. */
export function bernsteinPoint(ctrl: Cubic, t: number): P {
  const w = bernstein(t);
  return [w.reduce((sum, wi, i) => sum + wi * ctrl[i][0], 0), w.reduce((sum, wi, i) => sum + wi * ctrl[i][1], 0)];
}

/** B′(t) = 3[(1 − t)²(P1 − P0) + 2t(1 − t)(P2 − P1) + t²(P3 − P2)]. At t = 0 it is 3(P1 − P0). */
export function derivative(ctrl: Cubic, t: number): P {
  const s = 1 - t;
  const d = (k: 0 | 1) => 3 * (s * s * (ctrl[1][k] - ctrl[0][k]) + 2 * t * s * (ctrl[2][k] - ctrl[1][k]) + t * t * (ctrl[3][k] - ctrl[2][k]));
  return [d(0), d(1)];
}

export const sampleBezier = (ctrl: Cubic, n = 96): P[] => Array.from({ length: n + 1 }, (_, i) => pointAt(ctrl, i / n));

export type CurvePreset = 'arch' | 's' | 'loop';
/** Control points on a 0-10 plot. The loop's P1 and P2 cross over, so the curve crosses itself. */
export const CURVE_PRESETS: { id: CurvePreset; label: string; ctrl: Cubic }[] = [
  { id: 'arch', label: 'Arch', ctrl: [[1, 1.5], [2.5, 8.5], [7.5, 8.5], [9, 1.5]] },
  { id: 's', label: 'S-curve', ctrl: [[1, 2], [7, 1], [3, 9], [9, 8]] },
  { id: 'loop', label: 'Loop', ctrl: [[3.5, 1.5], [10, 9.5], [0, 9.5], [6.5, 1.5]] },
];

// ── CSS easing ──────────────────────────────────────────────────────

/** cubic-bezier(x1, y1, x2, y2): P0 = (0, 0) and P3 = (1, 1) are fixed. */
export interface Easing {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** One coordinate of a cubic with ends 0 and 1 and middle control values a, b. */
const coord = (a: number, b: number, t: number) => {
  const s = 1 - t;
  return 3 * s * s * t * a + 3 * s * t * t * b + t * t * t;
};
const coordSlope = (a: number, b: number, t: number) => {
  const s = 1 - t;
  return 3 * s * s * a + 6 * s * t * (b - a) + 3 * t * t * (1 - b);
};

export const xAt = (e: Easing, t: number) => coord(e.x1, e.x2, t);
export const yAt = (e: Easing, t: number) => coord(e.y1, e.y2, t);
export const dxAt = (e: Easing, t: number) => coordSlope(e.x1, e.x2, t);

export const easingCtrl = (e: Easing): Cubic => [[0, 0], [e.x1, e.y1], [e.x2, e.y2], [1, 1]];

export const SOLVE_EPS = 1e-7;
const NEWTON_STEPS = 8;
const BISECT_STEPS = 60;
const FLAT_SLOPE = 1e-6;

export interface Solve {
  t: number;
  method: 'newton' | 'bisection';
  steps: number;
}

/**
 * Find t with x(t) = time. Newton's method from t = time first; if a step meets a flat slope,
 * leaves [0, 1] or hasn't converged in a few steps, bisect [0, 1] instead (x(0) = 0 and
 * x(1) = 1 always bracket a root).
 */
export function solveT(e: Easing, time: number): Solve {
  const x = clamp(time, 0, 1);
  let t = x;
  for (let i = 0; i < NEWTON_STEPS; i++) {
    const err = xAt(e, t) - x;
    if (Math.abs(err) < SOLVE_EPS) return { t, method: 'newton', steps: i };
    const slope = dxAt(e, t);
    if (Math.abs(slope) < FLAT_SLOPE) break;
    t -= err / slope;
    if (t < 0 || t > 1) break;
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < BISECT_STEPS; i++) {
    t = (lo + hi) / 2;
    const err = xAt(e, t) - x;
    if (Math.abs(err) < SOLVE_EPS) return { t, method: 'bisection', steps: i + 1 };
    if (err < 0) lo = t;
    else hi = t;
  }
  return { t, method: 'bisection', steps: BISECT_STEPS };
}

/** The eased progress at a time in [0, 1]: solve x(t) = time, then read y(t). */
export const ease = (e: Easing, time: number) => yAt(e, solveT(e, time).t);

/** CSS requires x1 and x2 in [0, 1]; y may be anything (that's what lets a curve overshoot). */
export const X_RANGE: readonly [number, number] = [0, 1];
export const Y_RANGE: readonly [number, number] = [-0.5, 1.6];

export function clampEasing(e: Easing): Easing {
  return {
    x1: clamp(e.x1, X_RANGE[0], X_RANGE[1]),
    x2: clamp(e.x2, X_RANGE[0], X_RANGE[1]),
    y1: clamp(e.y1, Y_RANGE[0], Y_RANGE[1]),
    y2: clamp(e.y2, Y_RANGE[0], Y_RANGE[1]),
  };
}

const short = (v: number) => String(Number(v.toFixed(2)));
export const cssValue = (e: Easing) => `cubic-bezier(${[e.x1, e.y1, e.x2, e.y2].map(short).join(', ')})`;
/** The easing as written, rounded the way cssValue rounds it, so the solver and the browser get the same numbers. */
export const asWritten = (e: Easing): Easing => ({ x1: Number(short(e.x1)), y1: Number(short(e.y1)), x2: Number(short(e.x2)), y2: Number(short(e.y2)) });

export type PresetId = 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear' | 'overshoot';
/** The CSS Easing spec's keyword values (CSS Easing Functions Level 1). */
export const PRESETS: { id: PresetId; label: string; e: Easing; note: string }[] = [
  { id: 'ease', label: 'ease', e: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 }, note: 'the CSS default' },
  { id: 'ease-in', label: 'ease-in', e: { x1: 0.42, y1: 0, x2: 1, y2: 1 }, note: 'starts slow' },
  { id: 'ease-out', label: 'ease-out', e: { x1: 0, y1: 0, x2: 0.58, y2: 1 }, note: 'ends slow' },
  { id: 'ease-in-out', label: 'ease-in-out', e: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 }, note: 'slow at both ends' },
  { id: 'linear', label: 'linear', e: { x1: 0, y1: 0, x2: 1, y2: 1 }, note: 'a straight line: the same as the linear keyword' },
  { id: 'overshoot', label: 'overshoot', e: { x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 }, note: 'y goes past 1, then settles' },
];

/** Even steps of t and the x (time) each one lands on. */
export function evenT(e: Easing, steps = 10): { t: number; x: number; y: number }[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return { t, x: xAt(e, t), y: yAt(e, t) };
  });
}

/** Smallest and largest gap in x between neighbouring even-t samples. */
export function xGaps(e: Easing, steps = 10): { min: number; max: number } {
  const xs = evenT(e, steps).map((s) => s.x);
  const gaps = xs.slice(1).map((x, i) => x - xs[i]);
  return { min: Math.min(...gaps), max: Math.max(...gaps) };
}

// ── Lerp ────────────────────────────────────────────────────────────

/** Naive angle lerp: straight between the two numbers, so 350° → 10° goes the long way through 180°. */
export const lerpAngleNaive = (a: number, b: number, t: number) => lerp(a, b, t);

/** Signed shortest turn from a to b, in (−180, 180]; exactly 180° apart turns +180. */
export function shortestDelta(a: number, b: number): number {
  const d = (((b - a) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

/** Shortest-arc angle lerp, normalised to [0, 360). */
export const lerpAngleShortest = (a: number, b: number, t: number) => (((a + shortestDelta(a, b) * t) % 360) + 360) % 360;

export const normalizeAngle = (a: number) => ((a % 360) + 360) % 360;

/** Per-channel sRGB lerp of two #rrggbb colours, rounded to whole channel values. */
export function lerpHex(from: string, to: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  const mixed = [0, 1, 2].map((i) => Math.round(lerp(ch(from, i), ch(to, i), t)));
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
