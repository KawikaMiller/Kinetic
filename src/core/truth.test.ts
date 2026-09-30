import { describe, expect, it } from 'vitest';
import { truthRowIndex, truthRows } from './truth';

const tf = (row: Record<string, boolean>, vars: string[]) => vars.map((v) => (row[v] ? 'T' : 'F')).join('');

describe('truth tables', () => {
  it('counts up with the first variable most significant', () => {
    expect(truthRows(['p', 'q']).map((r) => tf(r, ['p', 'q']))).toEqual(['FF', 'FT', 'TF', 'TT']);
  });

  it('can list true-first, the textbook order', () => {
    expect(truthRows(['p', 'q'], { trueFirst: true }).map((r) => tf(r, ['p', 'q']))).toEqual(['TT', 'TF', 'FT', 'FF']);
  });

  it('has 2^n distinct rows for n variables', () => {
    const vars = ['a', 'b', 'c', 'd'];
    const rows = truthRows(vars);
    expect(rows).toHaveLength(16);
    expect(new Set(rows.map((r) => tf(r, vars))).size).toBe(16);
  });

  it('finds each row back by its index, in both orders', () => {
    const vars = ['p', 'q', 'r'];
    for (const trueFirst of [false, true]) {
      truthRows(vars, { trueFirst }).forEach((row, i) => expect(truthRowIndex(vars, row, { trueFirst })).toBe(i));
    }
  });

  it('gives one empty row for no variables', () => {
    expect(truthRows([])).toEqual([{}]);
  });
});
