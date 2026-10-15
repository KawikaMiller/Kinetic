import type { Point } from './plot';
import type { Scale } from './scale';

/**
 * The geometry behind Plot2D's Area, Steps and Band layers: SVG path strings from data-space
 * functions and points, given the plot's two scales. Pure, so the shapes are tested.
 */

/** Samples across an area or band, evenly spaced on screen (so a log x axis is covered evenly). */
export const AREA_SAMPLES = 160;

/** A band edge: a constant level, or a function of x. */
export type BandEdge = number | ((x: number) => number);

const fix = (v: number) => v.toFixed(2);
const at = (xs: Scale, ys: Scale, x: number, y: number) => `${fix(xs.map(x))} ${fix(ys.map(y))}`;

/** The x values to sample between `from` and `to` (clamped into the axis domain), even in screen space. */
export function sampleXs(xs: Scale, from?: number, to?: number, samples = AREA_SAMPLES): number[] {
  const [d0, d1] = [Math.min(...xs.domain), Math.max(...xs.domain)];
  const lo = Math.max(d0, Math.min(from ?? d0, to ?? d1));
  const hi = Math.min(d1, Math.max(from ?? d0, to ?? d1));
  if (!(hi > lo)) return [];
  const [r0, r1] = [xs.map(lo), xs.map(hi)];
  return Array.from({ length: samples + 1 }, (_, i) => (i === 0 ? lo : i === samples ? hi : xs.invert(r0 + ((r1 - r0) * i) / samples)));
}

/** Where an area rests when no base is given: 0, or the bottom of the axis if 0 is off it. */
export function defaultBase(ys: Scale): number {
  const [lo, hi] = [Math.min(...ys.domain), Math.max(...ys.domain)];
  return lo <= 0 && hi >= 0 ? 0 : lo;
}

/** A closed path under y = fn(x) from `from` to `to` down to `base`; samples where fn isn't finite are skipped. Empty string when nothing is drawn. */
export function areaPath(fn: (x: number) => number, xs: Scale, ys: Scale, o: { from?: number; to?: number; base?: number } = {}): string {
  const base = o.base ?? defaultBase(ys);
  const pts: Point[] = sampleXs(xs, o.from, o.to)
    .map((x): Point => [x, fn(x)])
    .filter(([, y]) => Number.isFinite(y));
  if (pts.length < 2) return '';
  const top = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${at(xs, ys, x, y)}`).join('');
  return `${top}L${at(xs, ys, pts[pts.length - 1][0], base)}L${at(xs, ys, pts[0][0], base)}Z`;
}

/**
 * A step path through ascending `data`: horizontal to each x, then vertical to its y. `startY`
 * is the level before the first point; the final level runs on to the right edge of the axis.
 */
export function stepsPath(data: readonly Point[], xs: Scale, ys: Scale, startY?: number): string {
  if (!data.length) return '';
  const right = Math.max(...xs.domain);
  const [first] = data;
  let d = startY === undefined ? `M${at(xs, ys, first[0], first[1])}` : `M${at(xs, ys, first[0], startY)}L${at(xs, ys, first[0], first[1])}`;
  for (let i = 1; i < data.length; i++) d += `H${fix(xs.map(data[i][0]))}V${fix(ys.map(data[i][1]))}`;
  const last = data[data.length - 1];
  if (right > last[0]) d += `H${fix(xs.map(right))}`;
  return d;
}

/** A closed path between two edges over `from`..`to` (default the whole axis). Empty string when an edge is nowhere finite. */
export function bandPath(lo: BandEdge, hi: BandEdge, xs: Scale, ys: Scale, o: { from?: number; to?: number } = {}): string {
  const edge = (e: BandEdge) => (x: number) => (typeof e === 'number' ? e : e(x));
  const [loFn, hiFn] = [edge(lo), edge(hi)];
  const samples = sampleXs(xs, o.from, o.to).filter((x) => Number.isFinite(loFn(x)) && Number.isFinite(hiFn(x)));
  if (samples.length < 2) return '';
  const upper = samples.map((x, i) => `${i ? 'L' : 'M'}${at(xs, ys, x, hiFn(x))}`).join('');
  const lower = [...samples].reverse().map((x) => `L${at(xs, ys, x, loFn(x))}`).join('');
  return `${upper}${lower}Z`;
}
