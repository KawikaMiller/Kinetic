import { describe, expect, it } from 'vitest';
import { openSqlite } from './sqlite';

describe('core/testing/sqlite', () => {
  it('runs SQL in a fresh in-memory database', () => {
    const db = openSqlite();
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    const insert = db.prepare('INSERT INTO t VALUES (?, ?)');
    insert.run(1, 'a');
    insert.run(2, 'b');
    expect(db.prepare('SELECT id, name FROM t ORDER BY id').all()).toEqual([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]);
    expect(Number(db.prepare('SELECT count(*) AS n FROM t').all()[0].n)).toBe(2);
  });

  it('every call opens its own database', () => {
    openSqlite().exec('CREATE TABLE only_here (x INTEGER)');
    expect(() => openSqlite().prepare('SELECT * FROM only_here').all()).toThrow();
  });

  it('returns arrays on request, and types the rows the caller reads', () => {
    const db = openSqlite<Record<string, number>>();
    const stmt = db.prepare('SELECT 1 + 1 AS two');
    expect(stmt.all()[0].two).toBe(2);
    stmt.setReturnArrays(true);
    expect(stmt.all()).toEqual([[2]]);
  });
});
