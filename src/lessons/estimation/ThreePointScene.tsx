import { useMemo, useState, type ReactNode } from 'react';
import { Bars, Curve, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { lognormalPdf, normalPdf } from '../../core/distributions';
import { sig } from '../../core/format';
import { barsFromHistogram } from '../../core/plot';
import { histogram } from '../../core/stats';
import { threePointCaption } from './captions';
import { THREE_POINT_SEED, RUNS, checkOrder, parseDays, threePointResult, type ThreePoint } from './model';
import { OPENING } from './opening';

const PLOT_WIDTH = 560;
const BINS = 48;
const FIELDS = [
  { key: 'optimistic', label: 'Optimistic (days)' },
  { key: 'likely', label: 'Most likely (days)' },
  { key: 'pessimistic', label: 'Pessimistic (days)' },
] as const;

/** Reads the three typed fields, or the first refusal (a bad number, then an out-of-order pair). */
function readThree(texts: Record<keyof ThreePoint, string>): { value: ThreePoint } | { error: string } {
  const out: Partial<ThreePoint> = {};
  for (const f of FIELDS) {
    const parsed = parseDays(texts[f.key], f.key);
    if (!parsed.ok) return { error: parsed.error };
    out[f.key] = parsed.value;
  }
  const value = out as ThreePoint;
  const order = checkOrder(value);
  return order ? { error: order } : { value };
}

/** Scene 3: the PERT convention beside a log-normal fitted to the same 5th and 95th percentiles. */
export function ThreePointScene({ picker }: { picker: ReactNode }) {
  const [texts, setTexts] = useState(OPENING.three);
  const read = useMemo(() => readThree(texts), [texts]);
  const point = 'value' in read ? read.value : null;
  const result = useMemo(() => ('value' in read ? threePointResult(read.value) : null), [read]);
  const refusal = 'error' in read ? read.error : null;

  const xMax = result ? Math.max(result.fit.p80 * 2, point!.pessimistic * 1.3) : 1;
  const hist = result ? histogram(result.draws, { bins: BINS, min: 0, max: xMax }) : null;
  const binWidth = xMax / BINS;
  const bars = hist ? barsFromHistogram({ edges: hist.edges, counts: hist.counts.map((c) => c / RUNS) }) : [];
  const yMax = hist ? Math.max(...hist.counts.map((c) => c / RUNS)) * 1.2 : 1;

  return (
    <StageFrame
      height={520}
      intro={threePointCaption(result, refusal)}
      introKey={`${texts.optimistic}|${texts.likely}|${texts.pessimistic}`}
      stats={
        <Stats>
          <Stat label="PERT mean" value={result ? `${sig(result.pert.mean, 3)} days` : '–'} color="var(--violet)" sub={result ? `spread (P - O) / 6 = ${sig(result.pert.sd, 3)}` : undefined} />
          <Stat label="Fitted log-normal mean" value={result ? `${sig(result.fit.mean, 3)} days` : '–'} color="var(--info)" sub={result ? `median ${sig(result.fit.median, 3)}, mode ${sig(result.fit.mode, 3)}` : undefined} />
          <Stat label="80th percentile" value={result ? `${sig(result.pert.p80, 3)} vs ${sig(result.fit.p80, 3)}` : '–'} sub="days: PERT (normal) vs the fit" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'simulated draws and fitted log-normal' },
            { color: 'var(--violet)', label: 'PERT normal curve and mean', shape: 'line' },
            { color: 'var(--hi)', label: 'your most likely value', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {FIELDS.map((f) => (
            <TextField key={f.key} label={f.label} value={texts[f.key]} width={64} onChange={(v) => setTexts((t) => ({ ...t, [f.key]: v }))} />
          ))}
        </>,
      ]}
    >
      <div className="es-stage stage-pad">
        {refusal && <Hint tone="muted" block>{refusal}</Hint>}
        {result && point && (
          <WideRegion minWidth={PLOT_WIDTH} label="Three-point estimate against the fitted log-normal: scroll sideways to see all of it">
            <Plot2D
              x={{ domain: [0, xMax], label: 'days', ticks: 6 }}
              y={{ domain: [0, yMax], label: 'share of runs per bin', format: (v) => sig(v, 2), ticks: 4 }}
              width={PLOT_WIDTH}
              height={260}
              ariaLabel={`Draws from the log-normal fitted to ${point.optimistic} and ${point.pessimistic} days, with the PERT normal curve over them`}
            >
              <Bars bars={bars} tone="info" />
              <Curve fn={(x) => lognormalPdf(x, result.fit.mu, result.fit.sigma) * binWidth} tone="info" />
              <Curve fn={(x) => normalPdf(x, result.pert.mean, result.pert.sd) * binWidth} tone="violet" />
              <VLine at={point.likely} tone="hi" />
              <VLine at={result.pert.mean} tone="violet" label="PERT mean" />
            </Plot2D>
          </WideRegion>
        )}
        <Hint tone="muted" block>
          Reading the three values as the 5th and 95th percentiles is this lesson&apos;s assumption for the fit; PERT instead treats them as nearly the extremes.
        </Hint>
        <ProvenanceRow>
          <ClaimLabel kind="standard">the PERT mean (O + 4M + P) / 6 and spread (P - O) / 6 are the standard formulas</ClaimLabel>
          <ClaimLabel kind="practice">used widely as a convention, not a law</ClaimLabel>
          <Provenance kind="simulated" seed={THREE_POINT_SEED}>{RUNS.toLocaleString('en-US')} seeded draws from the fitted log-normal</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
