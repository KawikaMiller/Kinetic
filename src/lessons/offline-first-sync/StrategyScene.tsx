import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { strategyCaption } from './captions';
import { HORIZON_MS, scheduleConfig, randomScript } from './check';
import { initialStrategy, pickSchedule, pickStrategy, SKEW_STEP } from './init';
import { opText, STRATEGIES, type Strategy } from './ops';
import { ReplicaCard } from './ReplicaCard';
import { runConfig } from './runs';
import { PRESET_UNTIL_MS, PRESETS, SKEW_MAX_S, presetById, presetConfig } from './scenarios';
import { BROKEN_SEED_ARRIVAL } from './seeds';
import type { Timed } from './nodes';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--orange)', label: 'a conflict kept for the user' },
      { color: 'var(--bad)', label: 'an acknowledged edit that disappeared, or replicas that disagree' },
      { color: 'var(--ok)', label: 'replicas that agree' },
      { color: 'var(--dim)', label: 'a deleted item (tombstone)' },
    ]}
  />
);
const SHORT: Record<Strategy, string> = { lww: 'last write wins', field: 'per-field', merge: 'merge', manual: 'manual', arrival: 'arrival order (broken)' };
const STRATEGY_OPTIONS = STRATEGIES.map((s) => ({ value: s.id, label: SHORT[s.id] }));
const SCHEDULE_NOTE_RANDOM = 'A seeded random schedule: ten edits from both devices over twenty seconds, the phone offline for eleven, on a slow, lossy, duplicating network with a partition, a crash and a pause.';

const describe = (t: Timed) => {
  const a = t.action;
  const what =
    a.kind === 'add' ? `adds "${a.title}"` : a.kind === 'rename' ? `renames item ${a.pick + 1} to "${a.title}"` : a.kind === 'tick' ? `ticks item ${a.pick + 1}` : a.kind === 'delete' ? `deletes item ${a.pick + 1}` : 'presses +1 on the counter';
  return `${(t.at / 1000).toFixed(1)} s: the ${t.device} ${what}`;
};

export function StrategyScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState(initialStrategy);
  const preset = st.schedule === 'random' ? null : st.schedule;
  const random = preset === null;
  const run = useMemo(
    () => (preset === null ? runConfig(scheduleConfig(st.seed, st.strategy, true, st.skewSec * 1000), HORIZON_MS) : runConfig(presetConfig(preset, st.strategy, st.skewSec), PRESET_UNTIL_MS)),
    [st, preset],
  );
  const script = preset === null ? randomScript(st.seed) : presetById(preset).script;
  const lostCount = run.lost.length;

  return (
    <StageFrame
      height={760}
      legend={LEGEND}
      intro={strategyCaption(run, st.strategy)}
      introKey={`${st.strategy}|${st.schedule}|${st.skewSec}|${st.seed}`}
      stats={
        <Stats>
          <Stat label="Replicas" value={run.converged ? 'agree' : 'differ'} color={run.converged ? 'var(--ok)' : 'var(--bad)'} sub="phone, laptop and server, at the end" />
          <Stat label="Lost updates" value={lostCount} color={lostCount > 0 ? 'var(--bad)' : 'var(--ok)'} sub="acknowledged, nowhere to be seen" />
          <Stat label="Conflicts listed" value={run.views.server.conflicts.length} color={run.views.server.conflicts.length > 0 ? 'var(--orange)' : undefined} sub="kept for the user" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented<Strategy> label="Conflict strategy" value={st.strategy} options={STRATEGY_OPTIONS} onChange={(strategy) => setSt((s) => pickStrategy(s, strategy))} />
        </>,
        <>
          <ControlGroup label="Edit script" inline>
            {PRESETS.map((p) => (
              <ChipButton key={p.id} on={st.schedule === p.id} onClick={() => setSt((s) => pickSchedule(s, p.id))}>
                {p.label}
              </ChipButton>
            ))}
            <ChipButton on={random} onClick={() => setSt((s) => pickSchedule(s, 'random'))}>seeded random schedule</ChipButton>
          </ControlGroup>
          <Slider label="Laptop clock ahead by" value={st.skewSec} min={0} max={SKEW_MAX_S} step={SKEW_STEP} format={(n) => (n === 0 ? 'nothing' : `${n} s`)} onChange={(skewSec) => setSt((s) => ({ ...s, skewSec }))} />
          {random && <SeedField seed={st.seed} onSeed={(seed) => setSt((s) => ({ ...s, seed }))} />}
          <Hint tone="muted">The slider moves only the last-write-wins strategies: the merge ones never read a wall clock.</Hint>
        </>,
      ]}
    >
      <div className="ofs-stage stage-pad">
        <Box>
          <SectionTitle hint={preset === null ? SCHEDULE_NOTE_RANDOM : presetById(preset).note}>What the two devices did</SectionTitle>
          <ol className="ofs-script">
            {script.slice(0, 12).map((t, i) => (
              <li key={i}>{describe(t)}</li>
            ))}
            {script.length > 12 && <li>and {script.length - 12} more</li>}
          </ol>
        </Box>
        <div className="ofs-devices ofs-three">
          <ReplicaCard name="Phone" view={run.views.phone} rolledBack={run.phone.notices} skipped={run.phone.skipped} />
          <ReplicaCard name="Laptop" view={run.views.laptop} rolledBack={run.laptop.notices} skipped={run.laptop.skipped} />
          <ReplicaCard name="Server" view={run.views.server} />
        </div>
        <Box>
          <SectionTitle hint="computed from the operation history and the final list">What was lost</SectionTitle>
          {run.lost.length === 0 ? (
            <p className="ofs-note">Nothing: every acknowledged edit is in the list, was overwritten by a later edit that had seen it, or is in a conflict above.</p>
          ) : (
            <ul className="ofs-lost">
              {run.lost.slice(0, 6).map((l) => (
                <li key={l.op.id}>
                  <b>{opText(l.op)}</b>: {l.reason}
                </li>
              ))}
              {run.lost.length > 6 && <li>and {run.lost.length - 6} more</li>}
            </ul>
          )}
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={random ? st.seed : undefined}>{random ? 'a seeded fault schedule on the distributed-sim harness' : 'a scripted example on a quiet simulated network'}</Provenance>
          <Provenance kind="toy">a replicated list, not Automerge or Yjs; the merge rules are this lesson's own simplification</Provenance>
          {st.strategy === 'arrival' && <Provenance kind="scripted">broken on purpose: the lowest seed on which it fails is {BROKEN_SEED_ARRIVAL}</Provenance>}
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
