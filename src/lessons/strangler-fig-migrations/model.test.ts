import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { choose, dominatedChoices, enumeratePaths, startWalk, validateScenario } from '../../core/scenario';
import { STRANGLER } from '../../core/testing/leadScenarios';
import {
  MINUTES, MODES, ROUTES, SHARES, bestOnEvery, bestPathSets, initialFacade, makeFacadeSim, neverRedPaths, observeCached, pathRows, readout, rollBack, setDualWrite,
  setMinutes, setMode, setSeed, setShare, simKey, type Facade, type Mode, type Readout, type RouteId, type Share,
} from './model';
import { METER, METERS, MIGRATION } from './scenario';

/** Independent oracle: the figures from the table in the spec, written as exact fractions of the 10,000 requests a minute. */
const TRAFFIC: Record<RouteId, number> = { login: 18, search: 22, catalog: 25, cart: 10, checkout: 6, orders: 8, reports: 6, admin: 5 };
const TABLES: Record<RouteId, number> = { login: 1, search: 0, catalog: 2, cart: 3, checkout: 6, orders: 4, reports: 5, admin: 2 };
const WRITES: Partial<Record<RouteId, number>> = { cart: 30, checkout: 12, orders: 20 };
/** Defect rate by the stated rule, in percent: 0.5 + 1 per shared table. */
const defectPct = (id: RouteId) => 0.5 + TABLES[id];

/** Expected wrong answers a minute, summed by hand: requests x routed share x defect. */
function handWrongPerMinute(f: Facade): number {
  let sum = 0;
  for (const id of Object.keys(TRAFFIC) as RouteId[]) {
    const s = f.settings[id];
    if (s.mode === 'serve') sum += 10000 * (TRAFFIC[id] / 100) * (s.share / 100) * (defectPct(id) / 100);
  }
  return sum;
}

const withModes = (modes: Partial<Record<RouteId, Mode>>, share?: Partial<Record<RouteId, Share>>): Facade => {
  let f = initialFacade();
  for (const [id, m] of Object.entries(modes) as [RouteId, Mode][]) f = setMode(f, id, m);
  for (const [id, s] of Object.entries(share ?? {}) as [RouteId, Share][]) f = setShare(f, id, s);
  return f;
};

describe('the route table', () => {
  it('has traffic shares that sum to 100 and defect rates that follow the stated rule', () => {
    expect(ROUTES.reduce((n, r) => n + r.traffic, 0)).toBe(100);
    for (const r of ROUTES) {
      expect(r.traffic).toBe(TRAFFIC[r.id]);
      expect(r.coupling).toBe(TABLES[r.id]);
      expect(r.writesPerMin).toBe(WRITES[r.id] ?? 0);
    }
  });
});

