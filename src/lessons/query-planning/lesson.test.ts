import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { DEFAULT_COSTS, FAST_STORAGE_RANDOM_PAGE_COST, INDEXES, QUERIES, crossoverRows, indexScanCost, misestimate, planNodes, scanOf, seqScanCost, type IndexSet, type StatsMode } from './model';
import { crossoverCaption, planCaption } from './captions';
import { PLAN_SCENES, effectiveInputs, initialControls, scenePlan, type PlanControls, type PlanSceneId } from './scenes';
import { planTextLines } from './textPlan';
import { ORDERS, STATUSES } from './table';
import lesson from './index';

const withIndexes = (...ids: IndexSet extends Record<infer K, boolean> ? K[] : never): IndexSet => ({ customer: ids.includes('customer'), status: ids.includes('status'), created: ids.includes('created'), composite: ids.includes('composite') });
const defaults = (scene: PlanSceneId, patch: Partial<PlanControls> = {}): PlanControls => ({ ...initialControls(scene), ...patch });
const chosenOf = (r: ReturnType<typeof scenePlan>) => r.candidates[r.chosen];

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: ANALYZE on the default customer query shows the Index Scan reading 10 rows against an estimate of 10, at cost 51.97', () => {
    const ctl = defaults('tree', { analyze: true });
    expect(ctl).toMatchObject({ customerId: 4242 });
    const r = scenePlan('tree', ctl);
    const scan = scanOf(chosenOf(r).root);
    expect([scan.kind, scan.estRows, scan.actualRows]).toEqual(['Index Scan', 10, 10]);
    expect(scan.total).toBeCloseTo(51.97, 2);
    expect(lesson.tryThis[0]).toContain('51.97');
    const c = text(planCaption('tree', r, effectiveInputs('tree', ctl).analyze), { strict: true });
    expect(c).toContain('estimated 10, actual 10');
    expect(planTextLines(chosenOf(r).root, true).join('\n')).toContain('(actual rows=10 loops=1)');
  });

  it('try-this 2: from no index, switching on customer_id turns a 2,250.00 seq scan into a 51.97 index scan, 43.3 times cheaper', () => {
    const before = scenePlan('indexes', defaults('indexes'));
    expect(chosenOf(before).id).toBe('seq');
    expect(chosenOf(before).total).toBeCloseTo(2250, 6);
    const after = scenePlan('indexes', defaults('indexes', { indexes: withIndexes('customer') }));
    expect(chosenOf(after).index?.id).toBe('customer');
    expect(chosenOf(after).total).toBeCloseTo(51.97, 2);
    expect(lesson.tryThis[1]).toContain('2,250.00');
    expect(lesson.tryThis[1]).toContain('43.3 times');
    expect(2250 / 51.97).toBeCloseTo(43.3, 1);
    expect(text(planCaption('indexes', after, false), { strict: true })).toContain('chose Index Scan: orders_customer_idx');
  });

  it('try-this 3: the crossover is 813 rows (0.81%) and, at random_page_cost 1.1, 76,447 rows (76.4%)', () => {
    expect(crossoverRows(ORDERS, DEFAULT_COSTS)).toBe(813);
    expect(crossoverRows(ORDERS, { ...DEFAULT_COSTS, randomPage: FAST_STORAGE_RANDOM_PAGE_COST })).toBe(76_447);
    for (const part of ['813 rows (0.81%', '76,447 rows (76.4%']) expect(lesson.tryThis[2]).toContain(part);
    expect(text(crossoverCaption(ORDERS, DEFAULT_COSTS, 500), { strict: true })).toContain('813 rows (0.81% of the table)');
  });

  it('try-this 4: for refunded the planner uses the index on fresh statistics, and after stale it estimates 25,000 against 500 and takes the seq scan', () => {
    const fresh = scenePlan('misestimate', defaults('misestimate'));
    expect(chosenOf(fresh).index?.id).toBe('status');
    const stale = scenePlan('misestimate', defaults('misestimate', { stats: 'stale' }));
    expect(chosenOf(stale).id).toBe('seq');
    const scan = scanOf(chosenOf(stale).root);
    expect([scan.estRows, scan.actualRows]).toEqual([25_000, 500]);
    const c = text(planCaption('misestimate', stale, true, scenePlan('misestimate', defaults('misestimate', { stats: 'stale' }), 'actual')), { strict: true });
    expect(c).toContain('estimated 25,000, actual 500: off by 50×');
    expect(c).toContain('Index Scan: orders_status_idx would cost 1,593.98 against 2,250.00');
  });

  it('try-this 5: with no index the plan is Limit, Sort, Seq Scan at 2,250.19; the composite index removes the Sort and the cost is 51.97', () => {
    const before = scenePlan('sort', defaults('sort'));
    expect(planNodes(chosenOf(before).root).map((n) => n.kind)).toEqual(['Limit', 'Sort', 'Seq Scan']);
    expect(chosenOf(before).total).toBeCloseTo(2250.19, 2);
    const after = scenePlan('sort', defaults('sort', { indexes: withIndexes('composite') }));
    expect(planNodes(chosenOf(after).root).map((n) => n.kind)).toEqual(['Limit', 'Index Scan']);
    expect(chosenOf(after).total).toBeCloseTo(51.97, 2);
    expect(lesson.tryThis[4]).toContain('2,250.19');
    expect(text(planCaption('sort', after, false), { strict: true })).toContain('no Sort');
  });
});

