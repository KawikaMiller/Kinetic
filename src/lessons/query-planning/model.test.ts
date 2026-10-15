import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COSTS, DESCENT_PAGES, INDEXES, NEWEST_LIMIT, NO_INDEXES, QUERIES, actualRows, crossoverRows, estimatedRows, indexScanCost, misestimate, pagesFetched, planNodes, planQuery, scanOf, seqScanCost,
  type Costs, type IndexSet, type Params, type QueryDef, type Setup, type StatsMode,
} from './model';
import { DEFAULT_CONTROLS, PLAN_SCENES, effectiveInputs, scenePlan, type PlanControls, type PlanSceneId } from './scenes';
import { DAYS, ORDERS, STATUSES, countRows, makeOrders, ordersCounts, type Status, type TableShape } from './table';

// An independent statement of the toy cost model, written from the lesson's own prose (not from model.ts):
// expected distinct pages through a log1p/exp identity rather than a power, and a linear scan for the crossover.
const refPages = (pages: number, m: number) => pages * (1 - Math.exp(m * Math.log1p(-1 / pages)));
const refSeq = (t: TableShape, c: Costs) => t.pages * c.seqPage + t.rows * (c.cpuTuple + c.cpuOperator);
const refIndex = (t: TableShape, m: number, c: Costs) => 3 * c.randomPage + refPages(t.pages, m) * c.randomPage + m * (c.cpuIndexTuple + c.cpuTuple);
const refSort = (m: number, c: Costs) => 2 * c.cpuOperator * m * Math.log2(Math.max(m, 2)) + c.cpuOperator * m;
function refCrossover(t: TableShape, c: Costs): number | null {
  for (let m = 1; m <= t.rows; m++) if (refIndex(t, m, c) > refSeq(t, c)) return m;
  return null;
}
const withRandomPage = (randomPage: number): Costs => ({ ...DEFAULT_COSTS, randomPage });

const INDEX_SETS: IndexSet[] = Array.from({ length: 16 }, (_, bits) => ({ customer: !!(bits & 1), status: !!(bits & 2), created: !!(bits & 4), composite: !!(bits & 8) }));
const PARAMS: Params[] = [
  { customerId: 1, status: 'shipped', day: 1 },
  { customerId: 4242, status: 'paid', day: 300 },
  { customerId: 10_000, status: 'new', day: 365 },
  { customerId: 77, status: 'refunded', day: 180 },
];
const counts = ordersCounts();
const plan = (query: QueryDef, params: Params, setup: Setup, costs = DEFAULT_COSTS, basis?: 'actual' | 'estimate') =>
  planQuery({ query, params, setup, costs, table: ORDERS, counts, basis });
const queryOf = (id: string) => QUERIES.find((q) => q.id === id)!;

describe('the cost model, against hand-computed values', () => {
  it('a seq scan with one predicate costs 2,250 for these numbers', () => {
    expect(seqScanCost(ORDERS, DEFAULT_COSTS)).toBeCloseTo(2250, 9);
    expect(refSeq(ORDERS, DEFAULT_COSTS)).toBeCloseTo(2250, 9);
  });

  it('an index scan of 10 rows costs 51.97 (descent 12, 9.96 pages, 0.15 of CPU)', () => {
    expect(indexScanCost(ORDERS, 10, DEFAULT_COSTS)).toBeCloseTo(51.97, 2);
    expect(DESCENT_PAGES * DEFAULT_COSTS.randomPage).toBe(12);
    expect(pagesFetched(ORDERS.pages, 10)).toBeCloseTo(9.955, 3);
  });

  it('expected distinct pages: one row touches one page, a huge number of rows touches them all', () => {
    expect(pagesFetched(1000, 1)).toBeCloseTo(1, 12);
    expect(pagesFetched(1000, 1e6)).toBeCloseTo(1000, 6);
    for (const m of [1, 50, 813, 5000]) expect(pagesFetched(1000, m)).toBeCloseTo(refPages(1000, m), 9);
  });
});

