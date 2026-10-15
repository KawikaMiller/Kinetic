import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bars, Curve, Plot2D, Segments, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { ChainGraph } from './ChainGraph';
import { MatrixTable } from './MatrixTable';
import { DISTANCE_FLOOR, FORGET_STEPS, GUIDE_ANCHOR, WEATHER_STATES, analyse, distributionAt, guideSeries, secondEigenvalues, startDistribution, stationarySolve, tvSeries } from './model';
import { rowControls, useRowEditor } from './rowEditor';
import { forgetCaption, lambdaText, measuredRatio, num3, prob } from './text';
import type { Chain } from './useChain';

const AXIS_FLOOR = 1e-9;
const BAR_INSET = 0.15;

type Start = number | 'even';
const START_OPTIONS: { value: Start; label: string }[] = [...WEATHER_STATES.map((s, i) => ({ value: i as Start, label: s })), { value: 'even', label: 'Even mix' }];

export function ForgetScene({ picker, chain }: { picker: ReactNode; chain: Chain }) {
  const { P } = chain;
  const [start, setStart] = useState<Start>(0);
  const [t, setT] = useState(0);
  const rows = useRowEditor(P, chain.setRow);
  const pi = useMemo(() => stationarySolve(P), [P]);
  const lambdas = useMemo(() => secondEigenvalues(P), [P]);
  const analysis = useMemo(() => analyse(P), [P]);
  const series = useMemo(() => (pi ? tvSeries(P, startDistribution(P.length, start), pi, FORGET_STEPS) : null), [P, pi, start]);
  const tv = series ? series[t] : null;
  const prevTv = series && t > 0 ? series[t - 1] : null;
  const ratio = measuredRatio(prevTv, tv);
  const settles = analysis.settles && analysis.uniqueStationary && lambdas.slem < 1 - 1e-9;
  const guide = series && settles ? guideSeries(series, lambdas.slem) : null;
  const mu = distributionAt(P, startDistribution(P.length, start), t);

  const caption = forgetCaption({ t, tv, prevTv, lambdas, settles: analysis.settles, uniquePi: !!pi });
  const setCaption = useSetCaption();
  useEffect(() => {
    setCaption(caption, { quiet: true });
  }, [caption, setCaption]);

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat label="Distance at step t" value={tv === null ? '–' : tv.toExponential(2)} color="var(--bad)" sub={tv === null ? 'no unique π' : `step ${t} of ${FORGET_STEPS}`} />
          <Stat label="Second eigenvalues" value={lambdas.kind === 'real' ? `${num3(lambdas.l2)}, ${num3(lambdas.l3)}` : `${num3(lambdas.re)} ± ${num3(Math.abs(lambdas.im))}i`} color="var(--violet)" sub={lambdas.kind === 'real' ? `decay rate ${num3(lambdas.slem)}` : `modulus ${num3(lambdas.modulus)}: the curve wobbles`} />
          <Stat label="Measured ratio" value={ratio === null ? '–' : num3(ratio)} sub={ratio === null ? 'needs a step before this one' : `distance now ÷ distance one step ago`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'total variation distance to π (the cost of not having converged)', shape: 'line' },
            { color: 'var(--violet)', label: `the |λ|^t guide, through the measured point at step ${GUIDE_ANCHOR}`, shape: 'line' },
            { color: 'var(--info)', label: 'the distribution at step t' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Start" value={start} onChange={setStart} options={START_OPTIONS} />
          <Slider label="Step t" value={t} min={0} max={FORGET_STEPS} onChange={setT} />
        </>,
        ...rowControls({ states: WEATHER_STATES, P, row: rows.row, onRow: rows.pick, onEntry: chain.setEntry, onRowText: rows.apply, draft: rows.draft, setDraft: rows.type, error: rows.error }),
        <>
          <Button onClick={chain.reset}>Reset weather chain</Button>
          <Hint>For a 3-state chain the eigenvalues are 1 and the roots of x² − (trace − 1) x + determinant = 0 ({lambdaText(lambdas)} here).</Hint>
        </>,
      ]}
    >
      <div className="mc-stage stage-pad">
        <div className="mc-visual">
          {series ? (
            <Plot2D
              x={{ domain: [0, FORGET_STEPS] as const, label: 'step t', ticks: 5 }}
              y={{ domain: [AXIS_FLOOR, 1] as const, log: true, label: 'distance to π', ticks: 5 }}
              ariaLabel={`Distance to the stationary distribution over ${FORGET_STEPS} steps, now at step ${t}`}
            >
              <Curve points={series.map((v, k): [number, number] => [k, Math.max(DISTANCE_FLOOR, v)])} tone="bad" />
              {guide && <Curve points={guide.map((v, k): [number, number] => [k, v])} tone="violet" dashed />}
              <VLine at={t} />
            </Plot2D>
          ) : (
            <p className="mc-note">No unique stationary distribution, so there is no single distance to follow.</p>
          )}
        </div>
        <div className="mc-visual">
          <Plot2D
            x={{ domain: [0, P.length] as const, tickValues: WEATHER_STATES.map((_, i) => i + 0.5), format: (v) => WEATHER_STATES[Math.floor(v)] ?? '' }}
            y={{ domain: [0, 1] as const, label: 'probability', ticks: 5 }}
            ariaLabel={`The distribution at step ${t}`}
          >
            <Bars bars={mu.map((p, i) => ({ x0: i + BAR_INSET, x1: i + 1 - BAR_INSET, y: p }))} tone="info" />
            {pi && <Segments segments={pi.map((p, i) => ({ from: [i + BAR_INSET / 2, p] as [number, number], to: [i + 1 - BAR_INSET / 2, p] as [number, number], tone: 'violet' as const }))} />}
          </Plot2D>
        </div>
        <div className="mc-visual">
          <ChainGraph states={WEATHER_STATES} P={P} ariaLabel="The weather chain" />
          <MatrixTable states={WEATHER_STATES} P={P} row={rows.row} />
          <p className="mc-note">{WEATHER_STATES.map((s, i) => `${s} ${prob(mu[i])}`).join(' · ')}</p>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the distribution is stepped exactly (π₍t₎ = π₍t−1₎ P), not simulated; the eigenvalues are closed-form</Provenance>
        <Provenance kind="illustrative">the weather numbers are invented</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
