import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { bytes, pct } from '../../core/format';
import { n, pagesCaption } from './captions';
import {
  FREED_STEP, FREE_PATTERNS, FREE_PATTERN_LABELS, OBJECTS_PER_PAGE, PAGES, PAGE_BYTES, PAGE_SEED, pagesOpening, summarisePages, type PageKind,
} from './classes';

const PER_ROW = 16;
const PAGE_CELL = { cell: 17, gap: 2, font: 0 } as const;
const KIND_CELL: Record<PageKind, GridCellSpec> = {
  full: { tone: 'muted', fill: 'tint', intensity: 0.3 },
  partial: { tone: 'bad', fill: 'solid' },
  empty: { tone: 'ok', fill: 'solid' },
};
const iec = (b: number) => bytes(b, { iec: true });

export function PagesScene({ picker }: { picker: ReactNode }) {
  const [open] = useState(pagesOpening);
  const [objectsPerPage, setObjectsPerPage] = useState(open.objectsPerPage);
  const [freed, setFreed] = useState(open.freed);
  const [pattern, setPattern] = useState(open.pattern);

  const setup = useMemo(() => ({ objectsPerPage, freed, pattern }), [objectsPerPage, freed, pattern]);
  const sum = useMemo(() => summarisePages(setup), [setup]);
  const caption = pagesCaption(setup, sum);

  return (
    <StageFrame
      height={420}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Returnable pages" value={`${n(sum.returnable)} of ${n(PAGES)}`} color="var(--ok)" sub="every object on the page is free" />
          <Stat label="Freed" value={iec(sum.freedBytes)} sub={`${pct(freed)} of the objects`} />
          <Stat label="Back to the OS" value={iec(sum.returnedBytes)} color={sum.returnedBytes < sum.freedBytes ? 'var(--bad)' : 'var(--ok)'} sub={`${pct(sum.freedBytes === 0 ? 0 : sum.returnedBytes / sum.freedBytes)} of what was freed`} />
          <Stat label="Stuck in partly used pages" value={iec(sum.stuckBytes)} color={sum.stuckBytes > 0 ? 'var(--bad)' : undefined} sub={`${n(sum.partial)} pages`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--muted)', label: 'full page', shape: 'square' },
            { color: 'var(--bad)', label: 'partly used: free bytes that cannot be returned', shape: 'square' },
            { color: 'var(--ok)', label: 'empty: returnable', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="How objects are freed" value={pattern} onChange={setPattern} options={FREE_PATTERNS.map((p) => ({ value: p, label: FREE_PATTERN_LABELS[p] }))} />
        </>,
        <>
          <Slider label="Objects per page" value={objectsPerPage} min={OBJECTS_PER_PAGE.min} max={OBJECTS_PER_PAGE.max} onChange={setObjectsPerPage} format={(v) => `${v} (${Math.floor(PAGE_BYTES / v)} bytes each)`} />
          <Slider label="Share freed" value={freed} min={0} max={1} step={FREED_STEP} onChange={(v) => setFreed(Math.round(v * 100) / 100)} format={(v) => pct(v)} />
        </>,
      ]}
    >
      <div className="ma-stage stage-pad">
        <Box>
          <SectionTitle hint={`${n(PAGES)} pages of ${iec(PAGE_BYTES)}, in address order`}>The heap, page by page</SectionTitle>
          <CellGrid
            className="ma-pages"
            rows={PAGES / PER_ROW}
            cols={PER_ROW}
            size={PAGE_CELL}
            cell={(r, c) => KIND_CELL[sum.kinds[r * PER_ROW + c]]}
            ariaLabel={`${PAGES} heap pages: ${sum.returnable} empty and returnable, ${sum.partial} partly used, ${sum.full} full`}
          />
        </Box>
        <Hint tone="muted" block>
          A page can go back to the operating system only if every object on it is free. A garbage-collected heap can move survivors together (copying collection) and release whole pages; an allocator behind C pointers cannot, because pointers to the objects are held elsewhere. Tuning knobs exist (<code>malloc_trim</code> in glibc, decay-based purging in jemalloc), but they can only return pages that are already empty.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="toy">equal objects packed into 4 KiB pages; a real heap mixes sizes and keeps its own metadata</Provenance>
          <Provenance kind="simulated" seed={PAGE_SEED}>random freeing is a seeded shuffle</Provenance>
          <Provenance kind="from-memory">malloc_trim in glibc and decay-based purging in jemalloc; verify the names against each allocator&apos;s documentation</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
