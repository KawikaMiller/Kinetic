import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Band, HLine, Plot2D, Points, Segments, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import type { Option } from '../../components/options';
import { Button, Hint, Legend, Provenance, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { mulberry32 } from '../../core/random';
import { pctText, sig } from '../distributions/fmt';
import { SeedField } from '../distributions/SeedField';
import { coverageCaption, intervalCaption } from './frames';
import {
  BOOTSTRAP_RESAMPLES, INTERVAL_DEFAULT, SAMPLE_N, SHOWN_INTERVALS, SOURCES, SWEEP_SIZES, TAIL_PCT, coverageRun, drawSampleOf,
  experimentsFor, expectedAbove, intervalFor, sampleSeed, sweepIntervals, truth, type CoverageRun, type Interval, type SourceId, type Statistic,
} from './model';

const SOURCE_OPTIONS: Option<SourceId>[] = [
  { value: 'normal', label: 'Normal source' },
  { value: 'heavy', label: 'Heavy-tailed source' },
];
const STAT_OPTIONS: Option<Statistic>[] = [
  { value: 'mean', label: 'Mean' },
  { value: 'p99', label: 'p99' },
];
const EXPONENT = { min: Math.log10(SAMPLE_N.min), max: Math.log10(SAMPLE_N.max), step: 0.05 } as const;
const PAD = 0.1;

/** Linear interpolation of a sweep in log n, so the band is a smooth ribbon between the measured sizes. */
function bandEdge(points: readonly { n: number; interval: Interval }[], edge: 'lo' | 'hi') {
  return (n: number): number => {
    const x = Math.log(n);
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1], points[i]];
      if (n <= b.n) {
        const t = (x - Math.log(a.n)) / (Math.log(b.n) - Math.log(a.n));
        return a.interval[edge] + t * (b.interval[edge] - a.interval[edge]);
      }
    }
    return points[points.length - 1].interval[edge];
  };
}

interface Experiment {
  key: string;
  run: CoverageRun;
}

