import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Bars, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Slider, Stat, Stats } from '../../components/ui';
import { barsFromHistogram } from '../../core/plot';
import { n, noiseCaption } from './captions';
import { Honesty } from './Honesty';
import { HISTOGRAM_SAMPLES, NOISE_RANGE, SIGNAL_RANGE, delta, meanTime, noiseOpening, samplesNeeded, timeDistributions } from './noise';

export function NoiseScene({ picker }: { picker: ReactNode }) {
  const [open] = useState(noiseOpening);
  const [perComparison, setPerComparison] = useState(open.perComparison);
  const [sigma, setSigma] = useState(open.sigma);
  const setting = useMemo(() => ({ perComparison, sigma }), [perComparison, sigma]);
  const dist = useMemo(() => timeDistributions(setting), [setting]);
  const need = samplesNeeded(setting);
  const caption = noiseCaption(setting);
  const peak = Math.max(...dist.wrong.counts, ...dist.right.counts);
  const edges = dist.wrong.edges;

  return (
    <StageFrame
      height={420}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Signal per comparison" value={n(delta(setting))} color="var(--info)" sub="time units added by one more byte" />
          <Stat label="Noise sigma" value={n(sigma)} sub={`${(sigma / delta(setting)).toFixed(1)} times the signal`} />
          <Stat label="Observations needed" value={n(need)} color="var(--bad)" sub={[`per case, ${n(2 * need)} in all`, 'about 95% confidence, 80% power']} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'first byte wrong (1 comparison)', shape: 'square' },
            { color: 'var(--violet)', label: 'first byte right (2 comparisons)', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Cost of one comparison (the signal)" value={perComparison} min={SIGNAL_RANGE.min} max={SIGNAL_RANGE.max} step={SIGNAL_RANGE.step} onChange={setPerComparison} format={(v) => `${v} units`} />
          <Slider label="Noise, sigma" value={sigma} min={NOISE_RANGE.min} max={NOISE_RANGE.max} step={NOISE_RANGE.step} onChange={setSigma} format={(v) => `${v} units`} />
        </>,
      ]}
    >
      <div className="tsc-stage stage-pad">
        <Box>
          <SectionTitle hint={`${n(HISTOGRAM_SAMPLES)} simulated times each`}>Two time distributions</SectionTitle>
          <Plot2D
            x={{ domain: [edges[0], edges[edges.length - 1]], label: 'simulated response time (units)', format: (v) => n(Math.round(v)) }}
            y={{ domain: [0, Math.ceil(peak * 1.15)], label: 'count' }}
            width={356}
            height={220}
            ariaLabel={`Simulated times for a wrong first byte (mean ${n(meanTime(setting, 1))}) and a right one (mean ${n(meanTime(setting, 2))})`}
          >
            <Bars bars={barsFromHistogram(dist.wrong)} tone="info" />
            <Bars bars={barsFromHistogram(dist.right)} tone="violet" />
            <VLine at={meanTime(setting, 1)} tone="info" />
            <VLine at={meanTime(setting, 2)} tone="violet" />
          </Plot2D>
          <Hint tone="muted" block>
            Time = base + c x comparisons + noise, with the noise drawn from a seeded normal. Each distribution is wide, and they still sit {n(delta(setting))} units apart: averaging many observations narrows each one, which is what the count above is for. A statement like &quot;it is only exploitable on a quiet network&quot; is a statement about how many observations that takes, not about whether the difference is there.
          </Hint>
        </Box>
        <Honesty />
      </div>
    </StageFrame>
  );
}
