import type { Pt } from '../../core/geometry';
import type { Tone } from '../../core/tone';
import type { PortSide, Rect } from './geometry';

/**
 * Layout for MemoryMap: an address-ordered column of rows, `unit` bytes each (1 for a byte
 * view, 8 for 64-bit words, 4096 for pages). Only rows worth seeing are drawn: region ends,
 * cells, pointer targets and short regions in full; a long empty run collapses into one
 * "…" gap row, so a process image from 0x400000 to 0x7ffd… still fits. Pure, so the ports
 * a lesson hands to RefArrow agree with what's drawn.
 */

export interface MemRegion {
  /** First address in the region. */
  from: number;
  /** One past the last address: the region covers [from, to). */
  to: number;
  label: string;
  tone: Tone;
  /** live (default), freed (hatched, after free()) or guard (a canary or guard page). */
  variant?: 'live' | 'freed' | 'guard';
}

export interface MemCell {
  addr: number;
  value: string | number;
  tone?: Tone;
}

export interface MemPointer {
  addr: number;
  label: string;
  tone: Tone;
}

export interface MemRow {
  kind: 'cell' | 'gap';
  /** Row address (cell), or the first address hidden (gap). */
  addr: number;
  /** One past the last address the row stands for. */
  end: number;
  y: number;
  h: number;
}

export interface MemBand {
  index: number;
  y: number;
  h: number;
  /** How many other regions contain this one (a frame inside the stack is 1): its bracket steps inward. */
  depth: number;
}

export interface MemLayout {
  width: number;
  height: number;
  unit: number;
  rows: MemRow[];
  /** One band per region, in region order: the y-span its rows cover. */
  bands: MemBand[];
  /** x and width of each column. */
  cols: { pointer: number; addr: number; addrW: number; cell: number; cellW: number; link: number; region: number; regionW: number };
  addrDigits: number;
}

export const MEMMAP = {
  ROW_H: 26,
  GAP_H: 18,
  POINTER_W: 46,
  /** Clear lane between the cells and the region brackets, where RefArrows between cells bow. */
  LINK_W: 24,
  /** Approximate glyph advances: address (10.5px mono), value (11.5px mono), region label (11px UI font). */
  ADDR_CHAR: 6.4,
  VALUE_CHAR: 7,
  LABEL_CHAR: 6.4,
  MIN_CELL_W: 72,
  /** Regions up to this many rows show every row. */
  EXPAND_ROWS: 12,
  /** Empty runs up to this many rows are drawn rather than collapsed. */
  FILL_ROWS: 2,
  MAX_ROWS: 400,
  /** Each nesting level moves a region's bracket this far right. */
  BRACKET_STEP: 10,
} as const;

const align = (addr: number, unit: number) => Math.floor(addr / unit) * unit;

/** Hex address, zero-padded: 0x7ffc_0018 style without separators ("0x7ffc0018"). */
export const formatAddr = (addr: number, digits: number) => `0x${addr.toString(16).padStart(digits, '0')}`;

