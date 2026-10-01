/**
 * Pure geometry and keyboard maths for row × column grids (CellGrid, ByteGrid).
 * Row-major throughout: index = row · cols + col.
 */

export interface Cell {
  r: number;
  c: number;
}

export const gridIndex = (r: number, c: number, cols: number) => r * cols + c;
export const gridCoords = (i: number, cols: number): Cell => ({ r: Math.floor(i / cols), c: i % cols });

/**
 * Where a key moves the focused cell (WAI-ARIA grid pattern): arrows step without wrapping,
 * Home/End go to the row's ends, Ctrl+Home/End to the grid's corners, PageUp/PageDown jump
 * `page` rows. null = not a grid key, or already at the edge.
 */
export function gridKeyTarget(
  key: string,
  at: Cell,
  rows: number,
  cols: number,
  opts: { ctrl?: boolean; page?: number } = {},
): Cell | null {
  if (rows <= 0 || cols <= 0) return null;
  const page = opts.page ?? 5;
  let { r, c } = at;
  switch (key) {
    case 'ArrowRight':
      c++;
      break;
    case 'ArrowLeft':
      c--;
      break;
    case 'ArrowDown':
      r++;
      break;
    case 'ArrowUp':
      r--;
      break;
    case 'Home':
      if (opts.ctrl) r = 0;
      c = 0;
      break;
    case 'End':
      if (opts.ctrl) r = rows - 1;
      c = cols - 1;
      break;
    case 'PageDown':
      r = Math.min(rows - 1, r + page);
      break;
    case 'PageUp':
      r = Math.max(0, r - page);
      break;
    default:
      return null;
  }
  if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
  return r === at.r && c === at.c ? null : { r, c };
}

export interface GridGeometry {
  /** Total drawing size, labels included. */
  width: number;
  height: number;
  /** Where the cell area starts (after the row and column labels). */
  x0: number;
  y0: number;
  cell: number;
  gap: number;
  /** Top-left corner of a cell. */
  at: (r: number, c: number) => { x: number; y: number };
  /** The cell under a point in drawing coordinates, or null in a gap or outside. */
  hit: (x: number, y: number) => Cell | null;
}

/** Cell and label sizes for a grid, in drawing units. */
export function gridGeometry(o: {
  rows: number;
  cols: number;
  cell: number;
  gap: number;
  rowLabelWidth?: number;
  colLabelHeight?: number;
}): GridGeometry {
  const x0 = o.rowLabelWidth ?? 0;
  const y0 = o.colLabelHeight ?? 0;
  const step = o.cell + o.gap;
  const width = x0 + o.cols * o.cell + Math.max(0, o.cols - 1) * o.gap;
  const height = y0 + o.rows * o.cell + Math.max(0, o.rows - 1) * o.gap;
  return {
    width,
    height,
    x0,
    y0,
    cell: o.cell,
    gap: o.gap,
    at: (r, c) => ({ x: x0 + c * step, y: y0 + r * step }),
    hit: (x, y) => {
      const c = Math.floor((x - x0) / step);
      const r = Math.floor((y - y0) / step);
      if (r < 0 || r >= o.rows || c < 0 || c >= o.cols) return null;
      const inCell = x - x0 - c * step < o.cell && y - y0 - r * step < o.cell;
      return inCell ? { r, c } : null;
    },
  };
}
