import { useMemo } from 'react';
import { HLine, Plot2D, Points, type PlotPoint } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { decimal } from '../../core/format';
import { panelCaption, percent, twoDp } from './captions';
import { PANEL_BOUNDS, SCATTER_POINTS, makePool, runPanel } from './model';
import type { PanelState, SceneProps } from './opening';

const PLOT = { width: 356, height: 300 } as const;
const SKILL_DOMAIN = 4;
const SCORE_DOMAIN = 6;
const clamp = (v: number): number => Math.max(-SCORE_DOMAIN, Math.min(SCORE_DOMAIN, v));

/** Scene 1: one panel, one decision. The scatter shows who is hired, who is missed and who is a false hire. */
export function PanelScene({ picker, seed, onSeed, state, onState }: SceneProps & { state: PanelState; onState: (next: PanelState) => void }) {
  const hireShare = state.hire / 100;
  const pool = useMemo(() => makePool(seed), [seed]);
  const res = useMemo(() => runPanel(pool, { k: state.k, sigma: state.sigma, rho: state.rho }, hireShare), [pool, state.k, state.sigma, state.rho, hireShare]);
  const layers = useMemo(() => {
    const groups: Record<'hit' | 'false' | 'miss' | 'plain', PlotPoint[]> = { hit: [], false: [], miss: [], plain: [] };
    for (let i = 0; i < SCATTER_POINTS; i += 1) {
      const hired = res.hiredSet.has(i);
      const top = res.topSet.has(i);
      const point = { x: pool.skill[i], y: clamp(res.scores[i]) };
      groups[hired ? (top ? 'hit' : 'false') : top ? 'miss' : 'plain'].push(point);
    }
    return groups;
  }, [pool, res]);
  const set = (change: Partial<PanelState>) => onState({ ...state, ...change });

  return (
    <StageFrame
      height={640}
      intro={panelCaption(state.k, state.sigma, state.hire, res)}
      introKey={`${seed}|${state.k}|${state.sigma}|${state.hire}|${state.rho}`}
      stats={
        <Stats>
          <Stat label="Score against skill, r" value={twoDp(res.rFormula)} sub={`formula; ${twoDp(res.rPool)} measured in this pool`} />
          <Stat label="True top found" value={percent(res.recallFormula)} color="var(--ok)" sub={`formula; ${percent(res.recallPool)} in this pool (${res.hits} of ${res.hired})`} />
          <Stat label="False hires" value={res.falseHires} color="var(--orange)" sub={`hired, but outside the true top ${state.hire}%, of ${res.hired} hired`} />
          <Stat label="Independent interviewers" value={decimal(res.effective, 2)} sub={`of ${state.k}: k / (1 + (k − 1) rho)`} />
        </Stats>
      }
      legend={<Legend items={[
        { color: 'var(--ok)', label: 'hired and in the true top group', shape: 'dot' },
        { color: 'var(--bad)', label: 'in the true top group, missed', shape: 'dot' },
        { color: 'var(--orange)', label: 'hired, outside the true top group (a false hire)', shape: 'dot' },
        { color: 'var(--muted)', label: 'neither', shape: 'dot' },
        { color: 'var(--dim)', label: 'the hire line', shape: 'line' },
      ]} />}
      controls={[
        <>{picker}<SeedField seed={seed} onSeed={onSeed} /></>,
        <>
          <Slider label="Interviewers k" value={state.k} {...PANEL_BOUNDS.k} onChange={(k) => set({ k })} />
          <Slider label="Noise per interview" value={state.sigma} {...PANEL_BOUNDS.sigma} format={(v) => v.toFixed(1)} onChange={(sigma) => set({ sigma })} />
        </>,
        <>
          <Slider label="Hire rate" value={state.hire} {...PANEL_BOUNDS.hire} format={(v) => `${v}%`} onChange={(hire) => set({ hire })} />
          <Slider label="Agreed before scoring (error correlation)" value={state.rho} {...PANEL_BOUNDS.rho} format={(v) => v.toFixed(1)} onChange={(rho) => set({ rho })} />
        </>,
      ]}
    >
      <div className="hi-stage stage-pad">
        <Hint tone="muted" block>
          {`${SCATTER_POINTS} of the ${pool.n.toLocaleString('en-US')} candidates are drawn; every number is computed from all ${pool.n.toLocaleString('en-US')}. Each candidate has a hidden skill; an interviewer's score is that skill plus an error, and the panel averages k scores. Scores beyond ±${SCORE_DOMAIN} are drawn on the edge.`}
        </Hint>
        <Plot2D x={{ domain: [-SKILL_DOMAIN, SKILL_DOMAIN], label: 'true skill' }} y={{ domain: [-SCORE_DOMAIN, SCORE_DOMAIN], label: "panel's mean score" }} width={PLOT.width} height={PLOT.height} ariaLabel={`Panel mean score against true skill for ${SCATTER_POINTS} candidates, with the hire line`}>
          <Points data={layers.plain} tone="muted" r={3} />
          <Points data={layers.miss} tone="bad" r={4} />
          <Points data={layers.false} tone="orange" r={4} />
          <Points data={layers.hit} tone="ok" r={4} />
          <HLine at={clamp(res.cutoff)} label="hire line" tone="dim" />
        </Plot2D>
        <Hint tone="muted" block>
          A correlation of 1 between the interviewers&apos; errors is not offered: it would make the number of interviewers irrelevant, since four people whose errors move exactly together are worth one.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="toy">candidates, scores and errors are drawn from normal distributions; this shows the arithmetic of variance, not how any real process behaves</Provenance>
          <Provenance kind="invented">every constant is made up; the numbers are arithmetic from invented constants, not measurements of any real process</Provenance>
          <Provenance kind="simulated" seed={seed}>a seeded pool of {pool.n.toLocaleString('en-US')} candidates</Provenance>
          <ClaimLabel kind="standard">averaging independent noisy scores raises their correlation with the truth; the formula is computed above</ClaimLabel>
          <ClaimLabel kind="practice">scoring independently before discussing, to avoid anchoring, is a common practice; the agreement control shows its arithmetic</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
