import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid, type GridCellSpec, type GridHighlight } from '../../components/CellGrid';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { pct } from '../../core/format';
import { BLOCKS, MAX_SPARE, MIN_SPARE, PAGES, runTrace, WA_WARN, writeAmplification, type Workload } from './ftl';
import { batchSummary, ssdCaption, ssdIntro, waText } from './ssdText';

const BATCHES = [1, 10, 100] as const;

export function SsdScene({ picker }: { picker: ReactNode }) {
  const [workload, setWorkload] = useState<Workload>('random');
  const [trim, setTrim] = useState(false);
  const [spare, setSpare] = useState(MIN_SPARE);
  const [ops, setOps] = useState({ n: 0, last: 0 });
  const setCaption = useSetCaption();
  const config = useMemo(() => ({ workload, trim, spare }), [workload, trim, spare]);
  const result = useMemo(() => runTrace(config, ops.n, ops.last), [config, ops]);
  const { ftl } = result;
  useIntroCaption(ssdIntro(workload, trim, spare), [workload, trim, spare]);

  const reset = (patch: () => void) => {
    patch();
    setOps({ n: 0, last: 0 });
  };
  const write = (k: number) => {
    const next = { n: ops.n + k, last: k };
    setOps(next);
    setCaption(ssdCaption(batchSummary(runTrace(config, next.n, k)), workload, trim));
  };

  const moved = new Set<string>();
  const erased = new Set<number>();
  let lastWrite: { block: number; page: number } | null = null;
  for (const e of result.recent) {
    if (e.kind === 'gc') e.moved.forEach((m) => moved.add(`${m.block}:${m.page}`));
    if (e.kind === 'erase') erased.add(e.block);
    if (e.kind === 'write') lastWrite = e;
  }

  const cell = (r: number, c: number): GridCellSpec => {
    const p = ftl.blocks[r].pages[c];
    if (p.kind === 'free') return { tone: 'muted', fill: 'outline' };
    if (p.kind === 'stale') return { tone: 'dim', fill: 'tint', text: <tspan className="sd-stale">{p.lpn}</tspan> };
    if (moved.has(`${r}:${c}`)) return { tone: 'violet', fill: 'tint', intensity: 0.45, text: p.lpn };
    return { tone: 'info', fill: 'tint', text: p.lpn };
  };
  const highlight: GridHighlight[] = [
    ...[...erased].flatMap((r) => Array.from({ length: PAGES }, (_, c) => ({ r, c, tone: 'orange' as const }))),
    ...(lastWrite ? [{ r: lastWrite.block, c: lastWrite.page, tone: 'hi' as const }] : []),
  ];
  const valid = (r: number) => ftl.blocks[r].pages.filter((p) => p.kind === 'valid').length;
  const wa = writeAmplification(ftl);

  return (
    <StageFrame
      height={430}
      stats={
        <Stats>
          <Stat label="Host writes" value={ftl.hostWrites} />
          <Stat label="NAND writes" value={ftl.nandWrites} />
          <Stat label="Write amp." value={waText(wa)} color={wa > WA_WARN ? 'var(--bad)' : undefined} sub={`red above ${WA_WARN}`} />
          <Stat label="GC runs" value={ftl.gcRuns} color="var(--violet)" />
          {workload === 'random' && !trim && <Stat label="Deleted, drive unaware" value={result.unseenDeletes} sub="pages the drive wasn't told about" />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'valid page' },
            { color: 'var(--dim)', label: 'stale (struck through)' },
            { color: 'var(--muted)', label: 'free (outline)' },
            { color: 'var(--violet)', label: 'copied by GC' },
            { color: 'var(--orange)', label: 'erased block (ring)' },
            { color: 'var(--hi)', label: 'last host write (ring)' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented
            label="Workload"
            value={workload}
            onChange={(v) => reset(() => setWorkload(v))}
            options={[
              { value: 'random', label: 'Random overwrites' },
              { value: 'sequential', label: 'Sequential' },
            ]}
          />
          <Toggle label="TRIM" value={trim} onChange={(v) => reset(() => setTrim(v))} />
          <Slider label="Spare blocks" value={spare} min={MIN_SPARE} max={MAX_SPARE} onChange={(v) => reset(() => setSpare(v))} format={(v) => `${v} of ${BLOCKS} (${pct(v / BLOCKS)})`} />
        </>,
        <>
          {BATCHES.map((k) => (
            <Button key={k} variant={k === 1 ? 'primary' : 'ghost'} onClick={() => write(k)}>
              Write ×{k}
            </Button>
          ))}
          <Button onClick={() => reset(() => setCaption(ssdIntro(workload, trim, spare)))}>Reset</Button>
        </>,
      ]}
    >
      <div className="sd stage-pad">
        <div className="sd-flash">
          <CellGrid
            rows={BLOCKS}
            cols={PAGES}
            size="sm"
            cell={cell}
            highlight={highlight}
            rowLabels={Array.from({ length: BLOCKS }, (_, r) => `blk ${r}`)}
            rowSuffix={{ width: 112, render: (r) => `${valid(r)} valid · ${ftl.blocks[r].erases}× erased` }}
            ariaLabel="Flash: erase blocks as rows, pages as cells, each showing the logical page it holds"
          />
          <Hint block>
            Each cell is a flash page and shows which logical page it holds. A page is written once; to change data the drive writes a new copy and marks the old one stale. Only a
            whole block can be erased. Toy drive: {BLOCKS} blocks of {PAGES} pages and a simple greedy collector; real SSD firmware is proprietary and smarter.
          </Hint>
        </div>
      </div>
    </StageFrame>
  );
}