export function IntervalScene({ picker }: { picker: ReactNode }) {
  const [source, setSource] = useState<SourceId>(INTERVAL_DEFAULT.source);
  const [stat, setStat] = useState<Statistic>(INTERVAL_DEFAULT.stat);
  const [exponent, setExponent] = useState<number>(INTERVAL_DEFAULT.exponent);
  const [seed, setSeed] = useState(INTERVAL_DEFAULT.seed);
  const [index, setIndex] = useState(0);
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const setCaption = useSetCaption();

  const n = Math.round(10 ** exponent);
  const exact = truth(source, stat);
  const sample = useMemo(() => drawSampleOf(source, seed, index, n), [source, seed, index, n]);
  const interval = useMemo(() => intervalFor(stat, sample, BOOTSTRAP_RESAMPLES, mulberry32(sampleSeed(seed, index) + 1)), [stat, sample, seed, index]);
  const sweep = useMemo(() => sweepIntervals(source, stat, seed, index), [source, stat, seed, index]);
  const key = `${source}|${stat}|${n}|${seed}`;
  const run = experiment?.key === key ? experiment.run : null;
  const tail = expectedAbove(n, TAIL_PCT);

  useIntroCaption(
    run ? coverageCaption(run, stat, n) : intervalCaption({ stat, n, interval, truth: exact, expectedAbove: tail }),
    [interval, run, stat, n, exact],
  );

  const runExperiments = () => {
    const result = coverageRun(source, stat, n, seed);
    setExperiment({ key, run: result });
    setCaption(coverageCaption(result, stat, n));
  };

  const ys = [...sweep.flatMap((s) => [s.interval.lo, s.interval.hi]), exact];
  const spread = Math.max(...ys) - Math.min(...ys);
  const yDomain: [number, number] = [Math.min(...ys) - spread * PAD, Math.max(...ys) + spread * PAD];
  const shown = run?.shown ?? [];
  const covX = [...shown.flatMap((s) => [s.interval.lo, s.interval.hi]), exact];
  const covPad = (Math.max(...covX) - Math.min(...covX)) * PAD;

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat
            label={stat === 'mean' ? 'Mean' : 'p99'}
            value={interval ? sig(interval.estimate) : '–'}
            sub={[interval ? `95% interval ${sig(interval.lo)} to ${sig(interval.hi)}` : 'interval undefined', `n = ${n.toLocaleString('en-US')}, sample ${index + 1}`]}
          />
          <Stat label="True value" value={sig(exact)} sub={[`the source's exact ${stat === 'mean' ? 'mean' : 'p99'}`]} />
          <Stat
            label={run ? 'Coverage' : 'Tail samples'}
            value={run ? pctText(run.coverage) : sig(tail, 2)}
            sub={run ? [`${run.covered.toLocaleString('en-US')} of ${run.experiments.toLocaleString('en-US')} intervals contained it`] : [`n × (1 − p99): expected samples above p99`]}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: '95% interval across n' },
            { color: 'var(--hi)', label: 'true value', shape: 'line' },
            { color: 'var(--info)', label: 'this sample', shape: 'dot' },
            { color: 'var(--ok)', label: 'interval that covered' },
            { color: 'var(--bad)', label: 'interval that missed' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Source" value={source} onChange={setSource} options={SOURCE_OPTIONS} />
          <Segmented label="Statistic" value={stat} onChange={setStat} options={STAT_OPTIONS} />
        </>,
        <>
          <Slider label="Sample size n" value={exponent} min={EXPONENT.min} max={EXPONENT.max} step={EXPONENT.step} format={() => n.toLocaleString('en-US')} onChange={setExponent} />
          <Button variant="primary" onClick={() => setIndex((i) => i + 1)}>Draw a fresh sample</Button>
          <Button onClick={runExperiments}>Run {experimentsFor(n).toLocaleString('en-US')} experiments</Button>
        </>,
        <>
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="ps-stage stage-pad">
        <div className="ps-row">
          <Plot2D
            x={{ domain: [SWEEP_SIZES[0], SWEEP_SIZES[SWEEP_SIZES.length - 1]], log: true, label: 'sample size n (log scale)', ticks: 4 }}
            y={{ domain: yDomain, label: stat === 'mean' ? 'mean' : 'p99', ticks: 4 }}
            ariaLabel={`95% interval for the ${stat} across sample sizes, against the true value ${sig(exact)}`}
          >
            <Band lo={bandEdge(sweep, 'lo')} hi={bandEdge(sweep, 'hi')} tone="violet" />
            <HLine at={exact} tone="hi" dashed={false} label="true" />
            {interval && <Segments segments={[{ from: [n, interval.lo], to: [n, interval.hi], tone: interval.lo <= exact && exact <= interval.hi ? 'ok' : 'bad' }]} />}
            {interval && <Points data={[{ x: n, y: interval.estimate, tone: 'info' }]} r={4.5} />}
          </Plot2D>
          {run && shown.length > 0 && (
            <Plot2D
              x={{ domain: [Math.min(...covX) - covPad, Math.max(...covX) + covPad], label: `${stat === 'mean' ? 'mean' : 'p99'}, first ${SHOWN_INTERVALS} experiments`, ticks: 4 }}
              y={{ domain: [0, SHOWN_INTERVALS + 1], label: 'experiment', ticks: 4 }}
              ariaLabel={`First ${SHOWN_INTERVALS} intervals; the ones that missed the true value are red`}
            >
              <Segments segments={shown.map((s, i) => ({ from: [s.interval.lo, i + 1] as const, to: [s.interval.hi, i + 1] as const, tone: s.covered ? 'ok' as const : 'bad' as const }))} />
              <VLine at={exact} tone="hi" dashed={false} />
            </Plot2D>
          )}
        </div>
        {run && run.experiments < 1000 && (
          <Hint className="ps-note">Only {run.experiments.toLocaleString('en-US')} experiments ran: at n = {n.toLocaleString('en-US')} each one draws a lot, so the run is capped to keep the page quick.</Hint>
        )}
        <Box className="ps-explain">
          <SectionTitle>How the interval is made</SectionTitle>
          <p>
            Mean: mean ± t·s/√n, with t from a small table (2.262 at n = 10, 1.960 for a large n). p99: the 2.5% and 97.5% points of {BOOTSTRAP_RESAMPLES.toLocaleString('en-US')} seeded
            resamples of this sample (a percentile bootstrap). The band shows the same interval on the first n values of one stream, so it narrows like 1/√n for the mean.
          </p>
        </Box>
        <div className="ps-chips">
          <Provenance kind="simulated" seed={seed}>{SOURCES[source].name}; the true value is exact</Provenance>
          <Provenance kind="illustrative">the sources are made up; no real service is measured</Provenance>
        </div>
      </div>
    </StageFrame>
  );
}
