/**
 * Where CellGrid puts things, without rendering it: the same sizes and positions the
 * component draws, so a scene that embeds a `CellGridGroup` can aim RefArrows at its cells.
 * Pure, so it's tested.
 */
import type { ReactNode } from 'react';
import { gridGeometry } from '../core/grid';
import type { Pt } from '../core/geometry';
import type { Tone } from '../core/tone';
import { resolveSize, type CellSize, type SizePreset } from './cellGridPaint';

/**
 * A decoration for a whole row: a `rail` (a thin bar beside the cells) or a `band` (a wash
 * behind them) in a tone, plus an optional label after the row. Returning nothing leaves the row plain.
 */
export interface RowDecor {
  tone?: Tone;
  /** Drawn after the row (and after a `rowSuffix`); strings and numbers set the width reserved for it. */
  label?: ReactNode;
  style?: 'rail' | 'band';
}
export type RowDecorFn = (r: number) => RowDecor | null | undefined;

/** A rail is this wide, with `RAIL_GAP` between it and the first cell; rails reserve that gutter left of the cells. */
export const RAIL_WIDTH = 4;
export const RAIL_GAP = 4;
export const RAIL_GUTTER = RAIL_WIDTH + RAIL_GAP;
/** A band reaches this far past the cells on every side, so it shows around them. */
export const BAND_PAD = 3;

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
  rowDecor?: RowDecorFn;
}

/** Row and column labels: 10px text, about 6.2 units a character. */
export const GRID_LABEL = { FONT: 10, CHAR_W: 6.2 } as const;

const textOf = (node: ReactNode) => (typeof node === 'string' || typeof node === 'number' ? String(node) : null);
const maxLabelChars = (labels: readonly ReactNode[]) => labels.reduce<number>((m, l) => Math.max(m, textOf(l)?.length ?? 2), 0);

const isRail = (d: RowDecor | null | undefined) => !!d && (d.style ?? 'rail') === 'rail';

/** Everything the component needs: the resolved size, the label gutter, the cell geometry, the row decorations and the full width. */
export function cellGridFrame(p: CellGridShape) {
  const size = resolveSize(p.size ?? 'sm');
  const decors = Array.from({ length: p.rowDecor ? p.rows : 0 }, (_, r) => p.rowDecor?.(r) ?? null);
  const railGutter = decors.some(isRail) ? RAIL_GUTTER : 0;
  const decorLabels = decors.flatMap((d) => (d?.label == null ? [] : [d.label]));
  const decorLabelWidth = decorLabels.length ? maxLabelChars(decorLabels) * GRID_LABEL.CHAR_W + 8 : 0;
  const labelWidth = p.rowLabels ? maxLabelChars(p.rowLabels) * GRID_LABEL.CHAR_W + 8 : 0;
  const rowLabelWidth = labelWidth + railGutter;
  const colLabelHeight = p.colLabels ? GRID_LABEL.FONT + 8 : 0;
  const geo = gridGeometry({ rows: p.rows, cols: p.cols, cell: size.cell, gap: p.gap ?? size.gap, rowLabelWidth, colLabelHeight });
  const suffixWidth = p.rowSuffix ? p.rowSuffix.width + 8 : 0;
  const width = geo.width + suffixWidth + decorLabelWidth;
  return { size, rowLabelWidth, railGutter, decors, decorLabelX: geo.width + suffixWidth + 8, geo, width };
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
