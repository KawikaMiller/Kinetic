import { describe, expect, it } from 'vitest';
import { gridGeometry } from '../core/grid';
import { resolveSize } from './cellGridPaint';
import { cellGridFrame, cellGridLayout, GRID_LABEL } from './cellGridLayout';

describe('cellGridLayout', () => {
  const shape = { rows: 3, cols: 4, rowLabels: ['P1', 'P2', 'P3'], colLabels: ['a', 'b', 'c', 'd'], size: 'sm' as const };

  it('matches the grid geometry the component draws, labels included', () => {
    const s = resolveSize('sm');
    const geo = gridGeometry({ rows: 3, cols: 4, cell: s.cell, gap: s.gap, rowLabelWidth: 2 * GRID_LABEL.CHAR_W + 8, colLabelHeight: GRID_LABEL.FONT + 8 });
    const L = cellGridLayout(shape);
    expect(L.at(2, 3)).toEqual(geo.at(2, 3));
    expect(L.width).toBe(geo.width);
    expect(L.height).toBe(geo.height);
    expect(L.center(0, 0)).toEqual({ x: geo.at(0, 0).x + s.cell / 2, y: geo.at(0, 0).y + s.cell / 2 });
  });

  it('offsets every position by where the group sits in its scene', () => {
    const local = cellGridLayout(shape);
    const placed = cellGridLayout(shape, { x: 100, y: 40 });
    expect(placed.at(1, 2)).toEqual({ x: local.at(1, 2).x + 100, y: local.at(1, 2).y + 40 });
    expect(placed.center(1, 2)).toEqual({ x: local.center(1, 2).x + 100, y: local.center(1, 2).y + 40 });
    expect(placed.width).toBe(local.width);
  });

  it('widens for a row suffix and has no label gutter without labels', () => {
    expect(cellGridFrame({ rows: 2, cols: 2, rowSuffix: { width: 50 } }).width).toBe(cellGridFrame({ rows: 2, cols: 2 }).width + 58);
    expect(cellGridFrame({ rows: 2, cols: 2 }).rowLabelWidth).toBe(0);
    expect(cellGridLayout({ rows: 2, cols: 2 }).at(0, 0)).toEqual({ x: 0, y: 0 });
  });
});
