import { useMemo, useState, type ReactNode } from 'react';
import { LogStream } from '../../components/LogStream';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, PauseButton, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useInterval } from '../../core/useInterval';
import { CONSUMERS, CONSUMER_LABEL, DUPLICATE, LOSS, RESTART_MS, endDivergence, evaluate, lowestFailing, lowestFailingAt, seededScenario, SAFE_FLAGS, type ConsumerId, type Fault, type Flags, type Network, type Scenario } from './cdc';
import { replayCaption, seedVerdict, traceLine } from './captions';
import { TableGrids } from './Grids';
import { END_MS, REPLAY_OPEN, REPLAY_OPS, STEP_MS, connOf, redeliveries, reorderedArrivals, replay, replaySequence, syncedCount } from './view';

const PLAY_MS = 120;
const SLOW_OPTIONS: { value: ConsumerId | 'none'; label: string }[] = [{ value: 'none', label: 'None' }, ...CONSUMERS.map((c) => ({ value: c as ConsumerId | 'none', label: CONSUMER_LABEL[c] }))];
const KILL_OPTIONS = CONSUMERS.map((c) => ({ value: c as ConsumerId, label: CONSUMER_LABEL[c] }));
const TRACE_TAIL = 12;
/** The seed the scene opens on: the lowest seed of 0..199 that breaks a blind consumer, and a clean pass for the safe settings. */
export const REPLAY_SEED = 0;