describe('the crossover', () => {
  it('is 813 rows at random_page_cost 4 and 76,447 at 1.1, found by a linear search that shares no code with the model', () => {
    expect(refCrossover(ORDERS, withRandomPage(4))).toBe(813);
    expect(refCrossover(ORDERS, withRandomPage(1.1))).toBe(76_447);
    expect(crossoverRows(ORDERS, withRandomPage(4))).toBe(813);
    expect(crossoverRows(ORDERS, withRandomPage(1.1))).toBe(76_447);
  });

  it('matches the linear search at every random_page_cost the slider offers (1.0 to 8.0 in steps of 0.1)', () => {
    for (let tenths = 10; tenths <= 80; tenths++) {
      const costs = withRandomPage(tenths / 10);
      expect(crossoverRows(ORDERS, costs), `random_page_cost ${tenths / 10}`).toBe(refCrossover(ORDERS, costs));
    }
  });

  it('the index wins just below the crossover and loses at it', () => {
    for (const rpc of [4, 1.1]) {
      const c = crossoverRows(ORDERS, withRandomPage(rpc))!;
      expect(indexScanCost(ORDERS, c - 1, withRandomPage(rpc))).toBeLessThanOrEqual(seqScanCost(ORDERS, withRandomPage(rpc)));
      expect(indexScanCost(ORDERS, c, withRandomPage(rpc))).toBeGreaterThan(seqScanCost(ORDERS, withRandomPage(rpc)));
    }
  });

  it('a broken planner that ignores random_page_cost fails the crossover check the real one passes', () => {
    const holds = (cross: (t: TableShape, c: Costs) => number | null) =>
      cross(ORDERS, withRandomPage(1.1)) === 76_447 && cross(ORDERS, withRandomPage(4)) === 813;
    const ignoresRandomPageCost = (t: TableShape, c: Costs) => crossoverRows(t, { ...c, randomPage: DEFAULT_COSTS.randomPage });
    expect(holds(crossoverRows)).toBe(true);
    expect(holds(ignoresRandomPageCost)).toBe(false);
  });

  it('is null when the index never loses (a tiny table with free random pages)', () => {
    expect(crossoverRows({ rows: 1000, pages: 10, customers: 100 }, { ...DEFAULT_COSTS, randomPage: 0.01 })).toBeNull();
  });
});

describe('the table', () => {
  const shape: TableShape = { rows: 2000, pages: 20, customers: 200 };
  const orders = makeOrders(shape, 3);

  it('has exactly the stated shares and ten rows per customer, counted by brute force', () => {
    const status = (s: Status) => orders.filter((o) => o.status === s).length;
    expect(STATUSES.map(status)).toEqual([1400, 400, 190, 10]);
    for (let c = 1; c <= shape.customers; c++) expect(orders.filter((o) => o.customer_id === c)).toHaveLength(10);
    expect(orders.every((o) => o.created_at >= 1 && o.created_at <= DAYS)).toBe(true);
  });

  it('countRows equals a plain filter for every status, a spread of customers and every day', () => {
    const c = countRows(orders);
    for (const s of STATUSES) expect(c.byStatus[s]).toBe(orders.filter((o) => o.status === s).length);
    for (const id of [1, 57, 200]) expect(c.byCustomer.get(id)).toBe(orders.filter((o) => o.customer_id === id).length);
    for (let d = 1; d <= DAYS; d++) expect(c.sinceDay[d]).toBe(orders.filter((o) => o.created_at >= d).length);
  });

  it('the same seed gives the same table, and the lesson table has 500 refunded rows', () => {
    expect(makeOrders(shape, 3)).toEqual(orders);
    expect(ordersCounts().byStatus.refunded).toBe(500);
    expect(ordersCounts().byStatus.shipped).toBe(70_000);
  });

  it('refuses a table size whose counts would not be exact', () => {
    expect(() => makeOrders({ rows: 1500, pages: 15, customers: 150 }, 1)).toThrow();
  });
});

