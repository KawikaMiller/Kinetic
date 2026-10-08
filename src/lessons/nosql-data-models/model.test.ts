import { describe, expect, it } from 'vitest';
import { CUSTOMERS, EXAMPLE_CUSTOMER, EXAMPLE_ORDER, ORDERS, PRODUCTS, refAlso, refLast, refOrder } from './canon';
import {
  CLUSTERINGS, PARTITION_KEYS, REQUIREMENT_SETS, evaluateDesign, hotPartition, partitionCount, partitionSizes, serves, totalsFor,
} from './design';
import { MODELS, buildEngine, extremes, runQuery, type Engine, type ModelId, type Params, type QueryId, type Result } from './engines';

const P: Params = { order: EXAMPLE_ORDER, customer: EXAMPLE_CUSTOMER, product: 'P1', newPrice: 175 };
const ENGINES: { name: string; make: () => Engine; id: ModelId }[] = [
  { name: 'relational', make: () => buildEngine('relational'), id: 'relational' },
  { name: 'document', make: () => buildEngine('document'), id: 'document' },
  { name: 'key-value (no index keys)', make: () => buildEngine('kv'), id: 'kv' },
  { name: 'key-value (index keys)', make: () => buildEngine('kv', { indexed: true }), id: 'kv' },
  { name: 'wide-column', make: () => buildEngine('wide'), id: 'wide' },
  { name: 'graph', make: () => buildEngine('graph'), id: 'graph' },
];

describe('the dataset the hand-worked numbers rest on', () => {
  it('has 16 orders, Ada has 12, pen is in 9 orders held by 2 customers with 15 orders between them', () => {
    expect(ORDERS.length).toBe(16);
    expect(ORDERS.filter((o) => o.customer === 'C1').length).toBe(12);
    const withPen = ORDERS.filter((o) => o.lines.some((l) => l.product === 'P1'));
    expect(withPen.length).toBe(9);
    expect(new Set(withPen.map((o) => o.customer))).toEqual(new Set(['C1', 'C2']));
    expect(ORDERS.filter((o) => o.customer !== 'C3').length).toBe(15);
    expect(ORDERS.find((o) => o.id === EXAMPLE_ORDER)!.lines.length).toBe(2);
  });

  it('no order holds a product twice, and ids and dates rise together', () => {
    for (const o of ORDERS) expect(new Set(o.lines.map((l) => l.product)).size).toBe(o.lines.length);
    for (let i = 1; i < ORDERS.length; i++) {
      expect(ORDERS[i].id).toBeGreaterThan(ORDERS[i - 1].id);
      expect(ORDERS[i].date >= ORDERS[i - 1].date).toBe(true);
    }
  });
});

describe('every model gives the same answers', () => {
  for (const e of ENGINES)
    describe(e.name, () => {
      it('get an order with its items, for every order', () => {
        const eng = e.make();
        for (const o of ORDERS) expect(eng.order(o.id).answer).toEqual(refOrder(o.id));
      });

      it("a customer's last 10 orders, for every customer", () => {
        const eng = e.make();
        for (const c of CUSTOMERS) expect(eng.last10(c.id).answer).toEqual(refLast(c.id));
        expect(refLast('C1')).toEqual([1046, 1044, 1043, 1042, 1041, 1040, 1038, 1037, 1035, 1034]);
      });

      it('who also bought this, for every product', () => {
        const eng = e.make();
        for (const p of PRODUCTS) expect(eng.also(p.id).answer).toEqual(refAlso(p.id));
        expect(refAlso('P1')).toEqual([{ product: 'P2', customers: 2 }, { product: 'P3', customers: 2 }, { product: 'P4', customers: 1 }]);
      });

      it('after a price update, reading any order shows the new price everywhere and nothing else changed', () => {
        for (const p of PRODUCTS) {
          const r = e.make().price(p.id, p.price + 25);
          const prices = Object.fromEntries(PRODUCTS.map((x) => [x.id, x.id === p.id ? p.price + 25 : x.price]));
          for (const o of ORDERS) expect(r.after.order(o.id).answer).toEqual(refOrder(o.id, prices));
        }
      });

      it('the update does not touch the engine it started from', () => {
        const eng = e.make();
        eng.price('P1', 999);
        expect(eng.order(EXAMPLE_ORDER).answer).toEqual(refOrder(EXAMPLE_ORDER));
      });
    });
});

type Row = { lookups: number; roundTrips: number; copies: number | null };
const row = (lookups: number, roundTrips: number, copies: number | null = null): Row => ({ lookups, roundTrips, copies });

