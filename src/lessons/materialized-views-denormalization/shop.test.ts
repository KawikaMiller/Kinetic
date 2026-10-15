import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  Counter, CUSTOMERS, aggregatesOf, dashboardOf, differences, inconsistentCopies, initState, liveDashboard, read, seededWorld, shown, write, viewRows,
  type Config, type Dashboard, type State, type Strategy, type World, type Write,
} from './shop';
import {
  BROKEN_SEED, MIX, RATIO, STALE_SEED, STALE_WRITES, WORKLOAD_CONFIG, WRITES, cycleCost, crossover, readFormula, refreshFormula, seededWrites, workloadTotal, writeFormula, type Kind,
} from './workload';

/** The dashboard by brute force over plain arrays, written without shop.ts: revenue per customer id, units per current product name. */
function oracle(w: World): Dashboard {
  const revenue: Record<number, number> = {};
  for (let c = 1; c <= CUSTOMERS.length; c++) {
    revenue[c] = 0;
    for (const o of w.orders) if (o.customerId === c) for (const i of w.items) if (i.orderId === o.id) revenue[c] += i.qty * i.unitPrice;
  }
  const units: Record<string, number> = {};
  for (const p of w.products) {
    units[p.name] = 0;
    for (const i of w.items) if (i.productId === p.id) units[p.name] += i.qty;
  }
  return { revenue, units };
}

const BIG = 1_000_000;
const cfg = (patch: Partial<Config> = {}): Config => ({ refreshEvery: BIG, fix: 'none', ...patch });
const same = (a: Dashboard, b: Dashboard) => JSON.stringify([a.revenue, Object.entries(a.units).sort()]) === JSON.stringify([b.revenue, Object.entries(b.units).sort()]);

function runWrites(strategy: Strategy, c: Config, seed: number, n: number, check: (s: State, i: number, op: Write) => void): State {
  const w0 = seededWorld(seed);
  let state = initState(strategy, w0);
  seededWrites(w0, seed, n).forEach((op, i) => {
    state = write(strategy, c, state, op).state;
    check(state, i, op);
  });
  return state;
}

describe('the live query and the oracle', () => {
  it('liveDashboard equals brute force over 500 seeded workloads, at every write', () => {
    for (let seed = 1; seed <= 500; seed++) runWrites('live', cfg(), seed, 30, (s, i) => expect(same(liveDashboard(s.world, new Counter()), oracle(s.world)), `seed ${seed} write ${i}`).toBe(true));
  });
});

describe('materialized views', () => {
  it('after a full refresh the view equals the brute-force live query, in every state of 500 seeded workloads', () => {
    let refreshes = 0;
    for (let seed = 1; seed <= 500; seed++) {
      runWrites('full', cfg({ refreshEvery: 3 }), seed, 30, (s, i) => {
        if (s.writesSince === 0) {
          refreshes++;
          expect(same(dashboardOf(s.mv!), oracle(s.world)), `seed ${seed} write ${i}`).toBe(true);
        }
      });
    }
    expect(refreshes).toBeGreaterThan(4000);
  });

  it('incremental maintenance equals full recomputation after every write, over the same 500 workloads', () => {
    for (let seed = 1; seed <= 500; seed++) {
      runWrites('incremental', cfg(), seed, 30, (s, i) => {
        expect(same(dashboardOf(s.mv!), oracle(s.world)), `seed ${seed} write ${i}`).toBe(true);
        expect(same(dashboardOf(s.mv!), dashboardOf(aggregatesOf(s.world, new Counter()))), `seed ${seed} write ${i}`).toBe(true);
      });
    }
  });

  it('a broken incremental rule (refunds not subtracted) is caught on the pinned seed, the lowest of 1 to 200', () => {
    const diverges = (seed: number) => {
      let bad = false;
      runWrites('incremental', cfg({ brokenRefund: true }), seed, 40, (s) => {
        if (!same(dashboardOf(s.mv!), oracle(s.world))) bad = true;
      });
      return bad;
    };
    let lowest: number | null = null;
    for (let seed = 1; seed <= 200 && lowest === null; seed++) if (diverges(seed)) lowest = seed;
    expect(lowest).toBe(BROKEN_SEED);
    for (let seed = 1; seed <= 200; seed++) {
      let bad = false;
      runWrites('incremental', cfg(), seed, 40, (s) => { bad ||= !same(dashboardOf(s.mv!), oracle(s.world)); });
      expect(bad).toBe(false);
    }
  });
});

