import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { LogStream } from '../../components/LogStream';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { parseBoundedInt } from '../../core/parse';
import { size, worldCaption } from './captions';
import { MAX_PROCS, Mmu, PAGES, PAGE_BYTES } from './mmu';
import { DEFAULT_WRITE_BYTE, LOG_TONE, POOL_FRAMES, frameLook, hex2, naiveForkBytes, openingWorld, pageReadout, processRowDecor, pteLook, sharedFrameCount } from './view';

const PTE_SIZE = { cell: 28 };
const FRAME_COLS = PAGES;
const FRAME_ROWS = POOL_FRAMES / FRAME_COLS;
const LOG_ROWS = 60;

const parseByte = (text: string) =>
  parseBoundedInt(text, {
    min: 0,
    max: 255,
    plainRadix: 16,
    prefixes: ['hex'],
    messages: { empty: 'Type a byte in hex, 00 to FF.', invalid: (typed) => `"${typed}" is not hex: use 0-9 and A-F.`, tooBig: () => 'A byte is 00 to FF.' },
  });

export function ProcessScene({ picker, scene }: { picker: ReactNode; scene: 'fork' | 'write' }) {
  const [world, setWorld] = useState<Mmu>(() => openingWorld(scene));
  const [selected, setSelected] = useState(1);
  const [page, setPage] = useState(0);
  const [byte, setByte] = useState(DEFAULT_WRITE_BYTE);
  const [byteText, setByteText] = useState(hex2(DEFAULT_WRITE_BYTE));
  const [error, setError] = useState<string | null>(null);
  const [fault, setFault] = useState<{ pid: number; page: number } | null>(null);

  const pids = world.alive.map((p) => p.pid);
  const sel = pids.includes(selected) ? selected : pids[0];
  const update = (f: (m: Mmu) => void) => {
    const next = world.clone();
    f(next);
    setWorld(next);
  };

  const doFork = () => {
    update((m) => m.fork(sel));
    setFault(null);
    setError(null);
  };
  const doWrite = (pid: number, p: number) => {
    const next = world.clone();
    const r = next.write(pid, p, byte);
    setPage(p);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setFault(r.fault ? { pid, page: p } : null);
    setWorld(next);
  };
  const reset = () => {
    const fresh = openingWorld(scene);
    fresh.broken = world.broken;
    setWorld(fresh);
    setFault(null);
    setError(null);
    setSelected(1);
  };
  const typeByte = (text: string) => {
    setByteText(text);
    const r = parseByte(text);
    if (r.ok) {
      setByte(r.value);
      setError(null);
    } else setError(`${r.error} Keeping ${hex2(byte)}.`);
  };

  const rows = useMemo(() => world.log.map((e, i) => ({ id: i, text: e.text, tone: LOG_TONE[e.kind] })), [world]);
  const readout = pageReadout(world, page);
  const shared = sharedFrameCount(world);
  const row = fault ? pids.indexOf(fault.pid) : -1;

  return (
    <StageFrame
      height={470}
      intro={worldCaption(world)}
      introKey={[world]}
      stats={
        <Stats>
          <Stat label="Frames in use" value={`${world.framesInUse} of ${POOL_FRAMES}`} color={shared > 0 ? 'var(--violet)' : undefined} sub={`${shared} shared by more than one entry`} />
          <Stat label="Bytes copied" value={size(world.copiedPages * PAGE_BYTES)} color={world.copiedPages > 0 ? 'var(--ok)' : undefined} sub={`${world.copiedPages} ${world.copiedPages === 1 ? 'page' : 'pages'} of ${size(PAGE_BYTES)}`} />
          <Stat label="Fork cost so far" value={`${world.forkedEntries} entries`} sub={`a naive fork copies ${size(naiveForkBytes(world))} each time`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'read-only, copy-on-write entry (outlined)', shape: 'square' },
            { color: 'var(--violet)', label: 'a frame shared by 2 or more entries, with its count', shape: 'square' },
            { color: 'var(--hi)', label: 'the entry that just took a write fault (ring)', shape: 'square' },
            { color: 'var(--ok)', label: 'a new private copy', shape: 'square' },
            { color: 'var(--dim)', label: 'a free frame or an unmapped page', shape: 'square' },
            { color: 'var(--bad)', label: 'a broken write through a shared page', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Process" value={sel} onChange={setSelected} options={pids.map((pid) => ({ value: pid, label: `P${pid}` }))} />
          <Button variant="primary" onClick={doFork} softDisabled={pids.length >= MAX_PROCS}>Fork the selected process</Button>
          <Button onClick={() => { update((m) => m.exit(sel)); setFault(null); }} softDisabled={pids.length <= 1}>Exit it</Button>
          <Button onClick={reset}>Reset</Button>
        </>,
        <>
          <TextField label="Byte to write (hex)" value={byteText} onChange={typeByte} onBlur={() => setByteText(hex2(byte))} width={80} spellCheck={false} />
          <Toggle label="Fault handler" value={world.broken} onChange={(v) => update((m) => { m.broken = v; })} off="Copies" on="Writes through (broken)" />
        </>,
      ]}
    >
      <div className="fk-stage stage-pad">
        <div className="fk-top">
          <Box>
            <SectionTitle hint="a row per process, a column per page; click a page to write the byte to it">Page tables</SectionTitle>
            <CellGrid
              rows={pids.length}
              cols={PAGES}
              size={PTE_SIZE}
              rowLabels={pids.map((pid) => `P${pid}`)}
              colLabels={Array.from({ length: PAGES }, (_, i) => i)}
              rowDecor={processRowDecor(world, pids)}
              cell={(r, c) => pteLook(world, pids[r], c)}
              highlight={row >= 0 && fault ? [{ r: row, c: fault.page, tone: world.broken ? 'bad' : 'hi' }] : []}
              onCellClick={(r, c) => doWrite(pids[r], c)}
              cellAriaLabel={(r, c) => `P${pids[r]} page ${c}, ${pteLook(world, pids[r], c).text || 'unmapped'}: press to write ${hex2(byte)}`}
              ariaLabel="Page tables of the processes"
            />
          </Box>
          <Box>
            <SectionTitle hint="each cell is a 4 KB frame; the number is how many entries map it">Frame pool</SectionTitle>
            <CellGrid
              rows={FRAME_ROWS}
              cols={FRAME_COLS}
              size={PTE_SIZE}
              cell={(r, c) => frameLook(world, r * FRAME_COLS + c)}
              cellTitle={(r, c) => `frame ${r * FRAME_COLS + c}: ${world.frames[r * FRAME_COLS + c].refs} mapping it`}
              ariaLabel="Frame pool with reference counts"
            />
          </Box>
        </div>
        <div className="fk-top">
          <Box>
            <SectionTitle hint={`page ${page}: click another page to look at it`}>What each process reads on page {page}</SectionTitle>
            <table className="data-table fk-table">
              <thead><tr><th scope="col">Process</th><th scope="col">Frame</th><th scope="col">Reads</th><th scope="col">Entry</th></tr></thead>
              <tbody>
                {readout.map((r) => (
                  <tr key={r.pid}><th scope="row">P{r.pid}</th><td>{r.frame === null ? 'none' : `${r.frame} (count ${r.refs})`}</td><td>{r.byte === null ? 'unmapped' : hex2(r.byte)}</td><td>{r.writable ? 'writable' : 'read-only, COW'}</td></tr>
                ))}
              </tbody>
            </table>
          </Box>
          <Box>
            <SectionTitle hint="what the kernel did on each fault">Fault log</SectionTitle>
            <LogStream label="Fork and fault log" rows={rows} maxHeight={170} follow max={LOG_ROWS} empty="Nothing yet." />
          </Box>
        </div>
        {error && <p className="fk-status" role="status">{error}</p>}
        <Hint tone="muted" block>Each page holds one byte here, standing in for {size(PAGE_BYTES)}. Nothing is written until you click a page.</Hint>
        <ProvenanceRow>
          <Provenance kind="toy">a toy MMU with {PAGES} pages of 4 KB; real kernels also track dirty and accessed bits, swap and file-backed pages</Provenance>
          <Provenance kind="simulated">every count and byte comes from the model; the naive fork is the oracle the tests compare it with</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
