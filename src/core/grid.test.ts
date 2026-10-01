import { describe, expect, it } from 'vitest';
import { gridCoords, gridGeometry, gridIndex, gridKeyTarget } from './grid';

describe('gridIndex / gridCoords', () => {
  it('round-trip every cell of several grid shapes', () => {
    for (const [rows, cols] of [[1, 1], [3, 4], [10, 10], [7, 13]])
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const i = gridIndex(r, c, cols);
          expect(gridCoords(i, cols)).toEqual({ r, c });
        }
    expect(gridIndex(2, 3, 10)).toBe(23);
  });
});

describe('gridKeyTarget', () => {
  const at = { r: 2, c: 2 };
  it('steps with arrows and stops at edges (no wrap)', () => {
    expect(gridKeyTarget('ArrowRight', at, 5, 5)).toEqual({ r: 2, c: 3 });
    expect(gridKeyTarget('ArrowUp', at, 5, 5)).toEqual({ r: 1, c: 2 });
    expect(gridKeyTarget('ArrowRight', { r: 0, c: 4 }, 5, 5)).toBeNull();
    expect(gridKeyTarget('ArrowUp', { r: 0, c: 0 }, 5, 5)).toBeNull();
  });
  it('Home/End go to the row ends; with Ctrl, to the corners', () => {
    expect(gridKeyTarget('Home', at, 5, 5)).toEqual({ r: 2, c: 0 });
    expect(gridKeyTarget('End', at, 5, 5)).toEqual({ r: 2, c: 4 });
    expect(gridKeyTarget('Home', at, 5, 5, { ctrl: true })).toEqual({ r: 0, c: 0 });
    expect(gridKeyTarget('End', at, 5, 5, { ctrl: true })).toEqual({ r: 4, c: 4 });
  });
  it('PageUp/PageDown jump rows and clamp', () => {
    expect(gridKeyTarget('PageDown', { r: 1, c: 0 }, 30, 3)).toEqual({ r: 6, c: 0 });
    expect(gridKeyTarget('PageDown', { r: 28, c: 0 }, 30, 3)).toEqual({ r: 29, c: 0 });
    expect(gridKeyTarget('PageUp', { r: 2, c: 1 }, 30, 3)).toEqual({ r: 0, c: 1 });
  });
  it('ignores other keys and empty grids', () => {
    expect(gridKeyTarget('a', at, 5, 5)).toBeNull();
    expect(gridKeyTarget('ArrowRight', at, 0, 5)).toBeNull();
  });
});

describe('gridGeometry', () => {
  const g = gridGeometry({ rows: 3, cols: 4, cell: 20, gap: 2, rowLabelWidth: 30, colLabelHeight: 16 });
  it('sizes the drawing to the cells plus labels', () => {
    expect(g.width).toBe(30 + 4 * 20 + 3 * 2);
    expect(g.height).toBe(16 + 3 * 20 + 2 * 2);
    expect(g.at(0, 0)).toEqual({ x: 30, y: 16 });
    expect(g.at(2, 3)).toEqual({ x: 30 + 3 * 22, y: 16 + 2 * 22 });
  });
  it('hit-tests every cell centre, and misses gaps and labels', () => {
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 4; c++) {
        const { x, y } = g.at(r, c);
        expect(g.hit(x + 10, y + 10)).toEqual({ r, c });
        expect(g.hit(x + 21, y + 10)).toBeNull(); // the gap to the right
      }
    expect(g.hit(5, 30)).toBeNull(); // row label column
    expect(g.hit(40, 5)).toBeNull(); // column label row
    expect(g.hit(g.width + 5, 20)).toBeNull();
  });
});
