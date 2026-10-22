import { useMemo, useState, type ReactNode } from 'react';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { toSequence } from '../../core/distSim';
import { messageLabel, strategyCaption } from './captions';
import { HORIZON_MS, SEED_COUNT, convergence, noSilentLoss, scheduleConfig, randomScript } from './check';
import { initialStrategy, pickSchedule, pickStrategy, SKEW_STEP } from './init';
import { lostEdits, opText, STRATEGIES, type Strategy } from './ops';
import { ReplicaCard } from './ReplicaCard';
import { runConfig } from './runs';
import { PRESET_UNTIL_MS, PRESETS, SKEW_MAX_S, presetById, presetConfig } from './scenarios';
import { BROKEN_FACTS, BROKEN_SEED_ARRIVAL, BROKEN_SEED_LWW } from './seeds';
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

const TRACE_CAP = 14;
const BROKEN_SEEDS = { arrival: BROKEN_SEED_ARRIVAL, lww: BROKEN_SEED_LWW } as const;

/** What breaks, in words, for one of the two broken modes; every number is from the pinned facts. */
const brokenCause = (strategy: 'arrival' | 'lww'): string =>
  strategy === 'arrival'
    ? `It fails on ${BROKEN_FACTS.arrival.fails} of ${SEED_COUNT} seeded schedules, and on ${BROKEN_FACTS.arrival.failsOnQuietNetwork} of ${SEED_COUNT} even on a quiet network with no loss, duplication or reordering. So reordering is not the cause: with no ids and no merge, a copy that arrives twice is applied twice, and concurrent edits are applied in a different order on each replica.`
    : `It fails on ${BROKEN_FACTS.lww.fails} of ${SEED_COUNT} seeded schedules, ${BROKEN_FACTS.lww.failsWithoutCounter} of them with the counter taken out of the script. The whole item (and the counter, a last-write-wins register here) takes the value with the latest device clock, so a concurrent edit is dropped with nothing listed.`;

const describe = (t: Timed) => {
  const a = t.action;
  const what =
    a.kind === 'add' ? `adds "${a.title}"` : a.kind === 'rename' ? `renames an item to "${a.title}"` : a.kind === 'tick' ? 'ticks an item' : a.kind === 'delete' ? 'deletes an item' : 'presses +1 on the counter';
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
  const lostCount = lostEdits(run.lost);
  const broken = st.strategy === 'arrival' || st.strategy === 'lww' ? st.strategy : null;
  const snap = { time: run.snap.time, nodes: run.snap.nodes };
  const violation = !random || broken === null ? null : broken === 'arrival' ? convergence('arrival')(snap) : noSilentLoss('lww')(snap);
  const ladder = useMemo(() => toSequence(run.trace.filter((r) => r.payload && ['push', 'ack', 'reject'].includes(r.payload.type)), { label: messageLabel }), [run]);
  const ladderMessages = ladder.messages.slice(0, TRACE_CAP);

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
        {broken !== null && (
          <Box>
            <SectionTitle hint="the checker's verdict on this run, and what the pinned seed means">Where the invariant breaks</SectionTitle>
            {random ? (
              <>
                <p className="ofs-note">
                  {violation === null ? `The invariant holds on seed ${st.seed}. ` : <b className="ofs-violation">Violated on seed {st.seed}: {violation}. </b>}
                  Seed {BROKEN_SEEDS[broken]} is the lowest failing seed of {SEED_COUNT}, and that means little: nearly every seed fails. {brokenCause(broken)}
                </p>
                {ladderMessages.length > 0 && (
                  <SequenceDiagram actors={ladder.actors} messages={ladderMessages} fit="all" ariaLabel="The first pushes, acknowledgements and rejections of this run, lost ones marked" />
                )}
                <p className="ofs-note">The ladder shows the first {Math.min(TRACE_CAP, ladder.messages.length)} of {ladder.messages.length} pushes and replies; the violation is read at the end of the run, once everything is delivered.</p>
              </>
            ) : (
              <p className="ofs-note">The pinned seed belongs to the seeded random schedule. Pick it to see the checker's verdict and the trace. {brokenCause(broken)}</p>
            )}
          </Box>
        )}
        <ProvenanceRow>
          <Provenance kind="simulated" seed={random ? st.seed : undefined}>{random ? 'a seeded fault schedule on the distributed-sim harness' : 'a scripted example on a quiet simulated network'}</Provenance>
          <Provenance kind="toy">a replicated list, not Automerge or Yjs; the merge rules are this lesson's own simplification</Provenance>
          {broken !== null && <Provenance kind="simulated">broken on purpose, and found by the checker: lowest failing seed {BROKEN_SEEDS[broken]}, failing on {BROKEN_FACTS[broken].fails} of {SEED_COUNT}</Provenance>}
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