// Worked by hand from the dataset: N = 16 orders; order 1042 has 2 lines; Ada has 12 orders; pen is in 9
// orders (O1 = 9) bought by 2 customers (B = 2) who have 15 orders between them (O2 = 15); Ada bought 4
// products and Linus 3 (7 BOUGHT edges to follow).
const EXPECTED: Record<string, Record<QueryId, Row>> = {
  relational: { order: row(1 + 1 + 2, 1), last10: row(1 + 10, 1), also: row(1 + 9 + 2 + 15, 1), price: row(1, 1, 1) },
  document: { order: row(1, 1), last10: row(1 + 10, 1), also: row(1 + 9 + 2 + 15, 2), price: row(1 + 9 + 1, 2, 10) },
  'key-value (no index keys)': { order: row(1, 1), last10: row(16, 1), also: row(16, 1), price: row(16 + 9 + 1, 2, 10) },
  'key-value (index keys)': { order: row(1, 1), last10: row(1 + 10, 2), also: row(1 + 9 + 2 + 15, 4), price: row(1 + 9 + 1, 2, 10) },
  'wide-column': { order: row(1, 1), last10: row(1, 1), also: row(1 + 2, 2), price: row(1 + 9 + 1, 2, 10) },
  graph: { order: row(1 + 2, 1), last10: row(1 + 12, 1), also: row(1 + 2 + 7, 1), price: row(1, 1, 1) },
};

describe('lookups, round trips and copies per model x query (hand-worked)', () => {
  for (const e of ENGINES)
    for (const q of ['order', 'last10', 'also', 'price'] as QueryId[])
      it(`${e.name}: ${q}`, () => {
        const r = runQuery(e.make(), q, P);
        const want = EXPECTED[e.name][q];
        expect({ lookups: r.lookups, roundTrips: r.roundTrips, copies: r.copies }).toEqual(want);
      });

  it('lookups are the sum of the animated steps, and every step touches records the view draws', () => {
    for (const e of ENGINES)
      for (const q of ['order', 'last10', 'also', 'price'] as QueryId[]) {
        const eng = e.make();
        const r = runQuery(eng, q, P);
        expect(r.steps.reduce((s, x) => s + x.count, 0)).toBe(r.lookups);
        const drawn = new Set(eng.groups().flatMap((g) => g.items.map((i) => i.id)));
        for (const s of r.steps) for (const ref of s.refs) expect(drawn.has(ref), `${e.name} ${q}: ${ref}`).toBe(true);
      }
  });

  it('only the price update reports copies, and every read has none', () => {
    for (const e of ENGINES) {
      expect(runQuery(e.make(), 'price', P).copies).not.toBeNull();
      for (const q of ['order', 'last10', 'also'] as QueryId[]) expect(runQuery(e.make(), q, P).copies).toBeNull();
    }
  });
});

describe('what each model is good and bad at (the comparison row)', () => {
  const runs = (q: QueryId) => Object.fromEntries(MODELS.map((m) => [m.id, runQuery(buildEngine(m.id), q, P)])) as Record<ModelId, Result<unknown>>;

  it('order page: document, key-value and wide-column are cheapest, relational (its joins) the costliest', () => {
    expect(extremes('order', runs('order'))).toEqual({ cheapest: ['document', 'kv', 'wide'], costliest: ['relational'] });
  });
  it('last 10 orders: wide-column is cheapest, key-value without an index the costliest', () => {
    expect(extremes('last10', runs('last10'))).toEqual({ cheapest: ['wide'], costliest: ['kv'] });
  });
  it('price update: relational and graph store the price once; key-value pays most', () => {
    expect(extremes('price', runs('price'))).toEqual({ cheapest: ['relational', 'graph'], costliest: ['kv'] });
  });
  it('also bought: wide-column cheapest, relational and document costliest (no join is not free)', () => {
    expect(extremes('also', runs('also'))).toEqual({ cheapest: ['wide'], costliest: ['relational', 'document'] });
  });

  it('marks nothing when every model costs the same', () => {
    const same = Object.fromEntries(MODELS.map((m) => [m.id, runQuery(buildEngine('relational'), 'order', P)])) as Record<ModelId, Result<unknown>>;
    expect(extremes('order', same)).toEqual({ cheapest: [], costliest: [] });
  });

  it('no model wins every query', () => {
    const cheapest = (['order', 'last10', 'price', 'also'] as QueryId[]).map((q) => extremes(q, runs(q)).cheapest);
    expect(cheapest.flat().length).toBeGreaterThan(4);
    for (const m of MODELS) expect(cheapest.every((c) => c.includes(m.id))).toBe(false);
  });
});

