import { describe, expect, it } from 'vitest';
import {
  DAY_S, FIRST_TRY_RATE, MAX_RETRIES, POLLUTER, SLEEP_MS, SOURCES, TEST_OF, drawsFor, exactFirstTryGreen, exactGreen, finalRate, runSeed, runSuite, summarise,
  type Config, type SourceId,
} from './sim';

const ALL_FIXED = new Set<SourceId>(SOURCES);
const cfg = (fixed: Iterable<SourceId>, retries = 0, quarantined: Iterable<string> = []): Config => ({
  fixed: new Set(fixed), retries, quarantined: new Set(quarantined),
});
const only = (s: SourceId) => SOURCES.filter((x) => x !== s);
const seeds = (n: number, from = 1) => Array.from({ length: n }, (_, i) => from + i);
const failShare = (c: Config, n: number, from = 1) => seeds(n, from).filter((s) => runSuite(s, c).status === 'fail').length / n;

describe('the stated rates are the closed forms', () => {
  it('match hand-worked values', () => {
    // P(70 + Exp(mean 15) > 100) = e^(-30/15) = e^-2
    expect(FIRST_TRY_RATE.sleep).toBeCloseTo(0.135335, 6);
    // applyCoupon before emptyCartTotal in a uniform shuffle: one of the two orders
    expect(FIRST_TRY_RATE.order).toBe(0.5);
    // the last hour of 24
    expect(FIRST_TRY_RATE.clock).toBeCloseTo(1 / 24, 12);
    // quantity 0 out of 0..9
    expect(FIRST_TRY_RATE.random).toBeCloseTo(0.1, 12);
    // |U1 - U2| < 2.5 on [0, 100): 1 - (97.5/100)^2
    expect(FIRST_TRY_RATE.race).toBeCloseTo(0.049375, 9);
  });
});

describe('the model', () => {
  it('passes 1,000 seeded runs out of 1,000 with every fix on', () => {
    for (const s of seeds(1000)) expect(runSuite(s, cfg(ALL_FIXED)).status).toBe('pass');
  });

  it.each(SOURCES)('fails within ±3 points of the stated rate for %s alone, over 10,000 seeded runs', (s) => {
    expect(Math.abs(failShare(cfg(only(s)), 10_000) - FIRST_TRY_RATE[s])).toBeLessThan(0.03);
  });

  it.each(SOURCES)('fails within ±3 points of the retried rate for %s alone with retries on', (s) => {
    expect(Math.abs(failShare(cfg(only(s), MAX_RETRIES), 10_000, 50_001) - finalRate(s, MAX_RETRIES))).toBeLessThan(0.03);
  });

  it('matches P(green) = Π(1 − pᵢ) for the whole suite (sources are independent)', () => {
    for (const c of [cfg([]), cfg([], MAX_RETRIES), cfg(['order']), cfg(['order', 'sleep'], MAX_RETRIES)]) {
      const green = 1 - failShare(c, 10_000, 90_001);
      expect(Math.abs(green - exactGreen(c))).toBeLessThan(0.03);
      const firstTry = seeds(10_000, 90_001).filter((s) => runSuite(s, c).status === 'pass').length / 10_000;
      expect(Math.abs(firstTry - exactFirstTryGreen(c))).toBeLessThan(0.03);
    }
    // Hand-worked, nothing fixed, no retries: (1 - e^-2)(1/2)(23/24)(0.9)(0.975^2)
    expect(exactGreen(cfg([]))).toBeCloseTo((1 - Math.exp(-2)) * 0.5 * (23 / 24) * 0.9 * 0.975 ** 2, 12);
  });

  it('is a pure function of the seed: replaying a seed gives the identical run', () => {
    for (const s of seeds(200)) expect(runSuite(s, cfg([], MAX_RETRIES))).toEqual(runSuite(s, cfg([], MAX_RETRIES)));
  });

  it('never shifts the random stream when a fix changes: unfixed tests keep their results', () => {
    for (const s of seeds(500)) {
      const before = runSuite(s, cfg([]));
      const after = runSuite(s, cfg(['sleep']));
      for (const t of before.tests.filter((x) => x.source !== 'sleep')) {
        expect(after.tests.find((x) => x.id === t.id)).toEqual(t);
      }
    }
  });

  it('only ever turns a run greener when a fix is added', () => {
    const rank = { pass: 0, retried: 1, fail: 2 } as const;
    for (const s of seeds(500)) {
      for (const src of SOURCES) {
        for (const retries of [0, MAX_RETRIES]) {
          const without = runSuite(s, cfg([], retries));
          const withFix = runSuite(s, cfg([src], retries));
          expect(rank[withFix.status]).toBeLessThanOrEqual(rank[without.status]);
        }
      }
    }
  });
});

