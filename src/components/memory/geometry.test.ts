import { describe, expect, it } from 'vitest';
import { fanBend, HEAP, heapFieldPort, heapHeight, heapRect, stackBoxes } from './geometry';

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
