import { describe, expect, it } from 'vitest';
import {
  CUSTOMERS, DELETED_ORDER, FDS, PRODUCTS, WIDE_COLS, WIDE_ROWS, candidateKeys, closure, factsHeld, inconsistencies, invoiceSql, isForeignKey,
  isSuperkey, joinAll, joinCount, money, normalForm, repeatedCells, runAnomaly, schemaAt, violations, type Fd, type Row, type StageId,
} from './model';

interface Db {
  exec(sql: string): void;
  prepare(sql: string): { all(): Row[] };
}
const SQLITE = 'node:sqlite';
const open = async (): Promise<Db> => {
  const { DatabaseSync } = (await import(/* @vite-ignore */ SQLITE)) as { DatabaseSync: new (path: string) => Db };
  return new DatabaseSync(':memory:');
};
const lit = (v: unknown) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const asSet = (rows: readonly Row[], cols: readonly string[]) => rows.map((r) => JSON.stringify(cols.map((c) => r[c]))).sort();
const STAGES: StageId[] = [0, 1, 2, 3];

// An independent closure: the textbook fixpoint written as repeated passes over a copy.
function bruteClosure(x: readonly string[], fds: readonly Fd[]): string[] {
  let cur = [...x];
  for (let pass = 0; pass < fds.length + 1; pass++)
    for (const fd of fds) if (fd.lhs.every((a) => cur.includes(a))) cur = [...new Set([...cur, ...fd.rhs])];
  return cur.sort();
}
const allSubsets = (xs: readonly string[]) => Array.from({ length: 1 << xs.length }, (_, m) => xs.filter((_, i) => m & (1 << i)));

describe('closure and keys', () => {
  it('closure matches a brute-force fixpoint on every subset of the wide table', () => {
    for (const x of allSubsets(WIDE_COLS)) expect([...closure(x)].sort()).toEqual(bruteClosure(x, FDS));
  });

  it('the wide table has exactly one candidate key, {order_id, product_id}', () => {
    expect(candidateKeys(WIDE_COLS)).toEqual([['order_id', 'product_id']]);
  });

  it('candidate keys are minimal superkeys, checked by brute force on every stage table', () => {
    for (const st of STAGES)
      for (const t of schemaAt(st)) {
        const cols = t.cols.filter((c) => !t.listCols?.includes(c));
        const keys = candidateKeys(cols);
        for (const k of keys) {
          expect(isSuperkey(k, cols)).toBe(true);
          for (const a of k) expect(isSuperkey(k.filter((b) => b !== a), cols)).toBe(false);
        }
        const minimal = allSubsets(cols).filter((x) => x.length && isSuperkey(x, cols) && x.every((a) => !isSuperkey(x.filter((b) => b !== a), cols)));
        expect(keys.length).toBe(minimal.length);
      }
  });
});

describe('the normal-form checker on every stage', () => {
  it('0NF fails 1NF on the list column, and only that: the key is order_id and no 2NF or 3NF flag is invented (review repro)', () => {
    const t = schemaAt(0)[0];
    const v = violations(t);
    expect(v.map((x) => x.form)).toEqual(['1NF']);
    expect(v[0].why).toMatch(/items/);
    expect(v[0].fd).toBeNull();
    expect(normalForm(schemaAt(0))).toBe('0NF');
    expect(candidateKeys(t.cols.filter((c) => !t.listCols?.includes(c)))).toEqual([['order_id']]);
  });

  it('1NF fails 2NF on both partial dependencies', () => {
    const two = schemaAt(1).flatMap((t) => violations(t)).filter((x) => x.form === '2NF').map((x) => x.fd!.lhs.join(','));
    expect(two.sort()).toEqual(['order_id', 'product_id']);
    expect(normalForm(schemaAt(1))).toBe('1NF');
  });

  it('2NF fails 3NF on customer_id → name, email in orders', () => {
    const v = schemaAt(2).flatMap((t) => violations(t));
    expect(v.filter((x) => x.form === '2NF')).toEqual([]);
    expect(v.filter((x) => x.form === '3NF').map((x) => `${x.table}: ${x.fd!.lhs} → ${x.fd!.rhs}`)).toEqual(['orders: customer_id → customer_name,customer_email']);
    expect(normalForm(schemaAt(2))).toBe('2NF');
  });

  it('3NF passes, and is BCNF too: every determinant is a key', () => {
    expect(schemaAt(3).flatMap((t) => violations(t))).toEqual([]);
    expect(normalForm(schemaAt(3))).toBe('BCNF');
  });

  it('flags BCNF separately when a non-key determines a prime attribute', () => {
    // The classic: (student, course) → teacher, teacher → course. 3NF holds, BCNF doesn't.
    const fds: Fd[] = [{ lhs: ['student', 'course'], rhs: ['teacher'] }, { lhs: ['teacher'], rhs: ['course'] }];
    const t = { name: 'teaches', cols: ['student', 'course', 'teacher'], key: ['student', 'course'], rows: [] };
    expect(violations(t, fds).map((v) => v.form)).toEqual(['BCNF']);
    expect(normalForm([t], fds)).toBe('3NF');
  });
});

