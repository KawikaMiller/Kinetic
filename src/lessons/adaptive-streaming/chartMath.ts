import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { VIDEO_SECONDS, type Run } from './abr';

const PHONE_WIDTH = 356;
const DESKTOP_WIDTH = 640;

export const useChartWidth = () => (useMediaQuery(PHONE_QUERY) ? PHONE_WIDTH : DESKTOP_WIDTH);

/** How far the time axis runs: the video or the run, whichever is longer, up to a round number. */
export const timeDomain = (run: Run, ...others: Run[]): number => {
  const longest = Math.max(VIDEO_SECONDS, run.wall ?? 0, ...others.map((r) => r.wall ?? 0));
  return Math.ceil(longest / 10) * 10;
};

/** The trace as a staircase: one flat step per second. */
export function stepsOf(trace: readonly number[], to: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let t = 0; t < to; t++) {
    const r = trace[Math.min(t, trace.length - 1)];
    pts.push([t, r], [t + 1, r]);
  }
  return pts;
}