describe('the planner picks the cheapest candidate', () => {
  it('in every combination of indexes, statistics, query and parameter, against an independent costing of each candidate', () => {
    let checked = 0;
    for (const indexes of INDEX_SETS) {
      for (const stats of ['fresh', 'stale'] as StatsMode[]) {
        for (const q of QUERIES) {
          for (const params of PARAMS) {
            const result = plan(q, params, { indexes, stats });
            const m = estimatedRows(q, params, stats, ORDERS);
            const total = (scan: { startup: number; total: number }, sorted: boolean) => {
              const node = sorted ? { startup: scan.total + refSort(m, DEFAULT_COSTS) - DEFAULT_COSTS.cpuOperator * m, total: scan.total + refSort(m, DEFAULT_COSTS) } : scan;
              if (q.limit === null) return node.total;
              return node.startup + (node.total - node.startup) * Math.min(1, q.limit / Math.max(m, 1));
            };
            const expected = [{ id: 'seq', total: total({ startup: 0, total: refSeq(ORDERS, DEFAULT_COSTS) }, q.newestFirst) }];
            for (const ix of INDEXES) {
              if (!indexes[ix.id] || ix.leading !== q.where) continue;
              const ordered = ix.id === 'composite' && q.newestFirst;
              const scan = { startup: 3 * DEFAULT_COSTS.randomPage, total: refIndex(ORDERS, m, DEFAULT_COSTS) };
              expected.push({ id: ix.id, total: total(scan, q.newestFirst && !ordered) });
            }
            expect(result.candidates.map((c) => c.id)).toEqual(expected.map((e) => e.id));
            result.candidates.forEach((c, i) => expect(c.total, `${q.id} ${c.id}`).toBeCloseTo(expected[i].total, 6));
            const cheapest = Math.min(...expected.map((e) => e.total));
            expect(result.candidates[result.chosen].total).toBeCloseTo(cheapest, 6);
            checked++;
          }
        }
      }
    }
    expect(checked).toBe(16 * 2 * 5 * 4);
  });

  it('a seq scan is always a candidate, and an index is a candidate only when its leading column is the WHERE column', () => {
    for (const q of QUERIES) {
      const result = plan(q, PARAMS[0], { indexes: INDEX_SETS[15], stats: 'fresh' });
      expect(result.candidates[0].id).toBe('seq');
      for (const c of result.candidates.slice(1)) expect(c.index!.leading).toBe(q.where);
    }
  });

  it('with no index the only plan is a seq scan', () => {
    for (const q of QUERIES) expect(plan(q, PARAMS[1], { indexes: NO_INDEXES, stats: 'fresh' }).candidates.map((c) => c.id)).toEqual(['seq']);
  });

  it('a customer lookup uses the index: 51.97 against 2,250', () => {
    const r = plan(queryOf('customer'), PARAMS[1], { indexes: { ...NO_INDEXES, customer: true }, stats: 'fresh' });
    expect(r.candidates[r.chosen].index?.id).toBe('customer');
    expect(r.candidates[r.chosen].total).toBeCloseTo(51.97, 2);
    expect(r.candidates[0].total).toBeCloseTo(2250, 6);
  });

  it('a query returning 40% of the table does not use its index (the quiz scenario)', () => {
    const q = queryOf('recent');
    const setup: Setup = { indexes: { ...NO_INDEXES, created: true }, stats: 'fresh' };
    const day = DAYS - Math.round(0.4 * DAYS) + 1;
    expect(estimatedRows(q, { ...PARAMS[0], day }, 'fresh', ORDERS) / ORDERS.rows).toBeCloseTo(0.4, 2);
    const r = plan(q, { ...PARAMS[0], day }, setup);
    expect(r.candidates[r.chosen].id).toBe('seq');
  });
});

