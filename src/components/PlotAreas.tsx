import type { Tone } from '../core/tone';
import { areaPath, bandPath, stepsPath, type BandEdge } from '../core/plotAreas';
import type { Point } from '../core/plot';
import { usePlot } from './plotContext';
import './plotAreas.css';

/* Shaded and stepped layers for Plot2D, re-exported from Plot2D.tsx: <Area>, <Steps>, <Band>. */

const toneClass = (t: Tone | undefined, fallback: Tone) => `tone-${t ?? fallback}`;

/**
 * The region under y = fn(x) between `from` and `to` (default: the whole x axis), down to
 * `base` (default 0, or the bottom of the axis when 0 is off it). Shade a tail, a p-value or
 * an interval under a density: `<Area fn={pdf} from={1.96} to={4} tone="bad" />`.
 */
export function Area({ fn, from, to, base, tone }: { fn: (x: number) => number; from?: number; to?: number; base?: number; tone?: Tone }) {
  const { xs, ys, clip } = usePlot();
  return <path className={`plot-area ${toneClass(tone, 'info')}`} d={areaPath(fn, xs, ys, { from, to, base })} clipPath={`url(#${clip})`} />;
}

/**
 * A step function through `data` points (x ascending): the level at each point holds until the
 * next. For an ECDF ("percentiles are read off the CDF") pass core/stats `ecdf(xs)`. `startY` is
 * the level before the first point (an ECDF starts at 0, so pass 0); by default the line
 * starts at the first point. The last level is held to the right edge of the plot.
 */
export function Steps({ data, tone, startY, width }: { data: readonly Point[]; tone?: Tone; startY?: number; width?: number }) {
  const { xs, ys, clip } = usePlot();
  return (
    <path
      className={`plot-steps ${toneClass(tone, 'info')}`}
      d={stepsPath(data, xs, ys, startY)}
      clipPath={`url(#${clip})`}
      style={width ? { strokeWidth: width } : undefined}
    />
  );
}

/**
 * A shaded band between two edges, each a constant or a function of x: a confidence band
 * around a fitted line, or a flat interval across the plot (`lo={4.1} hi={5.3}`). Limited to
 * `from`..`to` on x when given.
 */
export function Band({ lo, hi, from, to, tone }: { lo: BandEdge; hi: BandEdge; from?: number; to?: number; tone?: Tone }) {
  const { xs, ys, clip } = usePlot();
  return <path className={`plot-band ${toneClass(tone, 'violet')}`} d={bandPath(lo, hi, xs, ys, { from, to })} clipPath={`url(#${clip})`} />;
}