describe('the closed-form figures', () => {
  it('search at 100% is 0.11% (11 a minute); checkout shadowed is 600 mirrored, 39 a minute, 6.5%, and no user-visible error', () => {
    const search = readout(withModes({ search: 'serve' }));
    expect(search.errorRate).toBeCloseTo(0.0011, 12);
    expect(search.errorRate * 10000).toBeCloseTo(11, 9);
    const shadow = readout(withModes({ search: 'serve', checkout: 'shadow' }));
    expect(shadow.errorRate).toBeCloseTo(0.0011, 12);
    expect(shadow.mirroredPerMin).toBe(600);
    expect(shadow.mismatchPerMin).toBeCloseTo(39, 9);
    expect(shadow.mismatchRate).toBeCloseTo(0.065, 12);
  });

  it('search 100% plus checkout 50% is 0.305%, and checkout 100% makes it 0.50%', () => {
    expect(readout(withModes({ search: 'serve', checkout: 'serve' }, { checkout: 50 })).errorRate).toBeCloseTo(0.00305, 12);
    expect(readout(withModes({ search: 'serve', checkout: 'serve' })).errorRate).toBeCloseTo(0.005, 12);
  });

  it('agrees with the hand sum on 200 seeded settings, and shadowing a route never changes the error rate', () => {
    const rnd = mulberry32(2024);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
    for (let i = 0; i < 200; i += 1) {
      let f = initialFacade();
      for (const r of ROUTES) f = setShare(setMode(f, r.id, pick(MODES.map((m) => m.id))), r.id, pick(SHARES));
      expect(readout(f).errorRate * 10000).toBeCloseTo(handWrongPerMinute(f), 9);
      const shadowed = pick(ROUTES);
      const off = setMode(f, shadowed.id, 'off');
      const shadow = setMode(f, shadowed.id, 'shadow');
      expect(readout(shadow).errorRate).toBe(readout(off).errorRate);
    }
  });

  it('rollback loss is routed share x writes x minutes for a served data route without dual-write, else 0', () => {
    const at60 = (f: Facade) => setMinutes(f, 60);
    expect(readout(at60(withModes({ checkout: 'serve' }))).lostTotal).toBe(720);
    expect(readout(at60(withModes({ checkout: 'serve' }, { checkout: 50 }))).lostTotal).toBe(360);
    expect(readout(setDualWrite(at60(withModes({ checkout: 'serve' })), 'checkout', true)).lostTotal).toBe(0);
    expect(readout(at60(withModes({ search: 'serve', reports: 'serve' }))).lostTotal).toBe(0);
    expect(readout(at60(withModes({ checkout: 'shadow' }))).lostTotal).toBe(0);
    expect(readout(withModes({ checkout: 'serve' })).lostTotal).toBe(0);
    expect(readout(at60(withModes({ cart: 'serve', checkout: 'serve', orders: 'serve' }))).lostTotal).toBe(30 * 60 + 12 * 60 + 20 * 60);
  });

  it('Roll back sends the route Off and records what it left behind', () => {
    const f = rollBack(setMinutes(withModes({ checkout: 'serve' }), 60), 'checkout');
    expect(f.settings.checkout.mode).toBe('off');
    expect(f.notice).toEqual({ route: 'checkout', lost: 720 });
    expect(setMinutes(f, 60).notice).toBeNull();
  });

  it('lets no hidden control feed a number: the share is ignored outside Serve, minutes and dual-write touch only the rollback figure', () => {
    for (const mode of ['off', 'shadow'] as const) {
      const a = readout(withModes({ checkout: mode }, { checkout: 10 }));
      const b = readout(withModes({ checkout: mode }, { checkout: 100 }));
      expect(a).toEqual(b);
    }
    const base = withModes({ checkout: 'serve', search: 'shadow' });
    const noLoss = (r: Readout): Readout => ({ ...r, lost: [], lostTotal: 0 });
    expect(noLoss(readout(setMinutes(setDualWrite(base, 'checkout', true), 90)))).toEqual(noLoss(readout(base)));
    expect(simKey(setMinutes(setDualWrite(base, 'checkout', true), 90))).toBe(simKey(base));
  });

  it('clamps minutes to the slider range and one step beyond', () => {
    expect(setMinutes(initialFacade(), MINUTES.min - MINUTES.step).minutes).toBe(MINUTES.min);
    expect(setMinutes(initialFacade(), MINUTES.max + MINUTES.step).minutes).toBe(MINUTES.max);
    expect(setMinutes(initialFacade(), 60).minutes).toBe(60);
  });
});

describe('the seeded simulation', () => {
  /** Standard error of the observed rate, from the Bernoulli variances of each served route (a hand formula). */
  const standardError = (f: Facade, ticks: number): number => {
    let variance = 0;
    for (const id of Object.keys(TRAFFIC) as RouteId[]) {
      const s = f.settings[id];
      if (s.mode !== 'serve') continue;
      const n = 10000 * (TRAFFIC[id] / 100) * (s.share / 100);
      const p = defectPct(id) / 100;
      variance += n * p * (1 - p);
    }
    return Math.sqrt(variance * ticks) / (10000 * ticks);
  };

  it('over 10,000 minutes the observed error rate is within 3 standard errors of the closed form', () => {
    const f = withModes({ search: 'serve', checkout: 'serve' }, { checkout: 50 });
    const sim = makeFacadeSim(f);
    sim.run(10000);
    const observed = sim.state.wrong / (10000 * 10000);
    expect(Math.abs(observed - readout(f).errorRate)).toBeLessThan(3 * standardError(f, 10000));
  });

  it('over 10,000 minutes the shadow mismatch rate is within 3 standard errors of 6.5%', () => {
    const f = withModes({ checkout: 'shadow' });
    const sim = makeFacadeSim(f);
    sim.run(10000);
    const mirrored = sim.state.mirrored;
    expect(mirrored).toBe(600 * 10000);
    const rate = sim.state.mismatched / mirrored;
    expect(Math.abs(rate - 0.065)).toBeLessThan(3 * Math.sqrt((0.065 * 0.935) / mirrored));
    expect(sim.state.wrong).toBe(0);
  });

  it('a shadowed route never produces a user-visible wrong answer, over 200 seeds', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const f = setSeed(withModes({ cart: 'shadow', checkout: 'shadow', orders: 'shadow' }), seed);
      const sim = makeFacadeSim(f);
      sim.run(3);
      expect(sim.state.wrong).toBe(0);
      expect(sim.state.mirrored).toBe(3 * 2400);
    }
  });

  it('is deterministic per seed and the cache is keyed by routing and seed only', () => {
    const f = withModes({ search: 'serve' });
    expect(observeCached(f)).toBe(observeCached(setMinutes(f, 45)));
    expect(observeCached(f)).toEqual(observeCached({ ...f }));
    expect(observeCached(setSeed(f, 8))).not.toEqual(observeCached(f));
  });
});