describe('retries', () => {
  it('never lower the real-bugs-hidden count, for any fix set or quarantine', () => {
    const subsets = Array.from({ length: 2 ** SOURCES.length }, (_, m) => SOURCES.filter((_, i) => m & (1 << i)));
    for (const fixed of subsets) {
      for (const q of [[], [TEST_OF.race], [TEST_OF.sleep]]) {
        const runs = (r: number) => seeds(200).map((s) => runSuite(s, cfg(fixed, r, q)));
        expect(summarise(runs(MAX_RETRIES)).realBugsHidden).toBeGreaterThanOrEqual(summarise(runs(0)).realBugsHidden);
      }
    }
  });

  it('hide the real race: with retries off nothing is hidden, with retries on some is', () => {
    const runs = (r: number) => seeds(1000).map((s) => runSuite(s, cfg(only('race'), r)));
    expect(summarise(runs(0)).realBugsHidden).toBe(0);
    expect(summarise(runs(0)).realBugsCaught).toBeGreaterThan(0);
    expect(summarise(runs(MAX_RETRIES)).realBugsHidden).toBeGreaterThan(0);
  });

  it('turn sleep failures into retried (orange) runs, not passes', () => {
    const c = cfg(only('sleep'), MAX_RETRIES);
    const flaked = seeds(2000).filter((s) => !runSuite(s, cfg(only('sleep'))).tests.find((t) => t.source === 'sleep')!.attempts[0].passed);
    expect(flaked.length).toBeGreaterThan(0);
    for (const s of flaked) expect(runSuite(s, c).status).not.toBe('pass');
  });

  it("can't rescue the order-dependent test: the shared cart stays dirty", () => {
    const c = cfg(only('order'), MAX_RETRIES);
    for (const s of seeds(500)) {
      const d = drawsFor(s);
      const dirty = d.order.indexOf(POLLUTER) < d.order.indexOf(TEST_OF.order);
      expect(runSuite(s, c).status).toBe(dirty ? 'fail' : 'pass');
    }
  });

  it('rescue the clock test only when a retry crosses midnight', () => {
    expect(finalRate('clock', MAX_RETRIES)).toBeCloseTo((3600 - 10) / DAY_S, 12);
    const c = cfg(only('clock'), MAX_RETRIES);
    for (const s of seeds(3000)) {
      const start = drawsFor(s).startS;
      const failsAll = start >= 23 * 3600 && start < DAY_S - 10;
      expect(runSuite(s, c).status === 'fail').toBe(failsAll);
    }
  });
});

describe('quarantine', () => {
  it("keeps a quarantined test's failures out of the run status, but still records them", () => {
    for (const s of seeds(300)) {
      const r = runSuite(s, cfg(only('sleep'), 0, [TEST_OF.sleep]));
      expect(r.status).toBe('pass');
      const t = r.tests.find((x) => x.id === TEST_OF.sleep)!;
      expect(t.quarantined).toBe(true);
      expect(t.attempts.length).toBe(1);
    }
  });

  it('hides the real race too when its test is quarantined', () => {
    const runs = seeds(1000).map((s) => runSuite(s, cfg(only('race'), 0, [TEST_OF.race])));
    expect(summarise(runs).realBugsHidden).toBeGreaterThan(0);
    expect(summarise(runs).fail).toBe(0);
  });
});

describe('failure detail', () => {
  it('names the failure reason the model recorded for that seed', () => {
    const c = cfg([], MAX_RETRIES);
    for (const s of seeds(300)) {
      const r = runSuite(s, c);
      const d = drawsFor(s);
      for (const t of r.tests) {
        for (const a of t.attempts) expect(a.passed).toBe(a.reason === '');
        if (t.source === 'sleep' && !t.attempts[0].passed) {
          const shown = Number(/took ([\d.]+) ms/.exec(t.attempts[0].reason)![1]);
          expect(shown).toBeGreaterThan(SLEEP_MS); // never "took 100 ms but slept 100 ms"
          expect(Math.abs(shown - d.jobMs[0])).toBeLessThan(0.1);
        }
        if (t.source === 'random' && !t.attempts[0].passed) expect(d.qty[0]).toBe(0);
      }
    }
  });

  it('numbers seeds per batch so they can be typed back in', () => {
    expect(runSeed(1, 0)).toBe(1001);
    expect(runSeed(2, 99)).toBe(2100);
  });
});
