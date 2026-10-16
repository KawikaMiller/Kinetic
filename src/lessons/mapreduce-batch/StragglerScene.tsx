import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { CAUSES, stragglerCaption, type Cause } from './captions';
import { DURATION_SEED, SLOW_SPEED, WORKERS, evenSpeeds, slowLastSpeeds, taskName } from './cluster';
import { ClusterPane, TimeControls } from './ClusterPane';
import { initialStragglerScene } from './init';
import { EVEN_WORDS, HOT_SHARE, SKEWED_WORDS } from './text';
import { SIM_MAPPERS, SIM_REDUCERS, jobEnd, runCluster, worldAt } from './timeline';

const CAUSE_OPTIONS = (Object.keys(CAUSES) as Cause[]).map((c) => ({ value: c, label: CAUSES[c] }));
const runFor = (cause: Cause, speculate: boolean) =>
  runCluster({ words: cause === 'data' ? SKEWED_WORDS : EVEN_WORDS, speeds: cause === 'machine' ? slowLastSpeeds() : evenSpeeds(), speculate });

export function StragglerScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialStragglerScene);
  const [playing, setPlaying] = useState(false);
  const { cause, speculate, at } = state;

  const run = useMemo(() => runFor(cause, speculate), [cause, speculate]);
  const other = useMemo(() => runFor(cause, !speculate), [cause, speculate]);
  const end = jobEnd(run);
  const now = Math.min(at ?? end, end);
  const w = worldAt(run, now);
  const off = speculate ? jobEnd(other) : end;
  const on = speculate ? end : jobEnd(other);
  const slow = run.straggler === null ? null : run.world.attempts[run.straggler];
  const loads = run.plan.parts.map((p) => p.length);

  useIntroCaption(stragglerCaption(run, cause, speculate), [cause, speculate]);

  const change = (patch: Partial<typeof state>) => {
    setPlaying(false);
    setState((s) => ({ ...s, at: null, ...patch }));
  };

  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="Wall time" value={`${end} ticks`} color={slow ? 'var(--hi)' : undefined} sub={[`${off} without backups`, `${on} with backups`]} />
          <Stat label="Straggler" value={slow ? `${taskName(slow.task)}` : 'none'} color={slow ? 'var(--hi)' : undefined} sub={slow ? `${(slow.end ?? end) - slow.start} ticks on worker ${slow.worker + 1}` : 'no task far above its median'} />
          <Stat label="Tasks done" value={`${w.attempts.filter((a) => a.status === 'done').length} of ${SIM_MAPPERS + SIM_REDUCERS}`} sub={`at tick ${now}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'map task', shape: 'square' },
            { color: 'var(--violet)', label: 'reduce task (hatched while it waits for the maps)', shape: 'square' },
            { color: 'var(--hi)', label: 'the straggler', shape: 'square' },
            { color: 'var(--dim)', label: 'a copy cancelled because the other finished first', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="What is slow" value={cause} onChange={(c) => change({ cause: c })} options={CAUSE_OPTIONS} />
          <Toggle label="Backup tasks" value={speculate} onChange={(s) => change({ speculate: s })} off="Off" on="On" />
        </>,
        <TimeControls key="time" run={run} now={now} onNow={(t) => setState((s) => ({ ...s, at: t }))} playing={playing} onPlaying={setPlaying} />,
      ]}
    >
      <div className="mr-stage stage-pad">
        <ClusterPane run={run} now={now} hint={`${SIM_MAPPERS} map and ${SIM_REDUCERS} reduce tasks on ${WORKERS} workers`} />
        <Box>
          <SectionTitle hint="pairs each reducer is sent: the work is the data it gets">Reducer loads</SectionTitle>
          <div className="mr-bars">
            {loads.map((n, r) => (
              <Bar key={r} label={`reduce ${r + 1}`} value={n} max={Math.max(...loads)} tone={slow && slow.kind === 'reduce' && slow.index === r ? 'hi' : 'violet'} trailing={plural(n, 'pair')} />
            ))}
          </div>
          {cause === 'data' && <p className="mr-note">One word is {Math.round(HOT_SHARE * 100)}% of this input, and a key goes to one reducer, so one reducer gets most of the pairs.</p>}
          {cause === 'machine' && <p className="mr-note">Worker {WORKERS} runs at {SLOW_SPEED}% of normal speed; the input is spread as evenly as the hash allows.</p>}
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={DURATION_SEED}>a toy cluster of {WORKERS} workers: durations are seeded numbers of ticks, not measurements</Provenance>
          <Provenance kind="illustrative">real clusters run far more tasks than workers; a backup here starts when no task is waiting and a worker is idle</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
