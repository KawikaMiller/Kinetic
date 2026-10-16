import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, PauseButton, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useInterval } from '../../core/useInterval';
import { STATUSES } from './cdc';
import { pollingText, snapshotText } from './captions';
import {
  FAST_COMMIT, POLL_END_MS, POLL_EVERY_MS, SLOW_BEGIN, SLOW_COMMIT_DEFAULT, pollTimesEvery, pollingRun, twoInterleaved, type PollTx,
} from './polling';
import { SNAPSHOT_END_MS, SNAPSHOT_ROWS, buildSnapshotCluster, evaluateSnapshot, scanTimeOf, snapshotDivergence, type NewbieState, type SnapScenario, type StartFrom } from './snapshot';
import { SNAPSHOT_OPEN, statusLetter, type CellLook } from './view';
import type { CdcState } from './cdc';

const FROM_OPTIONS = [{ value: 'snapshot' as StartFrom, label: 'From where the snapshot began' }, { value: 'now' as StartFrom, label: 'From where the log is now' }];
const KEYS = Array.from({ length: SNAPSHOT_ROWS }, (_, i) => i + 1);
const COLS = ['st', 'amt'];
const CELL = { cell: 26 };
const PLAY_MS = 120;
const STEP = 10;
const DELETE_AT = 100;

