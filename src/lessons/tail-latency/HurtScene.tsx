import { useState, type ReactNode } from 'react';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pctText } from '../distributions/fmt';
import { hurtCaption, msText } from './frames';
import { MM1, MM1_DEFAULT_RHO, MM1_RHO, crossoverRho, hedgingHurts, mm1Hedging } from './model';

const Y_MAX = 1000;
const KEY_STEP = 0.01;
const clampRho = (v: number) => Math.min(MM1_RHO.max, Math.max(MM1_RHO.min, Math.round(v * 100) / 100));

export function HurtScene({ picker }: { picker: ReactNode }) {
  const [rho, setRho] = useState(MM1_DEFAULT_RHO);
  const r = mm1Hedging(rho);
  const cross = crossoverRho();
  const hurts = hedgingHurts(r);

  useIntroCaption(hurtCaption(r), [rho]);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label={<span className="keep-case">p99, no hedging</span>} value={msText(r.plainP99)} color="var(--info)" sub={['ln(100) / (μ(1 − ρ))', 'exact']} />
          <Stat
            label={<span className="keep-case">p99, hedged</span>}
            value={r.hedgedP99 === null ? 'overloaded' : msText(r.hedgedP99)}
            color={hurts ? 'var(--bad)' : 'var(--ok)'}
            sub={[r.loadedRho === null ? 'the hedges push ρ′ to 100% or past it' : `load with hedges: ρ′ = ${pctText(r.loadedRho, 1)}`, 'exact']}
          />
          <Stat label="Extra load" value={r.extra === null ? '–' : pctText(r.extra, 1)} color="var(--orange)" sub={[`a hedge after ${MM1.hedgeAfterMs} ms`, 'hedges are not cancelled here']} />
          <Stat label="Hedging starts to hurt at" value={cross === null ? 'never' : pctText(cross, 0)} sub="the first ρ, on a 1% grid, where the hedged p99 is no better" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'p99 without hedging', shape: 'line' },
            { color: 'var(--violet)', label: 'p99 with hedging', shape: 'line' },
            { color: 'var(--hi)', label: 'your ρ', shape: 'line' },
            { color: 'var(--orange)', label: 'crossover', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Utilisation ρ" value={rho} {...MM1_RHO} format={(v) => pctText(v, 0)} onChange={setRho} />
        </>,
      ]}
    >
      <div className="tl-stage stage-pad">
        <Plot2D
          x={{ domain: [MM1_RHO.min, MM1_RHO.max], label: 'utilisation ρ', format: (v) => pctText(v, 0), ticks: 5 }}
          y={{ domain: [0, Y_MAX], label: 'p99 (ms)', ticks: 4 }}
          ariaLabel={`p99 against utilisation with and without hedging; at ${pctText(rho, 0)} hedging ${hurts ? 'hurts' : 'helps'}`}
        >
          <Curve fn={(x) => mm1Hedging(Math.round(x * 100) / 100).plainP99} tone="info" />
          <Curve fn={(x) => mm1Hedging(Math.round(x * 100) / 100).hedgedP99 ?? NaN} tone="violet" />
          {cross !== null && <VLine at={cross} tone="orange" label="crossover" dashed />}
          <VLine
            at={rho}
            tone="hi"
            onDrag={(x) => setRho(clampRho(x))}
            onStep={(dir) => setRho((v) => clampRho(v + dir * KEY_STEP))}
            ariaLabel="Utilisation"
            valueText={`${pctText(rho, 0)} utilisation, hedging ${hurts ? 'hurts' : 'helps'}`}
          />
        </Plot2D>
        <ProvenanceRow>
          <Provenance kind="illustrative">a single M/M/1 backend at μ = {MM1.mu}/s, hedge after {MM1.hedgeAfterMs} ms: made-up numbers</Provenance>
          <Provenance kind="from-memory">the M/M/1 time in system is exponential with rate μ(1 − ρ): verify against a queueing text</Provenance>
        </ProvenanceRow>
        <Hint tone="muted" className="tl-note">
          Simplifications, stated: hedges are not cancelled, so each one is real load; the hedge&apos;s own latency is treated as an independent draw (a real second copy would queue behind the same work, so this flatters the hedge), and ρ′ = ρ(1 + P(T &gt; h)) is solved as a fixed point; arrivals
          are Poisson and service exponential. Past the crossover the p99 you buy back is smaller than the queue you build. The plot stops where the hedges overload the backend.
        </Hint>
      </div>
    </StageFrame>
  );
}
