import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { counterCaption } from './captions';
import { DURATION_SEED, inputRecords, sideEffectCount, taskName, mapId } from './cluster';
import { ClusterPane, TimeControls } from './ClusterPane';
import { counterRun } from './facts';
import { initialCounterScene } from './init';
import { jobEnd, worldAt } from './timeline';

export function CounterScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialCounterScene);
  const [playing, setPlaying] = useState(false);
  const { seed, sideEffect } = state;

  const run = useMemo(() => counterRun(seed), [seed]);
  const end = jobEnd(run);
  const now = Math.min(state.at ?? end, end);
  const records = inputRecords(run.plan);
  const counterNow = sideEffectCount(worldAt(run, now));
  const counterEnd = sideEffectCount(run.world);
  const leaked = counterEnd !== records;

  useIntroCaption(counterCaption(run, sideEffect, seed), [run, sideEffect, seed]);

  const attempts = Array.from({ length: run.plan.mappers }, (_, i) => run.world.attempts.filter((a) => a.task === mapId(i)));
  const change = (patch: Partial<typeof state>) => {
    setPlaying(false);
    setState((s) => ({ ...s, at: null, ...patch }));
  };

  return (
    <StageFrame
      height={580}
      stats={
        <Stats>
          <Stat
            label="External counter"
            value={sideEffect ? counterNow : '–'}
            color={sideEffect && now >= end ? (leaked ? 'var(--bad)' : 'var(--ok)') : undefined}
            sub={sideEffect ? [`${records} records in the input`, now >= end ? (leaked ? `${counterEnd - records} too many` : 'matches the input') : `at tick ${now}`] : 'not used: the map function is pure'}
          />
          <Stat label="Word counts" value={run.correct ? 'right' : 'wrong'} color={run.correct ? 'var(--ok)' : 'var(--bad)'} sub="against a plain count, either way" />
          <Stat label="Failures" value={run.cfg.kills.length} sub={`from seed ${seed}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'map task', shape: 'square' },
            { color: 'var(--violet)', label: 'reduce task', shape: 'square' },
            { color: 'var(--bad)', label: 'a lost attempt (✕), a task run again (↻), and a leaked counter', shape: 'square' },
            { color: 'var(--ok)', label: 'right word counts, and a counter that matches', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Map function" value={sideEffect} onChange={(s) => change({ sideEffect: s })} off="Pure" on="Bumps an external counter" />
          <SeedField key={seed} seed={seed} onSeed={(s) => change({ seed: s })} />
        </>,
        <TimeControls key="time" run={run} now={now} onNow={(t) => setState((s) => ({ ...s, at: t }))} playing={playing} onPlaying={setPlaying} />,
      ]}
    >
      <div className="mr-stage stage-pad">
        <ClusterPane run={run} now={now} hint="the failure schedule comes from the seed" />
        <Box>
          <SectionTitle hint="each map task and how many times it ran">Map attempts</SectionTitle>
          <ul className="mr-partials">
            {attempts.map((list, i) => (
              <li key={i} className={list.length > 1 ? 'mr-bad' : ''}>
                {taskName(mapId(i))}: {plural(list.length, 'attempt')}
                {list.length > 1 ? ', so its records were handled more than once' : ''}
              </li>
            ))}
          </ul>
          <p className="mr-note">Tasks can be retried safely when they are deterministic and side-effect free, or when the side effect is idempotent, like writing the same record to the same key. See the idempotency-keys lesson.</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>the failure schedule is seeded (up to two failures at random workers and times); durations are seeded numbers of ticks (seed {DURATION_SEED})</Provenance>
          <Provenance kind="illustrative">the counter stands for any outside effect: a database write, an email, a metrics bump</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