describe('statistics and misestimates', () => {
  const statusQuery = queryOf('status');
  const refunded: Params = { customerId: 1, status: 'refunded', day: 1 };
  const indexed: Setup['indexes'] = { ...NO_INDEXES, status: true };

  it('stale statistics think refunded is 25,000 rows, the data says 500: off by 50x', () => {
    expect(estimatedRows(statusQuery, refunded, 'stale', ORDERS)).toBe(25_000);
    expect(actualRows(statusQuery, refunded, counts)).toBe(500);
    expect(misestimate(25_000, 500)).toEqual({ ratio: 50, direction: 'over', flagged: true });
  });

  it('fresh statistics pick the index for refunded; stale ones pick a seq scan', () => {
    const fresh = plan(statusQuery, refunded, { indexes: indexed, stats: 'fresh' });
    const stale = plan(statusQuery, refunded, { indexes: indexed, stats: 'stale' });
    expect(fresh.candidates[fresh.chosen].id).toBe('status');
    expect(stale.candidates[stale.chosen].id).toBe('seq');
  });

  it('costed with the true 500 rows the index plan (1,593.98) is cheaper than the seq scan (2,250)', () => {
    const truth = plan(statusQuery, refunded, { indexes: indexed, stats: 'stale' }, DEFAULT_COSTS, 'actual');
    const byId = Object.fromEntries(truth.candidates.map((c) => [c.id, c.total]));
    expect(byId.status).toBeCloseTo(1593.98, 2);
    expect(byId.seq).toBeCloseTo(2250, 6);
    expect(byId.status).toBeLessThan(byId.seq);
  });

  it('the scan node carries both numbers: estimated 25,000, actual 500', () => {
    const stale = plan(statusQuery, refunded, { indexes: indexed, stats: 'stale' });
    const scan = scanOf(stale.candidates[0].root);
    expect([scan.estRows, scan.actualRows]).toEqual([25_000, 500]);
  });

  it('an estimate is only flagged from 10x off, and an exact one reads as exact', () => {
    expect(misestimate(100, 10).flagged).toBe(true);
    expect(misestimate(100, 11).flagged).toBe(false);
    expect(misestimate(500, 500)).toEqual({ ratio: 1, direction: 'exact', flagged: false });
    expect(misestimate(10, 100)).toMatchObject({ ratio: 10, direction: 'under' });
  });

  it('every customer lookup is estimated exactly (10 rows each)', () => {
    for (const customerId of [1, 999, 10_000]) {
      expect(estimatedRows(queryOf('customer'), { ...PARAMS[0], customerId }, 'fresh', ORDERS)).toBe(actualRows(queryOf('customer'), { ...PARAMS[0], customerId }, counts));
    }
  });
});

describe('sort elimination', () => {
  const newest = queryOf('customerNewest');
  const params = PARAMS[1];
  const kinds = (indexes: IndexSet) => {
    const r = plan(newest, params, { indexes, stats: 'fresh' });
    return planNodes(r.candidates[r.chosen].root).map((n) => n.kind);
  };

  it('has a Sort without the composite index and none with it', () => {
    expect(kinds(NO_INDEXES)).toEqual(['Limit', 'Sort', 'Seq Scan']);
    expect(kinds({ ...NO_INDEXES, customer: true })).toEqual(['Limit', 'Sort', 'Index Scan']);
    expect(kinds({ ...NO_INDEXES, composite: true })).toEqual(['Limit', 'Index Scan']);
    expect(kinds({ ...NO_INDEXES, customer: true, composite: true })).toEqual(['Limit', 'Index Scan']);
  });

  it('the composite index lowers the cost, 52.16 to 51.97, only by the sort cost of 10 rows', () => {
    const cost = (indexes: IndexSet) => { const r = plan(newest, params, { indexes, stats: 'fresh' }); return r.candidates[r.chosen].total; };
    expect(cost({ ...NO_INDEXES, customer: true })).toBeCloseTo(52.16, 2);
    expect(cost({ ...NO_INDEXES, composite: true })).toBeCloseTo(51.97, 2);
    expect(NEWEST_LIMIT).toBe(10);
  });

  it('an index on status cannot remove the Sort of a status query: every candidate has one', () => {
    for (const status of STATUSES) {
      const r = plan(queryOf('statusNewest'), { ...params, status }, { indexes: { ...NO_INDEXES, status: true, composite: true }, stats: 'fresh' });
      expect(r.candidates.every((c) => c.hasSort)).toBe(true);
      expect(r.candidates.every((c) => planNodes(c.root).some((n) => n.kind === 'Sort'))).toBe(true);
    }
  });
});

