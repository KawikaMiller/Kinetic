import { HLine, Plot2D, Points } from '../../components/Plot2D';
import { UNIVERSE, type ErrorRun } from './stream';

const PLOT_WIDTH = 356;
const PLOT_HEIGHT = 240;

/** Estimate minus truth for every item, by popularity rank (log axis), with the epsilon * N line. Red: over the line, or below zero. */
export function ErrorPlot({ run, limit }: { run: ErrorRun; limit: number }) {
  const points = Array.from(run.errors, (e, r) => ({ x: r + 1, y: e, bad: e > limit || e < 0 }));
  const top = Math.max(limit * 1.25, ...run.errors, 1) * 1.05;
  const bottom = Math.min(0, ...run.errors) * 1.1;
  return (
    <Plot2D
      x={{ domain: [1, UNIVERSE], log: true, label: 'rank by popularity' }}
      y={{ domain: [bottom, top], label: 'estimate minus truth' }}
      width={PLOT_WIDTH}
      height={PLOT_HEIGHT}
      ariaLabel={`Error of every one of ${UNIVERSE} items by rank, with the epsilon times N line at ${Math.round(limit)}`}
    >
      <Points data={points.filter((p) => !p.bad)} tone="info" r={2.2} />
      <Points data={points.filter((p) => p.bad)} tone="bad" r={2.8} />
      <HLine at={limit} tone="violet" label="ε·N" />
      <HLine at={0} tone="dim" />
    </Plot2D>
  );
}
