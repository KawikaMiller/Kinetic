import { useMemo } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Band, Curve, HLine, Plot2D } from '../../components/Plot2D';
import { CAPACITY, TRIGGER_START, type MetaRun } from './model';

const CHART_HEIGHT = 150;
const ROUND_TO = 100;

type Pt = [number, number];

const roundUp = (v: number, to: number): number => Math.max(to, Math.ceil(v / to) * to);

/** The four charts of a run on one tick axis, drawn up to `shown` ticks, with the trigger window shaded. */
export function Charts({ run, shown }: { run: MetaRun; shown: number }) {
  const upto = Math.min(shown, run.stats.length - 1);
  const series = useMemo(() => {
    const take = (pick: (i: number) => number): Pt[] => run.stats.slice(0, upto + 1).map((_, i) => [i, pick(i)]);
    return {
      queue: take((i) => run.stats[i].queue),
      goodput: take((i) => run.stats[i].goodput),
      wasted: take((i) => run.stats[i].wasted),
      newArrivals: take((i) => run.stats[i].newArrivals),
      retries: take((i) => run.stats[i].retryArrivals),
    };
  }, [run, upto]);
  const { trigger, lambda } = run.params;
  const queueTop = roundUp(Math.max(...run.stats.map((s) => s.queue)), ROUND_TO);
  const arrivalsTop = roundUp(Math.max(...run.stats.map((s) => s.newArrivals + s.retryArrivals)), ROUND_TO);
  const band = (top: number) => (trigger > 0 ? <Band lo={0} hi={top} from={TRIGGER_START} to={TRIGGER_START + trigger} tone="violet" /> : null);
  const x = { domain: [0, run.stats.length - 1] as [number, number], label: 'tick' };
  return (
    <Box>
      <SectionTitle hint="the violet band is the trigger: capacity drops to 20">One run, seed {run.params.seed}</SectionTitle>
      <div className="mf-charts">
        <Plot2D x={x} y={{ domain: [0, queueTop], label: 'items queued' }} height={CHART_HEIGHT} ariaLabel="Queue length per tick">
          {band(queueTop)}
          <Curve points={series.queue} tone="hi" />
        </Plot2D>
        <Plot2D x={x} y={{ domain: [0, CAPACITY], label: 'goodput per tick' }} height={CHART_HEIGHT} ariaLabel="Goodput per tick against the load">
          {band(CAPACITY)}
          <HLine at={lambda} label={`load ${lambda}`} tone="dim" />
          <Curve points={series.goodput} tone="ok" />
        </Plot2D>
        <Plot2D x={x} y={{ domain: [0, arrivalsTop], label: 'arrivals per tick' }} height={CHART_HEIGHT} ariaLabel="New requests and retries arriving per tick">
          {band(arrivalsTop)}
          <HLine at={CAPACITY} label="capacity" tone="dim" />
          <Curve points={series.newArrivals} tone="info" />
          <Curve points={series.retries} tone="orange" />
        </Plot2D>
        <Plot2D x={x} y={{ domain: [0, CAPACITY], label: 'wasted work per tick' }} height={CHART_HEIGHT} ariaLabel="Capacity spent on abandoned requests per tick">
          {band(CAPACITY)}
          <Curve points={series.wasted} tone="bad" />
        </Plot2D>
      </div>
    </Box>
  );
}