describe('hidden controls (AC-0/T3 #17): a scene pins every control it does not show', () => {
  const SCENE_IDS = Object.keys(PLAN_SCENES) as PlanSceneId[];
  const pick = (set: IndexSet, ids: readonly (keyof IndexSet)[]): Partial<IndexSet> => Object.fromEntries(ids.map((id) => [id, set[id]]));
  const totals = (scene: PlanSceneId, ctl: PlanControls) => {
    const r = scenePlan(scene, ctl);
    return JSON.stringify({ query: r.query.id, candidates: r.candidates.map((c) => [c.id, c.total, planNodes(c.root).map((n) => [n.kind, n.estRows, n.actualRows])]), chosen: r.chosen });
  };

  it('changing a control the scene hides never changes its plan, over the full cross product of those controls', () => {
    for (const scene of SCENE_IDS) {
      const def = PLAN_SCENES[scene];
      for (const query of def.queries) {
        const base: PlanControls = { ...DEFAULT_CONTROLS, query };
        const reference = totals(scene, base);
        for (const indexes of INDEX_SETS) {
          for (const stats of ['fresh', 'stale'] as StatsMode[]) {
            for (const analyze of [false, true]) {
              const ctl: PlanControls = {
                ...base,
                indexes: def.indexToggles.length === INDEXES.length ? base.indexes : { ...base.indexes, ...pick(indexes, INDEXES.map((i) => i.id).filter((id) => !(def.indexToggles as readonly string[]).includes(id))) },
                stats: def.showStats ? base.stats : stats,
                analyze: def.analyze === 'toggle' ? base.analyze : analyze,
              };
              expect(totals(scene, ctl), `${scene} ${JSON.stringify(ctl)}`).toBe(reference);
            }
          }
        }
      }
    }
  });

  it('a parameter the query does not use (the status of a customer lookup, the day of a status query) never changes its plan', () => {
    const unused: Record<string, Partial<PlanControls>[]> = {
      customer_id: [{ status: 'paid' }, { day: 1 }],
      status: [{ customerId: 1 }, { day: 1 }],
      created_at: [{ customerId: 1 }, { status: 'new' }],
    };
    for (const q of QUERIES) {
      const base: PlanControls = { ...DEFAULT_CONTROLS, query: q.id, indexes: { customer: true, status: true, created: true, composite: true } };
      for (const change of unused[q.where]) expect(totals('indexes', { ...base, ...change })).toBe(totals('indexes', base));
    }
  });

  it('effective inputs: a pinned index is the scene constant, whatever the toggles say', () => {
    const all: IndexSet = { customer: true, status: true, created: true, composite: true };
    expect(effectiveInputs('tree', { ...DEFAULT_CONTROLS, indexes: all }).setup.indexes).toEqual(PLAN_SCENES.tree.pinnedIndexes);
    expect(effectiveInputs('misestimate', { ...DEFAULT_CONTROLS, indexes: NO_INDEXES }).setup.indexes).toEqual({ ...NO_INDEXES, status: true });
    expect(effectiveInputs('indexes', { ...DEFAULT_CONTROLS, indexes: all }).setup.indexes).toEqual(all);
    expect(effectiveInputs('tree', { ...DEFAULT_CONTROLS, stats: 'stale' }).setup.stats).toBe('fresh');
    expect(effectiveInputs('misestimate', DEFAULT_CONTROLS).analyze).toBe(true);
    expect(effectiveInputs('sort', { ...DEFAULT_CONTROLS, query: 'status' }).query).toBe('customerNewest');
  });
});
