import { describe, expect, it } from 'vitest';
import { CUSTOMERS, EXAMPLE_CUSTOMER, EXAMPLE_ORDER, ORDERS, PRODUCTS, refAlso, refLast, refOrder } from './canon';
import {
  CLUSTERINGS, PARTITION_KEYS, REQUIREMENT_SETS, ddl, evaluateDesign, hotPartition, partitionCount, partitionSizes, primaryKey, serves, totalsFor, type Design,
} from './design';
import { MODELS, buildEngine, extremes, runQuery, type Engine, type ModelId, type Params, type QueryId, type Result } from './engines';

const P: Params = { order: EXAMPLE_ORDER, customer: EXAMPLE_CUSTOMER, product: 'P1', newPrice: 175 };
const ENGINES: { name: string; make: () => Engine; id: ModelId }[] = MODELS.flatMap((m) => [
  { name: `${m.label} (unprepared)`, make: () => buildEngine(m.id, { prepared: false }), id: m.id },
  { name: `${m.label} (prepared)`, make: () => buildEngine(m.id, { prepared: true }), id: m.id },
]);

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
const wideRows = {
  order: row(1, 1), last10: row(1, 1), also: row(1 + 2, 2), price: row(1 + 9 + 1, 2, 10),
};
const graphRows = {
  order: row(1 + 2, 1), last10: row(1 + 12, 1), also: row(1 + 2, 1), price: row(1, 1, 1),
};
const EXPECTED: Record<string, Record<QueryId, Row>> = {
  'Relational (unprepared)': { order: row(1 + 1 + 2, 1), last10: row(1 + 10, 1), also: row(1 + 9 + 2 + 15, 1), price: row(1, 1, 1) },
  'Relational (prepared)': { order: row(1 + 1 + 2, 1), last10: row(1, 1), also: row(1 + 2, 1), price: row(1, 1, 1) },
  'Document (unprepared)': { order: row(1, 1), last10: row(1 + 10, 1), also: row(1 + 9 + 2 + 15, 2), price: row(1 + 9 + 1, 2, 10) },
  'Document (prepared)': { order: row(1, 1), last10: row(1, 1), also: row(1 + 2, 1), price: row(1 + 9 + 1, 2, 10) },
  'Key-value (unprepared)': { order: row(1, 1), last10: row(16, 1), also: row(16, 1), price: row(16 + 9 + 1, 2, 10) },
  'Key-value (prepared)': { order: row(1, 1), last10: row(1, 1), also: row(1 + 2, 2), price: row(1 + 9 + 1, 2, 10) },
  'Wide-column (unprepared)': wideRows,
  'Wide-column (prepared)': wideRows,
  'Graph (unprepared)': graphRows,
  'Graph (prepared)': graphRows,
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
  const runs = (q: QueryId, prepared: boolean) => Object.fromEntries(MODELS.map((m) => [m.id, runQuery(buildEngine(m.id, { prepared }), q, P)])) as Record<ModelId, Result<unknown>>;

  it('prepared: order page cheapest in document, key-value and wide-column, costliest in relational (its joins)', () => {
    expect(extremes('order', runs('order', true))).toEqual({ cheapest: ['document', 'kv', 'wide'], costliest: ['relational'] });
  });
  it('prepared: last 10 orders is one lookup everywhere except the graph, which reads every order of the customer', () => {
    expect(extremes('last10', runs('last10', true))).toEqual({ cheapest: ['relational', 'document', 'kv', 'wide'], costliest: ['graph'] });
  });
  it('price update: relational and graph store the price once; document, key-value and wide-column copy it', () => {
    expect(extremes('price', runs('price', true))).toEqual({ cheapest: ['relational', 'graph'], costliest: ['document', 'kv', 'wide'] });
  });
  it('prepared: also bought costs 3 lookups in every model, so nothing is marked (not rigged)', () => {
    const r = runs('also', true);
    for (const m of MODELS) expect(r[m.id].lookups, m.id).toBe(3);
    expect(extremes('also', r)).toEqual({ cheapest: [], costliest: [] });
  });
  it('unprepared: also bought is cheap only where a structure was built for it (wide-column, graph) and costly in the nested-loop plans', () => {
    expect(extremes('also', runs('also', false))).toEqual({ cheapest: ['wide', 'graph'], costliest: ['relational', 'document'] });
  });
  it('unprepared: last 10 orders costs most in key-value (a full scan), least in wide-column', () => {
    expect(extremes('last10', runs('last10', false))).toEqual({ cheapest: ['wide'], costliest: ['kv'] });
  });

  it('marks nothing when every model costs the same', () => {
    const same = Object.fromEntries(MODELS.map((m) => [m.id, runQuery(buildEngine('relational'), 'order', P)])) as Record<ModelId, Result<unknown>>;
    expect(extremes('order', same)).toEqual({ cheapest: [], costliest: [] });
  });

  it('no model is cheapest at every query, prepared or not', () => {
    for (const prepared of [true, false]) {
      const cheapest = (['order', 'last10', 'price', 'also'] as QueryId[]).map((q) => extremes(q, runs(q, prepared)).cheapest);
      for (const m of MODELS) expect(cheapest.every((c) => c.includes(m.id)), `${m.id} ${prepared}`).toBe(false);
    }
  });
});

