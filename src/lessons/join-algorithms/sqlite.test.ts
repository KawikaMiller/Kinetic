import { describe, expect, it } from 'vitest';
import { openSqlite, type SqliteDb } from '../../core/testing/sqlite';
import { asMultiset, hashJoin, mergeJoin, nestedLoop, type Cond, type Pair, type Tables } from './join';
import { DEFAULT_SPEC, makeTables, type Shape } from './tables';

// SQLite (core/testing/sqlite) is the independent oracle for the join's rows.
// It has no hash join, so what is checked against it is the output; the three algorithms' counters are checked
// against brute force and closed forms in join.test.ts.
function load(t: Tables, indexOnB: boolean): SqliteDb {
  const db = openSqlite();
  db.exec('CREATE TABLE customers (id INTEGER PRIMARY KEY, customer_id INTEGER); CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER)');
  const insertA = db.prepare('INSERT INTO customers VALUES (?, ?)');
  const insertB = db.prepare('INSERT INTO orders VALUES (?, ?)');
  for (const r of t.a) insertA.run(r.id, r.key);
  for (const r of t.b) insertB.run(r.id, r.key);
  if (indexOnB) db.exec('CREATE INDEX orders_customer_idx ON orders(customer_id)');
  return db;
}

const JOIN = (op: '=' | '<') => `SELECT customers.id AS a, orders.id AS b FROM customers JOIN orders ON customers.customer_id ${op} orders.customer_id`;
const sqlitePairs = (db: SqliteDb, op: '=' | '<'): Pair[] => db.prepare(JOIN(op)).all().map((r) => [Number(r.a), Number(r.b)] as const);
const plan = (db: SqliteDb, op: '=' | '<'): string => db.prepare(`EXPLAIN QUERY PLAN ${JOIN(op)}`).all().map((r) => String(r.detail)).join(' | ');

const SHAPES: Shape[] = ['default', 'manyToMany', 'nulls'];

describe('the three algorithms produce the rows SQLite produces', () => {
  it('for every table shape and size: nested loop, index nested loop, hash (in memory and spilling) and merge equal SQLite, as multisets', () => {
    let cases = 0;
    for (const shape of SHAPES) {
      for (const [sizeA, sizeB] of [[4, 4], [8, 12], [16, 16], [4, 16], [16, 4]]) {
        for (const oneCustomer of [false, true]) {
          const t = makeTables({ ...DEFAULT_SPEC, shape, sizeA, sizeB, oneCustomer });
          const want = asMultiset(sqlitePairs(load(t, false), '='));
          const name = `${shape} ${sizeA}x${sizeB} one=${oneCustomer}`;
          expect(asMultiset(nestedLoop(t, 'eq', false).pairs), `nested ${name}`).toEqual(want);
          expect(asMultiset(nestedLoop(t, 'eq', true).pairs), `index nested ${name}`).toEqual(want);
          for (const memory of [2, 3, 1000]) expect(asMultiset(hashJoin(t, memory).pairs), `hash ${memory} ${name}`).toEqual(want);
          expect(asMultiset(mergeJoin(t, false).pairs), `merge ${name}`).toEqual(want);
          cases++;
        }
      }
    }
    expect(cases).toBe(30);
  });

  it('a < join by nested loop equals SQLite', () => {
    for (const shape of SHAPES) {
      const t = makeTables({ ...DEFAULT_SPEC, shape });
      expect(asMultiset(nestedLoop(t, 'lt' satisfies Cond, false).pairs), shape).toEqual(asMultiset(sqlitePairs(load(t, false), '<')));
    }
  });
});

describe('SQLite joins by nested loops', () => {
  const t = makeTables(DEFAULT_SPEC);

  it('its plan is a scan of the outer table and a search of the inner one, through a temporary automatic index or a real one', () => {
    const without = plan(load(t, false), '=');
    expect(without).toMatch(/^SCAN customers/);
    expect(without).toContain('SEARCH orders USING AUTOMATIC COVERING INDEX');
    const withIndex = plan(load(t, true), '=');
    expect(withIndex).toMatch(/^SCAN customers/);
    expect(withIndex).toContain('SEARCH orders USING COVERING INDEX orders_customer_idx');
  });

  it('it has no hash or merge join to show: no plan line names one', () => {
    for (const indexOnB of [false, true]) for (const op of ['=', '<'] as const) expect(plan(load(t, indexOnB), op)).not.toMatch(/hash|merge/i);
  });

  it('a real index serves a range as well as an exact key: the toy probe is exact only, and the lesson says so', () => {
    expect(plan(load(t, true), '<')).toContain('orders_customer_idx (customer_id>?)');
  });
});