describe('the migration scenario', () => {
  /** Hand-written triple loop over the three choice lists, plus the one-weekend path. */
  const effect = (id: string, meter: string) => MIGRATION.nodes.flatMap((n) => n.choices).find((c) => c.id === id)!.effects?.[meter] ?? 0;
  const handPaths = () => {
    const out: { key: string; meters: Record<string, number> }[] = [];
    const total = (ids: string[]) => Object.fromEntries(METERS.map((m) => [m.id, m.start + ids.reduce((n, id) => n + effect(id, m.id), 0)]));
    for (const a of ['a1', 'a2', 'a3']) for (const b of ['b1', 'b2', 'b3']) for (const c of ['c1', 'c2', 'c3']) out.push({ key: `${a}-${b}-${c}`, meters: total([a, b, c]) });
    out.push({ key: 'a4', meters: total(['a4']) });
    return out;
  };

  it('has the structure of the fixture the kit was proven against: same ids, effects and destinations', () => {
    expect(MIGRATION.start).toBe(STRANGLER.start);
    expect(MIGRATION.meters).toEqual(STRANGLER.meters);
    expect(MIGRATION.nodes.map((n) => n.id)).toEqual(STRANGLER.nodes.map((n) => n.id));
    for (const [i, node] of MIGRATION.nodes.entries()) {
      expect(node.choices.map((c) => [c.id, c.to, c.effects])).toEqual(STRANGLER.nodes[i].choices.map((c) => [c.id, c.to, c.effects]));
    }
    expect(MIGRATION.endings.map((e) => e.id)).toEqual(STRANGLER.endings.map((e) => e.id));
  });

  it('passes every trade-off check under all three readings of an equally good destination', () => {
    expect(validateScenario(MIGRATION, { tradeoffs: true })).toEqual([]);
    for (const destinations of ['same', 'equal-or-better', 'ignore'] as const) expect(dominatedChoices(MIGRATION, { destinations }), destinations).toEqual([]);
  });

  it('enumeratePaths matches the hand loop: 28 paths with the same meters', () => {
    const paths = enumeratePaths(MIGRATION);
    expect(paths).toHaveLength(28);
    const hand = handPaths();
    expect(paths.map((p) => p.choices.join('-')).sort()).toEqual(hand.map((h) => h.key).sort());
    for (const p of paths) expect(p.meters).toEqual(hand.find((h) => h.key === p.choices.join('-'))!.meters);
  });

  it('reproduces the hand-worked ledgers', () => {
    const at = (ids: string[]) => ids.reduce((w, id) => choose(MIGRATION, w, id), startWalk(MIGRATION)).meters;
    expect(at(['a1', 'b3', 'c1'])).toEqual({ incidents: 1, weeks: 24, strain: 4, surprises: 4 });
    expect(at(['a4'])).toEqual({ incidents: 6, weeks: 24, strain: 5, surprises: 0 });
    expect(at(['a2', 'b2', 'c1'])).toEqual({ incidents: 6, weeks: 28, strain: 4, surprises: 0 });
  });

  it('has five paths that are never red, and every path leaves some meter worse than the start', () => {
    const rows = pathRows(MIGRATION);
    expect(neverRedPaths(rows).map((r) => r.key).sort()).toEqual(['a1-b1-c3', 'a1-b2-c2', 'a1-b3-c1', 'a1-b3-c3', 'a3-b3-c3']);
    expect(rows.every((r) => r.worseThanStart.length > 0)).toBe(true);
    expect(rows.every((r) => r.worseThanStart.includes(METER.weeks))).toBe(true);
    const red = (id: string) => rows.filter((r) => r.everRed.includes(id)).length;
    for (const id of [METER.incidents, METER.weeks, METER.strain]) expect(red(id), id).toBeGreaterThan(0);
    expect(red(METER.surprises)).toBe(0);
  });

  it('has no path best on every meter, checked by a separate argmin pass', () => {
    const rows = pathRows(MIGRATION);
    const finals = enumeratePaths(MIGRATION);
    const argbest = (id: string, lowerIsBetter: boolean) => {
      const values = finals.map((p) => p.meters[id]);
      const target = lowerIsBetter ? Math.min(...values) : Math.max(...values);
      return finals.filter((p) => p.meters[id] === target).map((p) => p.choices.join('-')).sort();
    };
    const sets = bestPathSets(MIGRATION, rows);
    for (const m of METERS) expect([...sets[m.id]].sort()).toEqual(argbest(m.id, true));
    expect(sets[METER.incidents].sort()).toEqual(['a1-b3-c2']);
    expect(sets[METER.weeks].sort()).toEqual(['a1-b2-c2', 'a1-b3-c2']);
    expect(sets[METER.strain].sort()).toEqual(['a1-b2-c1', 'a3-b2-c1']);
    expect(sets[METER.surprises].sort()).toEqual(['a2-b1-c1', 'a2-b1-c3', 'a2-b2-c1', 'a2-b2-c3', 'a4']);
    expect(bestOnEvery(MIGRATION, rows)).toEqual([]);
  });
});
