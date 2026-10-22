import { useMemo, useState, type ReactNode } from 'react';
import { Curve, HLine, Plot2D, Points, VLine } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { sig } from '../../core/format';
import type { Tone } from '../../core/tone';
import { seriesCaption } from './captions';
import { OPENING } from './opening';
import { GUARDRAIL_RANGES, KIND_WORD, METRICS, RELEASE_WEEK, SERIES_SEED, WEEKS, change, firstBreach, generateSeries, type Guardrails, type MetricId } from './series';

const PLOT = 520;
const KIND_TONE: Record<string, Tone> = { vanity: 'orange', outcome: 'info', guardrail: 'info' };
const pctOf = (share: number) => `${share >= 0 ? '+' : '-'}${Math.round(Math.abs(share) * 100)}%`;

/** Scene 2: one release, five metrics: a vanity number rises, outcomes stay flat, guardrails catch the cost. */
export function SeriesScene({ picker }: { picker: ReactNode }) {
  const [metric, setMetric] = useState<MetricId>(OPENING.series.metric);
  const [pushed, setPushed] = useState(OPENING.series.pushed);
  const [guardrails, setGuardrails] = useState<Guardrails>(OPENING.series.guardrails);
  const [seed, setSeed] = useState(OPENING.series.seed);
  const series = useMemo(() => generateSeries(seed, pushed), [seed, pushed]);
  const breach = firstBreach(series, guardrails);
  const m = METRICS.find((x) => x.id === metric)!;
  const values = series[metric];
  const [lo, hi] = [Math.min(...values), Math.max(...values)];
  const guard = m.kind === 'guardrail' ? guardrails[metric as 'tickets' | 'latency'] : null;
  const top = Math.max(hi, guard ?? 0) * 1.1;
  const bottom = Math.min(lo, guard ?? Infinity) * 0.9;
  const points = values.map((v, i) => [i + 1, v] as [number, number]);

  return (
    <StageFrame
      height={640}
      intro={seriesCaption(series, metric, pushed, breach, guardrails)}
      introKey={[metric, pushed, seed, guardrails.tickets, guardrails.latency]}
      stats={
        <Stats>
          <Stat label={`${m.label}, after the release`} value={pctOf(change(values))} color={m.kind === 'vanity' ? 'var(--orange)' : undefined} sub={KIND_WORD[m.kind]} />
          <Stat label="Release verdict" value={breach ? 'flagged' : 'no flag'} color={breach ? 'var(--bad)' : 'var(--ok)'} sub={breach ? `${breach.metric === 'tickets' ? 'tickets' : 'latency'} crossed its guardrail in week ${breach.week}` : 'no guardrail crossed'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'a vanity metric (a labelled category, not a verdict)', shape: 'line' },
            { color: 'var(--info)', label: 'an outcome or guardrail metric', shape: 'line' },
            { color: 'var(--bad)', label: 'a week past a guardrail', shape: 'square' },
            { color: 'var(--dim)', label: 'the guardrail and the release week', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Metric to watch" options={METRICS.map((x) => ({ value: x.id, label: x.label }))} value={metric} onChange={setMetric} />
        </>,
        <>
          <Toggle label="Release" value={pushed} onChange={setPushed} off="Calm" on="Push signups hard" />
          <Slider label="Tickets guardrail (a week)" value={guardrails.tickets} {...GUARDRAIL_RANGES.tickets} onChange={(tickets) => setGuardrails((g) => ({ ...g, tickets }))} />
          <Slider label="Latency guardrail (ms)" value={guardrails.latency} {...GUARDRAIL_RANGES.latency} onChange={(latency) => setGuardrails((g) => ({ ...g, latency }))} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="pt-stage stage-pad">
        <WideRegion minWidth={PLOT} label="The chosen metric by week: scroll sideways to see all of it">
          <Plot2D
            x={{ domain: [1, WEEKS], ticks: 8, label: 'week' }}
            y={{ domain: [bottom, top], label: `${m.label} (${m.unit.trim() || 'count'})`, format: (v) => sig(v, 3), ticks: 5 }}
            width={PLOT}
            height={260}
            ariaLabel={`${m.label} by week with the release in week ${RELEASE_WEEK}`}
          >
            <VLine at={RELEASE_WEEK} tone="dim" label="release" />
            {guard !== null && <HLine at={guard} tone="dim" label="guardrail" />}
            <Curve points={points} tone={KIND_TONE[m.kind]} />
            <Points data={points.map(([x, y]) => ({ x, y, tone: guard !== null && x >= RELEASE_WEEK && y > guard ? 'bad' : KIND_TONE[m.kind] }))} r={3} />
          </Plot2D>
        </WideRegion>
        <table className="data-table pt-table">
          <caption>All five metrics, mean after the release against mean before</caption>
          <thead><tr><th>Metric</th><th>Kind</th><th>Change</th></tr></thead>
          <tbody>{METRICS.map((x) => <tr key={x.id}><td>{x.label}</td><td>{KIND_WORD[x.kind]}</td><td>{pctOf(change(series[x.id]))}</td></tr>)}</tbody>
        </table>
        <Hint tone="muted" block>A tight guardrail flags a calm release too: weekly numbers wobble by a few percent on their own, so a limit set close to the usual level is crossed by noise. Raise the limit and the calm release passes.</Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>{WEEKS} weeks of seeded numbers; the default seed is {SERIES_SEED}</Provenance>
          <Provenance kind="invented">the product, the release and every trend are invented</Provenance>
          <ClaimLabel kind="practice">Goodhart&apos;s law: a number that becomes a target stops measuring what it did; guardrail metrics are a common defence</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
