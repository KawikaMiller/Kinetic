import { describe, expect, it } from 'vitest';
import { addRow, changeRow, constraintsOf, initialRows, type Row } from './edit';
import lesson from './index';
import { DEFAULT_OBJECTIVE, integerSolution, integerText, solutionText, solve } from './lp2d';

const rows0 = initialRows();
const D = constraintsOf(rows0);

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: the default objective has its best value 11 at (3, 1)', () => {
    const s = solve(D, DEFAULT_OBJECTIVE.cx, DEFAULT_OBJECTIVE.cy);
    expect(solutionText(D, s)).toBe('Optimal: 11 at (3, 1).');
    expect(lesson.tryThis[0]).toContain('best value is 11 at (3, 1)');
  });

  it('try-this 2: cx = 1, cy = 2 moves the optimum to (2.5, 1.5), value 5.5', () => {
    expect(solutionText(D, solve(D, 1, 2))).toBe('Optimal: 5.5 at (2.5, 1.5).');
    expect(lesson.tryThis[1]).toContain('(2.5, 1.5), value 5.5');
  });

  it('try-this 3: cx = 1, cy = 1 ties two corners at 4 and says the whole edge is optimal', () => {
    expect(solutionText(D, solve(D, 1, 1))).toBe('Tie: (2.5, 1.5) and (3, 1) are both worth 4, so the whole edge between them is optimal and the best point is not unique.');
    expect(lesson.tryThis[2]).toContain('two corners tie at 4');
  });

  it('try-this 4: Add a constraint then a = -1, b = -1, c = -5 reports Infeasible and names x + y <= 4 against -x - y <= -5', () => {
    const added = addRow(rows0);
    if (!added.ok) throw new Error(added.text);
    let rows: Row[] = added.rows;
    expect(rows).toHaveLength(4);
    for (const patch of [{ a: -1 }, { b: -1 }, { c: -5 }]) {
      const r = changeRow(rows, 3, patch);
      if (!r.ok) throw new Error(r.text);
      rows = r.rows;
    }
    const cons = constraintsOf(rows);
    expect(cons[3]).toEqual({ a: -1, b: -1, c: -5 });
    expect(solutionText(cons, solve(cons, 1, 1))).toBe(
      'Infeasible: no point satisfies all constraints. The clash is x + y <= 4 against -x - y <= -5 (together they need x + y at most 4 and at least 5).',
    );
    expect(lesson.tryThis[3]).toContain('x + y <= 4 against -x - y <= -5');
  });

  it('try-this 5: Whole numbers shows the LP optimum 5.5, the whole-number optimum 5 and the rounded point (3, 2) outside the region', () => {
    const lp = solve(D, 1, 2);
    const ints = integerSolution(D, 1, 2);
    expect(integerText(D, lp, ints)).toContain('The LP optimum is 5.5 at (2.5, 1.5). Rounding (2.5, 1.5) to (3, 2) breaks x + y <= 4 (5 > 4).');
    expect(lesson.tryThis[4]).toContain('LP optimum 5.5 against the whole-number optimum 5');
  });
});
