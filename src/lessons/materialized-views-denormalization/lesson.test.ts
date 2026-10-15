import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { crossoverCaption, playCaption } from './captions';
import { STRATEGIES, differences, initState, inconsistentCopies, read, seededWorld, write, type Config, type State, type Strategy } from './shop';
import { RATIO, STALENESS_REFRESH, WORKLOAD_CONFIG, WORLD_SEED, crossover, readFormula, workloadTotal, writeFormula } from './workload';
import lesson from './index';

const base = seededWorld(WORLD_SEED);
const cheapest = (ratio: number) => STRATEGIES.map((s) => ({ s: s.value, t: workloadTotal(s.value, WORKLOAD_CONFIG, ratio).total })).reduce((a, b) => (b.t < a.t ? b : a)).s;
const label = (id: Strategy) => STRATEGIES.find((s) => s.value === id)!.label;
const caption = (strategy: Strategy, cfg: Config, state: State, last: { label: string; touched: number } | null) =>
  text(playCaption({ strategy, cfg, state, last, differences: differences(strategy, cfg, state) }), { strict: true });

describe('try-this entries, from the seeded shop, as written', () => {
  it('try-this 1: reading the live join touches items + orders + products rows', () => {
    const got = read('live', WORKLOAD_CONFIG, initState('live', base));
    expect(got.touched).toBe(base.items.length + base.orders.length + base.products.length);
    expect(lesson.tryThis[0]).toContain(`touches ${got.touched} rows`);
    expect(caption('live', WORKLOAD_CONFIG, got.state, { label: 'read the dashboard', touched: got.touched })).toContain(`touching ${got.touched} rows`);
  });

  it('try-this 2: the incremental view reads 11 rows and a place touches 6, against 2 for the live join', () => {
    const state = initState('incremental', base);
    expect(read('incremental', WORKLOAD_CONFIG, state).touched).toBe(11);
    expect(write('incremental', WORKLOAD_CONFIG, state, { kind: 'place', customerId: 1, productId: 2, qty: 2 }).touched).toBe(6);
    expect(write('live', WORKLOAD_CONFIG, initState('live', base), { kind: 'place', customerId: 1, productId: 2, qty: 2 }).touched).toBe(2);
    expect(lesson.tryThis[1]).toContain('11 rows');
    expect(lesson.tryThis[1]).toContain('touches 6 rows, against 2 on the live join');
  });

  it('try-this 3: the cheapest strategy at the slider\'s two ends is the one the lesson names, and they differ', () => {
    const low = cheapest(RATIO.min);
    const high = cheapest(RATIO.max);
    expect(low).not.toBe(high);
    expect(lesson.tryThis[2]).toContain(`${label(low)} is the cheapest`);
    expect(lesson.tryThis[2]).toContain(`${label(high)} is.`);
    const totals = STRATEGIES.map((s) => ({ strategy: s.value, total: workloadTotal(s.value, WORKLOAD_CONFIG, RATIO.min).total }));
    expect(text(crossoverCaption(base, WORKLOAD_CONFIG, RATIO.min, totals), { strict: true })).toContain(`the cheapest is ${label(low)} at ${Math.min(...totals.map((t) => t.total)).toLocaleString('en-US')} rows touched`);
  });

  it('try-this 4: a rename leaves the full-refresh view one write behind and differing on the named row', () => {
    const cfg: Config = { refreshEvery: STALENESS_REFRESH.initial, fix: 'none' };
    const productId = base.items[0].productId;
    const after = write('full', cfg, initState('full', base), { kind: 'rename', productId, name: 'Renamed' });
    const diffs = differences('full', cfg, after.state);
    expect(after.state.writesSince).toBe(1);
    expect(diffs.length).toBeGreaterThan(0);
    expect(lesson.tryThis[3]).toContain(`"${diffs[0].what}"`);
    const c = caption('full', cfg, after.state, { label: 'renamed a product', touched: after.touched });
    expect(c).toContain('1 write behind');
    expect(c).toContain('differs from the live query');
  });

  it('try-this 5: a rename leaves old-name copies and two names; updating every copy costs 1 + items + copies rows and leaves none', () => {
    const productId = base.items[0].productId;
    const copies = base.items.filter((i) => i.productId === productId).length;
    const none: Config = { refreshEvery: 10, fix: 'none' };
    const renamed = write('copy', none, initState('copy', base), { kind: 'rename', productId, name: 'Renamed' });
    expect(inconsistentCopies(renamed.state.world)).toBe(copies);
    expect(caption('copy', none, renamed.state, null)).toContain(`${copies} ${copies === 1 ? 'copy has' : 'copies have'} an old name`);
    const update: Config = { ...none, fix: 'update' };
    const fixed = write('copy', update, initState('copy', base), { kind: 'rename', productId, name: 'Renamed' });
    expect(fixed.touched).toBe(1 + base.items.length + copies);
    expect(lesson.tryThis[4]).toContain(`touches ${fixed.touched} rows`);
    expect(caption('copy', update, fixed.state, null)).toContain('consistent');
  });
});

