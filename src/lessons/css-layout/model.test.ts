import { describe, expect, it } from 'vitest';
import { borderBoxWidth, boxCss, collapsedMargin, emptySpace, flexCss, gridCss, gridLines, lineGroups, parseTracks } from './model';

describe('collapsedMargin', () => {
  it('two positive margins: the larger wins (the 20 + 30 = 30 preset)', () => {
    expect(collapsedMargin(20, 30)).toBe(30);
    expect(collapsedMargin(30, 20)).toBe(30);
  });
  it('two negative margins: the more negative wins', () => {
    expect(collapsedMargin(-10, -25)).toBe(-25);
  });
  it('mixed signs: largest positive plus most negative', () => {
    expect(collapsedMargin(30, -10)).toBe(20);
    expect(collapsedMargin(-30, 10)).toBe(-20);
  });
  it('zero behaves like any positive margin', () => {
    expect(collapsedMargin(0, 24)).toBe(24);
  });
});

describe('parseTracks / gridLines', () => {
  it('reads computed track sizes', () => {
    expect(parseTracks('200px 342.5px')).toEqual([200, 342.5]);
    expect(parseTracks('none')).toEqual([]);
    expect(parseTracks('')).toEqual([]);
  });
  it('places n + 1 lines: internal ones in the middle of their gutter, the outer ones at the edges', () => {
    expect(gridLines([100, 100, 100], 10)).toEqual([0, 105, 215, 320]);
    expect(gridLines([50], 10)).toEqual([0, 50]);
    expect(gridLines([80, 80], 0)).toEqual([0, 80, 160]);
  });
});

describe('lineGroups', () => {
  it('groups wrapped items by their cross-axis start', () => {
    const items = [{ cross: 0, id: 'a' }, { cross: 0.4, id: 'b' }, { cross: 60, id: 'c' }];
    expect(lineGroups(items).map((l) => l.map((i) => i.id))).toEqual([['a', 'b'], ['c']]);
  });
});

describe('emptySpace', () => {
  const box = { start: 0, end: 400 };
  it('flex-start: all free space after the last item', () => {
    expect(emptySpace(box, [{ start: 0, end: 80 }, { start: 90, end: 170 }], 10)).toEqual([{ start: 170, end: 400 }]);
  });
  it('space-between: the free space sits between items, excluding the gap', () => {
    const spans = emptySpace(box, [{ start: 0, end: 80 }, { start: 320, end: 400 }], 10);
    expect(spans).toEqual([{ start: 90, end: 320 }]);
  });
  it('items that fill the line leave nothing', () => {
    expect(emptySpace(box, [{ start: 0, end: 195 }, { start: 205, end: 400 }], 10)).toEqual([]);
  });
});

describe('generated CSS', () => {
  it('writes the box, flex and grid rules the sandbox uses', () => {
    expect(boxCss({ width: 200, padding: 16, border: 4, margin: 20, boxSizing: 'border-box' })).toContain('  box-sizing: border-box;');
    const flex = flexCss({ direction: 'row', justify: 'center', align: 'stretch', wrap: true, gap: 8, items: [{ basis: 80, grow: 2, shrink: 1 }] });
    expect(flex).toContain('  flex-wrap: wrap;');
    expect(flex).toContain('.item-1 { flex: 2 1 80px; }');
    expect(gridCss({ columns: 'repeat(3, 1fr)', gap: 12, spans: [1, 2, 1] })).toContain('.item-2 { grid-column: span 2; }');
  });
});

describe('border-box width', () => {
  const box = (width: number, padding: number, border: number) => ({ width, padding, border, margin: 0, boxSizing: 'border-box' as const });
  it('is the width while padding and border fit inside it', () => {
    expect(borderBoxWidth(box(200, 16, 6))).toBe(200);
  });
  it('grows to padding + border once they exceed it (the content stops at 0)', () => {
    expect(borderBoxWidth(box(80, 40, 20))).toBe(120);
  });
});
