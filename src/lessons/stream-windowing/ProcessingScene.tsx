import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { processingCaption } from './captions';
import { MAX_DELAY, MIN_DELAY, generate } from './events';
import { clockLabel } from './layout';
import { BROKEN_DELAY, BROKEN_SEED, disagreeing, perMinute, replayed } from './processing';

type Job = 'processing' | 'event';

export function ProcessingScene({ picker }: { picker: ReactNode }) {
  const [job, setJob] = useState<Job>('processing');
  const [maxDelay, setMaxDelay] = useState(BROKEN_DELAY);
  const [seed, setSeed] = useState(BROKEN_SEED);
  const [replay, setReplay] = useState(false);

  const events = useMemo(() => generate(seed, maxDelay).events, [seed, maxDelay]);
  const original = useMemo(() => perMinute(events), [events]);
  const backwards = useMemo(() => replayed(events), [events]);
  const rows = replay ? backwards : original;
  const wrong = job === 'processing' ? disagreeing(rows) : [];
  const total = rows.reduce((n, r) => n + r[job], 0);

  useIntroCaption(processingCaption({ rows, job, replay, maxDelay }), [rows, job, replay]);

  const cell = (r: (typeof rows)[number], column: Job) => (
    <td className={`${job === column ? 'sw-job' : ''} ${column === 'processing' && r.processing !== r.event ? 'sw-wrong' : ''}`}>{r[column]}</td>
  );

  return (
    <StageFrame
      height={380}
      stats={
        <Stats>
          <Stat label="Minutes the job gets wrong" value={wrong.length} color={wrong.length > 0 ? 'var(--bad)' : 'var(--ok)'} sub={`of ${rows.length}, against the event-time truth`} />
          <Stat label="Events counted" value={total} sub={job === 'processing' ? 'by arrival, every one lands somewhere' : 'by when it happened'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--text)', label: 'bold column: the answer your job gives', shape: 'square' },
            { color: 'var(--bad)', label: 'a processing-time count that differs from the event-time truth', shape: 'square' },
            { color: 'var(--ok)', label: 'the event-time column: the truth', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="The job counts by" value={job === 'event'} onChange={(event) => setJob(event ? 'event' : 'processing')} off="Arrival (processing time)" on="When it happened (event time)" />
          <Toggle label="Run" value={replay} onChange={setReplay} off="The original" on="A replay, read backwards" />
        </>,
        <>
          <Slider label="Delay bound D" value={maxDelay} min={MIN_DELAY} max={MAX_DELAY} format={(v) => `${v} s`} onChange={setMaxDelay} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="sw-stage stage-pad">
        <Box>
          <SectionTitle hint={replay ? 'the same log, read backwards' : 'one-minute windows'}>Count per minute</SectionTitle>
          <table className="data-table sw-table">
            <thead>
              <tr><th scope="col">Minute</th><th scope="col">By arrival (processing time)</th><th scope="col">By when it happened (event time)</th>{replay && <th scope="col">Original run, by arrival</th>}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.start}>
                  <td>{clockLabel(r.start)} to {clockLabel(r.end)}</td>
                  {cell(r, 'processing')}
                  {cell(r, 'event')}
                  {replay && <td>{original[i].processing}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>the same click generator as the other scenes (each scene opens on its own seed); the event-time column keeps every event until the stream ends</Provenance>
          <Provenance kind="scripted">the replay is one fixed rule: arrival times mirrored, so the last event arrives first and the gaps stay</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
