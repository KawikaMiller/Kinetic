import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bars, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { histogram } from '../../core/stats';
import { SeedField } from '../distributions/SeedField';
import { sig } from '../distributions/fmt';
import { noiseCaption, us } from './frames';
import { NOISE_DEFAULT, OTHER_PROCESS, RUNS_RANGE, RUN_NOISE, readNoise, type NoiseSettings } from './model';

/** The histogram's range: the quiet runs and the slowed ones fit, and a rare ×3 pause falls off the right edge. */
const HIST = { min: 7, max: 22, bins: 45 } as const;

/** Histogram bars for the runs of one mode, as plot bars. */
function bars(values: readonly number[]): { x0: number; x1: number; y: number }[] {
  const h = histogram(values, HIST);
  return h.counts.map((y, i) => ({ x0: h.edges[i], x1: h.edges[i + 1], y }));
}

export function NoiseScene({ picker }: { picker: ReactNode }) {
  const [settings, setSettings] = useState<NoiseSettings>({ runs: NOISE_DEFAULT.runs, otherProcess: NOISE_DEFAULT.otherProcess, frequencyScaling: NOISE_DEFAULT.frequencyScaling });
  const [seed, setSeed] = useState(NOISE_DEFAULT.seed);
  const set = (patch: Partial<NoiseSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const reading = useMemo(() => readNoise(settings, seed), [settings, seed]);

  useIntroCaption(noiseCaption(reading, settings), [reading]);

  const quiet = useMemo(() => bars(reading.runsA.filter((r) => !r.disturbed).map((r) => r.us)), [reading]);
  const disturbed = useMemo(() => bars(reading.runsA.filter((r) => r.disturbed).map((r) => r.us)), [reading]);
  const top = Math.max(1, ...quiet.map((b) => b.y), ...disturbed.map((b) => b.y)) * 1.15;
  const d = reading.difference;

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="A" value={us(reading.A.median)} color="var(--sky)" sub={[`median, 95% interval ${sig(reading.A.interval.lo)} to ${sig(reading.A.interval.hi)}`, `mean ${us(reading.A.mean)}, minimum ${us(reading.A.min)}`]} />
          <Stat label="B" value={us(reading.B.median)} color="var(--amber)" sub={[`median, 95% interval ${sig(reading.B.interval.lo)} to ${sig(reading.B.interval.hi)}`, `mean ${us(reading.B.mean)}, minimum ${us(reading.B.min)}`]} />
          <Stat
            label="B − A"
            value={`${sig(d.estimate, 2)} µs`}
            color={reading.verdict === 'distinguishable' ? 'var(--ok)' : undefined}
            sub={[`95% interval ${sig(d.lo, 2)} to ${sig(d.hi, 2)} µs`, reading.verdict === 'distinguishable' ? `distinguishable: ${reading.faster} is faster` : 'cannot tell']}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--sky)', label: 'A, runs on a quiet machine' },
            { color: 'var(--pink)', label: 'A, runs with another process' },
            { color: 'var(--sky)', label: 'A median', shape: 'line' },
            { color: 'var(--amber)', label: 'B median', shape: 'line' },
            { color: 'var(--hi)', label: 'A mean', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Runs" value={settings.runs} {...RUNS_RANGE} onChange={(runs) => set({ runs })} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
        <>
          <Toggle label="Another process is running" value={settings.otherProcess} onChange={(otherProcess) => set({ otherProcess })} />
          <Toggle label="Frequency scaling" value={settings.frequencyScaling} onChange={(frequencyScaling) => set({ frequencyScaling })} />
        </>,
      ]}
    >
      <div className="bm-stage stage-pad">
        <Plot2D
          x={{ domain: [HIST.min, HIST.max], label: 'time per run of A (µs)', ticks: 5 }}
          y={{ domain: [0, top], label: 'runs', ticks: 3 }}
          ariaLabel={`Histogram of ${settings.runs} runs of A with the medians of A and B`}
        >
          <Bars bars={quiet} tone="sky" />
          <Bars bars={disturbed} tone="pink" />
          <VLine at={reading.A.median} tone="sky" label="A" dashed />
          <VLine at={reading.B.median} tone="amber" dashed />
          <VLine at={reading.A.mean} tone="hi" dashed />
        </Plot2D>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>seeded runs: log-normal noise (sigma {RUN_NOISE.sigma}), {Math.round(RUN_NOISE.outlierProb * 100)}% of runs hit a pause (×{RUN_NOISE.outlierFactor}), bootstrap of 1,000 resamples</Provenance>
          <Provenance kind="illustrative">medians of 10 and 9.7 µs, and the other process ({Math.round(OTHER_PROCESS.prob * 100)}% of runs ×{OTHER_PROCESS.factor}), are made up</Provenance>
        </ProvenanceRow>
        <Hint tone="muted" className="bm-note">
          B really is 3% faster, which only many runs can show. Adding runs until the verdict flips to &quot;distinguishable&quot; is peeking at the result, the same flaw as stopping an A/B test
          when it first looks significant: see <Link to="/lesson/hypothesis-testing-ab">hypothesis testing and A/B experiments</Link>. The interval is a percentile bootstrap of the median,
          and with another process running the histogram, not the interval, is the honest view.
        </Hint>
      </div>
    </StageFrame>
  );
}