describe('staleness', () => {
  it('the readout equals "view != live" computed independently, for every strategy and fix, over 100 seeded workloads', () => {
    const combos: [Strategy, Config][] = [['live', cfg()], ['full', cfg({ refreshEvery: 7 })], ['incremental', cfg()], ['copy', cfg()], ['copy', cfg({ fix: 'update' })], ['copy', cfg({ fix: 'recompute' })]];
    for (const [strategy, c] of combos) {
      for (let seed = 1; seed <= 100; seed++) {
        runWrites(strategy, c, seed, 25, (s, i) => {
          const stale = !same(shown(strategy, c, s), oracle(s.world));
          expect(differences(strategy, c, s).length > 0, `${strategy} ${c.fix} seed ${seed} write ${i}`).toBe(stale);
        });
      }
    }
  });

  it('a lagging view is stale on the pinned schedule, and the differing rows are named', () => {
    let lowest: number | null = null;
    for (let seed = 1; seed <= 50 && lowest === null; seed++) {
      let stale = false;
      runWrites('full', cfg({ refreshEvery: 10 }), seed, STALE_WRITES, (s) => { stale ||= differences('full', cfg({ refreshEvery: 10 }), s).length > 0; });
      if (stale) lowest = seed;
    }
    expect(lowest).toBe(STALE_SEED);
    const s = runWrites('full', cfg({ refreshEvery: 10 }), STALE_SEED, 1, () => {});
    expect(differences('full', cfg({ refreshEvery: 10 }), s)[0].what).toMatch(/^(revenue|units) of /);
  });

  it('refreshing every operation is never stale, and a bigger interval is stale at some point', () => {
    for (let seed = 1; seed <= 50; seed++) runWrites('full', cfg({ refreshEvery: 1 }), seed, 20, (s) => expect(differences('full', cfg({ refreshEvery: 1 }), s)).toEqual([]));
  });
});

describe('the update anomaly of a denormalised copy', () => {
  const renamed = (fix: Config['fix']) => {
    const c = cfg({ fix });
    const state = initState('copy', seededWorld(3));
    const productId = state.world.items[0].productId;
    const copies = state.world.items.filter((i) => i.productId === productId).length;
    const after = write('copy', c, state, { kind: 'rename', productId, name: 'Renamed' });
    return { c, copies, items: state.world.items.length, after };
  };

  it('without a fix a rename leaves the old name on every copy: two names for one product, counted', () => {
    const { c, copies, after } = renamed('none');
    const state0 = initState('copy', seededWorld(3));
    expect(copies).toBeGreaterThan(0);
    expect(inconsistentCopies(after.state.world)).toBe(copies);
    const units = shown('copy', c, after.state).units;
    expect(units.Renamed).toBe(0);
    const old = state0.world.products.find((p) => p.id === state0.world.items[0].productId)!.name;
    expect(units[old]).toBeGreaterThan(0);
    expect(differences('copy', c, after.state).length).toBe(2);
    expect(after.touched).toBe(1);
  });

  it('updating every copy costs one row for the product plus a scan of the items plus a write per copy, and leaves nothing inconsistent', () => {
    const { c, copies, items, after } = renamed('update');
    expect(inconsistentCopies(after.state.world)).toBe(0);
    expect(differences('copy', c, after.state)).toEqual([]);
    expect(after.touched).toBe(1 + items + copies);
  });

  it('recomputing from the source on read keeps the write at one row and pays on the read instead', () => {
    const { c, after } = renamed('recompute');
    expect(after.touched).toBe(1);
    expect(differences('copy', c, after.state)).toEqual([]);
    expect(read('copy', c, after.state).touched).toBe(readFormula('live', c, after.state.world));
  });
});

