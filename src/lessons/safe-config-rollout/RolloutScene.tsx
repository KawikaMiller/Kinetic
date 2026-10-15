import { useMemo, type ReactNode } from 'react';
import { CellGrid, type GridCellSpec, type GridHighlight } from '../../components/CellGrid';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { timeFrames } from '../../core/frames';
import { usePlayer } from '../../core/usePlayer';
import { momentCaption, summaryCaption } from './captions';
import {
  ALL_AT_ONCE, BAKE_MAX, CHANGES, FLEET, GATE_THRESHOLD, HUMAN_DETECT_MIN, REGIONS, ROLLBACK_MANUAL_MIN, REGION_SIZE, STAGE_CHOICES, bakingStage, endOf, simulate, statusAt, changeOf, planFrom,
  type ChangeId, type Result, type ServerStatus,
} from './model';
import type { PlanState } from './plan';

const STEP_MS = 420;
const HOLD = 2;

const CELL: Record<ServerStatus, GridCellSpec> = {
  unreached: { tone: 'dim', fill: 'outline' },
  healthy: { tone: 'ok', fill: 'tint' },
  failing: { tone: 'bad', fill: 'solid' },
  rolledback: { tone: 'info', fill: 'tint' },
};

/** The frames of a result: one per minute, with a caption that is true at that minute, and a held frame at every event. */
function framesFor(r: Result, caption: (now: number) => ReactNode, summary: ReactNode) {
  const end = endOf(r);
  const events = new Set<number>([0, ...r.stages.map((s) => s.start), ...r.failAt.flatMap((f) => (f === null ? [] : [f])), ...(r.detectedAt === null ? [] : [r.detectedAt]), ...(r.revertAt === null ? [] : [r.revertAt])]);
  const frames = timeFrames({
    end,
    steps: end,
    milestones: [...events].filter((t) => t > 0 && t < end).map((t) => ({ t, say: caption(t) })),
    intro: caption(0),
    summary,
    hold: HOLD,
  });
  return frames.map((f) => (f.say === undefined ? { ...f, say: caption(f.now), quiet: true } : f));
}

export function RolloutScene({ picker, staged, change, onChange, state, onState }: {
  picker: ReactNode;
  staged: boolean;
  change: ChangeId;
  onChange: (c: ChangeId) => void;
  state: PlanState;
  onState: (s: PlanState) => void;
}) {
  const c = changeOf(change);
  const plan = useMemo(() => (staged ? planFrom(state.stages, { bake: state.bake, gate: state.gate, validate: state.validate, autoRollback: state.autoRollback }) : ALL_AT_ONCE), [staged, state]);
  const result = useMemo(() => simulate(c, plan), [c, plan]);
  const frames = useMemo(
    () => framesFor(result, (now) => momentCaption(c, plan, result, now, staged), summaryCaption(c, plan, result, staged)),
    [result, c, plan, staged],
  );
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const now = player.frame.now;
  const baking = staged ? bakingStage(result, now) : null;
  const before = baking ? (plan.stages[plan.stages.indexOf(baking.size) - 1] ?? 0) : 0;
  const highlight: GridHighlight[] = baking
    ? Array.from({ length: baking.size - before }, (_, k) => before + k).map((s) => ({ r: Math.floor(s / REGION_SIZE), c: s % REGION_SIZE, tone: 'hi' as const }))
    : [];

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat label="Blast radius" value={result.refused ? '0' : result.serverMinutes.toLocaleString('en-US')} sub="server-minutes affected" color={result.serverMinutes > 0 ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Servers reached" value={`${result.reached} of ${FLEET}`} sub={result.peakFailing ? `${result.peakFailing} failed at most` : 'none failed'} />
          <Stat
            label="Seen"
            value={result.refused ? 'refused' : result.detectedAt === null ? 'nothing to see' : `minute ${result.detectedAt}`}
            sub={result.detectedBy === 'gate' ? 'by the health gate' : result.detectedBy === 'human' ? 'by a person' : undefined}
            color={result.refused ? 'var(--orange)' : undefined}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--dim)', label: 'not reached yet', shape: 'square' },
            { color: 'var(--ok)', label: 'has the change, healthy', shape: 'square' },
            { color: 'var(--bad)', label: 'failing', shape: 'square' },
            { color: 'var(--info)', label: 'rolled back', shape: 'square' },
            { color: 'var(--hi)', label: 'the stage being baked', shape: 'square' },
            { color: 'var(--orange)', label: 'refused by validation', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="The change" value={change} onChange={onChange} options={CHANGES.map((x) => ({ value: x.id, label: x.label }))} />
        </>,
        ...(staged
          ? [
              <>
                {STAGE_CHOICES.map((s) => (
                  <ChipButton
                    key={s.id}
                    tone="violet"
                    on={state.stages.includes(s.id)}
                    onClick={() => onState({ ...state, stages: state.stages.includes(s.id) ? state.stages.filter((x) => x !== s.id) : [...state.stages, s.id] })}
                  >
                    {s.label} ({s.size})
                  </ChipButton>
                ))}
                <Hint>then all {FLEET}</Hint>
                <Slider label="Bake" value={state.bake} min={0} max={BAKE_MAX} onChange={(bake) => onState({ ...state, bake })} format={(v) => `${v} min`} />
              </>,
              <>
                <Toggle label="Health gate" value={state.gate} onChange={(gate) => onState({ ...state, gate })} off="Off" on="On" />
                <Toggle label="Validate before push" value={state.validate} onChange={(validate) => onState({ ...state, validate })} off="Off" on="On" />
                <Toggle label="Rollback" value={state.autoRollback} onChange={(autoRollback) => onState({ ...state, autoRollback })} off="By hand" on="Automatic" />
              </>,
            ]
          : []),
      ]}
    >
      <div className="cr stage-pad">
        <div className="cr-grid">
          <CellGrid
            rows={REGIONS.length}
            cols={REGION_SIZE}
            size="sm"
            rowLabels={[...REGIONS]}
            cell={(r, col) => (result.refused ? { tone: 'orange', fill: 'outline' } : CELL[statusAt(result, r * REGION_SIZE + col, now)])}
            highlight={highlight}
            ariaLabel={`Fleet of ${FLEET} servers at minute ${now}`}
          />
        </div>
        <Hint block>
          {staged
            ? `The health gate checks every minute of a stage’s bake, and stops the rollout when more than ${Math.round(GATE_THRESHOLD * 100)}% of the servers reached are failing. Without a gate, a person notices ${HUMAN_DETECT_MIN} minutes after the first failure.`
            : `Pushed everywhere at once, with no gate and no validation: a person notices ${HUMAN_DETECT_MIN} minutes after the first failure, and rolls back by hand, which takes ${ROLLBACK_MANUAL_MIN}.`}
          {' '}Server-minutes counts each failing server from the minute it fails until the rollback reaches it.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated">a simulated fleet and traffic: whole minutes, invented numbers</Provenance>
          <ClaimLabel kind="practice">staged rollouts with a health gate are common practice for config, as for code</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
