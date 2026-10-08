import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import {
  cssValue, ease, lerpAngleNaive, lerpAngleShortest, normalizeAngle, pointAt, shortestDelta, solveT, xGaps, type Cubic, type Easing,
} from './model';

/** Two decimals with a real minus sign; -0 prints as 0. */
export const f2 = (v: number) => {
  const s = (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
};
export const pt = (p: readonly [number, number]) => `(${f2(p[0])}, ${f2(p[1])})`;

export const T_STEPS = 50;

export interface CurveFrame extends Frame {
  t: number;
}

export function curveCaption(ctrl: Cubic, t: number): ReactNode {
  const p = pt(pointAt(ctrl, t));
  if (t === 0) return <>t = 0: every lerp sits on its first point, so the curve starts exactly at P0 {p}. Press play to sweep t to 1, or drag the violet control points.</>;
  if (t === 1) return <>t = 1: every lerp sits on its second point, so the curve ends exactly at P3 {p}. P1 and P2 pull the curve towards them, but in general it doesn't pass through them.</>;
  return (
    <>t = {f2(t)}: lerp each pair of neighbouring points by {f2(t)}. The four control points give three grey points, those give two violet ones, and those give the <span className="hl">one point on the curve</span>, {p}.</>
  );
}

/** t from 0 to 1 in T_STEPS even steps, one caption each. */
export function curveFrames(ctrl: Cubic): CurveFrame[] {
  return Array.from({ length: T_STEPS + 1 }, (_, i) => {
    const t = i / T_STEPS;
    return { t, say: curveCaption(ctrl, t), quiet: i > 0 && i < T_STEPS };
  });
}

// ── Easing ──────────────────────────────────────────────────────────

const HALF = 0.5;

export function easingCaption(e: Easing): ReactNode {
  const s = solveT(e, HALF);
  const y = ease(e, HALF);
  const g = xGaps(e);
  return (
    <>{cssValue(e)}: halfway through the time (x = 0.5) the curve parameter is t = {f2(s.t)}, found by {s.method === 'newton' ? "Newton's method" : 'bisection'}, so the ball is {Math.round(y * 100)}% of the way there.
      Even steps of t land {f2(g.min)} to {f2(g.max)} apart in time.</>
  );
}

export interface RaceResult {
  /** Frames at which both balls were compared. */
  frames: number;
  /** Largest distance between them, in px. */
  maxGap: number;
  /** False if the browser never started a CSS transition. */
  started: boolean;
}

/** The comparison after a run, from what was measured. */
export function raceCaption(e: Easing, r: RaceResult): ReactNode {
  if (!r.started) return <>Your browser didn't start a CSS transition, so there is nothing to compare against this time.</>;
  if (r.frames === 0) return <>The transition finished before a single frame could be compared. Run it again.</>;
  const close = r.maxGap < 1;
  return (
    <>Done. Over {r.frames} frames, the solver's ball and your browser's own {cssValue(e)} transition were at most {r.maxGap.toFixed(2)} px apart
      {close ? <>: the <span className="hl ok">same easing</span>, worked out two different ways.</> : '.'}</>
  );
}

// ── Lerp ────────────────────────────────────────────────────────────

/** An angle rounded to whole degrees in [0, 360): 359.6 prints as 0°, never 360°. */
export const deg = (v: number) => `${normalizeAngle(Math.round(v))}°`;

export function lerpCaption(from: number, to: number, t: number): ReactNode {
  const naive = lerpAngleNaive(from, to, t);
  const short = lerpAngleShortest(from, to, t);
  const naiveDelta = to - from;
  const shortDelta = shortestDelta(from, to);
  if (naiveDelta === shortDelta) {
    return <>t = {f2(t)}: from {deg(from)} to {deg(to)}, plain numbers already take the shortest way ({Math.abs(shortDelta)}°), so both lerps agree: {deg(short)}.</>;
  }
  if (Math.abs(naiveDelta) === Math.abs(shortDelta)) {
    return <>t = {f2(t)}: {deg(from)} and {deg(to)} are exactly half a circle apart, so both ways are 180°. The two lerps just turn opposite ways: {deg(naive)} and {deg(short)}.</>;
  }
  return (
    <>t = {f2(t)}: the naive lerp treats {deg(from)} → {deg(to)} as plain numbers and turns <span className="hl bad">{Math.abs(naiveDelta)}° the long way</span>, so it reads {deg(naive)}.
      The shortest arc turns only {Math.abs(shortDelta)}° and reads {deg(short)}.</>
  );
}