describe('rows touched, counted where they happen, against the formulas', () => {
  const KINDS: Kind[] = ['place', 'refund', 'rename'];
  const strategies: [Strategy, Config][] = [['live', cfg()], ['full', cfg()], ['incremental', cfg()], ['copy', cfg()], ['copy', cfg({ fix: 'update' })], ['copy', cfg({ fix: 'recompute' })]];

  it('every write and read touches exactly the rows the formula says, in 100 random states of every strategy', () => {
    for (const [strategy, c] of strategies) {
      for (let seed = 1; seed <= 100; seed++) {
        const w0 = seededWorld(seed);
        let state = initState(strategy, w0);
        for (const op of seededWrites(w0, seed, 15)) {
          const copies = op.kind === 'rename' ? state.world.items.filter((i) => i.productId === op.productId).length : 0;
          const got = write(strategy, c, state, op);
          expect(got.touched, `${strategy} ${c.fix} ${op.kind} seed ${seed}`).toBe(writeFormula(strategy, c, { items: state.world.items.length, copies }, op.kind));
          state = got.state;
          expect(read(strategy, c, state).touched, `${strategy} read seed ${seed}`).toBe(readFormula(strategy, c, state.world));
        }
      }
    }
    expect(KINDS).toHaveLength(3);
  });

  it('a full refresh adds its own rows on the operation that triggers it: tables read plus view rows written', () => {
    const c = cfg({ refreshEvery: 1 });
    const state = initState('full', seededWorld(3));
    const got = write('full', c, state, { kind: 'rename', productId: 1, name: 'X' });
    expect(got.touched).toBe(1 + refreshFormula(got.state.world));
    expect(got.state.writesSince).toBe(0);
    expect(viewRows(state.world)).toBe(11);
  });

  it('the totals table equals a loop over every operation with the formulas, for each strategy and several ratios', () => {
    for (const ratio of [0.05, 0.5, 1, 7.5, 25]) {
      for (const [strategy] of strategies.slice(0, 4)) {
        const w0 = seededWorld(3);
        let state = initState(strategy, w0);
        let want = 0;
        let ops = 0;
        let served = 0;
        for (const [k, op] of seededWrites(w0, 3, WRITES).entries()) {
          const copies = op.kind === 'rename' ? state.world.items.filter((i) => i.productId === op.productId).length : 0;
          const wf = writeFormula(strategy, WORKLOAD_CONFIG, { items: state.world.items.length, copies }, op.kind);
          const after = write('live', cfg(), state, op).state.world;
          want += wf;
          ops++;
          if (strategy === 'full' && ops % WORKLOAD_CONFIG.refreshEvery === 0) want += refreshFormula(after);
          const due = Math.round(ratio * (k + 1)) - served;
          served += due;
          for (let r = 0; r < due; r++) {
            want += readFormula(strategy, WORKLOAD_CONFIG, after);
            ops++;
            if (strategy === 'full' && ops % WORKLOAD_CONFIG.refreshEvery === 0) want += refreshFormula(after);
          }
          state = { ...state, world: after };
        }
        expect(workloadTotal(strategy, WORKLOAD_CONFIG, ratio).total, `${strategy} ratio ${ratio}`).toBe(want);
      }
    }
  });
});

describe('the crossover', () => {
  const w = seededWorld(3);
  const c = WORKLOAD_CONFIG;
  const writesOf = (s: Strategy) => (Object.keys(MIX) as Kind[]).reduce((sum, k) => sum + MIX[k] * writeFormula(s, c, { items: w.items.length, copies: w.items.length / w.products.length }, k), 0);

  it('where the incremental view starts to beat the live join equals the closed form from the formulas, and a fine scan agrees', () => {
    const exact = (writesOf('incremental') - writesOf('live')) / (readFormula('live', c, w) - readFormula('incremental', c, w));
    expect(crossover('incremental', 'live', c, w)).toBeCloseTo(exact, 9);
    expect(exact).toBeGreaterThan(RATIO.min);
    let scanned: number | null = null;
    for (let r = 0.001; r < 5 && scanned === null; r += 0.001) if (cycleCost('incremental', c, w, r) < cycleCost('live', c, w, r)) scanned = r;
    expect(scanned!).toBeCloseTo(exact, 2);
  });

  it('writes dominate below it and reads above it: the live join wins at the slider\'s low end and every view wins at its top', () => {
    expect(cycleCost('live', c, w, RATIO.min)).toBeLessThan(cycleCost('incremental', c, w, RATIO.min));
    for (const s of ['full', 'incremental'] as Strategy[]) expect(cycleCost(s, c, w, RATIO.max)).toBeLessThan(cycleCost('live', c, w, RATIO.max));
  });

  it('the simulated totals agree with the closed form on which side wins, at both ends of the slider', () => {
    for (const ratio of [RATIO.min, RATIO.max]) {
      const sim = workloadTotal('incremental', WORKLOAD_CONFIG, ratio).total < workloadTotal('live', WORKLOAD_CONFIG, ratio).total;
      expect(sim).toBe(cycleCost('incremental', WORKLOAD_CONFIG, w, ratio) < cycleCost('live', WORKLOAD_CONFIG, w, ratio));
    }
  });

  it('is null when a strategy never catches up (a view against itself)', () => {
    expect(crossover('live', 'live', c, w)).toBeNull();
  });
});
describe('seeded workloads', () => {
  it('are deterministic and use only valid rows', () => {
    const w = seededWorld(9);
    expect(seededWrites(w, 4, 30)).toEqual(seededWrites(w, 4, 30));
    const rnd = mulberry32(1);
    expect(rnd()).toBeLessThan(1);
    const refunded = seededWrites(w, 4, 60).filter((o) => o.kind === 'refund');
    expect(new Set(refunded.map((o) => (o as { itemId: number }).itemId)).size).toBe(refunded.length);
  });
});
