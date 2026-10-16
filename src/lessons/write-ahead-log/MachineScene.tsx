import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { LogStream } from '../../components/LogStream';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { parseBoundedInt } from '../../core/parse';
import { crashReport, machineCaption, plural, verdictText, type CrashReport } from './captions';
import {
  MACHINE_OPEN, MACHINE_TXS, PAGE_COLS, PAGE_NUMBERS, PRESETS, dirtyCount, logRows, pageCell, pageRail, presetMachine,
} from './view';
import {
  MAX_RECORDS, MAX_VALUE, MIN_VALUE, PAGES, abort, checkpoint, commit, fresh, flushPage, fsyncLog, withPolicy, write, type Machine, type Policy, type Result,
} from './wal';

const TX_OPTIONS = MACHINE_TXS.map((t) => ({ value: t, label: `T${t}` }));
const CELL = { cell: 34 };

export function MachineScene({ picker }: { picker: ReactNode }) {
  const [m, setM] = useState<Machine>(() => fresh(MACHINE_OPEN.policy));
  const [tx, setTx] = useState<number>(MACHINE_OPEN.tx);
  const [page, setPage] = useState<number>(MACHINE_OPEN.page);
  const [valueText, setValueText] = useState(String(MACHINE_OPEN.value));
  const [note, setNote] = useState<string | null>(null);
  const [report, setReport] = useState<(CrashReport & { torn: boolean }) | null>(null);

  const parsed = useMemo(() => parseBoundedInt(valueText, { min: MIN_VALUE, max: MAX_VALUE, messages: { empty: 'Type a value.', invalid: (t) => `"${t}" isn't a whole number.`, tooSmall: () => `Keep it from ${MIN_VALUE} to ${MAX_VALUE}.`, tooBig: () => `Keep it from ${MIN_VALUE} to ${MAX_VALUE}.` } }), [valueText]);
  const crashed = report !== null;
  const rows = useMemo(() => logRows(m, report?.image.torn ?? null), [m, report]);
  const caption = report ? verdictText(report, m.acked) : machineCaption(m);

  const run = (f: (m: Machine) => Result) => {
    const r = f(m);
    if ('m' in r) {
      setM(r.m);
      setNote(null);
    } else setNote(r.refused);
  };
  const toggle = (patch: Partial<Policy>) => setM(withPolicy(m, patch));
  const load = (id: string) => {
    setM(presetMachine(id));
    setReport(null);
    setNote(null);
  };
  const reset = () => {
    setM(fresh(m.policy));
    setReport(null);
    setNote(null);
  };
  const doCrash = (torn: boolean) => setReport({ ...crashReport(m, torn), torn });
  const shown = report ? report.recovered : null;

  return (
    <StageFrame
      height={520}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Log records" value={`${m.log.length} of ${MAX_RECORDS}`} sub={m.durable === 0 ? 'none durable' : `durable up to LSN ${m.durable}`} />
          <Stat label="Dirty pages" value={dirtyCount(m)} color={dirtyCount(m) > 0 ? 'var(--hi)' : undefined} sub="newest change not on disk" />
          <Stat label="Page writes" value={m.pageWrites} sub="random writes to the data file" />
          <Stat label="Log fsyncs" value={m.fsyncs} sub="sequential appends made durable" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a committed transaction\'s records', shape: 'square' },
            { color: 'var(--bad)', label: 'an uncommitted transaction (a loser)', shape: 'square' },
            { color: 'var(--dim)', label: 'undone, or still only in memory', shape: 'square' },
            { color: 'var(--violet)', label: 'the durable boundary of the log', shape: 'line' },
            { color: 'var(--hi)', label: 'a dirty page: its newest change is not on disk', shape: 'square' },
            { color: 'var(--orange)', label: 'a page LSN past the durable log, or a torn record', shape: 'square' },
            { color: 'var(--info)', label: 'a checkpoint record', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlsPresets onLoad={load} />
        </>,
        <>
          <Toggle label="Steal" value={m.policy.steal} onChange={(v) => toggle({ steal: v })} off="No-steal" on="Steal" />
          <Toggle label="Force" value={m.policy.force} onChange={(v) => toggle({ force: v })} off="No-force" on="Force" />
          <Toggle label="WAL rule" value={m.policy.enforceWal} onChange={(v) => toggle({ enforceWal: v })} off="Off (broken)" on="Enforced" />
          <Toggle label="Acknowledge commit" value={m.policy.ackBeforeFsync} onChange={(v) => toggle({ ackBeforeFsync: v })} off="After fsync" on="Before fsync (broken)" />
        </>,
        <>
          <Segmented label="Transaction" value={tx} onChange={setTx} options={TX_OPTIONS} />
          <Slider label="Page" value={page} min={0} max={PAGES - 1} onChange={setPage} />
          <TextField label="Value" value={valueText} onChange={setValueText} width={70} spellCheck={false} />
          {!parsed.ok && <Hint tone="muted">{parsed.error}</Hint>}
        </>,
        <>
          <Button variant="primary" softDisabled={crashed || !parsed.ok} onClick={() => parsed.ok && run((x) => write(x, tx, page, parsed.value))}>T{tx} writes page {page}</Button>
          <Button softDisabled={crashed} onClick={() => run((x) => commit(x, tx))}>Commit T{tx}</Button>
          <Button softDisabled={crashed} onClick={() => run((x) => abort(x, tx))}>Abort T{tx}</Button>
          <Button softDisabled={crashed} onClick={() => run((x) => flushPage(x, page))}>Flush page {page}</Button>
          <Button softDisabled={crashed} onClick={() => run(fsyncLog)}>fsync the log</Button>
          <Button softDisabled={crashed} onClick={() => run(checkpoint)}>Checkpoint</Button>
          <Button variant="danger" softDisabled={crashed} onClick={() => doCrash(false)}>Crash now</Button>
          <Button variant="danger" softDisabled={crashed} onClick={() => doCrash(true)}>Crash, last record torn</Button>
          <Button onClick={reset}>Reset</Button>
        </>,
      ]}
    >
      <div className="wal-stage stage-pad">
        <div className="wal-two">
          <Box>
            <SectionTitle hint="the pool is memory, the disk is the data file">{shown ? 'Pages after recovery' : 'Pages'}</SectionTitle>
            <CellGrid
              rows={PAGES}
              cols={PAGE_COLS.length}
              size={CELL}
              rowLabels={PAGE_NUMBERS}
              colLabels={PAGE_COLS}
              cell={(r, c) => {
                if (shown) {
                  const v = shown.disk[r];
                  return c === 0 ? { text: '', fill: 'none' } : c === 1 ? { text: String(v), tone: report!.violations.length > 0 && report!.violations.some((x) => x.message.startsWith(`page ${r} `)) ? 'bad' : 'ok', fill: 'tint' } : { text: String(shown.diskLsn[r]), tone: 'muted', fill: 'outline' };
                }
                return pageCell(m, r, c);
              }}
              rowDecor={(r) => (shown ? null : pageRail(m, r))}
              ariaLabel="The eight pages: pool copy, disk copy and page LSN"
            />
            {note && <Hint tone="muted" block>{note}.</Hint>}
          </Box>
          <Box>
            <SectionTitle hint={`${plural(m.log.length, 'record')}; the log is appended in order`}>The log</SectionTitle>
            <LogStream label="Log records" rows={rows} maxHeight={250} follow max={MAX_RECORDS + 2} live="off" empty="No records yet. Write a page." />
          </Box>
        </div>
        <ProvenanceRow>
          <Provenance kind="simulated">a toy of 8 pages and a {MAX_RECORDS}-record log; no real file is written</Provenance>
          <Provenance kind="toy">simplified ARIES: a sharp checkpoint, no analysis pass, one log, a lock on each page until its writer finishes</Provenance>
          <Provenance kind="from-memory">Postgres calls its log the WAL, InnoDB has a redo log and an undo log, SQLite has a WAL mode: the names and details differ, check your database</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

function ControlsPresets({ onLoad }: { onLoad: (id: string) => void }) {
  return (
    <>
      {PRESETS.map((p) => (
        <ChipButton key={p.id} tone="info" size="md" onClick={() => onLoad(p.id)}>{p.label}</ChipButton>
      ))}
    </>
  );
}
