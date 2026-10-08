import { describe, expect, it } from 'vitest';
import { execute } from './exec';
import { DEFAULT_PICK, queryFor } from './picker';
import { dbRows, responseLines } from './scenes';

describe('display helpers', () => {
  it('responseLines cuts to the limit and reports exactly how many lines were left out', () => {
    const body = { data: { a: [1, 2, 3, 4, 5, 6] } };
    const all = JSON.stringify(body, null, 2).split('\n');
    expect(responseLines(body, 100)).toEqual({ lines: all, cut: 0 });
    const r = responseLines(body, 4);
    expect(r.lines).toEqual(all.slice(0, 4));
    expect(r.cut).toBe(all.length - 4);
  });

  it('dbRows lists calls that have finished by a level, capped, with the remainder counted', () => {
    const exec = execute(queryFor({ ...DEFAULT_PICK, n: 50 }), { dataLoader: false, failProductId: null });
    expect(exec.dbCalls).toHaveLength(52);
    expect(dbRows(exec, 0, 6)).toMatchObject({ more: 0, rows: [{ id: 0, sql: 'SELECT * FROM users WHERE id = 1' }] });
    expect(dbRows(exec, 1, 6).rows.map((r) => r.id)).toEqual([0, 1]);
    const all = dbRows(exec, 3, 6);
    expect(all.rows).toHaveLength(6);
    expect(all.more).toBe(46);
    expect(dbRows(execute(queryFor(DEFAULT_PICK), { dataLoader: true, failProductId: null }), 3, 6).rows.at(-1)).toMatchObject({ batched: true });
  });
});
