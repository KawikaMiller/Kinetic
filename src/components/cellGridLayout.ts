/**
 * Where CellGrid puts things, without rendering it: the same sizes and positions the
 * component draws, so a scene that embeds a `CellGridGroup` can aim RefArrows at its cells.
 * Pure, so it's tested.
 */
import type { ReactNode } from 'react';
import { gridGeometry } from '../core/grid';
import type { Pt } from '../core/geometry';
import { resolveSize, type CellSize, type SizePreset } from './cellGridPaint';

/** Where things are, for drawing an overlay (arrows between cells, a path) in the grid's coordinates. */
export interface CellGridGeometry {
  /** Top-left corner of a cell. */
  at: (r: number, c: number) => Pt;
  /** Centre of a cell. */
  center: (r: number, c: number) => Pt;
  cell: number;
  gap: number;
  /** Whole drawing size, labels included. */
  width: number;
  height: number;
}

/** The props of CellGrid that decide its geometry. */
export interface CellGridShape {
  rows: number;
  cols: number;
  rowLabels?: readonly ReactNode[];
  colLabels?: readonly ReactNode[];
  size?: SizePreset | CellSize;
  gap?: number;
  rowSuffix?: { width: number };
}

/** Row and column labels: 10px text, about 6.2 units a character. */
export const GRID_LABEL = { FONT: 10, CHAR_W: 6.2 } as const;

const textOf = (node: ReactNode) => (typeof node === 'string' || typeof node === 'number' ? String(node) : null);
const maxLabelChars = (labels: readonly ReactNode[]) => labels.reduce<number>((m, l) => Math.max(m, textOf(l)?.length ?? 2), 0);

/** Everything the component needs: the resolved size, the label gutter, the cell geometry and the full width. */
export function cellGridFrame(p: CellGridShape) {
  const size = resolveSize(p.size ?? 'sm');
  const rowLabelWidth = p.rowLabels ? maxLabelChars(p.rowLabels) * GRID_LABEL.CHAR_W + 8 : 0;
  const colLabelHeight = p.colLabels ? GRID_LABEL.FONT + 8 : 0;
  const geo = gridGeometry({ rows: p.rows, cols: p.cols, cell: size.cell, gap: p.gap ?? size.gap, rowLabelWidth, colLabelHeight });
  const width = geo.width + (p.rowSuffix ? p.rowSuffix.width + 8 : 0);
  return { size, rowLabelWidth, geo, width };
}

/**
 * The grid's geometry, offset by `at` (where a CellGridGroup sits in its scene): cell
 * corners and centres in scene coordinates, for RefArrows to and from cells.
 */
export function cellGridLayout(p: CellGridShape, at: Pt = { x: 0, y: 0 }): CellGridGeometry {
  const { size, geo, width } = cellGridFrame(p);
  const corner = (r: number, c: number) => {
    const q = geo.at(r, c);
    return { x: at.x + q.x, y: at.y + q.y };
  };
  return {
    at: corner,
    center: (r, c) => {
      const q = corner(r, c);
      return { x: q.x + size.cell / 2, y: q.y + size.cell / 2 };
    },
    cell: size.cell,
    gap: geo.gap,
    width,
    height: geo.height,
  };
}
