import { describe, expect, it } from 'vitest';
import { DEFAULT_CONSTRAINTS, LIMITS, MAX_CONSTRAINTS, solve } from './lp2d';
import { NOT_A_LINE_TEXT, TOO_MANY_TEXT, WINDOW, addRow, changeRow, constraintsOf, draggedBound, handlePoint, initialRows, lineEnds, objectiveEnds, regionPolygon } from './edit';

describe('editing the constraint list', () => {
  it('manipulation 4: a = 0 and b = 0 is refused with the spec text and the row is unchanged; a seventh constraint is refused', () => {
    const rows = initialRows();
    expect(NOT_A_LINE_TEXT).toBe('a = 0 and b = 0 is not a line');
    expect(changeRow(rows, 2, { a: 0 })).toEqual({ ok: false, text: 'a = 0 and b = 0 is not a line' });
    expect(changeRow(rows, 0, { a: 0 }).ok).toBe(true);
    expect(TOO_MANY_TEXT).toBe('at most 6 constraints: the picture stops being readable, remove one first');
    let grown = rows;
    while (grown.length < MAX_CONSTRAINTS) {
      const r = addRow(grown);
      expect(r.ok).toBe(true);
      if (r.ok) grown = r.rows;
    }
    expect(grown).toHaveLength(6);
    expect(addRow(grown)).toEqual({ ok: false, text: TOO_MANY_TEXT });
    expect(new Set(grown.map((r) => r.id)).size).toBe(6);
  });

  it('the starting rows are the default region, and a changed row leaves the others as they were', () => {
    const rows = initialRows();
    expect(constraintsOf(rows)).toEqual(DEFAULT_CONSTRAINTS);
    const r = changeRow(rows, 1, { c: 6 });
    expect(r.ok && constraintsOf(r.rows)[1]).toEqual({ a: 1, b: 3, c: 6 });
    expect(r.ok && r.rows[0]).toEqual(rows[0]);
  });
});

describe('the geometry the plot draws', () => {
  it('the region polygon of the default constraints inside the window has the five corners', () => {
    const corners = regionPolygon(DEFAULT_CONSTRAINTS);
    expect(corners).toHaveLength(5);
    expect(corners[0]).toEqual([0, 0]);
    expect(regionPolygon([{ a: 1, b: 1, c: -10 }])).toEqual([]);
    expect(regionPolygon([])).toHaveLength(4);
    expect(Math.max(...regionPolygon([]).map(([x]) => x))).toBe(WINDOW);
  });

  it('dragging a handle slides the line through the dragged point and snaps c to the slider step and range', () => {
    const k = { a: 1, b: 1, c: 4 };
    expect(draggedBound(k, 2, 2)).toBe(4);
    expect(draggedBound(k, 2.3, 2.1)).toBe(4.5);
    expect(draggedBound(k, 100, 100)).toBe(LIMITS.bound.max);
    expect(draggedBound(k, -100, -100)).toBe(LIMITS.bound.min);
    const [hx, hy] = handlePoint(k);
    expect(hx + hy).toBeCloseTo(4, 9);
  });

  it('a line is drawn between two far points that satisfy its equation, and the zero objective has no line', () => {
    for (const k of [{ a: 1, b: 1, c: 4 }, { a: 1, b: 0, c: 3 }, { a: 0, b: -2, c: 5 }, { a: -3.5, b: 1, c: -2 }]) {
      for (const [x, y] of lineEnds(k)) expect(k.a * x + k.b * y).toBeCloseTo(k.c, 6);
    }
    expect(objectiveEnds(0, 0, 3)).toBeNull();
    expect(solve(DEFAULT_CONSTRAINTS, 3, 2).value).toBe(11);
    const ends = objectiveEnds(3, 2, 11)!;
    for (const [x, y] of ends) expect(3 * x + 2 * y).toBeCloseTo(11, 6);
  });
});
