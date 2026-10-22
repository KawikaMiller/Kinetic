import { CellGrid, type GridCellSpec, type GridHighlight } from '../../components/CellGrid';
import { WideRegion } from '../../components/WideRegion';
import type { Table } from './model';

const GRID_MIN_WIDTH = 480;

/** The jump table: a row per level k (2^k-th ancestor), a column per node. `cell` decides what each cell shows. */
export function TableGrid({
  table, cell, highlight, onCellClick, revealColumn,
}: {
  table: Table;
  cell: (k: number, v: number) => GridCellSpec;
  highlight?: readonly GridHighlight[];
  onCellClick?: (k: number, v: number) => void;
  /** A node whose column to keep on screen when the table is wider than a phone. */
  revealColumn?: number;
}) {
  const n = table.parents.length;
  // One label column plus n node columns share the width.
  const span = revealColumn === undefined ? null : { from: (revealColumn + 1) / (n + 1), to: (revealColumn + 2) / (n + 1) };
  return (
    <WideRegion minWidth={GRID_MIN_WIDTH} label="The jump table: scroll sideways to see all of it" reveal={span}>
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
