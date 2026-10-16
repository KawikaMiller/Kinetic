import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { failureCaption } from './captions';
import { DURATION_SEED, WORKERS, outputOf } from './cluster';
import { ClusterPane, TimeControls } from './ClusterPane';
import { initialFailureScene } from './init';
import { reference, sortedEntries } from './job';
import { addKill, runningWorkerAt } from './kills';
import { EVEN_WORDS } from './text';
import { SIM_MAPPERS, SIM_REDUCERS, jobEnd, rerunCount, runCluster, worldAt } from './timeline';

export function FailureScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialFailureScene);
  const [playing, setPlaying] = useState(false);
  const [note, setNote] = useState('');
  const { kills } = state;

  const run = useMemo(() => runCluster({ words: EVEN_WORDS, kills }), [kills]);
  const end = jobEnd(run);
  const now = Math.min(state.at, end);
  const w = worldAt(run, now);
  const out = useMemo(() => outputOf(run.world, run.plan), [run]);
  const truth = useMemo(() => reference('wordcount', EVEN_WORDS), []);

  useIntroCaption(failureCaption(run, kills.length), [run, kills.length]);

  const kill = (worker: number) => {
    const r = addKill(run, kills, worker, now);
    setNote(r.message);
    if (r.changed) setState((s) => ({ ...s, kills: r.kills }));
  };
  const killBar = (id: string) => {
    const worker = runningWorkerAt(run, id, now);
    if (worker === null) setNote(`That task is not running at tick ${now}: pick a bar the cursor is inside.`);
    else kill(worker);
  };
  const rows = sortedEntries(truth);

  return (
    <StageFrame
      height={580}
      stats={
        <Stats>
          <Stat label="Workers up" value={`${w.alive.filter(Boolean).length} of ${WORKERS}`} color={w.alive.every(Boolean) ? undefined : 'var(--bad)'} sub={`at tick ${now}`} />
          <Stat label="Tasks run again" value={rerunCount(w)} color={rerunCount(w) > 0 ? 'var(--bad)' : undefined} sub="started after a failure threw work away" />
          <Stat label="Job ends" value={run.world.stalled ? 'never' : `tick ${end}`} color={run.world.stalled ? 'var(--bad)' : undefined} sub={run.world.stalled ? 'no worker left' : `${SIM_MAPPERS} maps, ${SIM_REDUCERS} reduces`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'map task', shape: 'square' },
            { color: 'var(--violet)', label: 'reduce task (hatched while it waits)', shape: 'square' },
            { color: 'var(--bad)', label: 'a lost attempt (✕), and a task run again (↻, red outline)', shape: 'square' },
            { color: 'var(--ok)', label: 'the finished table equals the plain count', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {Array.from({ length: WORKERS }, (_, k) => (
            <Button key={k} onClick={() => kill(k)} aria-label={`Fail worker ${k + 1} at tick ${now}`}>Kill worker {k + 1}</Button>
          ))}
          <Button onClick={() => { setState((s) => ({ ...s, kills: [] })); setNote('Back to a run with no failures.'); }} softDisabled={kills.length === 0}>No failures</Button>
        </>,
        <TimeControls key="time" run={run} now={now} onNow={(t) => setState((s) => ({ ...s, at: t }))} playing={playing} onPlaying={setPlaying} />,
      ]}
    >
      <div className="mr-stage stage-pad">
        <ClusterPane run={run} now={now} onBarClick={killBar} hint="press Kill at the time cursor, or click a running bar" />
        {note && <p className="mr-status" role="status">{note}</p>}
        <Box>
          <SectionTitle hint="when the job finishes: the reducers' table against a plain count">The result</SectionTitle>
          {!out.complete ? (
            <p className="mr-bad-note">No result: {run.world.stalled ? 'no worker is left, so the job cannot finish.' : 'the job has not finished.'}</p>
          ) : (
            <div className="mr-scroll" role="region" aria-label="Final table against the plain count" tabIndex={0}>
              <table className="data-table mr-table">
                <thead>
                  <tr><th scope="col">Word</th><th scope="col">MapReduce</th><th scope="col">Plain count</th><th scope="col">Equal</th></tr>
                </thead>
                <tbody>
                  {rows.map(([k, v]) => (
                    <tr key={k}>
                      <th scope="row">{k}</th>
                      <td>{out.result.get(k) ?? '–'}</td>
                      <td>{v}</td>
                      <td className={out.result.get(k) === v ? 'mr-ok' : 'mr-bad'}>{out.result.get(k) === v ? '✓' : '✗'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={DURATION_SEED}>a toy cluster: you choose when a worker fails, durations are seeded numbers of ticks</Provenance>
          <Provenance kind="from-memory">the rule that finished map tasks on a dead worker are run again, and finished reduce tasks are not, is from the original MapReduce paper by Dean and Ghemawat (2004); check the paper</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