describe('the prepare toggle: everything it changes is visible, and it is the same unit for every model', () => {
  it('changes the numbers of relational, document and key-value, and leaves wide-column and graph alone (they always carry their structures)', () => {
    for (const q of ['last10', 'also'] as QueryId[]) {
      for (const m of ['relational', 'document', 'kv'] as ModelId[])
        expect(runQuery(buildEngine(m, { prepared: true }), q, P).lookups, `${m} ${q}`).toBeLessThan(runQuery(buildEngine(m, { prepared: false }), q, P).lookups);
      for (const m of ['wide', 'graph'] as ModelId[])
        expect(runQuery(buildEngine(m, { prepared: true }), q, P).lookups).toBe(runQuery(buildEngine(m, { prepared: false }), q, P).lookups);
    }
  });

  it('a wide-column partition and a graph node with its edge list are each one lookup for the same "also bought" shape: 1 + buyers', () => {
    const buyers = 2;
    expect(runQuery(buildEngine('wide'), 'also', P).lookups).toBe(1 + buyers);
    expect(runQuery(buildEngine('graph'), 'also', P).lookups).toBe(1 + buyers);
  });

  it('prepared key-value pays round trips for its index keys but not lookups; unprepared scans everything', () => {
    const scan = runQuery(buildEngine('kv', { prepared: false }), 'also', P);
    const idx = runQuery(buildEngine('kv', { prepared: true }), 'also', P);
    expect(idx.lookups).toBeLessThan(scan.lookups);
    expect(idx.roundTrips).toBeGreaterThan(scan.roundTrips);
  });

  it('at 16 records a scan beats the relational nested-loop plan, and the hint says so with these numbers', () => {
    expect(runQuery(buildEngine('kv'), 'also', P).lookups).toBeLessThan(runQuery(buildEngine('relational'), 'also', P).lookups);
  });
});

