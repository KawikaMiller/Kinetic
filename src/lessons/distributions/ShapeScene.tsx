import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Bars, Curve, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, Segmented, Slider, Stat, Stats } from '../../components/ui';
import type { Option } from '../../components/options';
import { useIntroCaption } from '../../core/caption';
import { barsFromHistogram } from '../../core/plot';
import { shapeCaption } from './frames';
import { BOUNDS, DEFAULT_SHAPES, SHAPE_DEFAULT, FAMILIES, FAMILY_NAME, N_DRAWS, PRESETS, RUNNING_AT, logBinsAllowed, momentsOf, shapeView, summaryRows, type BinMode, type ShapeDefaults, type ShapeView } from './model';
import { SeedField } from '../../components/SeedField';
import { pctText, sig } from '../../core/format';
import { distPdf, type Dist, type Family } from '../../core/distributions';

const FAMILY_OPTIONS: Option<Family>[] = FAMILIES.map((f) => ({ value: f, label: FAMILY_NAME[f] }));
/** Headroom above the tallest bar, as a multiple of it. */
const HEADROOM = 1.12;
const Y_TICKS = 4;
const LOG_REASON = 'Log bins need positive values, and a normal has non-positive ones.';

/** Draws a curve of the exact expected count per bin: N·w·pdf(x) on linear bins, per-bin expectations on log bins. */
function expectedCurve(v: ShapeView): { fn?: (x: number) => number; points?: [number, number][] } {
  if (v.mode === 'linear') {
    const width = v.edges[1] - v.edges[0];
    return { fn: (x) => v.n * width * distPdf(v.dist, x) };
  }
  return { points: v.expected.map((e, i) => [Math.sqrt(v.edges[i] * v.edges[i + 1]), e]) };
}

/** What each family's sliders allow, written from BOUNDS so the text and the sliders can't drift apart. */
const BOUND_TEXT: Record<Family, string> = {
  normal: `μ from ${BOUNDS.normalMu.min} to ${BOUNDS.normalMu.max}, σ from ${BOUNDS.normalSigma.min} to ${BOUNDS.normalSigma.max}`,
  exponential: `mean from ${BOUNDS.expMean.min} to ${BOUNDS.expMean.max}`,
  lognormal: `μ from ${BOUNDS.logMu.min} to ${BOUNDS.logMu.max}, σ from ${BOUNDS.logSigma.min} to ${BOUNDS.logSigma.max}`,
  pareto: `xm from ${BOUNDS.paretoXm.min} to ${BOUNDS.paretoXm.max}, α from ${BOUNDS.paretoAlpha.min} to ${BOUNDS.paretoAlpha.max}`,
};

function moment(d: Dist): string {
  const m = momentsOf(d);
  if (m === 'infinite-mean') return 'α ≤ 1: no finite mean, and no finite variance either.';
  if (m === 'infinite-variance') return 'α ≤ 2: the mean exists but the variance is infinite.';
  return 'Mean and variance both exist.';
}

