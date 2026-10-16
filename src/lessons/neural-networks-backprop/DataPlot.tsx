import { Heat, Plot2D, Points, Segments, type HeatValue } from '../../components/Plot2D';
import { CLASS_TONE, DOMAIN, type Sample } from './model';

/** The plane every scene draws: labelled points over a shaded decision region, optionally a straight decision line. */
export function DataPlot({
  points, heat, wrong, line, ariaLabel, width = 340,
}: {
  points: readonly Sample[];
  /** Either a function sampled by Heat (memoise it) or a precomputed grid (row 0 at the top). */
  heat: { fn: (x: number, y: number) => HeatValue } | { grid: readonly (readonly HeatValue[])[] };
  /** A point the network gets wrong gets a ring. */
  wrong: (p: Sample) => boolean;
  line?: [[number, number], [number, number]] | null;
  ariaLabel: string;
  width?: number;
}) {
  return (
    <Plot2D x={{ domain: DOMAIN, label: 'x1', ticks: 3 }} y={{ domain: DOMAIN, label: 'x2', ticks: 3 }} width={width} aspect="equal" ariaLabel={ariaLabel}>
      {'fn' in heat ? <Heat fn={heat.fn} resolution={48} /> : <Heat grid={heat.grid} />}
      {line && <Segments segments={[{ from: line[0], to: line[1], tone: 'muted' }]} />}
      <Points data={points.map((p) => ({ x: p.x, y: p.y, tone: CLASS_TONE[p.label], ring: wrong(p) ? ('bad' as const) : undefined }))} r={4} />
    </Plot2D>
  );
}