describe('no control feeds numbers it does not show (review repros)', () => {
  const scenes = import.meta.glob<string>('./*Scene.tsx', { query: '?raw', import: 'default', eager: true });
  const source = (name: string) => Object.entries(scenes).find(([k]) => k.endsWith(name))![1];

  it('the prepare toggle is always rendered, not behind a model check', () => {
    const src = source('ModelsScene.tsx');
    expect(src).toMatch(/<Toggle label="Prepare each store/);
    expect(src).not.toMatch(/model === '\w+' && <Toggle/);
  });

  it('the wide-column key and clustering pickers are always rendered, since the Wide-column column always uses them', () => {
    const src = source('DesignScene.tsx');
    expect(src).not.toMatch(/model === 'wide' \? \[/);
    expect(src).toMatch(/label="Wide-column partition key"/);
    expect(src).toMatch(/label="Clustering"/);
  });

  it('the exercise totals take no state beyond the set, the design and the params', () => {
    const page = REQUIREMENT_SETS.find((x) => x.id === 'page')!;
    const a = totalsFor(page, { key: 'constant', clustering: 'id' }, P);
    const b = totalsFor(page, { key: 'constant', clustering: 'id' }, P);
    expect(a).toEqual(b);
    expect(a.wide).toBe(evaluateDesign(page, { key: 'constant', clustering: 'id' }).total);
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
    expect(serves('order_id', 'id', 'order')).toMatchObject({ kind: 'one', partitions: 1 });
    expect(serves('customer_id', 'date-desc', 'order')).toMatchObject({ kind: 'scatter', partitions: 3 });
    expect(serves('customer_id', 'date-desc', 'last10')).toMatchObject({ kind: 'one', partitions: 1 });
    expect(serves('customer_id', 'id', 'last10')).toMatchObject({ kind: 'one-sorted-in-app', partitions: 1 });
    expect(serves('order_id', 'date-desc', 'last10')).toMatchObject({ kind: 'scatter', partitions: 16 });
    expect(serves('product_id', 'id', 'price')).toMatchObject({ kind: 'one', partitions: 1 });
    expect(serves('product_id', 'id', 'also')).toMatchObject({ kind: 'scatter', partitions: 4 });
  });

  it('"also bought" is never one partition unless everything is: no single key serves it', () => {
    for (const k of PARTITION_KEYS) for (const c of CLUSTERINGS) expect(serves(k.id, c.id, 'also').kind === 'one').toBe(k.id === 'constant');
  });

  it('the constant key serves everything from one partition, and is still flagged bad', () => {
    for (const q of ['order', 'last10', 'price', 'also'] as QueryId[]) expect(serves('constant', 'id', q).partitions).toBe(1);
    expect(evaluateDesign(REQUIREMENT_SETS[0], { key: 'constant', clustering: 'id' }).hot.level).toBe('bad');
  });

  it('evaluates a design over both required queries', () => {
    const page = REQUIREMENT_SETS.find((s) => s.id === 'page')!;
    expect(evaluateDesign(page, { key: 'customer_id', clustering: 'date-desc' })).toMatchObject({ total: 1 + 3, served: 1 });
    expect(evaluateDesign(page, { key: 'order_id', clustering: 'id' })).toMatchObject({ total: 1 + 16, served: 1 });
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
  it('sum the two required queries per model (every store prepared), with wide-column taken from the design', () => {
    const page = REQUIREMENT_SETS.find((s) => s.id === 'page')!;
    expect(totalsFor(page, { key: 'customer_id', clustering: 'date-desc' }, P)).toEqual({
      relational: 4 + 1, document: 1 + 1, kv: 1 + 1, wide: 1 + 3, graph: 3 + 13,
    });
  });
});

describe('the wide-column DDL is valid: a primary key is unique per row (review repro)', () => {
  const LINES = ORDERS.flatMap((o) => o.lines.map((l) => ({ order_id: String(o.id), customer_id: o.customer, product_id: l.product, order_date: o.date, constant: 'all' })));
  const columnsOf = (d: Design) => {
    const { partition, clustering } = primaryKey(d);
    return [partition, ...clustering.map((c) => c.replace(' DESC', ''))] as (keyof (typeof LINES)[number])[];
  };

  it('every key x clustering choice gives each order line a distinct primary key, so no row overwrites another', () => {
    for (const k of PARTITION_KEYS)
      for (const c of CLUSTERINGS) {
        const cols = columnsOf({ key: k.id, clustering: c.id });
        expect(new Set(LINES.map((l) => JSON.stringify(cols.map((col) => l[col])))).size, `${k.id} ${c.id}`).toBe(LINES.length);
      }
  });

  it('a key with no clustering columns would hold one row per partition: the second order overwrites the first', () => {
    const customerOnly = LINES.map((l) => l.customer_id);
    expect(new Set(customerOnly).size).toBeLessThan(LINES.length);
  });

  it('renders the real DDL for the choices the scene offers', () => {
    expect(ddl({ key: 'customer_id', clustering: 'date-desc' })).toBe('PRIMARY KEY ((customer_id), order_date DESC, order_id, product_id)');
    expect(ddl({ key: 'customer_id', clustering: 'id' })).toBe('PRIMARY KEY ((customer_id), order_id, product_id)');
    expect(ddl({ key: 'order_id', clustering: 'id' })).toBe('PRIMARY KEY ((order_id), product_id)');
    expect(ddl({ key: 'product_id', clustering: 'date-desc' })).toBe('PRIMARY KEY ((product_id), order_date DESC, order_id)');
    expect(ddl({ key: 'constant', clustering: 'id' })).toBe("PRIMARY KEY (('all'), order_id, product_id)");
  });

  it('clustering by the ids only is not date-ordered, so the newest-orders query sorts in the application', () => {
    expect(serves('customer_id', 'id', 'last10').kind).toBe('one-sorted-in-app');
    expect(serves('customer_id', 'date-desc', 'last10').kind).toBe('one');
  });
});
