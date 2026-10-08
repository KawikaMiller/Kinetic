import { describe, expect, it } from 'vitest';
import { fanBend, fieldArrowBetween, HEAP, heapFieldPort, heapGrid, heapHeight, heapRect, portToward, stackBoxes } from './geometry';

describe('stackBoxes', () => {
  it('stacks downward from start, with a gap between boxes', () => {
    expect(stackBoxes([30, 50, 20], { start: 10, gap: 5 })).toEqual({ tops: [10, 45, 100], end: 125 });
  });

  it('stacks upward from a bottom edge, like a call stack', () => {
    // bottom 200: first box spans 170..200, next 115..165 (gap 5), then 90..110
    expect(stackBoxes([30, 50, 20], { start: 200, gap: 5, direction: 'up' })).toEqual({ tops: [170, 115, 90], end: 85 });
  });

  it('leaves start untouched for an empty list', () => {
    expect(stackBoxes([], { start: 42, gap: 8 })).toEqual({ tops: [], end: 42 });
  });
});

describe('fanBend', () => {
  it('is straight for a single arrow and symmetric around the middle for several', () => {
    expect(fanBend(0, 1)).toBe(0);
    expect([0, 1, 2].map((i) => fanBend(i, 3))).toEqual([-22, 0, 22]);
    expect([0, 1].map((i) => fanBend(i, 2, 10))).toEqual([-5, 5]);
  });
});

describe('heapFieldPort', () => {
  const at = { x: 100, y: 50 };
  it('sits just inside the right edge by default, on the field row midline', () => {
    expect(heapFieldPort(at, 180, 1)).toEqual({ x: 270, y: 50 + HEAP.titleH + HEAP.fieldH * 1.5 });
  });

  it('sits on the left border for a left-heading reference', () => {
    expect(heapFieldPort(at, 180, 0, 'left')).toEqual({ x: 100, y: 50 + HEAP.titleH + HEAP.fieldH / 2 });
  });
});

describe('heapHeight with no fields', () => {
  it('keeps one empty row by default and collapses to the title row on request', () => {
    expect(heapHeight(0)).toBe(heapHeight(1));
    expect(heapHeight(0, true)).toBe(HEAP.titleOnlyH);
    expect(heapHeight(0, true)).toBeLessThan(heapHeight(0));
    // collapseEmpty only matters without fields
    expect(heapHeight(2, true)).toBe(heapHeight(2));
    expect(heapRect({ x: 5, y: 6 }, 100, 0, true)).toEqual({ x: 5, y: 6, w: 100, h: HEAP.titleOnlyH });
  });
});

describe('heapGrid', () => {
  const g = heapGrid({ cols: 3, colW: 200, rowH: 90, origin: { x: 20, y: 40 } });

  it('places boxes row by row from the origin', () => {
    expect(g.at(0)).toEqual({ x: 20, y: 40 });
    expect(g.at(2)).toEqual({ x: 420, y: 40 });
    expect(g.at(3)).toEqual({ x: 20, y: 130 });
    expect(g.cell(1, 2)).toEqual({ x: 220, y: 220 });
  });

  it('measures the area the boxes cover', () => {
    expect(g.size(0)).toEqual({ w: 0, h: 0 });
    expect(g.size(2)).toEqual({ w: 400, h: 90 });
    expect(g.size(4, 70)).toEqual({ w: 600, h: 160 });
  });

  it('defaults the origin to (0, 0) and needs at least one column', () => {
    expect(heapGrid({ cols: 0, colW: 10, rowH: 10 }).at(2)).toEqual({ x: 0, y: 20 });
  });
});

describe('fieldArrowBetween', () => {
  const a = { at: { x: 300, y: 50 }, w: 160 };

  it('leaves from the right port toward a box on the right, ending on its whole box', () => {
    const r = fieldArrowBetween({ ...a, field: 1 }, { at: { x: 600, y: 50 }, w: 160, fields: 2 });
    expect(r.port).toBe('right');
    expect(r.from).toEqual(heapFieldPort(a.at, a.w, 1, 'right'));
    expect(r.to).toEqual(heapRect({ x: 600, y: 50 }, 160, 2));
  });

  it('leaves from the left border toward a box on the left', () => {
    const r = fieldArrowBetween({ ...a, field: 0 }, { at: { x: 0, y: 200 }, w: 160, fields: 0, collapseEmpty: true });
    expect(r.port).toBe('left');
    expect(r.from).toEqual(heapFieldPort(a.at, a.w, 0, 'left'));
    expect(r.to).toEqual(heapRect({ x: 0, y: 200 }, 160, 0, true));
  });
});

describe('portToward', () => {
  const src = { at: { x: 300, y: 0 }, w: 100 };

  it('faces left for a target box left of the source, right otherwise', () => {
    expect(portToward(src, { at: { x: 100, y: 0 }, w: 100 })).toBe('left');
    expect(portToward(src, { at: { x: 500, y: 0 }, w: 100 })).toBe('right');
  });

  it('treats a box in the same column as right (the arrow bows instead)', () => {
    expect(portToward(src, { at: { x: 300, y: 200 }, w: 100 })).toBe('right');
  });
});