export function memoryMapLayout(o: {
  regions: readonly MemRegion[];
  cells?: readonly MemCell[];
  pointers?: readonly MemPointer[];
  /** Bytes per row (default 8). */
  unit?: number;
  /** down: higher addresses at the top (a stack that grows down grows down the page); up: lower at the top. */
  direction?: 'down' | 'up';
  /** Stretch the cell column so the map is this wide (never narrower than its content needs). */
  width?: number;
  /** Hex digits in the address column (default: enough for the highest address). */
  addrDigits?: number;
}): MemLayout {
  const unit = o.unit ?? 8;
  if (!(unit > 0)) throw new RangeError('unit must be positive');
  const cells = o.cells ?? [];
  const pointers = o.pointers ?? [];
  for (const r of o.regions) if (!(r.to > r.from)) throw new RangeError(`region ${r.label}: to must be greater than from`);

  const need = new Set<number>();
  for (const r of o.regions) {
    const first = align(r.from, unit);
    const last = align(r.to - 1, unit);
    need.add(first);
    need.add(last);
    if ((last - first) / unit < MEMMAP.EXPAND_ROWS) for (let a = first; a <= last; a += unit) need.add(a);
  }
  for (const c of cells) need.add(align(c.addr, unit));
  for (const p of pointers) need.add(align(p.addr, unit));
  const sorted = [...need].sort((a, b) => a - b);

  type Proto = { kind: 'cell' | 'gap'; addr: number; end: number };
  const protos: Proto[] = [];
  sorted.forEach((a, i) => {
    if (i > 0) {
      const prev = sorted[i - 1];
      const missing = (a - prev) / unit - 1;
      if (missing > 0 && missing <= MEMMAP.FILL_ROWS) for (let b = prev + unit; b < a; b += unit) protos.push({ kind: 'cell', addr: b, end: b + unit });
      else if (missing > MEMMAP.FILL_ROWS) protos.push({ kind: 'gap', addr: prev + unit, end: a });
    }
    protos.push({ kind: 'cell', addr: a, end: a + unit });
  });
  if (protos.length > MEMMAP.MAX_ROWS) throw new RangeError(`memory map would draw ${protos.length} rows; use a bigger unit`);
  if ((o.direction ?? 'down') === 'down') protos.reverse();

  let y = 0;
  const rows: MemRow[] = protos.map((p) => {
    const h = p.kind === 'gap' ? MEMMAP.GAP_H : MEMMAP.ROW_H;
    const row = { ...p, y, h };
    y += h;
    return row;
  });

  const bands: MemBand[] = o.regions.map((r, index) => {
    const inside = rows.filter((row) => row.addr >= align(r.from, unit) && row.end <= align(r.to - 1, unit) + unit);
    const top = Math.min(...inside.map((row) => row.y));
    const bottom = Math.max(...inside.map((row) => row.y + row.h));
    const depth = o.regions.filter((q, j) => j !== index && q.from <= r.from && q.to >= r.to && (q.from < r.from || q.to > r.to)).length;
    return { index, y: top, h: bottom - top, depth };
  });

  const maxAddr = Math.max(0, ...rows.map((r) => r.end - 1));
  const addrDigits = o.addrDigits ?? Math.max(4, maxAddr.toString(16).length);
  const addrW = Math.ceil(16 + (addrDigits + 2) * MEMMAP.ADDR_CHAR);
  const naturalCell = Math.ceil(Math.max(MEMMAP.MIN_CELL_W, ...cells.map((c) => String(c.value).length * MEMMAP.VALUE_CHAR + 16)));
  const regionW = Math.ceil(
    Math.max(60, ...o.regions.map((r, i) => 13 + bands[i].depth * MEMMAP.BRACKET_STEP + r.label.length * MEMMAP.LABEL_CHAR + 4)),
  );
  const fixed = MEMMAP.POINTER_W + addrW + MEMMAP.LINK_W + regionW;
  const cellW = Math.max(naturalCell, (o.width ?? 0) - fixed);
  const cell = MEMMAP.POINTER_W + addrW;
  return {
    width: fixed + cellW,
    height: y,
    unit,
    rows,
    bands,
    cols: { pointer: 0, addr: MEMMAP.POINTER_W, addrW, cell, cellW, link: cell + cellW, region: cell + cellW + MEMMAP.LINK_W, regionW },
    addrDigits,
  };
}

/** The drawn row holding `addr` (a cell row, or the gap that hides it); null if it's off the map. */
export const rowAt = (L: MemLayout, addr: number) => L.rows.find((r) => addr >= r.addr && addr < r.end) ?? null;

/** The cell box for `addr`, offset by the map's `at`: pass it as a RefArrow's `to`. */
export function memCellRect(L: MemLayout, addr: number, at: Pt = { x: 0, y: 0 }): Rect | null {
  const r = rowAt(L, addr);
  return r && { x: at.x + L.cols.cell, y: at.y + r.y, w: L.cols.cellW, h: r.h };
}

/**
 * Where a reference to or from `addr` meets the map: the middle of the cell's left or
 * right edge (left by default, beside the address column), offset by `at`.
 */
export function memPort(L: MemLayout, addr: number, side: PortSide = 'left', at: Pt = { x: 0, y: 0 }): Pt | null {
  const rect = memCellRect(L, addr, at);
  return rect && { x: side === 'left' ? rect.x : rect.x + rect.w, y: rect.y + rect.h / 2 };
}

/** A region's band (its bracket on the right), offset by `at`: a RefArrow target for a whole region. */
export function memRegionRect(L: MemLayout, index: number, at: Pt = { x: 0, y: 0 }): Rect {
  const b = L.bands[index];
  return { x: at.x + L.cols.cell, y: at.y + b.y, w: L.cols.cellW, h: b.h };
}