describe('captions follow the engine for every strategy and fix, at every step of seeded workloads (AC-0/T3 #14, #17)', () => {
  const combos: [Strategy, Config][] = [
    ['live', WORKLOAD_CONFIG], ['full', { refreshEvery: 4, fix: 'none' }], ['incremental', WORKLOAD_CONFIG],
    ['copy', { refreshEvery: 10, fix: 'none' }], ['copy', { refreshEvery: 10, fix: 'update' }], ['copy', { refreshEvery: 10, fix: 'recompute' }],
  ];

  it('the verdict words match "view != live" and the inconsistent-copy count, whatever the strategy', () => {
    for (const [strategy, cfg] of combos) {
      for (let seed = 1; seed <= 20; seed++) {
        let state = initState(strategy, seededWorld(seed));
        for (const op of [{ kind: 'rename', productId: 1, name: `P${seed}` }, { kind: 'place', customerId: 2, productId: 1, qty: 2 }, { kind: 'refund', itemId: 1 }] as const) {
          state = write(strategy, cfg, state, op).state;
          const c = caption(strategy, cfg, state, null);
          const stale = differences(strategy, cfg, state).length > 0;
          if (strategy === 'full' || strategy === 'incremental') expect(c.includes('differs from the live query'), `${strategy} ${seed}`).toBe(stale);
          if (strategy === 'full') expect(c).toContain(`${state.writesSince} ${state.writesSince === 1 ? 'write' : 'writes'} behind`);
          if (strategy === 'copy') {
            const n = inconsistentCopies(state.world);
            expect(c.includes('an old name'), `${cfg.fix} ${seed}`).toBe(n > 0);
            expect(c.includes('consistent')).toBe(n === 0);
          }
        }
      }
    }
  });

  it('the crossover sentence quotes the same crossover the plot draws, at the slider extremes', () => {
    const x = crossover('incremental', 'live', WORKLOAD_CONFIG, base)!;
    for (const ratio of [RATIO.min, RATIO.initial, RATIO.max]) {
      const totals = STRATEGIES.map((s) => ({ strategy: s.value, total: workloadTotal(s.value, WORKLOAD_CONFIG, ratio).total }));
      const c = text(crossoverCaption(base, WORKLOAD_CONFIG, ratio, totals), { strict: true });
      expect(c).toContain(`${x.toFixed(2)} reads per write`);
      expect(c).toContain(`the cheapest is ${label(totals.reduce((a, b) => (b.total < a.total ? b : a)).strategy)}`);
    }
  });

  it('hidden controls: the totals use constants (refresh every 10, no copy fix), so they do not follow the staleness slider or the fix toggle', () => {
    const a = workloadTotal('full', WORKLOAD_CONFIG, 10).total;
    expect(workloadTotal('full', { ...WORKLOAD_CONFIG, refreshEvery: 3 }, 10).total).not.toBe(a);
    expect(workloadTotal('full', WORKLOAD_CONFIG, 10).total).toBe(a);
    expect(WORKLOAD_CONFIG).toEqual({ refreshEvery: 10, fix: 'none' });
    expect(readFormula('copy', WORKLOAD_CONFIG, base)).toBe(base.items.length + base.orders.length);
    expect(writeFormula('copy', WORKLOAD_CONFIG, { items: base.items.length, copies: 2 }, 'rename')).toBe(1);
  });
});

describe('lesson content', () => {
  it('has five try-this entries and five questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});