describe('index keys are an application cost the numbers do not hide', () => {
  it('indexed key-value reads a list and then the orders: more round trips than the scan, fewer lookups for a customer', () => {
    const scan = runQuery(buildEngine('kv'), 'last10', P);
    const idx = runQuery(buildEngine('kv', { indexed: true }), 'last10', P);
    expect(idx.lookups).toBeLessThan(scan.lookups);
    expect(idx.roundTrips).toBeGreaterThan(scan.roundTrips);
  });

  it('at this size a scan beats the index for "also bought" (16 against 27): honest, and why the dataset is labelled small', () => {
    expect(runQuery(buildEngine('kv'), 'also', P).lookups).toBeLessThan(runQuery(buildEngine('kv', { indexed: true }), 'also', P).lookups);
  });
});

describe('partition keys: hot partitions and what one partition can serve', () => {
  it('the constant key is bad, product_id warns, customer_id and order_id are fine', () => {
    expect(hotPartition('constant').level).toBe('bad');
    expect(hotPartition('product_id').level).toBe('warn');
    expect(hotPartition('customer_id').level).toBe('ok');
    expect(hotPartition('order_id').level).toBe('ok');
    for (const k of PARTITION_KEYS) expect(hotPartition(k.id).reason.length).toBeGreaterThan(20);
  });

  it('counts partitions and rows from the data: 16 orders, 3 customers, 4 products, 1', () => {
    expect([partitionCount('order_id'), partitionCount('customer_id'), partitionCount('product_id'), partitionCount('constant')]).toEqual([16, 3, 4, 1]);
    const lines = ORDERS.reduce((s, o) => s + o.lines.length, 0);
    for (const k of PARTITION_KEYS) expect(partitionSizes(k.id).reduce((a, b) => a + b, 0)).toBe(lines);
    expect(partitionSizes('constant')).toEqual([lines]);
  });

  it('serves: the matching key reads one partition, any other scatters over all of them', () => {
    expect(serves('order_id', 'none', 'order')).toMatchObject({ kind: 'one', partitions: 1 });
    expect(serves('customer_id', 'date-desc', 'order')).toMatchObject({ kind: 'scatter', partitions: 3 });
    expect(serves('customer_id', 'date-desc', 'last10')).toMatchObject({ kind: 'one', partitions: 1 });
    expect(serves('customer_id', 'none', 'last10')).toMatchObject({ kind: 'one-sorted-in-app', partitions: 1 });
    expect(serves('order_id', 'date-desc', 'last10')).toMatchObject({ kind: 'scatter', partitions: 16 });
    expect(serves('product_id', 'none', 'price')).toMatchObject({ kind: 'one', partitions: 1 });
    expect(serves('product_id', 'none', 'also')).toMatchObject({ kind: 'scatter', partitions: 4 });
  });

  it('"also bought" is never one partition unless everything is: no single key serves it', () => {
    for (const k of PARTITION_KEYS) for (const c of CLUSTERINGS) expect(serves(k.id, c.id, 'also').kind === 'one').toBe(k.id === 'constant');
  });

  it('the constant key serves everything from one partition, and is still flagged bad', () => {
    for (const q of ['order', 'last10', 'price', 'also'] as QueryId[]) expect(serves('constant', 'none', q).partitions).toBe(1);
    expect(evaluateDesign(REQUIREMENT_SETS[0], { key: 'constant', clustering: 'none' }).hot.level).toBe('bad');
  });

  it('evaluates a design over both required queries', () => {
    const page = REQUIREMENT_SETS.find((s) => s.id === 'page')!;
    expect(evaluateDesign(page, { key: 'customer_id', clustering: 'date-desc' })).toMatchObject({ total: 1 + 3, served: 1 });
    expect(evaluateDesign(page, { key: 'order_id', clustering: 'none' })).toMatchObject({ total: 1 + 16, served: 1 });
    const reco = REQUIREMENT_SETS.find((s) => s.id === 'reco')!;
    expect(evaluateDesign(reco, { key: 'customer_id', clustering: 'date-desc' })).toMatchObject({ total: 1 + 3, served: 1 });
  });

  it('no single table serves the order page and the history both: query-first design needs two tables', () => {
    const page = REQUIREMENT_SETS.find((s) => s.id === 'page')!;
    for (const k of PARTITION_KEYS.filter((x) => x.id !== 'constant'))
      for (const c of CLUSTERINGS) expect(evaluateDesign(page, { key: k.id, clustering: c.id }).served).toBeLessThan(2);
  });
});

describe('model totals in the exercise', () => {
  it('sum the two required queries per model, with wide-column taken from the design', () => {
    const page = REQUIREMENT_SETS.find((s) => s.id === 'page')!;
    expect(totalsFor(page, { key: 'customer_id', clustering: 'date-desc' }, P)).toEqual({
      relational: 4 + 11, document: 1 + 11, kv: 1 + 16, wide: 1 + 3, graph: 3 + 13,
    });
  });
});