export function ShapeScene({ picker }: { picker: ReactNode }) {
  const [family, setFamily] = useState<Family>(SHAPE_DEFAULT.family);
  const [shapes, setShapes] = useState<ShapeDefaults>(DEFAULT_SHAPES);
  const [mode, setMode] = useState<BinMode>(SHAPE_DEFAULT.mode);
  const [seed, setSeed] = useState(SHAPE_DEFAULT.seed);
  const [presetId, setPresetId] = useState<string | null>('latency');

  const dist: Dist = shapes[family];
  const view = useMemo(() => shapeView(dist, seed, mode), [dist, seed, mode]);
  const preset = PRESETS.find((p) => p.id === presetId);
  const rows = summaryRows(view);
  const infiniteMean = momentsOf(dist) === 'infinite-mean';

  useIntroCaption(shapeCaption(view), [view]);

  const change = <F extends Family>(f: F, patch: Partial<ShapeDefaults[F]>) => {
    setShapes((s) => ({ ...s, [f]: { ...s[f], ...patch } }));
    setPresetId(null);
  };
  const loadPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setFamily(p.dist.family);
    setShapes((s) => ({ ...s, [p.dist.family]: p.dist }));
    setPresetId(id);
  };

  const bars = barsFromHistogram(view, (bin) => (bin.x0 >= view.p99 ? 'bad' : 'muted'));
  const top = Math.max(...view.counts, ...view.expected) * HEADROOM;
  const inAxis = (x: number) => x >= view.domain[0] && x <= view.domain[1];
  const curve = expectedCurve(view);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Draws" value={view.n.toLocaleString('en-US')} sub={[`seed ${seed}`]} />
          <Stat
            label="Below the mean"
            value={infiniteMean ? '–' : pctText(view.belowMeanSample)}
            sub={infiniteMean ? ['no finite mean'] : [`sample ${pctText(view.belowMeanSample)}`, `exact ${pctText(view.belowMeanExact)}`]}
          />
          <Stat label="Mean ÷ median" value={infiniteMean ? '–' : sig(view.mean / view.median)} sub={infiniteMean ? ['no finite mean'] : [`sample ${sig(view.mean)} ÷ ${sig(view.median)}`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--muted)', label: 'count per bin' },
            { color: 'var(--bad)', label: 'beyond p99' },
            { color: 'var(--violet)', label: 'exact density', shape: 'line' },
            { color: 'var(--hi)', label: 'mean', shape: 'line' },
            { color: 'var(--info)', label: 'median', shape: 'line' },
            { color: 'var(--orange)', label: 'p99', shape: 'line' },
            { color: 'var(--bad)', label: 'p99.9', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Shape" value={family} onChange={(f) => { setFamily(f); setPresetId(null); }} options={FAMILY_OPTIONS} />
        </>,
        <>
          {family === 'normal' && (
            <>
              <Slider label="Mean μ" value={shapes.normal.mu} {...BOUNDS.normalMu} onChange={(mu) => change('normal', { mu })} />
              <Slider label="Spread σ" value={shapes.normal.sigma} {...BOUNDS.normalSigma} onChange={(sigma) => change('normal', { sigma })} />
            </>
          )}
          {family === 'exponential' && (
            <Slider label="Mean" value={shapes.exponential.mean} {...BOUNDS.expMean} onChange={(mean) => change('exponential', { mean })} />
          )}
          {family === 'lognormal' && (
            <>
              <Slider label="μ of ln x" value={shapes.lognormal.mu} {...BOUNDS.logMu} step={0.1} format={(v) => v.toFixed(1)} onChange={(mu) => change('lognormal', { mu })} />
              <Slider label="σ of ln x" value={shapes.lognormal.sigma} {...BOUNDS.logSigma} step={0.05} format={(v) => v.toFixed(2)} onChange={(sigma) => change('lognormal', { sigma })} />
            </>
          )}
          {family === 'pareto' && (
            <>
              <Slider label="Minimum xm" value={shapes.pareto.xm} {...BOUNDS.paretoXm} onChange={(xm) => change('pareto', { xm })} />
              <Slider label="Shape α" value={shapes.pareto.alpha} {...BOUNDS.paretoAlpha} step={0.1} format={(v) => v.toFixed(1)} onChange={(alpha) => change('pareto', { alpha })} />
            </>
          )}
          <Hint>Sliders stop at their ends: {BOUND_TEXT[family]}. {family === 'pareto' ? moment(dist) : ''}</Hint>
        </>,
        <>
          <ControlGroup label="Presets" inline>
            {PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={presetId === p.id} onClick={() => loadPreset(p.id)}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
          <ControlGroup label="Bins" inline>
            <ChipButton tone="info" on={view.mode === 'linear'} onClick={() => setMode('linear')}>Linear bins</ChipButton>
            <ChipButton tone="info" on={view.mode === 'log'} disabled={!logBinsAllowed(dist)} title={logBinsAllowed(dist) ? undefined : LOG_REASON} onClick={() => setMode('log')}>
              {logBinsAllowed(dist) ? 'Log bins' : 'Log bins (needs positive values)'}
            </ChipButton>
          </ControlGroup>
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="stage-pad dist-stage">
        <div className="dist-row">
          <Plot2D
            x={{ domain: view.domain, log: view.mode === 'log', label: view.mode === 'log' ? 'value (log scale)' : 'value', ticks: 5 }}
            y={{ domain: [0, top], label: 'draws per bin', ticks: Y_TICKS }}
            ariaLabel={`Histogram of ${view.n} ${FAMILY_NAME[family]} draws; median ${sig(view.median)}, p99 ${sig(view.p99)}`}
          >
            <Bars bars={bars} tone="muted" />
            <Curve {...curve} tone="violet" />
            {!infiniteMean && inAxis(view.mean) && <VLine at={view.mean} tone="hi" />}
            {inAxis(view.median) && <VLine at={view.median} tone="info" />}
            {inAxis(view.p99) && <VLine at={view.p99} tone="orange" label="p99" />}
            {inAxis(view.p999) && <VLine at={view.p999} tone="bad" label="p99.9" />}
          </Plot2D>
          <Box className="dist-table">
            <SectionTitle hint={`${N_DRAWS.toLocaleString('en-US')} draws, sample beside exact`}>Sample vs exact</SectionTitle>
            <table className="data-table">
              <thead>
                <tr><th>statistic</th><th>sample</th><th>exact</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>{r.label}</td>
                    <td>{sig(r.sample)}</td>
                    <td>{r.exact === null ? 'no finite mean' : sig(r.exact)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {infiniteMean && (
              <Hint tone="muted" block>
                Sample mean after {RUNNING_AT.map((k) => k.toLocaleString('en-US')).join(', ')} draws: {view.runningMeans.map((m) => sig(m)).join(', ')}.
                With no finite mean there is nothing for it to settle on.
              </Hint>
            )}
          </Box>
        </div>
        {view.outside > 0 && (
          <Hint className="dist-note">{view.outside.toLocaleString('en-US')} of {view.n.toLocaleString('en-US')} draws lie past the right edge of the axis (the tail runs on); they still count in every number above.</Hint>
        )}
        {mode === 'log' && !logBinsAllowed(dist) && <Hint className="dist-note">{LOG_REASON} Showing linear bins.</Hint>}
        <div className="dist-chips">
          <Provenance kind="simulated" seed={seed}>{N_DRAWS.toLocaleString('en-US')} seeded draws; the violet curve is exact, not simulated</Provenance>
          <Provenance kind="illustrative">parameters are made up; no real service is measured</Provenance>
        </div>
        {preset && <Hint tone="muted" className="dist-note">{preset.note}</Hint>}
      </div>
    </StageFrame>
  );
}
