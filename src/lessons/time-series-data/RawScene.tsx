import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { bytes, decimal } from '../../core/format';
import { rawCaption } from './captions';
import { RAW_POINT_BYTES } from './gorilla';
import { initialRawScene } from './init';
import { NOISE_MAX, POINTS_PER_DAY, SPIKE_POINTS, SERIES_START, SPIKE_MAX, SPIKE_START, STEP_SECONDS, buildSeries, decimate, spikePeak } from './series';

const PLOT_COLUMNS = 340;
const HOUR_S = 3_600;
const spikeHour = (SPIKE_START * STEP_SECONDS) / HOUR_S;

export function RawScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialRawScene);
  const { seed, noise, spike, from, to } = state;

  const series = useMemo(() => buildSeries({ seed, noise, spike }), [seed, noise, spike]);
  const view = useMemo(() => series.filter((p) => p.t >= SERIES_START + from * HOUR_S && p.t < SERIES_START + to * HOUR_S), [series, from, to]);
  const drawn = useMemo(() => decimate(view, PLOT_COLUMNS).map((p): [number, number] => [(p.x - SERIES_START) / HOUR_S, p.y]), [view]);
  const peak = spikePeak(series);
  const top = Math.ceil(Math.max(...series.map((p) => p.v))) + 1;

  useIntroCaption(rawCaption(view.length, series.length, view.length * RAW_POINT_BYTES, peak, spike), [view.length, peak, spike]);

  const setFrom = (v: number) => setState((s) => ({ ...s, from: v, to: Math.max(s.to, v + 1) }));
  const setTo = (v: number) => setState((s) => ({ ...s, to: v, from: Math.min(s.from, v - 1) }));

  return (
    <StageFrame
      height={430}
      stats={
        <Stats>
          <Stat label="Points" value={POINTS_PER_DAY.toLocaleString('en-US')} sub={`${view.length.toLocaleString('en-US')} in view`} />
          <Stat label="Storage" value={bytes(series.length * RAW_POINT_BYTES)} sub={[`${RAW_POINT_BYTES} B a point:`, '8 B timestamp, 8 B value']} />
          <Stat label="Spike peak" value={decimal(peak, 2)} color="var(--hi)" sub={spike === 0 ? 'no spike at height 0' : `the highest of its ${SPIKE_POINTS} points`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'raw points (the largest under each pixel column)', shape: 'line' },
            { color: 'var(--hi)', label: 'the two-minute spike', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Noise" value={noise} min={0} max={NOISE_MAX} step={0.1} format={(v) => decimal(v, 1)} onChange={(v) => setState((s) => ({ ...s, noise: v }))} />
          <Slider label="Spike height" value={spike} min={0} max={SPIKE_MAX} step={0.5} format={(v) => decimal(v, 1)} onChange={(v) => setState((s) => ({ ...s, spike: v }))} />
          <SeedField seed={seed} onSeed={(v) => setState((s) => ({ ...s, seed: v }))} />
        </>,
        <>
          <Slider label="Zoom from hour" value={from} min={0} max={23} format={(v) => `${v}:00`} onChange={setFrom} />
          <Slider label="to hour" value={to} min={1} max={24} format={(v) => `${v}:00`} onChange={setTo} />
        </>,
      ]}
    >
      <div className="ts-stage stage-pad">
        <Box>
          <SectionTitle hint="24 hours at one point every 10 seconds">The raw series</SectionTitle>
          <Plot2D x={{ domain: [from, to], label: 'hour of the day (UTC)' }} y={{ domain: [0, top], label: 'value' }} ariaLabel={`The series from hour ${from} to hour ${to}, with a spike at hour ${decimal(spikeHour, 1)}`}>
            <Curve points={drawn} tone="info" />
            {spike > 0 && spikeHour >= from && spikeHour <= to && <VLine at={spikeHour} label="spike" tone="hi" />}
          </Plot2D>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>a seeded daily wave, noise and one two-minute spike; no clock is read and no real metric is shown</Provenance>
          <Provenance kind="toy">16 bytes a point (an 8-byte timestamp and an 8-byte value) is this lesson&rsquo;s stated layout, not any product&rsquo;s</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
