import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { bytes, pct } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { n } from './captions';
import { tlbFrames } from './frames';
import { PAGE_NAMES, WALK_REFERENCES, hex } from './paging';
import {
  ACCESSES, ENTRY_OPTIONS, HIT_CYCLES, PATTERNS, PATTERN_LABELS, REFERENCE_CYCLES, STRIDE, WORKING_SET, hitRate, hitRateCurve, reachBytes, runTlb, tlbOpening, translationCost,
  type TlbPageSize,
} from './tlb';

const PER_ROW = 8;
const TLB_CELL = { cell: 34, gap: 3, font: 11 } as const;
const SIZES = [{ value: 'p4k' as const, label: '4 KiB' }, { value: 'p2m' as const, label: '2 MiB' }];
const SMALL_PAGE = 4096;

export function TlbScene({ picker }: { picker: ReactNode }) {
  const [open] = useState(tlbOpening);
  const [entries, setEntries] = useState(open.entries);
  const [size, setSize] = useState<TlbPageSize>(open.size);
  const [pattern, setPattern] = useState(open.pattern);
  const [workingSet, setWorkingSet] = useState(open.workingSet);
  const [stride, setStride] = useState(open.stride);

  const cfg = useMemo(() => ({ entries, size, pattern, workingSet, stride }), [entries, size, pattern, workingSet, stride]);
  const run = useMemo(() => runTlb(cfg), [cfg]);
  const frames = useMemo(() => tlbFrames(cfg, run), [cfg, run]);
  const player = usePlayer(frames, { interval: 260 });
  const i = player.frame.i;
  const step = i >= 0 ? run.steps[i] : null;
  const seen = run.steps.slice(0, i + 1);
  const shown = { hits: seen.filter((s) => s.hit).length, misses: seen.filter((s) => !s.hit).length };
  const curve = useMemo(() => hitRateCurve(cfg), [cfg]);
  const reach = reachBytes(cfg);
  const slots = step ? step.after : run.steps.length ? Array.from({ length: entries }, () => null) : [];
  const rows = Math.ceil(entries / PER_ROW);
  const cols = Math.min(entries, PER_ROW);
  const reachPages = reach / SMALL_PAGE;

  const cell = (r: number, c: number): GridCellSpec => {
    const slot = r * PER_ROW + c;
    const vpn = slots[slot];
    if (vpn === null || vpn === undefined) return { tone: 'dim', fill: 'outline' };
    const text = hex(BigInt(vpn)).slice(2);
    if (step && step.slot === slot) return { text, tone: step.hit ? 'ok' : 'bad', fill: 'solid' };
    return { text, tone: 'muted', fill: 'tint', intensity: 0.2 };
  };

  return (
    <StageFrame
      player={player}
      height={560}
      stats={
        <Stats>
          <Stat label="Hit rate" value={i >= 0 ? pct(hitRate(shown), 1) : '-'} color="var(--ok)" sub={`whole run: ${pct(hitRate(run), 1)}`} />
          <Stat label="Average translation" value={`${translationCost(run, size).toFixed(1)} cycles`} sub={`whole run; hit ${HIT_CYCLES}, walk ${WALK_REFERENCES[size]} x ${REFERENCE_CYCLES} (illustrative)`} />
          <Stat label="TLB reach" value={bytes(reach, { iec: true })} sub={`${n(entries)} entries x ${PAGE_NAMES[size]}`} />
          <Stat label="Working set" value={bytes(workingSet * SMALL_PAGE, { iec: true })} color={workingSet * SMALL_PAGE > reach ? 'var(--bad)' : 'var(--ok)'} sub={workingSet * SMALL_PAGE > reach ? 'larger than the reach' : 'within the reach'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'hit', shape: 'square' },
            { color: 'var(--bad)', label: 'miss (entry just filled)', shape: 'square' },
            { color: 'var(--muted)', label: 'other valid entry', shape: 'square' },
            { color: 'var(--dim)', label: 'empty entry', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Entries" value={entries} onChange={setEntries} options={ENTRY_OPTIONS.map((e) => ({ value: e, label: String(e) }))} />
          <Segmented label="Page size" value={size} onChange={setSize} options={SIZES} />
        </>,
        <>
          <Segmented label="Access pattern" value={pattern} onChange={setPattern} options={PATTERNS.map((p) => ({ value: p, label: PATTERN_LABELS[p] }))} />
          <Slider label="Working set" value={workingSet} min={WORKING_SET.min} max={WORKING_SET.max} onChange={setWorkingSet} format={(v) => `${v} pages`} />
          {pattern === 'stride' && <Slider label="Stride" value={stride} min={STRIDE.min} max={STRIDE.max} onChange={setStride} format={(v) => `${v} pages`} />}
        </>,
      ]}
    >
      <div className="ptt-stage stage-pad">
        <div className="ptt-tlb">
          <Box>
            <SectionTitle hint={`${n(entries)} entries, page numbers in hex`}>The TLB</SectionTitle>
            <CellGrid
              className="ptt-entries"
              rows={rows}
              cols={cols}
              size={TLB_CELL}
              cell={cell}
              rowLabels={Array.from({ length: rows }, (_, r) => `${r * PER_ROW}-${Math.min(entries, (r + 1) * PER_ROW) - 1}`)}
              rowDecor={(r) => (step && Math.floor(step.slot / PER_ROW) === r ? { tone: step.hit ? 'ok' : 'bad', style: 'rail', label: step.hit ? 'hit' : 'miss' } : null)}
              ariaLabel={`TLB of ${entries} entries${step ? `, access ${step.index + 1} was a ${step.hit ? 'hit' : 'miss'} in entry ${step.slot}` : ''}`}
            />
            {step && step.evicted !== null && <p className="ptt-evicted">just evicted: page {hex(BigInt(step.evicted))}</p>}
          </Box>
          <Box>
            <SectionTitle hint={`the same ${ACCESSES}-access run at every working-set size`}>Hit rate against working set</SectionTitle>
            <Plot2D
              x={{ domain: [WORKING_SET.min, WORKING_SET.max], label: 'working set (4 KiB pages)' }}
              y={{ domain: [0, 1], label: 'hit rate', format: (v) => pct(v) }}
              width={356}
              height={200}
              ariaLabel="TLB hit rate against working-set size"
            >
              <Curve points={curve} tone="ok" />
              {reachPages <= WORKING_SET.max && <VLine at={reachPages} label="reach" tone="bad" />}
              <VLine at={workingSet} tone="info" />
            </Plot2D>
          </Box>
        </div>
        <Hint tone="muted" block>
          A TLB entry holds a translation, not data. A cyclic scan over more pages than the TLB has entries evicts each page just before it is needed again under LRU, so the hit rate drops from near 100% to 0% as the working set passes the reach.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="toy">a small LRU TLB over a seeded access stream; real TLBs have levels, associativity and prefetching</Provenance>
          <Provenance kind="illustrative">entry counts and the cycle costs are chosen, not measured; real L1 data TLBs are often around 64 entries and unified second levels around 1,500 or more, verify against a vendor manual or measured sources</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
