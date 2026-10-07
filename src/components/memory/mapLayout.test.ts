import { describe, expect, it } from 'vitest';
import { MEMMAP, formatAddr, memCellRect, memPort, memRegionRect, memoryMapLayout, rowAt } from './mapLayout';

// one x86-64 stack frame: name[8], canary, saved rbp, return address (high addresses on top)
const FRAME = {
  regions: [
    { from: 0x7ff0, to: 0x8010, label: 'main frame', tone: 'info' as const },
    { from: 0x7ff0, to: 0x7ff8, label: 'name[8]', tone: 'hi' as const },
    { from: 0x7ff8, to: 0x8000, label: 'canary', tone: 'orange' as const, variant: 'guard' as const },
  ],
  cells: [
    { addr: 0x8000, value: 'saved rbp' },
    { addr: 0x8008, value: 'return addr', tone: 'violet' as const },
  ],
  pointers: [{ addr: 0x7ff0, label: 'rsp', tone: 'hi' as const }],
};

describe('memoryMapLayout', () => {
  it('lists every row of a small map, high addresses on top by default', () => {
    const L = memoryMapLayout(FRAME);
    expect(L.rows.map((r) => r.addr)).toEqual([0x8008, 0x8000, 0x7ff8, 0x7ff0]);
    expect(L.rows.every((r) => r.kind === 'cell' && r.h === MEMMAP.ROW_H)).toBe(true);
    expect(L.height).toBe(4 * MEMMAP.ROW_H);
  });

  it("direction 'up' puts low addresses on top", () => {
    expect(memoryMapLayout({ ...FRAME, direction: 'up' }).rows.map((r) => r.addr)).toEqual([0x7ff0, 0x7ff8, 0x8000, 0x8008]);
  });

  it('bands cover exactly their rows, nested regions step inward', () => {
    const L = memoryMapLayout(FRAME);
    const [frame, name, canary] = L.bands;
    expect(frame).toMatchObject({ y: 0, h: 4 * MEMMAP.ROW_H, depth: 0 });
    expect(name).toMatchObject({ y: 3 * MEMMAP.ROW_H, h: MEMMAP.ROW_H, depth: 1 });
    expect(canary).toMatchObject({ y: 2 * MEMMAP.ROW_H, h: MEMMAP.ROW_H, depth: 1 });
  });

  it('collapses a long empty run into one gap row', () => {
    const L = memoryMapLayout({
      regions: [
        { from: 0x400000, to: 0x401000, label: 'code', tone: 'violet' },
        { from: 0x7ffd0000, to: 0x7ffe0000, label: 'stack', tone: 'info' },
      ],
      unit: 0x1000,
      direction: 'up',
    });
    const kinds = L.rows.map((r) => r.kind);
    expect(kinds).toEqual(['cell', 'gap', 'cell', 'gap', 'cell']);
    // the gap between the regions hides everything from the end of code to the start of the stack
    expect(L.rows[1]).toMatchObject({ addr: 0x401000, end: 0x7ffd0000, h: MEMMAP.GAP_H });
    // the 16-page stack is longer than EXPAND_ROWS, so it shows its first and last page around a gap
    expect(L.rows[2].addr).toBe(0x7ffd0000);
    expect(L.rows[4].addr).toBe(0x7ffdf000);
    expect(L.bands[1].h).toBe(2 * MEMMAP.ROW_H + MEMMAP.GAP_H);
  });

  it('fills short empty runs instead of collapsing them', () => {
    const L = memoryMapLayout({ regions: [{ from: 0, to: 8, label: 'a', tone: 'ok' }], cells: [{ addr: 24, value: 1 }], unit: 8, direction: 'up' });
    expect(L.rows.map((r) => [r.kind, r.addr])).toEqual([
      ['cell', 0],
      ['cell', 8],
      ['cell', 16],
      ['cell', 24],
    ]);
  });

  it('aligns odd addresses to their row and finds rows by address', () => {
    const L = memoryMapLayout({ regions: [{ from: 0x10, to: 0x20, label: 'buf', tone: 'hi' }], cells: [{ addr: 0x13, value: 'x' }], unit: 4 });
    expect(rowAt(L, 0x13)!.addr).toBe(0x10);
    expect(rowAt(L, 0x40)).toBeNull();
  });

  it('gives RefArrow ports on the cell edges, offset by where the map sits', () => {
    const L = memoryMapLayout(FRAME);
    const at = { x: 100, y: 50 };
    const rect = memCellRect(L, 0x8000, at)!;
    expect(rect).toEqual({ x: 100 + L.cols.cell, y: 50 + MEMMAP.ROW_H, w: L.cols.cellW, h: MEMMAP.ROW_H });
    expect(memPort(L, 0x8000, 'left', at)).toEqual({ x: rect.x, y: rect.y + rect.h / 2 });
    expect(memPort(L, 0x8000, 'right', at)).toEqual({ x: rect.x + rect.w, y: rect.y + rect.h / 2 });
    expect(memPort(L, 0x1234)).toBeNull();
    expect(memRegionRect(L, 1, at)).toEqual({ x: 100 + L.cols.cell, y: 50 + 3 * MEMMAP.ROW_H, w: L.cols.cellW, h: MEMMAP.ROW_H });
  });

  it('sizes columns to their content, fits a phone, stretches on request, and formats addresses', () => {
    const L = memoryMapLayout(FRAME);
    expect(L.width).toBeLessThanOrEqual(358);
    expect(L.cols.cellW).toBeGreaterThanOrEqual('return addr'.length * MEMMAP.VALUE_CHAR + 16);
    expect(L.cols.region).toBe(L.cols.cell + L.cols.cellW + MEMMAP.LINK_W);
    expect(L.cols.region + L.cols.regionW).toBe(L.width);
    const wide = memoryMapLayout({ ...FRAME, width: 600 });
    expect(wide.width).toBe(600);
    expect(wide.cols.cellW).toBeGreaterThan(L.cols.cellW);
    expect(memoryMapLayout({ ...FRAME, width: 10 }).width).toBe(L.width);
    expect(formatAddr(0x7ff0, L.addrDigits)).toBe('0x7ff0');
    expect(formatAddr(0xa, 4)).toBe('0x000a');
  });

  it('refuses empty regions and maps that would draw too many rows', () => {
    expect(() => memoryMapLayout({ regions: [{ from: 8, to: 8, label: 'x', tone: 'hi' }] })).toThrow(RangeError);
    const cells = Array.from({ length: 500 }, (_, i) => ({ addr: i * 8, value: i }));
    expect(() => memoryMapLayout({ regions: [], cells })).toThrow(RangeError);
  });
});
