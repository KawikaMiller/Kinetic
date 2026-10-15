import { describe, expect, it } from 'vitest';
import { INDEXES, NO_INDEXES, QUERIES, actualRows, planNodes, planQuery, predicateText, queryById, sqlLines, DEFAULT_COSTS, type IndexSet, type Params, type QueryDef } from './model';
import { STATUSES, countRows, makeOrders, type TableShape } from './table';

// SQLite is the independent oracle (AC-0/T3 #19) for the access paths it can tell us about. It is loaded at run time:
// the app's tsconfig has no Node types, so this is the same dynamic-import shim core/testing uses for node:crypto.
interface SqliteStatement { all: (...p: unknown[]) => Record<string, unknown>[]; run: (...p: unknown[]) => unknown }
interface SqliteDb { exec: (sql: string) => void; prepare: (sql: string) => SqliteStatement }
const SQLITE = 'node:sqlite';
const { DatabaseSync } = (await import(/* @vite-ignore */ SQLITE)) as { DatabaseSync: new (path: string) => SqliteDb };

/** A 2,000-row table (10 rows a customer, 10 rows a page): the same seeded generator as the lesson, smaller. */
const SHAPE: TableShape = { rows: 2000, pages: 200, customers: 200 };
const orders = makeOrders(SHAPE, 11);
const counts = countRows(orders);

const SQLITE_INDEX_SQL: Record<string, string> = {
  customer: 'CREATE INDEX orders_customer_idx ON orders(customer_id)',
  status: 'CREATE INDEX orders_status_idx ON orders(status)',
  created: 'CREATE INDEX orders_created_idx ON orders(created_at)',
  composite: 'CREATE INDEX orders_customer_created_idx ON orders(customer_id, created_at)',
};

function database(indexes: IndexSet): SqliteDb {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, status TEXT, created_at INTEGER, total INTEGER)');
  const insert = db.prepare('INSERT INTO orders VALUES (?, ?, ?, ?, ?)');
  for (const o of orders) insert.run(o.id, o.customer_id, o.status, o.created_at, o.total);
  for (const ix of INDEXES) if (indexes[ix.id]) db.exec(SQLITE_INDEX_SQL[ix.id]);
  return db;
}

/** The query as SQLite runs it: the lesson's SQL with the day number as a plain integer. */
const sqlOf = (q: QueryDef, p: Params): string => sqlLines(q, p).join(' ').replace(/;$/, '');
const planText = (db: SqliteDb, sql: string): string => db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all().map((r) => String(r.detail)).join(' | ');

const toyPlan = (q: QueryDef, p: Params, indexes: IndexSet) => {
  const r = planQuery({ query: q, params: p, setup: { indexes, stats: 'fresh' }, costs: DEFAULT_COSTS, table: SHAPE, counts });
  const chosen = r.candidates[r.chosen];
  return { usesIndex: chosen.index !== null, hasSort: planNodes(chosen.root).some((n) => n.kind === 'Sort') };
};

const P: Params = { customerId: 57, status: 'refunded', day: 300 };
const CONFIGS: { name: string; indexes: IndexSet }[] = [
  { name: 'no index', indexes: NO_INDEXES },
  { name: 'customer_id index', indexes: { ...NO_INDEXES, customer: true } },
  { name: '(customer_id, created_at) index', indexes: { ...NO_INDEXES, composite: true } },
  { name: 'both customer indexes', indexes: { ...NO_INDEXES, customer: true, composite: true } },
];

describe('the toy planner agrees with SQLite where the two are comparable', () => {
  const deterministic = QUERIES.filter((q) => q.deterministic);

  it('an equality on an indexed column is a SEARCH in SQLite and an Index Scan in the toy; with no index both scan the table', () => {
    for (const q of deterministic) {
      for (const { name, indexes } of CONFIGS) {
        const sqlite = planText(database(indexes), sqlOf(q, P));
        const toy = toyPlan(q, P, indexes);
        const indexed = indexes.customer || indexes.composite;
        expect(sqlite.includes('SEARCH orders USING INDEX'), `${q.id}, ${name}: ${sqlite}`).toBe(indexed);
        expect(sqlite.includes('SCAN orders'), `${q.id}, ${name}: ${sqlite}`).toBe(!indexed);
        expect(toy.usesIndex, `${q.id}, ${name}`).toBe(indexed);
      }
    }
  });

  it('SQLite shows a sort step (USE TEMP B-TREE FOR ORDER BY) exactly when the toy has a Sort node', () => {
    for (const q of QUERIES.filter((x) => x.newestFirst)) {
      const configs = q.deterministic ? CONFIGS : [{ name: 'no index', indexes: NO_INDEXES }, { name: 'status index', indexes: { ...NO_INDEXES, status: true } }];
      for (const { name, indexes } of configs) {
        const sqlite = planText(database(indexes), sqlOf(q, P));
        expect(toyPlan(q, P, indexes).hasSort, `${q.id}, ${name}: ${sqlite}`).toBe(sqlite.includes('USE TEMP B-TREE FOR ORDER BY'));
      }
    }
  });

  it('the composite index removes the sort in SQLite too, while the single-column index does not', () => {
    const q = queryById('customerNewest');
    expect(planText(database({ ...NO_INDEXES, customer: true }), sqlOf(q, P))).toContain('USE TEMP B-TREE FOR ORDER BY');
    expect(planText(database({ ...NO_INDEXES, composite: true }), sqlOf(q, P))).not.toContain('USE TEMP B-TREE');
  });

  it('queries with no usable index scan the whole table in both (status and date ranges)', () => {
    for (const q of QUERIES.filter((x) => !x.deterministic && !x.newestFirst)) {
      expect(planText(database(NO_INDEXES), sqlOf(q, P)), q.id).toContain('SCAN orders');
      expect(toyPlan(q, P, NO_INDEXES).usesIndex).toBe(false);
    }
  });

  it('where the two differ, the lesson says so: SQLite also walks a created_at index just to get the order, the toy does not', () => {
    const created: IndexSet = { ...NO_INDEXES, created: true };
    const q = queryById('customerNewest');
    expect(planText(database(created), sqlOf(q, P))).toContain('SCAN orders USING INDEX');
    expect(toyPlan(q, P, created).usesIndex).toBe(false);
  });
});

describe('the toy\'s actual rows equal SELECT count(*) on the same data', () => {
  const db = database(NO_INDEXES);
  const count = (where: string): number => Number(db.prepare(`SELECT count(*) AS n FROM orders WHERE ${where}`).all()[0].n);

  it('for every status, a spread of customers and several days', () => {
    for (const status of STATUSES) {
      const p: Params = { ...P, status };
      expect(actualRows(queryById('status'), p, counts), status).toBe(count(predicateText(queryById('status'), p)));
    }
    for (const customerId of [1, 2, 57, 123, 200]) {
      const p: Params = { ...P, customerId };
      expect(actualRows(queryById('customer'), p, counts)).toBe(count(predicateText(queryById('customer'), p)));
    }
    for (const day of [1, 2, 100, 300, 365]) {
      const p: Params = { ...P, day };
      expect(actualRows(queryById('recent'), p, counts)).toBe(count(predicateText(queryById('recent'), p)));
    }
  });
});
