import { CellGrid } from '../../components/CellGrid';
import { cellGridFrame } from '../../components/cellGridLayout';
import { Box, SectionTitle } from '../../components/Panel';
import { WideRegion } from '../../components/WideRegion';
import { bytes, plural } from '../../core/format';
import { minWidthForText } from '../../core/scale';
import { Legend } from '../../components/ui';
import { cellKey, slotText, slotsPerPage, type Comparison, type Side } from './layout';
import { FIELD_TONE } from './pageModel';
import { COLUMNS, type Column } from './table';

/** The legend both page scenes share. */
export function PageLegend() {
  return (
    <Legend
      items={[
        ...COLUMNS.map((c) => ({ color: `var(--${FIELD_TONE[c]})`, label: c, shape: 'square' as const })),
        { color: 'var(--hi)', label: 'rail: a page the query touches, with its size (solid cells are the fields it needs)', shape: 'line' as const },
        { color: 'var(--dim)', label: 'a page it never touches', shape: 'line' as const },
      ]}
    />
  );
}

function shapeOf(side: Side, need: ReadonlySet<string>, table: Comparison['table']) {
  const { layout } = side;
  const touched = new Set(side.pages);
  const perColumn = new Map<Column, number>();
  for (const p of layout.pages) if (p.col) perColumn.set(p.col, (perColumn.get(p.col) ?? 0) + 1);
  const seen = new Map<Column, number>();
  const rowLabels = layout.pages.map((p) => {
    if (!p.col) return `page ${p.index + 1}`;
    const k = (seen.get(p.col) ?? 0) + 1;
    seen.set(p.col, k);
    return perColumn.get(p.col)! > 1 ? `${p.col} ${k}` : p.col;
  });
  return {
    rows: layout.pages.length,
    cols: slotsPerPage(layout.pageBytes),
    size: 'sm' as const,
    rowLabels,
    rowDecor: (r: number) => (touched.has(r) ? { tone: 'hi' as const, label: bytes(layout.pageBytes) } : { tone: 'dim' as const }),
    cell: (r: number, c: number) => {
      const slot = layout.pages[r].slots[c];
      if (slot === null) return { tone: 'dim' as const, fill: 'none' as const };
      const text = slotText(table, slot);
      if (!touched.has(r)) return { tone: 'dim' as const, fill: 'outline' as const, text };
      return need.has(cellKey(slot.row, slot.col))
        ? { tone: FIELD_TONE[slot.col], fill: 'solid' as const, text }
        : { tone: FIELD_TONE[slot.col], fill: 'tint' as const, intensity: 0.25, text };
    },
  };
}

function SideGrid({ side, need, table, title, hint, label }: { side: Side; need: ReadonlySet<string>; table: Comparison['table']; title: string; hint: string; label: string }) {
  const shape = shapeOf(side, need, table);
  const frame = cellGridFrame(shape);
  return (
    <Box>
      <SectionTitle hint={hint}>{title}</SectionTitle>
      <WideRegion minWidth={minWidthForText(frame.width, frame.size.font)} label={`${title}: scroll sideways to see all of it`}>
        <CellGrid {...shape} ariaLabel={`${label}: ${plural(side.layout.pages.length, 'page')}, ${plural(side.pages.length, 'page')} touched`} />
      </WideRegion>
    </Box>
  );
}

/** The row store above the column store, each page a row of 4-byte fields; the pages a query touches carry a rail and their size. */
export function PageGrids({ comparison, need }: { comparison: Comparison; need: ReadonlySet<string> }) {
  const n = comparison.table.length;
  return (
    <>
      <SideGrid
        side={comparison.row}
        need={need}
        table={comparison.table}
        title="Row store"
        hint={`${plural(n, 'row')} of ${COLUMNS.length} fields, whole rows only: ${plural(comparison.row.layout.pages.length, 'page')}`}
        label="Row store pages"
      />
      <SideGrid
        side={comparison.column}
        need={need}
        table={comparison.table}
        title="Column store"
        hint={`one column at a time: ${plural(comparison.column.layout.pages.length, 'page')}`}
        label="Column store pages"
      />
    </>
  );
}