export function SnapshotScene({ picker }: { picker: ReactNode }) {
  const [from, setFrom] = useState<StartFrom>(SNAPSHOT_OPEN.from);
  const [now, setNow] = useState<number>(SNAPSHOT_OPEN.now);
  const [playing, setPlaying] = useState(false);
  const [writes, setWrites] = useState<SnapScenario['writes']>([]);
  const [key, setKey] = useState(7);
  const [at, setAt] = useState(60);
  const [slowCommit, setSlowCommit] = useState(SLOW_COMMIT_DEFAULT);
  const [withDelete, setWithDelete] = useState(false);

  const scenario: SnapScenario = useMemo(() => ({ seed: 1, from, writes }), [from, writes]);
  const final = useMemo(() => evaluateSnapshot(scenario), [scenario]);
  const stateAtNow = useMemo(() => runTo(scenario, now), [scenario, now]);
  const missing = snapshotDivergence(final.cluster.snapshot());
  const caption = snapshotText(from, missing);
  useInterval(() => setNow((t) => Math.min(SNAPSHOT_END_MS, t + STEP)), PLAY_MS, playing && now < SNAPSHOT_END_MS);

  const txs: PollTx[] = useMemo(() => {
    const base = twoInterleaved(slowCommit);
    return withDelete ? [...base, { txid: 3, begin: DELETE_AT, commit: DELETE_AT + 2, stmts: [{ op: 'delete' as const, key: 2 }] }] : base;
  }, [slowCommit, withDelete]);
  const poll = useMemo(() => pollingRun(txs, pollTimesEvery(POLL_EVERY_MS, POLL_END_MS), POLL_END_MS), [txs]);
  const pollKeys = [1, 2];

  return (
    <StageFrame
      height={600}
      intro={`${caption} ${pollingText(poll)}`}
      introKey={`${caption} ${pollingText(poll)}`}
      stats={
        <Stats>
          <Stat label="Scan reads row" value={`${stateAtNow.scanned} of ${SNAPSHOT_ROWS}`} sub={`at ${now} ms`} />
          <Stat label="Writes during the scan" value={writes.length} sub={writes.length === 0 ? 'none yet' : 'each is a committed change'} />
          <Stat label="New consumer at the end" value={missing === null ? 'equal' : 'differs'} color={missing === null ? 'var(--ok)' : 'var(--bad)'} sub={missing ?? 'every row matches the source'} />
          <Stat label="Poller at the end" value={poll.misses.length === 0 ? 'equal' : `${poll.misses.length} wrong`} color={poll.misses.length === 0 ? 'var(--ok)' : 'var(--bad)'} sub={`updated_at polling every ${POLL_EVERY_MS} ms`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a new-consumer cell equal to the source', shape: 'square' },
            { color: 'var(--hi)', label: 'a cell that differs, or a row not yet read', shape: 'square' },
            { color: 'var(--bad)', label: 'a lost change, or a poller miss', shape: 'square' },
            { color: 'var(--violet)', label: 'a row the poller copied', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Start streaming" value={from} onChange={setFrom} options={FROM_OPTIONS} />
        </>,
        <>
          <Slider label="Time" value={now} min={0} max={SNAPSHOT_END_MS} step={STEP} onChange={(v) => { setNow(v); setPlaying(false); }} format={(v) => `${v} ms`} />
          <PauseButton paused={!playing} onToggle={() => setPlaying(!playing)} />
        </>,
        <>
          <Slider label="Row" value={key} min={1} max={SNAPSHOT_ROWS} onChange={setKey} />
          <Slider label="Written at" value={at} min={5} max={110} onChange={setAt} format={(v) => `${v} ms`} />
          <Button variant="primary" onClick={() => setWrites([...writes, { at, key, row: { status: STATUSES[(writes.length + 1) % STATUSES.length], amount: 100 + writes.length + 1 } }].sort((a, b) => a.at - b.at))}>Write row {key} at {at} ms</Button>
          <ChipButton tone="info" size="md" onClick={() => setWrites([{ at: scanTimeOf(7) + 15, key: 7, row: { status: 'paid', amount: 101 } }])}>Row 7, just after the scan read it</ChipButton>
          <Button onClick={() => setWrites([])}>Clear writes</Button>
        </>,
        <>
          <Slider label="Slow transaction commits at" value={slowCommit} min={FAST_COMMIT - 1} max={60} onChange={setSlowCommit} format={(v) => `${v} ms`} />
          <Toggle label="Also a hard delete" value={withDelete} onChange={setWithDelete} off="No delete" on="Delete row 2" />
        </>,
      ]}
    >
      <div className="cdc-stage stage-pad">
        <div className="cdc-grids">
          <Box className="cdc-grid">
            <SectionTitle hint="the live table">Source</SectionTitle>
            <CellGrid rows={SNAPSHOT_ROWS} cols={2} size={CELL} rowLabels={KEYS} colLabels={COLS} cell={(r, c) => stateAtNow.src(r + 1, c)} ariaLabel="Source rows 1 to 12" />
          </Box>
          <Box className="cdc-grid">
            <SectionTitle hint={stateAtNow.phase}>New consumer</SectionTitle>
            <CellGrid rows={SNAPSHOT_ROWS} cols={2} size={CELL} rowLabels={KEYS} colLabels={COLS} cell={(r, c) => stateAtNow.mine(r + 1, c)} ariaLabel="The new consumer's rows 1 to 12" />
          </Box>
          <Box className="cdc-grid">
            <SectionTitle hint="updated_at polling">Poller</SectionTitle>
            <table className="cdc-table table-cards">
              <thead><tr><th scope="col">Row</th><th scope="col">Source</th><th scope="col">Poller copy</th></tr></thead>
              <tbody>
                {pollKeys.map((k) => {
                  const a = poll.source[k];
                  const b = poll.copy[k];
                  const bad = poll.misses.some((m) => m.key === k);
                  return (
                    <tr key={k}>
                      <td data-label="Row">{k}</td>
                      <td data-label="Source">{a ? `${statusLetter(a.status)} ${a.amount}` : 'deleted'}</td>
                      <td data-label="Poller copy" className={bad ? 'cdc-bad' : 'cdc-ok'}>{b ? `${statusLetter(b.status)} ${b.amount}` : 'missing'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Hint tone="muted" block>Row 1 is written by the slow transaction, which began at {SLOW_BEGIN} ms.</Hint>
          </Box>
        </div>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={1}>a scan that reads one row every few ms while writes keep arriving; no faults in this scene</Provenance>
          <Provenance kind="toy">the poller is the usual naive version: it remembers the largest updated_at it saw and asks for newer ones</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}


function runTo(s: SnapScenario, t: number) {
  const cluster = buildSnapshotCluster(s);
  cluster.run({ until: t });
  const snap = cluster.snapshot();
  const db = snap.nodes.db.state as Extract<CdcState, { kind: 'db' }>;
  const n = snap.nodes.newbie.state as unknown as NewbieState;
  const rows = db.rows;
  const look = (r: { status: string; amount: number } | undefined, col: number, tone: CellLook['tone']): CellLook =>
    r ? { text: col === 0 ? statusLetter(r.status) : String(r.amount), tone, fill: 'tint' } : { text: '', tone: 'dim', fill: 'outline' };
  return {
    scanned: n.scanned,
    phase: n.phase === 'scanning' ? `scanning, ${n.scanned} of ${SNAPSHOT_ROWS} rows read` : `streaming from LSN ${n.cursor}`,
    src: (k: number, c: number): CellLook => look(rows[k], c, 'muted'),
    mine: (k: number, c: number): CellLook => {
      const raw = n.rows[k];
      const have = raw && !raw.deleted ? raw : undefined;
      const s = rows[k];
      const same = !!s && !!have && s.status === have.status && s.amount === have.amount;
      if (!have && !s) return { text: '', tone: 'dim', fill: 'outline' };
      return look(have, c, same ? 'ok' : 'hi');
    },
  };
}
