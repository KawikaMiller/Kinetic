import { useMemo, useState } from 'react';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { FUNNEL_POOL, FUNNEL_TOP_SHARE, DEFAULT_STAGES, PANEL_BOUNDS, STAGE_NAMES, hiredShare, makeFunnelDraws, runFunnel, type StageSpec } from './model';
import { loopCaption, percent, twoDp } from './captions';
import type { SceneProps } from './opening';

const PHONE = 1;

/** Scene 2: a three-stage loop. Each stage keeps the top share of those still alive; the page shows where the true top group is lost. */
export function LoopScene({ picker, seed, onSeed }: SceneProps) {
  const [stages, setStages] = useState<readonly StageSpec[]>(DEFAULT_STAGES);
  const results = useMemo(() => runFunnel(makeFunnelDraws(seed), stages), [seed, stages]);
  const last = results[results.length - 1];
  const setStage = (i: number, change: Partial<StageSpec>) => setStages(stages.map((s, j) => (j === i ? { ...s, ...change } : s)));
  const noPhone = stages[PHONE].noSignal;

  return (
    <StageFrame
      height={640}
      intro={loopCaption(stages, results)}
      introKey={`${seed}|${JSON.stringify(stages)}`}
      stats={
        <Stats>
          <Stat label="Hired" value={percent(hiredShare(stages))} sub="the product of the three keep shares" />
          <Stat label="True top 10% found" value={percent(last.recall)} color="var(--info)" sub="of the true top 10% by skill, at the end" />
          <Stat label="Mean skill hired" value={twoDp(last.meanSkill)} sub="in skill standard deviations; the pool averages 0" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--muted)', label: 'share of the pool still alive', shape: 'square' }, { color: 'var(--info)', label: 'share of the true top group still alive', shape: 'square' }]} />}
      controls={[
        <>{picker}<SeedField seed={seed} onSeed={onSeed} /></>,
        ...stages.map((s, i) => (
          <div key={STAGE_NAMES[i]} className="hi-stage-controls">
            <Slider label={`${STAGE_NAMES[i]}: interviewers`} value={s.k} {...PANEL_BOUNDS.k} onChange={(k) => setStage(i, { k })} />
            <Slider label="noise" value={s.sigma} {...PANEL_BOUNDS.sigma} format={(v) => v.toFixed(1)} onChange={(sigma) => setStage(i, { sigma })} />
            <Slider label="keeps" value={Math.round(s.keep * 100)} {...PANEL_BOUNDS.keep} format={(v) => `${v}%`} onChange={(v) => setStage(i, { keep: v / 100 })} />
          </div>
        )),
        <>
          <Toggle label="No signal at the phone screen" value={noPhone} onChange={(noSignal) => setStage(PHONE, { noSignal })} off="Scores skill" on="Pure noise" />
        </>,
      ]}
    >
      <div className="hi-stage stage-pad">
        <Hint tone="muted" block>
          {`A pool of ${FUNNEL_POOL.toLocaleString('en-US')} seeded candidates, larger than the panel scene's so the percentages are steady. The true top ${Math.round(FUNNEL_TOP_SHARE * 100)}% is the best by skill; each stage scores only those still alive.`}
        </Hint>
        <div className="hi-cards">
          {results.map((r, i) => (
            <div key={STAGE_NAMES[i]} className="hi-card">
              <b>{STAGE_NAMES[i]}</b>
              <span>{stages[i].noSignal ? 'scores pure noise' : `${stages[i].k} interviewer${stages[i].k === 1 ? '' : 's'}, noise ${stages[i].sigma.toFixed(1)}`}; keeps {Math.round(stages[i].keep * 100)}%</span>
              <span className="hi-bar" aria-hidden="true"><span className="hi-bar-fill is-alive" style={{ width: `${r.share * 100}%` }} /></span>
              <span>{percent(r.share)} of the pool alive</span>
              <span className="hi-bar" aria-hidden="true"><span className="hi-bar-fill is-recall" style={{ width: `${r.recall * 100}%` }} /></span>
              <span>{percent(r.recall)} of the true top {Math.round(FUNNEL_TOP_SHARE * 100)}% alive</span>
              <span>mean true skill {twoDp(r.meanSkill)}</span>
            </div>
          ))}
        </div>
        <ProvenanceRow>
          <Provenance kind="toy">every stage is the same noisy-score model as the panel scene</Provenance>
          <Provenance kind="invented">the keep shares, noise levels and interviewers per stage are made up</Provenance>
          <Provenance kind="simulated" seed={seed}>a seeded pool of {FUNNEL_POOL.toLocaleString('en-US')} candidates</Provenance>
          <ClaimLabel kind="view">where to put signal in a loop, and how many people to keep at each stage, is a design choice with no single answer</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
