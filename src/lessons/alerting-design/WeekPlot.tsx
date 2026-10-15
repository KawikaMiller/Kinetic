import { useMemo } from 'react';
import { Band, Curve, HLine, Plot2D, Points, type PlotPoint } from '../../components/Plot2D';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { INCIDENTS, MIN_PER_DAY, WEEK, WEEK_MINUTES, incidentEnd } from './week';
import { THRESHOLD_RANGE, incidentAt, judge, type Metric } from './rules';

const PHONE_W = 356;
const WIDE_W = 680;
const HEIGHT = 200;
/** Minutes per drawn point: the plot keeps the highest value in each bucket so a one-minute blip stays visible. */
const BUCKET = 10;
/** A 12-minute incident is under a pixel wide on a week: its band is drawn at least this many days wide (the data is not changed). */
const MIN_BAND_DAYS = 0.06;

/** The series reduced to its per-bucket maxima, as [day, value]. */
function downsample(series: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let t = 0; t < WEEK_MINUTES; t += BUCKET) out.push([t / MIN_PER_DAY, Math.max(...series.slice(t, t + BUCKET))]);
  return out;
}
const DRAWN: Record<Metric, [number, number][]> = { errors: downsample(WEEK.errors), cpu: downsample(WEEK.cpu) };

const toDay = (minute: number) => minute / MIN_PER_DAY;

/** The week: the metric as a line, the real incidents as red bands, the threshold, and a dot for each page (green useful, orange false). */
export function WeekPlot({ metric, threshold, fires }: { metric: Metric; threshold: number; fires: readonly number[] }) {
  const phone = useMediaQuery(PHONE_QUERY);
  const top = THRESHOLD_RANGE[metric].max;
  const verdict = useMemo(() => judge(fires), [fires]);
  const pageDots: PlotPoint[] = fires.map((f) => ({ x: toDay(f), y: top * 0.93, tone: incidentAt(f) ? 'ok' : 'orange' }));
  const missedDots: PlotPoint[] = verdict.missed.map((i) => ({ x: toDay(i.start + i.length / 2), y: top * 0.5, tone: 'bad', hollow: true, ring: 'bad' }));
  return (
    <Plot2D
      x={{ domain: [0, 7], label: 'day of the week', ticks: 7 }}
      y={{ domain: [0, top], label: metric === 'errors' ? 'error ratio %' : 'CPU %' }}
      width={phone ? PHONE_W : WIDE_W}
      height={HEIGHT}
      ariaLabel={`One week of ${metric === 'errors' ? 'checkout error ratio' : 'CPU'} with the real incidents shaded, the threshold at ${threshold}% and ${fires.length} pages`}
    >
      {INCIDENTS.map((i) => (
        <Band key={i.id} lo={0} hi={top} from={toDay(i.start)} to={Math.max(toDay(incidentEnd(i)), toDay(i.start) + MIN_BAND_DAYS)} tone="bad" />
      ))}
      <Curve points={DRAWN[metric]} tone={metric === 'errors' ? 'hi' : 'info'} />
      <HLine at={threshold} tone="violet" label={`threshold ${threshold}%`} />
      <Points data={pageDots} r={3.5} />
      <Points data={missedDots} r={4} />
    </Plot2D>
  );
}
