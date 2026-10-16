import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { n, sharingCaption } from './captions';
import {
  BURST_RANGE, COUNTER_BYTES, HIT_CYCLES, LAYOUTS, OFFSET_MAX, OFFSET_STEP, SHOWN_WRITES, TRANSFER_CYCLES, WRITES_RANGE, costCurve, counterSlots, layoutLabel, runSharing,
  sharingOpening, type Layout, type LineBytes,
} from './sharing';

const SLOT_CELL = { cell: 22, gap: 2, font: 10 } as const;
const WRITE_CELL = { cell: 17, gap: 2, font: 10 } as const;
const PER_ROW = 16;
const LINES_SHOWN = 2;
const LINE_SIZES = [{ value: 64 as const, label: '64 bytes' }, { value: 128 as const, label: '128 bytes' }];

export function SharingScene({ picker }: { picker: ReactNode }) {
  const [open] = useState(sharingOpening);
  const [layout, setLayout] = useState<Layout>(open.layout);
  const [lineBytes, setLineBytes] = useState<LineBytes>(open.lineBytes);
  const [offsetA, setOffsetA] = useState(open.offsetA);
  const [offsetB, setOffsetB] = useState(open.offsetB);
  const [burst, setBurst] = useState(open.burst);
  const [writes, setWrites] = useState(open.writes);

  const cfg = useMemo(() => ({ layout, lineBytes, offsetA, offsetB, burst, writes }), [layout, lineBytes, offsetA, offsetB, burst, writes]);
  const run = useMemo(() => runSharing(cfg), [cfg]);
  const padded = useMemo(() => runSharing({ ...cfg, layout: 'padded' }), [cfg]);
  const curve = useMemo(() => costCurve(cfg), [cfg]);
  const paddedCurve = useMemo(() => costCurve(cfg, 'padded'), [cfg]);
  const slots = useMemo(() => counterSlots(cfg), [cfg]);
  const caption = sharingCaption(cfg, run);
  const costMax = Math.max(...curve.map((p) => p.cost), ...paddedCurve.map((p) => p.cost));

  const slotCell = (line: number, slot: number): GridCellSpec => {
    const here = slots.filter((s) => s.line === line && s.slot === slot);
    if (here.length === 2) return { text: 'A+B', tone: 'violet', fill: 'solid' };
    if (here.length === 1) return here[0].thread === 0 ? { text: 'A', tone: 'sky', fill: 'solid' } : { text: 'B', tone: 'amber', fill: 'solid' };
    return { tone: 'dim', fill: 'outline' };
  };
  const writeCell = (r: number, c: number): GridCellSpec => {
    const rec = run.records[r * PER_ROW + c];
    if (!rec) return { fill: 'none' };
    return { text: rec.thread === 0 ? 'A' : 'B', tone: rec.transfer ? 'bad' : 'ok', fill: rec.transfer ? 'solid' : 'tint', intensity: 0.3 };
  };
  const shownWrites = Math.min(SHOWN_WRITES, run.records.length);

  return (
    <StageFrame
      height={520}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Ownership transfers" value={n(run.transfers)} color="var(--bad)" sub={run.readTransfers ? `plus ${n(run.readTransfers)} line read to merge` : 'read-for-ownership and upgrades'} />
          <Stat label="Hits" value={n(run.hits)} color="var(--ok)" sub="writes that found the line in their own cache" />
          <Stat label="Cost" value={n(run.cost)} color={run.cost <= padded.cost ? 'var(--ok)' : 'var(--bad)'} sub={[`${n(run.transfers + run.readTransfers)} x ${n(TRANSFER_CYCLES)} + ${n(run.hits)} x ${HIT_CYCLES}`, `padded: ${n(padded.cost)}`]} />
          <Stat label="Bus transactions" value={n(run.busTransactions)} color="var(--violet)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--sky)', label: 'thread A\'s counter', shape: 'square' },
            { color: 'var(--amber)', label: 'thread B\'s counter', shape: 'square' },
            { color: 'var(--violet)', label: 'one variable both threads write', shape: 'square' },
            { color: 'var(--bad)', label: 'a write that moved the line', shape: 'square' },
            { color: 'var(--ok)', label: 'a write that hit', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented ariaLabel="Counter layout" label="Layout" value={layout} onChange={setLayout} options={LAYOUTS.map((l) => ({ value: l, label: layoutLabel(l, lineBytes) }))} />
        </>,
        <>
          <Segmented label="Cache line size" value={lineBytes} onChange={setLineBytes} options={LINE_SIZES} />
          <Slider label="Burst: writes in a row" value={burst} min={BURST_RANGE.min} max={BURST_RANGE.max} onChange={setBurst} />
          <Slider label="Run length" value={writes} min={WRITES_RANGE.min} max={WRITES_RANGE.max} step={WRITES_RANGE.step} onChange={setWrites} format={(v) => `${v} writes`} />
        </>,
        ...(layout === 'adjacent'
          ? [
              <>
                <Slider label="Counter A at byte" value={offsetA} min={0} max={OFFSET_MAX} step={OFFSET_STEP} onChange={setOffsetA} />
                <Slider label="Counter B at byte" value={offsetB} min={0} max={OFFSET_MAX} step={OFFSET_STEP} onChange={setOffsetB} />
              </>,
            ]
          : []),
      ]}
    >
      <div className="cc-stage stage-pad">
        <div className="cc-sharing">
          <Box>
            <SectionTitle hint={`${COUNTER_BYTES}-byte slots, ${lineBytes}-byte lines`}>Where the counters live</SectionTitle>
            <CellGrid
              className="cc-slots"
              rows={LINES_SHOWN}
              cols={lineBytes / COUNTER_BYTES}
              size={SLOT_CELL}
              cell={(r, c) => slotCell(r, c)}
              rowLabels={Array.from({ length: LINES_SHOWN }, (_, i) => `line ${i}`)}
              ariaLabel={`Cache lines: counter A in line ${slots[0].line}, counter B in line ${slots[1].line}`}
            />
            {run.refused && <p className="cc-refused" role="status">{run.refused}: it is the shared-counter case.</p>}
          </Box>
          <Box>
            <SectionTitle hint={`first ${shownWrites} of ${n(writes)} writes`}>Each write: hit or line moved</SectionTitle>
            <CellGrid
              className="cc-writes"
              rows={Math.ceil(shownWrites / PER_ROW)}
              cols={PER_ROW}
              size={WRITE_CELL}
              cell={writeCell}
              ariaLabel={`The first ${shownWrites} writes: ${run.records.slice(0, shownWrites).filter((r) => r.transfer).length} moved the line`}
            />
          </Box>
        </div>
        <Box>
          <SectionTitle hint="the same run at every burst length">Cost against burst length</SectionTitle>
          <Plot2D
            x={{ domain: [BURST_RANGE.min, BURST_RANGE.max], label: 'writes in a row' }}
            y={{ domain: [0, Math.ceil(costMax * 1.05)], label: 'cost (cycles)', format: (v) => n(Math.round(v)) }}
            width={356}
            height={220}
            ariaLabel="Cost of the run against burst length, for the chosen layout and for padded counters"
          >
            <Curve points={paddedCurve.map((p): [number, number] => [p.burst, p.cost])} tone="ok" dashed />
            <Curve points={curve.map((p): [number, number] => [p.burst, p.cost])} tone="bad" />
            <VLine at={burst} label={`${burst}`} />
          </Plot2D>
          <Legend items={[{ color: 'var(--bad)', label: layoutLabel(layout, lineBytes), shape: 'line' }, { color: 'var(--ok)', label: 'padded (dashed)', shape: 'line' }]} />
        </Box>
        <Hint tone="muted" block>
          Padding separates two variables onto two lines. It cannot help two threads that really write one variable: the line still moves, and a shared atomic counter costs what the one-line layout costs.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="toy">the MESI machine of the first scene, one line per counter, atomic bus transactions, no store buffer</Provenance>
          <Provenance kind="illustrative">{TRANSFER_CYCLES} cycles to move a line and {HIT_CYCLES} for a hit are round numbers, not measurements</Provenance>
          <Provenance kind="from-memory">many x86 CPUs have 64-byte lines and some Apple Arm designs are reported to use 128; padding in C++ is `alignas(64)` or `std::hardware_destructive_interference_size`, in Java `@Contended`; verify against the vendor manuals and language references</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