export function ReplayScene({ picker }: { picker: ReactNode }) {
  const [now, setNow] = useState<number>(REPLAY_OPEN.now);
  const [playing, setPlaying] = useState(false);
  const [faults, setFaults] = useState<Fault[]>([]);
  const [ackBefore, setAckBefore] = useState(REPLAY_OPEN.flags.ackBeforeApply);
  const [idempotent, setIdempotent] = useState(REPLAY_OPEN.flags.idempotent);
  const [slow, setSlow] = useState<ConsumerId | 'none'>('none');
  const [victim, setVictim] = useState<ConsumerId>('warehouse');
  const [seed, setSeed] = useState(REPLAY_SEED);
  const [network, setNetwork] = useState<Network>('noisy');

  const flags: Flags = useMemo(() => ({ ackBeforeApply: ackBefore, idempotent, slowConsumer: slow === 'none' ? null : slow }), [ackBefore, idempotent, slow]);
  const scenario: Scenario = useMemo(() => ({ seed: 1, ops: REPLAY_OPS, faults, flags, loss: 0, duplicate: 0 }), [faults, flags]);
  const { snap, trace } = useMemo(() => replay(scenario, now), [scenario, now]);
  const caption = replayCaption(snap, now, trace, flags);
  useInterval(() => setNow((t) => Math.min(END_MS, t + STEP_MS)), PLAY_MS, playing && now < END_MS);

  const sequence = useMemo(() => replaySequence(trace), [trace]);

  const seeded = useMemo(() => {
    const scenario = seededScenario(seed, flags, network);
    const ev = evaluate(scenario);
    return { rule: ev.rule, message: ev.message, cause: { reordered: reorderedArrivals(ev.cluster.trace), repeated: redeliveries(ev.cluster.trace), endsEqual: ev.rule === 'S1' && endDivergence(scenario) === null }, rows: ev.cluster.trace.filter((r) => r.kind !== 'timer' && !(r.payload && ['read', 'batch'].includes(r.payload.type))).slice(-TRACE_TAIL).map((r) => ({ id: `t${r.id}`, text: traceLine(r), tone: r.kind === 'crash' ? ('bad' as const) : r.kind === 'drop' ? ('orange' as const) : undefined })) };
  }, [seed, flags, network]);
  const ackSeed = useMemo(() => lowestFailing({ ...SAFE_FLAGS, ackBeforeApply: true }, network), [network]);
  const counterSeed = useMemo(() => lowestFailingAt({ ...SAFE_FLAGS, idempotent: false }, network, 'S3'), [network]);
  const naiveSeed = useMemo(() => lowestFailing({ ...SAFE_FLAGS, idempotent: false }, network), [network]);

  const addFault = (f: Fault) => setFaults([...faults, f]);
  return (
    <StageFrame
      height={620}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Saved position" value={`LSN ${connOf(snap).saved}`} color="var(--violet)" sub="where a restarted connector resumes" />
          <Stat label="Repeated deliveries" value={redeliveries(trace)} color={redeliveries(trace) > 0 ? 'var(--orange)' : undefined} sub="an event handed over again" />
          <Stat label="Consumers in sync" value={`${syncedCount(snap)} of 3`} color={syncedCount(snap) === 3 ? 'var(--ok)' : 'var(--hi)'} sub={`at ${now} ms`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a consumer cell equal to the source', shape: 'square' },
            { color: 'var(--hi)', label: 'a consumer behind the source', shape: 'square' },
            { color: 'var(--orange)', label: 'a repeated delivery', shape: 'square' },
            { color: 'var(--bad)', label: 'a crash, or a change lost for good', shape: 'square' },
            { color: 'var(--violet)', label: 'the saved position', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Time" value={now} min={0} max={END_MS} step={STEP_MS} onChange={(v) => { setNow(v); setPlaying(false); }} format={(v) => `${v} ms`} />
          <PauseButton paused={!playing} onToggle={() => setPlaying(!playing)} />
        </>,
        <>
          <Toggle label="Consumer acknowledges" value={ackBefore} onChange={setAckBefore} off="After applying" on="Before applying (broken)" />
          <Toggle label="Apply" value={idempotent} onChange={setIdempotent} off="Blind (broken)" on="By key and LSN" />
          <Segmented label="Delay one consumer" value={slow} onChange={setSlow} options={SLOW_OPTIONS} />
        </>,
        <>
          <Button variant="danger" onClick={() => addFault({ kind: 'crash-connector', at: now })}>Kill the connector now</Button>
          <Segmented label="Consumer to kill" value={victim} onChange={setVictim} options={KILL_OPTIONS} />
          <Button variant="danger" onClick={() => addFault({ kind: 'crash-consumer', at: now, consumer: victim })}>Kill {CONSUMER_LABEL[victim]} now</Button>
          <Button onClick={() => addFault({ kind: 'dup', at: now })}>Duplicate the last event</Button>
          <Button onClick={() => { setFaults([]); setNow(0); setPlaying(false); }}>Reset</Button>
        </>,
      ]}
    >
      <div className="cdc-stage stage-pad">
        <TableGrids snap={snap} />
        <Box>
          <SectionTitle hint="the last events and acknowledgements">Messages</SectionTitle>
          <SequenceDiagram actors={sequence.actors} messages={sequence.messages} />
          <Hint tone="muted" block>{faults.length === 0 ? 'Nothing has been killed yet: this run has no faults and delivers each event once.' : `${faults.length} fault${faults.length === 1 ? '' : 's'} injected so far, each kill lasting ${RESTART_MS} ms.`}</Hint>
        </Box>
        <Box>
          <SectionTitle hint={`a seeded fault schedule: ${Math.round(LOSS * 100)}% loss and ${Math.round(DUPLICATE * 100)}% duplication when the network is noisy, crashes of the connector and a consumer`}>Seeded run, seed {seed}</SectionTitle>
          <div className="cdc-seed">
            <SeedField seed={seed} onSeed={setSeed} />
            <Button softDisabled={seed === naiveSeed} onClick={() => setSeed(naiveSeed ?? 0)}>Load seed {naiveSeed}</Button>
            <Button onClick={() => setSeed(ackSeed ?? 0)}>Load seed {ackSeed}</Button>
            <Toggle label="Network" value={network === 'noisy'} onChange={(v) => setNetwork(v ? 'noisy' : 'clean')} off="Clean" on="Noisy" />
          </div>
          <p className={`cdc-verdict ${seeded.rule ? 'is-bad' : 'is-ok'}`} role="status">{seedVerdict(seed, seeded.rule, seeded.message, seeded.cause)}</p>
          <LogStream label="The trace up to the end of the run" rows={seeded.rows} maxHeight={150} follow live="off" empty="No trace." />
          <Hint tone="muted" block>
            Over seeds 0 to 199 with this network: blind apply fails first on seed {naiveSeed} (message latency reorders events, and blind apply trusts arrival order); the restart effect shows at the end, as S3 (a row or the counter differs once the stream drained), first on {counterSeed === undefined ? 'no seed' : `seed ${counterSeed}`}; acknowledging before applying fails first on seed {ackSeed}; with idempotent apply and acknowledging after applying, no seed fails.
          </Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>messages, crashes and duplicates come from the lesson's message simulator</Provenance>
          <Provenance kind="toy">at-least-once delivery: the saved position moves only after every consumer acknowledges, so a restart delivers events again</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