describe('decompositions are lossless', () => {
  for (const st of [2, 3] as const) {
    it(`stage ${st}: joining the tables back gives exactly the wide rows`, () => {
      expect(asSet(joinAll(schemaAt(st)), WIDE_COLS)).toEqual(asSet(WIDE_ROWS, WIDE_COLS));
    });

    it(`stage ${st}: the invoice query in SQLite returns every order line`, async () => {
      const db = await open();
      for (const t of schemaAt(st)) {
        db.exec(`CREATE TABLE ${t.name} (${t.cols.join(', ')})`);
        for (const r of t.rows) db.exec(`INSERT INTO ${t.name} VALUES (${t.cols.map((c) => lit(r[c])).join(', ')})`);
      }
      const cols = ['order_id', 'customer_name', 'customer_email', 'product_name', 'price', 'quantity'];
      expect(asSet(db.prepare(invoiceSql(st).join('\n')).all(), cols)).toEqual(asSet(WIDE_ROWS, cols));
    });
  }

  it('the join count grows with every split: 0, 0, 2, 3', () => {
    expect(STAGES.map(joinCount)).toEqual([0, 0, 2, 3]);
  });
});

describe('anomalies reproduce before the split and not after', () => {
  const fixedAt = (id: 'update' | 'delete' | 'insert') => STAGES.find((s) => runAnomaly(id, schemaAt(s)).ok);
  it("update: one changed row leaves the other copies of Ada's email disagreeing until 3NF", () => {
    for (const st of STAGES) {
      const r = runAnomaly('update', schemaAt(st));
      expect(r.touched).toBe(1);
      expect(r.ok).toBe(st === 3);
    }
    expect(runAnomaly('update', schemaAt(1)).inconsistent.size).toBe(3);
    expect(fixedAt('update')).toBe(3);
  });

  it(`delete order ${DELETED_ORDER}: loses the stapler's price until 2NF, and Grace's email until 3NF`, () => {
    expect(runAnomaly('delete', schemaAt(1)).lost.sort()).toEqual(['email of Grace', 'price of stapler']);
    expect(runAnomaly('delete', schemaAt(0)).lost.sort()).toEqual(['email of Grace', 'price of stapler']);
    expect(runAnomaly('delete', schemaAt(2)).lost).toEqual(['email of Grace']);
    expect(runAnomaly('delete', schemaAt(3)).lost).toEqual([]);
  });

  it('insert a product with no order: refused while the key needs an order, fine from 2NF', () => {
    expect(runAnomaly('insert', schemaAt(0)).refused).toMatch(/order_id/);
    expect(runAnomaly('insert', schemaAt(1)).refused).toMatch(/order_id/);
    expect(runAnomaly('insert', schemaAt(2)).ok).toBe(true);
    expect(fixedAt('insert')).toBe(2);
  });

  it('the 0NF table really holds every price it can lose: each product price is in the items text', () => {
    const items = schemaAt(0)[0].rows.map((r) => String(r.items)).join(' | ');
    for (const p of Object.values(PRODUCTS)) expect(items.includes(`${p.name} ×`), p.name).toBe(true);
    for (const p of Object.values(PRODUCTS)) expect(items).toContain(money(p.price));
    expect(factsHeld(schemaAt(0)).has('price of stapler')).toBe(true);
    // A table with no price anywhere cannot lose one.
    const noPrices = [{ ...schemaAt(0)[0], rows: schemaAt(0)[0].rows.map((r) => ({ ...r, items: 'pen ×1' })) }];
    expect([...factsHeld(noPrices)].some((f) => f.startsWith('price'))).toBe(false);
  });

  it('every stage starts consistent and records every fact', () => {
    for (const st of STAGES) {
      expect(inconsistencies(schemaAt(st)).size).toBe(0);
      expect(factsHeld(schemaAt(st)).size).toBe(Object.keys(PRODUCTS).length + Object.keys(CUSTOMERS).length);
    }
  });
});

describe('what the tables highlight', () => {
  it('repeated facts exist in the wide table and vanish by 3NF', () => {
    expect(repeatedCells(schemaAt(1)[0]).size).toBeGreaterThan(0);
    for (const t of schemaAt(3)) expect(repeatedCells(t).size).toBe(0);
    const t = schemaAt(1)[0];
    const ada = t.rows.map((r, i) => (r.customer_id === 'C1' ? i : -1)).filter((i) => i >= 0);
    expect(ada.length).toBe(3);
    expect(ada.every((i) => repeatedCells(t).has(`${i}:customer_email`))).toBe(true);
  });

  it("foreign keys are the columns that are another table's key", () => {
    const s = schemaAt(3);
    const fk = s.flatMap((t) => t.cols.filter((c) => isForeignKey(s, t, c)).map((c) => `${t.name}.${c}`));
    expect(fk.sort()).toEqual(['order_lines.order_id', 'order_lines.product_id', 'orders.customer_id']);
  });
});