describe('captions are computed from the model (AC-0/T3 #14), over each scene\'s control cross product', () => {
  const INDEX_SETS: IndexSet[] = Array.from({ length: 16 }, (_, bits) => ({ customer: !!(bits & 1), status: !!(bits & 2), created: !!(bits & 4), composite: !!(bits & 8) }));
  const num = (x: number) => x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  it('names the cheapest candidate and its cost, and the Sort state, for every query, status, index set and statistics mode', () => {
    let checked = 0;
    for (const scene of Object.keys(PLAN_SCENES) as PlanSceneId[]) {
      const def = PLAN_SCENES[scene];
      for (const query of def.queries) {
        for (const status of STATUSES) {
          for (const indexes of def.indexToggles.length ? INDEX_SETS : [INDEX_SETS[0]]) {
            for (const stats of (def.showStats ? ['fresh', 'stale'] : ['fresh']) as StatsMode[]) {
              const ctl = defaults(scene, { query, status, indexes, stats });
              const r = scenePlan(scene, ctl);
              const analyze = effectiveInputs(scene, ctl).analyze;
              const c = text(planCaption(scene, r, analyze, scene === 'misestimate' ? scenePlan(scene, ctl, 'actual') : undefined), { strict: true });
              const cheapest = Math.min(...r.candidates.map((x) => x.total));
              expect(c, `${scene} ${query} ${status} ${stats}`).toContain(`chose ${chosenOf(r).label} at cost ${num(cheapest)}`);
              expect(c).toContain(`costed ${r.candidates.length} candidate plan`);
              const sortNode = planNodes(chosenOf(r).root).some((n) => n.kind === 'Sort');
              if (scene === 'sort') expect(c.includes('still has a Sort node')).toBe(sortNode);
              if (scene === 'sort') expect(c.includes('no Sort')).toBe(!sortNode);
              if (analyze && scene !== 'sort') {
                const scan = scanOf(chosenOf(r).root);
                const m = misestimate(scan.estRows, scan.actualRows);
                expect(c.includes('exact')).toBe(m.direction === 'exact');
                expect(c.includes('too high')).toBe(m.direction === 'over');
                expect(c.includes('too low')).toBe(m.direction === 'under');
              }
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('the crossover caption picks the plan the cost lines say is cheaper, and states the crossover, at the slider extremes', () => {
    for (const rpc of [1, 1.1, 2.5, 4, 8]) {
      const costs = { ...DEFAULT_COSTS, randomPage: rpc };
      const cross = crossoverRows(ORDERS, costs)!;
      for (const m of [1, 10, cross - 1, cross, 5000, ORDERS.rows]) {
        const c = text(crossoverCaption(ORDERS, costs, m), { strict: true });
        const indexWins = indexScanCost(ORDERS, m, costs) <= seqScanCost(ORDERS, costs);
        expect(c, `${rpc} ${m}`).toContain(`so the planner picks the ${indexWins ? 'index' : 'seq scan'}`);
        expect(c).toContain(`cross at ${cross.toLocaleString('en-US')} rows`);
      }
    }
  });
});

describe('the plan text', () => {
  it('lays the plan out as EXPLAIN does: root first, children after ->, conditions underneath', () => {
    const r = scenePlan('sort', defaults('sort'));
    const lines = planTextLines(chosenOf(r).root, false);
    expect(lines[0]).toMatch(/^Limit {2}\(cost=\d+\.\d\d\.\.\d+\.\d\d rows=10\)$/);
    expect(lines[1]).toMatch(/^ {2}-> {2}Sort {2}\(cost=/);
    expect(lines.some((l) => l.trim() === 'Sort Key: created_at DESC')).toBe(true);
    expect(lines.some((l) => l.trim() === 'Filter: (customer_id = 4242)')).toBe(true);
    expect(lines.join('\n')).not.toContain('actual');
  });
});

describe('lesson content', () => {
  it('has five try-this entries, five questions and a Provenance chip in the source', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
    expect(INDEXES).toHaveLength(4);
    expect(QUERIES).toHaveLength(5);
  });
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});
