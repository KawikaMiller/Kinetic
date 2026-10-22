import { useMemo, useState, type ReactNode } from 'react';
import { Bars, Plot2D, VLine } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { sig } from '../../core/format';
import { barsFromHistogram } from '../../core/plot';
import { histogram } from '../../core/stats';
import { riskCaption } from './captions';
import { PRESET, cpm } from './cpm';
import { OPENING } from './opening';
import { MERGE_DEMO, RUNS, SPREAD, criticalChainMean, expectedMaxClosedForm, maxOfTwoPaths, simulateProject } from './uncertainty';

const PLOT_WIDTH = 520;
const BINS = 36;
const PLANNED = cpm(PRESET).length;
const SLACK = cpm(PRESET).slack;
const MERGE = { api: 'API', schema: 'Schema', into: 'Integrate' };

/** Scene 5: the preset's durations as ranges: a Monte Carlo of the project length, criticality indices and merge bias. */
export function RiskScene({ picker }: { picker: ReactNode }) {
  const [sigma, setSigma] = useState(OPENING.risk.sigma);
  const [seed, setSeed] = useState(OPENING.risk.seed);
  const u = useMemo(() => simulateProject(PRESET, sigma, seed), [sigma, seed]);
  const mergeMc = useMemo(() => maxOfTwoPaths(MERGE_DEMO.mean, MERGE_DEMO.sd, MERGE_DEMO.seed), []);
  const xMax = Math.ceil(u.lengths[Math.floor(0.995 * RUNS)] + 1);
  const hist = histogram(u.lengths, { bins: BINS, min: 0, max: xMax });
  const shares = hist.counts.map((c) => (100 * c) / RUNS);
  const bars = barsFromHistogram({ edges: hist.edges, counts: shares }, (bin) => (bin.x1 <= PLANNED ? 'ok' : 'info'));
  const ranked = [...PRESET.tasks].sort((a, b) => u.criticality[b.id] - u.criticality[a.id]);
  const onTime = u.lengths.filter((l) => l <= PLANNED).length / RUNS;

  return (
    <StageFrame
      height={640}
      intro={riskCaption(PRESET, PLANNED, SLACK, u, sigma)}
      introKey={[sigma, seed]}
      stats={
        <Stats>
          <Stat label="Planned length" value={`${PLANNED} days`} color="var(--ok)" sub={`met in ${Math.round(onTime * 100)}% of runs`} />
          <Stat label="Average simulated length" value={`${sig(u.meanLength, 3)} days`} sub={`spread ${sigma} on every task`} />
          <Stat label="Critical chain alone, average" value={`${sig(criticalChainMean(PRESET, sigma), 3)} days`} sub={`closed form: planned ${PLANNED} x e^(${sigma}²/2); the rest is merge bias`} />
          <Stat label="Merge into Integrate" value={`day ${sig(u.meanEs.integrate, 3)}`} sub={[`API finishes by day ${sig(u.meanEf.api, 3)} on average`, `Schema by day ${sig(u.meanEf.schema, 3)}`]} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'simulated project lengths', shape: 'square' }, { color: 'var(--ok)', label: 'runs that meet the plan; the planned length', shape: 'square' }, { color: 'var(--hi)', label: 'average simulated length', shape: 'line' }]} />}
      controls={[<>{picker}<Slider label="Spread of each task" value={sigma} {...SPREAD} format={(v) => v.toFixed(1)} onChange={setSigma} /><SeedField seed={seed} onSeed={setSeed} /></>]}
    >
      <div className="pp-stage stage-pad">
        <WideRegion minWidth={PLOT_WIDTH} label="Histogram of simulated project lengths: scroll sideways to see all of it">
          <Plot2D
            x={{ domain: [0, xMax], label: 'project length (working days)', ticks: 6 }}
            y={{ domain: [0, Math.max(...shares) * 1.15], label: '% of runs per bin', format: (v) => sig(v, 2), ticks: 4 }}
            width={PLOT_WIDTH}
            height={250}
            ariaLabel={`Histogram of ${RUNS.toLocaleString('en-US')} simulated project lengths around the planned ${PLANNED} days`}
          >
            <Bars bars={bars} />
            <VLine at={PLANNED} tone="ok" label="plan" />
            <VLine at={u.meanLength} tone="hi" />
          </Plot2D>
        </WideRegion>
        <table className="data-table pp-slack">
          <caption>How often each task is on a longest chain (criticality index)</caption>
          <thead><tr><th>Task</th><th>Planned slack</th><th>On a longest chain</th></tr></thead>
          <tbody>
            {ranked.map((t) => (
              <tr key={t.id}><td>{t.label}</td><td>{SLACK[t.id]} days</td><td>{Math.round(u.criticality[t.id] * 100)}% of runs</td></tr>
            ))}
          </tbody>
        </table>
        <p className="pp-note">
          Merge bias: the later of two independent N({MERGE_DEMO.mean}, {MERGE_DEMO.sd}²) paths finishes on average at day {sig(mergeMc, 4)} in {RUNS.toLocaleString('en-US')} seeded runs;
          the closed form is {MERGE_DEMO.mean} + {MERGE_DEMO.sd}/√π = {sig(expectedMaxClosedForm(MERGE_DEMO.mean, MERGE_DEMO.sd), 4)}. In the project above the same effect puts {MERGE.into} later than {MERGE.api} or {MERGE.schema} alone.
        </p>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>{RUNS.toLocaleString('en-US')} seeded runs, each task log-normal around its planned days</Provenance>
          <Provenance kind="illustrative">independent durations are an assumption; shared causes widen the spread (see the estimation lesson)</Provenance>
          <ClaimLabel kind="standard">the mean of the later of two equal independent normals is the mean plus the spread over the square root of pi</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
