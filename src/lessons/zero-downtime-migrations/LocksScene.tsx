import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { humanDuration } from '../../core/format';
import { parseBoundedInt } from '../../core/parse';
import { CLIENT_TIMEOUT_S, DEFAULT_LOCK_TIMEOUT_S, MAX_BATCH, MAX_LOCK_TIMEOUT_S, MIN_BATCH, MIN_LOCK_TIMEOUT_S, TABLE_ROWS, batchRun, lockRun } from './lock';
import { lockCaption } from './clocks';
import { LOCKS_OPEN, lockBars } from './view';

const GANTT_MIN_WIDTH = 520;

export function LocksScene({ picker }: { picker: ReactNode }) {
  const [big, setBig] = useState<boolean>(LOCKS_OPEN.big);
  const [timeoutOn, setTimeoutOn] = useState<boolean>(LOCKS_OPEN.timeout);
  const [timeoutS, setTimeoutS] = useState(DEFAULT_LOCK_TIMEOUT_S);
  const [batchText, setBatchText] = useState(String(LOCKS_OPEN.batch));

  const run = useMemo(() => lockRun({ big, lockTimeoutS: timeoutOn ? timeoutS : null }), [big, timeoutOn, timeoutS]);
  const gantt = useMemo(() => lockBars(run), [run]);
  const parsed = useMemo(() => parseBoundedInt(batchText, { min: MIN_BATCH, max: MAX_BATCH, messages: { empty: 'Type a batch size.', invalid: (t) => `"${t}" isn't a whole number.`, tooSmall: () => `A batch holds at least ${MIN_BATCH} row; zero and negatives are refused.`, tooBig: () => `Keep batches to ${MAX_BATCH} rows or fewer.` } }), [batchText]);
  const batch = parsed.ok ? batchRun(parsed.value) : batchRun(LOCKS_OPEN.batch);
  const caption = lockCaption(run, big, timeoutOn);

  return (
    <StageFrame
      height={520}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Longest block" value={`${run.longestBlockS.toFixed(1)} s`} color={run.longestBlockS > CLIENT_TIMEOUT_S ? 'var(--bad)' : 'var(--hi)'} sub="new requests wait that long" />
          <Stat label="Peak queue" value={run.peakQueue} sub="requests waiting behind the ALTER" />
          <Stat label="Requests past the timeout" value={run.timedOut} color={run.timedOut > 0 ? 'var(--bad)' : 'var(--ok)'} sub={`clients give up after ${CLIENT_TIMEOUT_S} s`} />
          <Stat label="Backfill, total" value={humanDuration(batch.totalS)} sub={`${batch.batches.toLocaleString('en-US')} batches over ${(TABLE_ROWS / 1e6).toFixed(0)} million rows`} />
          <Stat label="Longest batch lock" value={`${batch.peakLockMs.toFixed(1)} ms`} sub="about the replication lag one batch adds" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'the long-running query holding a lock', shape: 'square' },
            { color: 'var(--hi)', label: 'the ALTER waiting or running, and the queue behind it', shape: 'square' },
            { color: 'var(--bad)', label: 'a DDL that gave up, or requests past the timeout', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Table" value={big} onChange={setBig} off="Small" on="Big (a long query is running)" />
          <Toggle label="Lock timeout" value={timeoutOn} onChange={setTimeoutOn} off="None (wait forever)" on="Short, then retry" />
          {timeoutOn && <Slider label="Gives up after" value={timeoutS} min={MIN_LOCK_TIMEOUT_S} max={MAX_LOCK_TIMEOUT_S} step={0.5} onChange={setTimeoutS} format={(v) => `${v} s`} />}
        </>,
        <>
          <TextField label="Backfill batch size (rows)" value={batchText} onChange={setBatchText} width={90} spellCheck={false} />
          {!parsed.ok && <Hint tone="muted">{parsed.error}</Hint>}
        </>,
      ]}
    >
      <div className="zdm-stage stage-pad">
        <Box>
          <SectionTitle hint="PostgreSQL-flavoured; every request that arrives while the ALTER waits queues behind it">The lock queue</SectionTitle>
          <WideRegion minWidth={GANTT_MIN_WIDTH} label="Lock queue chart: scroll sideways to see all of it">
            <GanttLanes lanes={gantt.lanes} bars={gantt.bars} domain={gantt.domain} unit=" s" axis size="md" labelWidth={100} ariaLabel="A long query, the ALTER TABLE waiting for its lock, and the requests queued behind it" />
          </WideRegion>
          <Hint tone="muted" block>Mitigations drawn here: a short lock timeout with a retry, so the ALTER stops blocking after its timeout instead of holding up everyone. Doing the backfill in batches keeps each lock short, below.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="illustrative">query length, request rate, timeouts, row counts and per-row cost are made-up round numbers, not measurements</Provenance>
          <Provenance kind="from-memory">lock behaviour is PostgreSQL-flavoured: an ALTER waits for a lock held by an earlier query and later queries queue behind it; adding a column with a constant default is instant in current PostgreSQL and rewrote the table in old ones; a constraint can be added as not validated and validated later. Verify against the docs for your database and version</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
