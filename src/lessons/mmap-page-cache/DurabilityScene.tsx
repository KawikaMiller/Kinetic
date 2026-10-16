import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { LogStream } from '../../components/LogStream';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { durabilityCaption, plural, powerVerdict, stepText } from './captions';
import {
  BROKEN_ACK_SEED, DEFAULT_ACK_MODE, DIRTY_EXPIRE, DURABILITY_PAGES, ack, advance, dirtyCount, freshMachine, fsync, kill, lostWrites, powerCut, runSchedule, scheduleFor, planFor, touchAfterTruncate, untilWake,
  writePage, type AckMode, type Machine, type Via,
} from './durability';

const VIA_OPTIONS = [{ value: 'write' as const, label: 'write()' }, { value: 'mmap' as const, label: 'a store through the mapping' }];
const COLS = 8;
const ROWS = DURABILITY_PAGES / COLS;
const CELL = { cell: 30 };
const ADVANCE_TICKS = 10;
const TRUNCATED_PAGES = 16;
const FAR_PAGE = 40;

export function DurabilityScene({ picker }: { picker: ReactNode }) {
  const [m, setM] = useState<Machine>(freshMachine);
  const [via, setVia] = useState<Via>('write');
  const [mode, setMode] = useState<AckMode>(DEFAULT_ACK_MODE);
  const [seed, setSeed] = useState(BROKEN_ACK_SEED);
  const [truncated, setTruncated] = useState(false);
  const [touched, setTouched] = useState<string | null>(null);

  const doWrite = (page: number) => {
    const r = writePage(m, page, via);
    if (!r) return;
    setM(mode === 'before' ? ack(r.m, r.ack) : r.m);
  };
  const lost = lostWrites(m);
  const rows = useMemo(() => m.log.map((text, id) => ({ id, text, tone: text.startsWith('power cut') ? ('bad' as const) : text.includes('written to disk') ? ('ok' as const) : undefined })), [m]);
  const seeded = useMemo(() => {
    const plan = planFor(seed);
    return { run: runSchedule(seed, mode), steps: scheduleFor(plan, mode).steps };
  }, [seed, mode]);
  const reset = () => {
    setM(freshMachine());
    setTouched(null);
  };
  const touch = (method: 'read' | 'mmap') => {
    const r = touchAfterTruncate(method, FAR_PAGE, TRUNCATED_PAGES);
    setTouched(r.kind === 'sigbus' ? `mmap: the mapping was made before the truncation, so touching page ${FAR_PAGE} of the now ${TRUNCATED_PAGES}-page file raises SIGBUS (scripted here)` : r.kind === 'eof' ? `read(): asking for page ${FAR_PAGE} returns 0 bytes, end of file` : 'inside the file: fine');
  };
  const live = m.poweredOn;

  return (
    <StageFrame
      height={470}
      intro={durabilityCaption(m, mode)}
      introKey={[m, mode]}
      stats={
        <Stats>
          <Stat label="Dirty pages in the cache" value={dirtyCount(m)} color={dirtyCount(m) > 0 ? 'var(--hi)' : undefined} sub={live ? `writeback in ${untilWake(m)} ticks flushes pages dirty for ${DIRTY_EXPIRE}+` : 'power is off: the cache is gone'} />
          <Stat label="Saves acknowledged" value={m.acked.length} sub={mode === 'before' ? 'told when write returns' : 'told after fsync'} />
          <Stat label="Acknowledged writes lost" value={live ? 'power is on' : lost.length} color={!live ? (lost.length > 0 ? 'var(--bad)' : 'var(--ok)') : undefined} sub={live ? 'pull the plug to find out' : 'acknowledged but not on disk'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--dim)', label: 'a page not cached (outlined)', shape: 'square' },
            { color: 'var(--ok)', label: 'cached and clean, or on disk', shape: 'square' },
            { color: 'var(--hi)', label: 'cached and dirty', shape: 'square' },
            { color: 'var(--bad)', label: 'an acknowledged write that is gone', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Write by" value={via} onChange={setVia} options={VIA_OPTIONS} />
          <Toggle label="Tell the user it is saved" value={mode === 'after'} onChange={(v) => setMode(v ? 'after' : 'before')} off="Before fsync" on="After fsync" />
        </>,
        <>
          <Button onClick={() => setM(advance(m, ADVANCE_TICKS))} softDisabled={!live}>Let {ADVANCE_TICKS} ticks pass</Button>
          <Button onClick={() => setM(fsync(m, mode === 'after'))} softDisabled={!live}>fsync / msync</Button>
          <Button onClick={() => setM(kill(m))} softDisabled={!live || !m.processAlive}>Kill the process</Button>
          <Button variant="danger" onClick={() => setM(powerCut(m))} softDisabled={!live}>Power cut</Button>
          <Button variant="danger" onClick={() => setM(powerCut(fsync(m, mode === 'after')))} softDisabled={!live}>fsync, then power cut</Button>
          <Button onClick={reset}>Reset</Button>
        </>,
      ]}
    >
      <div className="mp-stage stage-pad">
        <div className="mp-two">
          <Box>
            <SectionTitle hint="click a page to save to it; the number is its version">The page cache (RAM)</SectionTitle>
            <CellGrid
              rows={ROWS}
              cols={COLS}
              size={CELL}
              cell={(r, c) => {
                const page = r * COLS + c;
                const p = m.cache[page];
                if (!p) return { tone: 'dim', fill: 'outline' };
                return { tone: p.dirty ? 'hi' : 'ok', fill: 'tint', text: `v${p.version}` };
              }}
              onCellClick={live && m.processAlive ? (r, c) => doWrite(r * COLS + c) : undefined}
              cellAriaLabel={(r, c) => `page ${r * COLS + c}, ${m.cache[r * COLS + c] ? (m.cache[r * COLS + c]!.dirty ? 'dirty' : 'clean') : 'not cached'}: press to save to it`}
              ariaLabel="Page cache of 16 pages"
            />
          </Box>
          <Box>
            <SectionTitle hint="what survives a power cut">The disk</SectionTitle>
            <CellGrid
              rows={ROWS}
              cols={COLS}
              size={CELL}
              cell={(r, c) => {
                const v = m.disk[r * COLS + c];
                const gone = m.acked.some((a) => a.page === r * COLS + c && a.version > v) && !live;
                return v === 0 ? { tone: gone ? 'bad' : 'dim', fill: 'outline' } : { tone: gone ? 'bad' : 'ok', fill: 'tint', text: `v${v}` };
              }}
              cellTitle={(r, c) => `page ${r * COLS + c} on disk: version ${m.disk[r * COLS + c]}`}
              ariaLabel="Disk contents of 16 pages"
            />
          </Box>
        </div>
        {!live && (
          <p className={`mp-verdict ${lost.length > 0 ? 'is-bad' : 'is-ok'}`} role="status">
            {powerVerdict(m)}
          </p>
        )}
        <Box>
          <SectionTitle hint="what the kernel did">Log</SectionTitle>
          <LogStream label="Page cache events" rows={rows} maxHeight={130} follow max={50} empty="Click a page of the cache to save to it." />
        </Box>
        <Box>
          <SectionTitle hint={`the same pull-the-plug test over a seeded schedule, in the policy you picked`}>Seeded crash, seed {seed}</SectionTitle>
          <div className="mp-seed">
            <SeedField key={seed} seed={seed} onSeed={setSeed} />
            <Button onClick={() => setSeed(BROKEN_ACK_SEED)}>Load seed {BROKEN_ACK_SEED}</Button>
          </div>
          <p className="mp-seeded">
            {mode === 'before' ? 'Acknowledging before fsync' : 'Acknowledging after fsync'}, seed {seed}: {plural(seeded.run.lost.length, 'acknowledged write')} lost
            {seeded.run.lost.length > 0 ? ` (${seeded.run.lost.map((a) => `page ${a.page} v${a.version}`).join(', ')})` : ''}. The plug was pulled after: {stepText(seeded.steps.at(-1)!)}.
          </p>
          <Hint tone="muted" block>Seed {BROKEN_ACK_SEED} is the lowest of 200 on which acknowledging before fsync loses a write; acknowledging after fsync loses none of the 200.</Hint>
        </Box>
        <Box>
          <SectionTitle hint="a mapped access is a signal, not a return code">Pitfall: truncating a mapped file</SectionTitle>
          <div className="mp-seed">
            <Button onClick={() => { setTruncated(true); setTouched(null); }} softDisabled={truncated}>Truncate the file to {TRUNCATED_PAGES} pages</Button>
            <Button onClick={() => touch('mmap')} softDisabled={!truncated}>Touch page {FAR_PAGE} through the mapping</Button>
            <Button onClick={() => touch('read')} softDisabled={!truncated}>read() page {FAR_PAGE}</Button>
          </div>
          {touched && <p className="mp-seeded" role="status">{touched}.</p>}
          <ProvenanceRow>
            <Provenance kind="scripted">the SIGBUS is a one-line rule here, not a signal the page raised</Provenance>
          </ProvenanceRow>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>an LRU toy; Linux uses per-device writeback and more elaborate lists</Provenance>
          <Provenance kind="illustrative">ticks stand for seconds: a wake every 5 and a 30-tick dirty age are the usual Linux defaults (dirty_writeback_centisecs 500, dirty_expire_centisecs 3000, read on one WSL2 kernel)</Provenance>
          <Provenance kind="from-memory">a mapped access past a truncated end raises SIGBUS (seen once on Linux 6.18, WSL2, not run here); an I/O error on a mapped page also arrives as a signal rather than a return code; page cache is charged to the cgroup that touched it: check man 2 mmap and the cgroup docs</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
