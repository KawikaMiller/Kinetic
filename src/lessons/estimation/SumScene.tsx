import { useMemo, useState, type ReactNode } from 'react';
import { Bars, Plot2D, VLine } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { barsFromHistogram } from '../../core/plot';
import { sig } from '../../core/format';
import { histogram } from '../../core/stats';
import { sumCaption } from './captions';
import {
  CORRELATION, DEADLINE, MAX_TASKS, MIN_TASKS, RUNS, SPREAD, STATISTICS, chanceBy, independentSd, percentileOf, simulateTotal, statisticOf, sumFacts, sumSpec,
  type Statistic,
} from './model';
import { OPENING } from './opening';

const PLOT_WIDTH = 560;
const BINS = 40;
const X_STEP = 10;
const pctOf = (share: number) => `${Math.round(share * 100)}%`;

/** Scene 2: why summed point estimates come in late, with a seeded Monte Carlo of the total. */
export function SumScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState(OPENING.sum.n);
  const [sigma, setSigma] = useState(OPENING.sum.sigma);
  const [rho, setRho] = useState(OPENING.sum.rho);
  const [seed, setSeed] = useState(OPENING.sum.seed);
  const [statistic, setStatistic] = useState<Statistic>(OPENING.sum.statistic);
  const [deadline, setDeadline] = useState(OPENING.sum.deadline);

  const spec = useMemo(() => sumSpec(n, sigma, rho, seed), [n, sigma, rho, seed]);
  const run = useMemo(() => simulateTotal(spec), [spec]);
  const facts = useMemo(() => sumFacts(spec, run), [spec, run]);
  const indSd = independentSd(spec.medians, sigma);
  const yourSum = spec.medians.reduce((acc, m) => acc + statisticOf(statistic, m, sigma), 0);

  const xMax = Math.max(X_STEP, Math.ceil((percentileOf(run, 0.995) * 1.05) / X_STEP) * X_STEP);
  const hist = useMemo(() => histogram(run.sorted, { bins: BINS, min: 0, max: xMax }), [run, xMax]);
  const shares = hist.counts.map((c) => (100 * c) / RUNS);
  const yMax = Math.max(...shares) * 1.15;
  const bars = barsFromHistogram({ edges: hist.edges, counts: shares }, (bin) => (bin.x1 <= deadline ? 'ok' : 'info'));

  const rows: { label: string; value: number }[] = [
    { label: 'Sum of modes', value: facts.sumModes },
    { label: 'Sum of medians', value: facts.sumMedians },
    { label: 'Sum of means', value: facts.sumMeans },
    { label: 'P50 of the total', value: facts.p50 },
    { label: 'P80 of the total', value: facts.p80 },
    { label: 'P90 of the total', value: facts.p90 },
  ];

  return (
    <StageFrame
      height={520}
      intro={sumCaption(spec, facts, run, statistic, yourSum, deadline, indSd)}
      introKey={[n, sigma, rho, seed, statistic, deadline]}
      stats={
        <Stats>
          <Stat label="Your sum" value={`${sig(yourSum, 3)} days`} color="var(--bad)" sub={`finished by it in ${pctOf(chanceBy(run, yourSum))} of runs`} />
          <Stat label="P50 / P80 / P90" value={`${sig(facts.p50, 3)} / ${sig(facts.p80, 3)} / ${sig(facts.p90, 3)}`} color="var(--ok)" sub="days, from the simulated totals" />
          <Stat label="Deadline" value={`day ${deadline}`} color="var(--orange)" sub={`met in ${pctOf(chanceBy(run, deadline))} of runs`} />
          <Stat label="Spread of the total" value={`${sig(run.sd, 3)} days`} sub={[`standard deviation, ${n} tasks`, `independent closed form: ${sig(indSd, 3)} days`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'simulated totals', shape: 'square' },
            { color: 'var(--ok)', label: 'runs that meet the deadline', shape: 'square' },
            { color: 'var(--bad)', label: 'your sum of estimates', shape: 'line' },
            { color: 'var(--hi)', label: 'P50', shape: 'line' },
            { color: 'var(--ok)', label: 'P80, P90', shape: 'line' },
            { color: 'var(--orange)', label: 'deadline (dashed)', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Tasks" value={n} min={MIN_TASKS} max={MAX_TASKS} onChange={setN} />
          <Slider label="Spread of each task (σ)" value={sigma} {...SPREAD} format={(v) => v.toFixed(1)} onChange={setSigma} />
          <Slider label="Shared cause (correlation ρ)" value={rho} {...CORRELATION} format={(v) => v.toFixed(1)} onChange={setRho} />
        </>,
        <>
          <Segmented label="Each task estimated as its" options={STATISTICS} value={statistic} onChange={setStatistic} />
          <Slider label="Deadline (days)" value={deadline} {...DEADLINE} onChange={setDeadline} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="es-stage stage-pad">
        <WideRegion minWidth={PLOT_WIDTH} label="Histogram of the simulated project totals: scroll sideways to see all of it">
          <Plot2D
            x={{ domain: [0, xMax], label: 'project total (days)', ticks: 6 }}
            y={{ domain: [0, yMax], label: '% of runs per bin', format: (v) => `${sig(v, 2)}`, ticks: 4 }}
            width={PLOT_WIDTH}
            height={260}
            ariaLabel={`Histogram of ${RUNS.toLocaleString('en-US')} simulated project totals, P50 ${sig(facts.p50, 3)} days, P90 ${sig(facts.p90, 3)} days`}
          >
            <Bars bars={bars} />
            <VLine at={yourSum} tone="bad" label="your sum" />
            <VLine at={facts.p50} tone="hi" />
            <VLine at={facts.p80} tone="ok" label="P80" />
            <VLine at={facts.p90} tone="ok" label="P90" />
            <VLine at={deadline} tone="orange" label="deadline" dashed />
          </Plot2D>
        </WideRegion>
        <table className="data-table es-table">
          <thead>
            <tr><th>Marker</th><th>Days</th><th>Runs finished by it</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}><td>{r.label}</td><td>{sig(r.value, 3)}</td><td>{pctOf(chanceBy(run, r.value))}</td></tr>
            ))}
          </tbody>
        </table>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>{RUNS.toLocaleString('en-US')} seeded runs of {n} invented tasks</Provenance>
          <Provenance kind="illustrative">task durations are not guaranteed to be log-normal; independence is an assumption the correlation slider relaxes</Provenance>
          <ClaimLabel kind="standard">log-normal mean, median and mode are closed forms; the total is a Monte Carlo</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
