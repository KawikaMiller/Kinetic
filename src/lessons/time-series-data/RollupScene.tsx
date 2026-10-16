import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { decimal } from '../../core/format';
import { rollupCaption } from './captions';
import { defaultSeries } from './facts';
import { initialRollupScene } from './init';
import { AGGREGATES, GAP_FROM_MINUTE, GAP_KEEP_EVERY, GAP_TO_MINUTE, HOUR, MINUTE, SERIES_START, SPIKE_START, STEP_SECONDS, averageOfAverages, decimate, exactAverage, rollup, spikePeak, valueOf, withGap } from './series';

const HOUR_S = 3_600;
const BUCKETS = [{ value: 'minute' as const, label: '1-minute buckets' }, { value: 'hour' as const, label: '1-hour buckets' }];
const PLOT_COLUMNS = 340;
const spikeT = SERIES_START + SPIKE_START * STEP_SECONDS;
const middle = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

export function RollupScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialRollupScene);
  const { bucket, aggregate, gap } = state;
  const seconds = bucket === 'minute' ? MINUTE : HOUR;

  const full = useMemo(() => defaultSeries(), []);
  const data = useMemo(() => (gap ? withGap(full, GAP_FROM_MINUTE, GAP_TO_MINUTE) : full), [full, gap]);
  const buckets = useMemo(() => rollup(data, seconds), [data, seconds]);
  const target = buckets.find((b) => b.start <= spikeT && spikeT < b.start + seconds)!;
  const inBucket = data.filter((p) => p.t >= target.start && p.t < target.start + seconds).map((p) => p.v);
  const peak = spikePeak(data);
  const typical = middle(inBucket);
  const shown = valueOf(target, aggregate);
  const naive = averageOfAverages(buckets);
  const exact = exactAverage(buckets);
  const raw = useMemo(() => decimate(data, PLOT_COLUMNS).map((p): [number, number] => [(p.x - SERIES_START) / HOUR_S, p.y]), [data]);
  const steps = useMemo(
    () => buckets.flatMap((b): [number, number][] => [[(b.start - SERIES_START) / HOUR_S, valueOf(b, aggregate)], [(b.start + seconds - SERIES_START) / HOUR_S, valueOf(b, aggregate)]]),
    [buckets, aggregate, seconds],
  );
  const top = aggregate === 'count' ? Math.max(...buckets.map((b) => b.count)) + 1 : Math.ceil(peak) + 1;

  useIntroCaption(rollupCaption(bucket === 'minute' ? '1-minute' : '1-hour', aggregate, shown, peak, typical, naive, exact), [bucket, aggregate, gap]);

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Spike shows" value={decimal(shown, 2)} color={aggregate === 'count' ? undefined : shown < (peak + typical) / 2 ? 'var(--bad)' : 'var(--ok)'} sub={`${aggregate === 'count' ? 'points in its bucket' : `raw peak ${decimal(peak, 2)}`}`} />
          <Stat label="Average of averages" value={decimal(naive, 3)} color={Math.abs(naive - exact) > 1e-9 ? 'var(--bad)' : 'var(--ok)'} sub="of the bucket averages" />
          <Stat label="From (sum, count)" value={decimal(exact, 3)} color="var(--ok)" sub={`${buckets.length} buckets, exact`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'raw points', shape: 'line' },
            { color: 'var(--violet)', label: 'rollup buckets', shape: 'line' },
            { color: 'var(--ok)', label: 'a value that kept the spike, or the exact average', shape: 'square' },
            { color: 'var(--bad)', label: 'a value that lost the spike, or the average of averages', shape: 'square' },
          ]}
        />
      }
      controls={
        <>
          {picker}
          <Segmented label="Bucket" value={bucket} onChange={(b) => setState((s) => ({ ...s, bucket: b }))} options={BUCKETS} />
          <Segmented label="Aggregate" value={aggregate} onChange={(a) => setState((s) => ({ ...s, aggregate: a }))} options={AGGREGATES} />
          <Toggle label="Missing data" value={gap} onChange={(g) => setState((s) => ({ ...s, gap: g }))} off="None" on={`A gap (minutes ${GAP_FROM_MINUTE} to ${GAP_TO_MINUTE}, 1 point in ${GAP_KEEP_EVERY} kept)`} />
        </>
      }
    >
      <div className="ts-stage stage-pad">
        <Box>
          <SectionTitle hint="the same day, rolled up">Raw against rollup</SectionTitle>
          <Plot2D x={{ domain: [0, 24], label: 'hour of the day (UTC)' }} y={{ domain: [0, top], label: aggregate === 'count' ? 'points in bucket' : 'value' }} ariaLabel={`The ${aggregate} of each ${bucket} bucket against the raw series`}>
            {aggregate !== 'count' && <Curve points={raw} tone="info" />}
            <Curve points={steps} tone="violet" />
            <VLine at={(spikeT - SERIES_START) / HOUR_S} label="spike" tone="hi" />
          </Plot2D>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">the series of the previous scene (seed fixed), rolled up by real code into (sum, count, min, max)</Provenance>
          <Provenance kind="toy">{gap ? `the gap leaves 1 point in ${GAP_KEEP_EVERY} for minutes ${GAP_FROM_MINUTE} to ${GAP_TO_MINUTE}, so some buckets hold fewer points` : 'with no gap every bucket holds the same number of points, which hides the average-of-averages mistake'}</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
