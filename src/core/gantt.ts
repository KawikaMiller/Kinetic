/**
 * Geometry for GanttLanes: where a bar or a cursor sits on its track, as percentages of
 * the track width. Pure, so the component stays a thin renderer and the maths is tested.
 */
import { linearScale } from './scale';

export type Domain = readonly [number, number];

/** Share of the domain covered up to `t`, in [0, 1]. */
export function domainFraction(t: number, [d0, d1]: Domain): number {
  const f = (t - d0) / (d1 - d0);
  return Math.min(1, Math.max(0, f));
}

export interface BarGeometry {
  /** Left edge, % of the track. */
  left: number;
  /** Width of the whole planned bar, %. */
  full: number;
  /** Width actually drawn: full × progress, %. */
  shown: number;
}

/**
 * A bar from `start` to `end` on a track spanning `domain`. `progress` (0..1, default 1)
 * draws only that share of it, for a job still running.
 */
export function barGeometry(start: number, end: number, [d0, d1]: Domain, progress = 1): BarGeometry {
  const span = d1 - d0;
  const left = ((start - d0) / span) * 100;
  const full = ((end - start) / span) * 100;
  return { left, full, shown: full * progress };
}

/** Axis tick positions: nice values inside the domain and where they sit, in % of the track. */
export function ganttTicks(domain: Domain, count = 5): { value: number; at: number }[] {
  const s = linearScale(domain[0], domain[1], 0, 100);
  return s.ticks(count).map((value) => ({ value, at: s.map(value) }));
}
