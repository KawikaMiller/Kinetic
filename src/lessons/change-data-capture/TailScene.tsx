import { useMemo, useState, type ReactNode } from 'react';
import { LogStream } from '../../components/LogStream';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, PauseButton, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, TextField } from '../../components/ui';
import { useInterval } from '../../core/useInterval';
import { parseBoundedInt } from '../../core/parse';
import { MAX_AMOUNT, MAX_EVENTS_IN_FLIGHT, MAX_KEY, SAFE_FLAGS, STATUSES, type Fault, type Scenario, type Stmt, type TimedTx } from './cdc';
import { tailCaption } from './captions';
import { TableGrids } from './Grids';
import { END_MS, MAX_OPS, STEP_MS, TAIL_OPEN, connOf, dbOf, isRefusal, logRows, makeTx, producerPaused, replay, syncedCount } from './view';

const STATUS_OPTIONS = STATUSES.map((s) => ({ value: s as string, label: s }));
const PLAY_MS = 120;
const NO_FAULTS: Fault[] = [];

export function TailScene({ picker }: { picker: ReactNode }) {
  const [ops, setOps] = useState<TimedTx[]>([]);
  const [now, setNow] = useState<number>(TAIL_OPEN.now);
  const [key, setKey] = useState<number>(TAIL_OPEN.key);
  const [status, setStatus] = useState<string>(TAIL_OPEN.status);
  const [amountText, setAmountText] = useState(String(TAIL_OPEN.amount));
  const [playing, setPlaying] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const scenario: Scenario = useMemo(() => ({ seed: TAIL_OPEN.seed, ops, faults: NO_FAULTS, flags: SAFE_FLAGS, loss: 0, duplicate: 0 }), [ops]);
  const { snap } = useMemo(() => replay(scenario, now), [scenario, now]);
  const rows = useMemo(() => logRows(snap), [snap]);
  const amount = useMemo(
    () => parseBoundedInt(amountText, { min: 0, max: MAX_AMOUNT, messages: { empty: 'Type an amount.', invalid: (t) => `"${t}" isn't a whole number.`, tooSmall: () => `Keep it from 0 to ${MAX_AMOUNT}.`, tooBig: () => `Keep it from 0 to ${MAX_AMOUNT}.` } }),
    [amountText],
  );
  const paused = producerPaused(snap);
  const full = ops.length >= MAX_OPS;
  const caption = tailCaption(snap, now, note);
  useInterval(() => setNow((t) => Math.min(END_MS, t + STEP_MS)), PLAY_MS, playing && now < END_MS);

  const add = (stmts: Stmt[], outcome: 'commit' | 'rollback') => {
    const tx = makeTx(stmts, outcome, ops.filter((o) => 'tx' in o).length + 1, dbOf(snap).rows, MAX_KEY);
    if (isRefusal(tx)) return setNote(tx.refused);
    setNote(null);
    setOps([...ops, { at: now, tx }]);
  };
  const row = amount.ok ? { status, amount: amount.value } : undefined;
  const single = (op: Stmt['op']) => (row || op === 'delete' ? add([{ op, key, row }], 'commit') : setNote(amount.ok ? null : amount.error));
  const other = key === MAX_KEY ? 1 : key + 1;
  const pair = (outcome: 'commit' | 'rollback') => (row ? add([{ op: 'update', key, row }, { op: 'update', key: other, row }], outcome) : setNote(amount.ok ? null : amount.error));

  return (
    <StageFrame
      height={560}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Log records" value={dbOf(snap).log.length} sub={`${ops.length} of ${MAX_OPS} operations`} />
          <Stat label="Saved position" value={`LSN ${connOf(snap).saved}`} color="var(--violet)" sub="where the connector resumes" />
          <Stat label="Events in flight" value={connOf(snap).inflight} color={connOf(snap).inflight > 0 ? 'var(--info)' : undefined} sub="sent, not yet acknowledged" />
          <Stat label="Consumers in sync" value={`${syncedCount(snap)} of 3`} color={syncedCount(snap) === 3 ? 'var(--ok)' : 'var(--hi)'} sub={`at ${now} ms`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a committed change, or a consumer cell equal to the source', shape: 'square' },
            { color: 'var(--dim)', label: 'a rolled-back change: logged, never emitted', shape: 'square' },
            { color: 'var(--hi)', label: 'a consumer behind the source', shape: 'square' },
            { color: 'var(--info)', label: 'an event in flight, or a schema change', shape: 'square' },
            { color: 'var(--violet)', label: 'the connector\'s saved position in the log', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Time" value={now} min={0} max={END_MS} step={STEP_MS} onChange={(v) => { setNow(v); setPlaying(false); }} format={(v) => `${v} ms`} />
          <PauseButton paused={!playing} onToggle={() => setPlaying(!playing)} />
          <Button onClick={() => { setOps([]); setNow(0); setPlaying(false); setNote(null); }}>Reset</Button>
        </>,
        <>
          <Slider label="Row id" value={key} min={1} max={MAX_KEY} onChange={setKey} />
          <Segmented label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          <TextField label="Amount" value={amountText} onChange={setAmountText} width={80} spellCheck={false} />
        </>,
        <>
          <Button variant="primary" softDisabled={paused || full} onClick={() => single('insert')}>Insert row {key}</Button>
          <Button softDisabled={paused || full} onClick={() => single('update')}>Update row {key}</Button>
          <Button softDisabled={paused || full} onClick={() => single('delete')}>Delete row {key}</Button>
          <Button softDisabled={paused || full} onClick={() => pair('commit')}>Two updates, commit</Button>
          <Button softDisabled={paused || full} onClick={() => pair('rollback')}>Two updates, roll back</Button>
          <Button softDisabled={paused || full} onClick={() => { setNote(null); setOps([...ops, { at: now, ddl: true }]); }}>Add a column</Button>
        </>,
      ]}
    >
      <div className="cdc-stage stage-pad">
        <TableGrids snap={snap} />
        {(paused || full || note || !amount.ok) && <Hint tone="muted" block>{paused ? `${MAX_EVENTS_IN_FLIGHT} or more events are in flight: the buttons pause until the consumers catch up.` : full ? `The toy takes at most ${MAX_OPS} operations: reset to start over.` : note ?? (amount.ok ? '' : amount.error)}</Hint>}
        <Box>
          <SectionTitle hint="the source's log: the connector reads it in commit order">The log</SectionTitle>
          <LogStream label="Source log" rows={rows} maxHeight={170} follow live="off" empty="Insert a row to start the log." />
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={TAIL_OPEN.seed}>a toy source, connector and three consumers on the lesson's own message simulator</Provenance>
          <Provenance kind="toy">log decoding simplified: real connectors read a binary log and handle types, large values and failover</Provenance>
          <Provenance kind="from-memory">tools such as Debezium read a database's log this way</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
