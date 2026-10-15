import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { crossoverCaption, playCaption } from './captions';
import { PRODUCTS, differences, initState, inconsistentCopies, read, seededWorld, write, type Config, type State, type Strategy } from './shop';
import { CONTENDERS, RATIO, STALENESS_REFRESH, WORKLOAD_CONFIG, WORLD_SEED, cheapestRight, contenderTotals, crossover, readFormula, renameWrite, workloadTotal, writeFormula } from './workload';
import lesson from './index';

const base = seededWorld(WORLD_SEED);
const cheapest = (ratio: number) => cheapestRight(contenderTotals(ratio)).label;
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
    expect(lesson.tryThis[2]).toContain(`${low} is the cheapest row whose answer is right`);
    expect(lesson.tryThis[2]).toContain(`${high} is.`);
    const totals = contenderTotals(RATIO.min);
    const rightMin = Math.min(...totals.filter((t) => t.right).map((t) => t.total));
    expect(text(crossoverCaption(base, WORKLOAD_CONFIG, RATIO.min, totals), { strict: true })).toContain(`the cheapest right answer is ${low} at ${rightMin.toLocaleString('en-US')} rows touched`);
  });

  it('try-this 4: a rename leaves the full-refresh view one write behind and differing on the named row', () => {
    const cfg: Config = { refreshEvery: STALENESS_REFRESH.initial, fix: 'none' };
    const productId = base.items[0].productId;
    // The page's "Rename a product" button builds this same write: renameWrite(world, id, 1) on the first item's product.
    const after = write('full', cfg, initState('full', base), renameWrite(base, productId, 1));
    const diffs = differences('full', cfg, after.state);
    expect(after.state.writesSince).toBe(1);
    expect(diffs.length).toBeGreaterThan(0);
    expect(lesson.tryThis[3]).toContain(`"${diffs[0].what}"`);
    // Independent of the engine: the live query has the new name, the stale view the old one.
    const oldName = PRODUCTS[productId - 1].name;
    expect(diffs.map((d) => d.what)).toEqual(expect.arrayContaining([`units of ${oldName} v1`, `units of ${oldName}`]));
    expect(lesson.tryThis[3]).toContain(`units of ${oldName} v1`);
    expect(lesson.tryThis[3]).not.toContain('Renamed');
    const c = caption('full', cfg, after.state, { label: 'renamed a product', touched: after.touched });
    expect(c).toContain('1 write behind');
    expect(c).toContain('differs from the live query');
  });

  it('try-this 5: a rename leaves old-name copies and two names; updating every copy costs 1 + items + copies rows and leaves none', () => {
    const productId = base.items[0].productId;
    const copies = base.items.filter((i) => i.productId === productId).length;
    const none: Config = { refreshEvery: 10, fix: 'none' };
    const renamed = write('copy', none, initState('copy', base), renameWrite(base, productId, 1));
    expect(inconsistentCopies(renamed.state.world)).toBe(copies);
    expect(caption('copy', none, renamed.state, null)).toContain(`${copies} ${copies === 1 ? 'copy has' : 'copies have'} an old name`);
    const update: Config = { ...none, fix: 'update' };
    const fixed = write('copy', update, initState('copy', base), renameWrite(base, productId, 1));
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
      const totals = contenderTotals(ratio);
      const c = text(crossoverCaption(base, WORKLOAD_CONFIG, ratio, totals), { strict: true });
      expect(c).toContain(`${x.toFixed(2)} reads per write`);
      expect(c).toContain(`the cheapest right answer is ${cheapestRight(totals).label}`);
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

describe('the totals table and key idea 4 (the live join wins when writes dominate)', () => {
  const ratios = [RATIO.min, 0.1, 0.2, 0.5, 1, RATIO.initial, 100, RATIO.max];
  const byId = (ratio: number) => Object.fromEntries(contenderTotals(ratio).map((t) => [t.id, t]));

  it('the copy that is never fixed is cheaper than the live join at every ratio and wrong at the end: the table says so instead of crowning it', () => {
    for (const ratio of ratios) {
      const t = byId(ratio);
      expect(t['copy-none'].total, String(ratio)).toBeLessThan(t.live.total);
      expect(t['copy-none'].right, String(ratio)).toBe(false);
      expect(cheapestRight(Object.values(t)).id).not.toBe('copy-none');
    }
  });

  it('the live join, the incremental view and the fixed copy are right at the end whatever the ratio', () => {
    for (const ratio of ratios) {
      const t = byId(ratio);
      expect([t.live.right, t.incremental.right, t['copy-update'].right], String(ratio)).toEqual([true, true, true]);
    }
  });

  it('among the right answers the live join wins at the left end and the incremental view at the right, flipping near the quoted crossover', () => {
    const x = crossover('incremental', 'live', WORKLOAD_CONFIG, base)!;
    expect(cheapestRight(contenderTotals(RATIO.min)).id).toBe('live');
    expect(cheapestRight(contenderTotals(RATIO.max)).id).toBe('incremental');
    const incrementalWins = (ratio: number) => byId(ratio).incremental.total < byId(ratio).live.total;
    expect(incrementalWins(x / 2)).toBe(false);
    expect(incrementalWins(x * 4)).toBe(true);
    expect(lesson.keyIdeas[3]).toContain(`${x.toPrecision(2)} reads per write`);
  });

  it('a copy that is kept right costs more than the cheaper of the live join and the incremental view, at every sampled ratio', () => {
    for (const ratio of ratios) {
      const t = byId(ratio);
      expect(t['copy-update'].total, String(ratio)).toBeGreaterThan(Math.min(t.live.total, t.incremental.total));
    }
  });

  it('the rows are priced under the configurations the table names', () => {
    expect(CONTENDERS.map((c) => c.id)).toEqual(['live', 'full', 'incremental', 'copy-none', 'copy-update']);
    expect(workloadTotal('copy', { ...WORKLOAD_CONFIG, fix: 'update' }, 1).total).toBe(byId(1)['copy-update'].total);
  });
});

describe('the broken refund rule is reachable from the scene (the "Refund rule" toggle sets cfg.brokenRefund)', () => {
  it('with the toggle on, a refund leaves the incremental view differing from the live query, with no error, and the caption says why', () => {
    const cfg: Config = { ...WORKLOAD_CONFIG, brokenRefund: true };
    const state = write('incremental', cfg, initState('incremental', base), { kind: 'refund', itemId: base.items.at(-1)!.id }).state;
    expect(differences('incremental', cfg, state).length).toBeGreaterThan(0);
    const c = caption('incremental', cfg, state, { label: 'refunded an item', touched: 0 });
    expect(c).toContain('planted bug');
    expect(c).toContain('differs from the live query');
  });

  it('with the toggle off the same refund keeps the view equal to the live query', () => {
    const state = write('incremental', WORKLOAD_CONFIG, initState('incremental', base), { kind: 'refund', itemId: base.items.at(-1)!.id }).state;
    expect(differences('incremental', WORKLOAD_CONFIG, state)).toEqual([]);
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
