import { CellGrid, type GridCellSpec, type GridHighlight } from '../../components/CellGrid';
import { WideRegion } from '../../components/WideRegion';
import type { Table } from './model';

const GRID_MIN_WIDTH = 480;

/** The jump table: a row per level k (2^k-th ancestor), a column per node. `cell` decides what each cell shows. */
export function TableGrid({
  table, cell, highlight, onCellClick,
}: {
  table: Table;
  cell: (k: number, v: number) => GridCellSpec;
  highlight?: readonly GridHighlight[];
  onCellClick?: (k: number, v: number) => void;
}) {
  const n = table.parents.length;
  return (
    <WideRegion minWidth={GRID_MIN_WIDTH} label="The jump table: scroll sideways to see all of it">
      <CellGrid
        rows={table.levels}
        cols={n}
        size="sm"
        cell={cell}
        rowLabels={Array.from({ length: table.levels }, (_, k) => `k = ${k}`)}
        colLabels={Array.from({ length: n }, (_, v) => v)}
        highlight={highlight}
        onCellClick={onCellClick}
        cellAriaLabel={(k, v) => `up[${k}][${v}]: ${cell(k, v).text || 'not filled in'}`}
        ariaLabel="The jump table: row k holds the 2^k-th ancestor of each node"
      />
    </WideRegion>
  );
}
