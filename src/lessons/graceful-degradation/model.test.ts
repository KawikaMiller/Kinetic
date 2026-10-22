import { describe, expect, it } from 'vitest';
import {
  BROKEN_SEED, CACHE_DEFAULT, CORE_RATE, DEFAULT_POLICY, DEFAULT_TAG, FULL_RATE, PRICE, QUEUE_BOUND, RUNGS, SERVICES, SIM_TICKS, TICK_S, TIERS, WIDGETS, WIDGET_SERVICE,
  allUp, brownoutPoint, checkout, costMs, createQueueSim, journey, journeyWorks, livePriceAt, meanResponseS, pageMs, runQueue, runTimeline, segments, serviceRate, softSweep,
  tagVerdicts, tiersOn, trulyHard, widgetState, widgetStates, withHealth, firstMinute, staleAgeMin, STALE_AGE_AT_FAILURE_MIN,
  type CacheConfig, type Health, type HealthMap, type Policies, type Rung, type ServiceId, type WidgetId,
} from './model';
import { mulberry32 } from '../../core/random';

const HEALTHS: Health[] = ['up', 'slow', 'down'];

/** Every health map of the eight services over `states`, in lexicographic order. */
function* healthMaps(states: readonly Health[]): Generator<HealthMap> {
  const total = states.length ** SERVICES.length;
  for (let n = 0; n < total; n++) {
    const map = {} as HealthMap;
    let rest = n;
    for (const s of SERVICES) {
      map[s] = states[rest % states.length];
      rest = Math.floor(rest / states.length);
    }
    yield map;
  }
}

/**
 * An independent oracle for the journey, written as lookup tables from the dependency list rather
 * than through widgetState: for each step, does it survive a service in this health when the
 * widget has this rung? The pay step also needs the live price, whatever the price widget does.
 */
type Row = Record<Rung, boolean>;
const SERVES_STEP: Record<Health, Row> = {
  up: { live: true, stale: true, static: true, hide: true, error: true },
  slow: { live: true, stale: true, static: false, hide: false, error: false },
  down: { live: false, stale: true, static: false, hide: false, error: false },
};
const PAYS_STEP: Record<Health, Row> = {
  up: { live: true, stale: true, static: true, hide: true, error: true },
  slow: { live: true, stale: false, static: false, hide: false, error: false },
  down: { live: false, stale: false, static: false, hide: false, error: false },
};
const worseOf = (a: Health, b: Health): Health => (a === 'down' || b === 'down' ? 'down' : a === 'slow' || b === 'slow' ? 'slow' : 'up');

function oracleJourney(health: HealthMap, p: Policies, buyWaitsForRecs: boolean): boolean {
  const buyHealth = buyWaitsForRecs ? worseOf(health.payments, health.recs) : health.payments;
  return SERVES_STEP[health.catalog][p.product] && SERVES_STEP[health.inventory][p.stock] && PAYS_STEP[buyHealth][p.buy] && health.pricing !== 'down';
}

describe('the core journey against an independent oracle', () => {
  it('matches the lookup-table oracle on all 3^8 health maps and all 125 assignments of the product, stock and buy rungs', () => {
    let checked = 0;
    for (const health of healthMaps(HEALTHS)) {
      for (const product of RUNGS) for (const stock of RUNGS) for (const buy of RUNGS) {
        const p: Policies = { ...DEFAULT_POLICY, product, stock, buy };
        expect(journeyWorks(health, p), JSON.stringify([health, p])).toBe(oracleJourney(health, p, false));
        checked++;
      }
    }
    expect(checked).toBe(3 ** 8 * 125);
  });

  it('matches the oracle with the buy-button bug on every health map', () => {
    const bug = { buyWaitsForRecs: true };
    for (const health of healthMaps(HEALTHS)) {
      for (const buy of RUNGS) {
        const p: Policies = { ...DEFAULT_POLICY, buy };
        expect(journeyWorks(health, p, bug)).toBe(oracleJourney(health, p, true));
      }
    }
  });

  it('the other six widgets cannot change the journey: all 5^6 policy assignments, on 40 seeded health maps', () => {
    const rnd = mulberry32(11);
    const irrelevant: WidgetId[] = ['header', 'price', 'reviews', 'recs', 'banner', 'chat'];
    const maps = Array.from({ length: 40 }, () => Object.fromEntries(SERVICES.map((s) => [s, HEALTHS[Math.floor(rnd() * 3)]])) as HealthMap);
    for (const health of maps) {
      const want = journeyWorks(health, DEFAULT_POLICY);
      for (let n = 0; n < 5 ** irrelevant.length; n++) {
        const p: Policies = { ...DEFAULT_POLICY };
        let rest = n;
        for (const w of irrelevant) {
          p[w] = RUNGS[rest % RUNGS.length];
          rest = Math.floor(rest / RUNGS.length);
        }
        expect(journeyWorks(health, p)).toBe(want);
      }
    }
  });
});

describe('the invariant: with every soft dependency failed, the core journey completes (default policies)', () => {
  const hardSet = new Set<ServiceId>(['catalog', 'pricing', 'payments']);

  it('over all 2^8 subsets of failed services, the journey works exactly when no hard service is in the subset', () => {
    for (let mask = 0; mask < 2 ** SERVICES.length; mask++) {
      const down = SERVICES.filter((_, i) => mask & (1 << i));
      const health = withHealth(allUp(), Object.fromEntries(down.map((s) => [s, 'down' as const])));
      expect(journeyWorks(health, DEFAULT_POLICY), down.join(',')).toBe(!down.some((s) => hardSet.has(s)));
    }
  });

  it('the default tags are the truly hard services under the default policies, and no tag is flagged', () => {
    expect(trulyHard(DEFAULT_POLICY)).toEqual(SERVICES.filter((s) => hardSet.has(s)));
    expect(SERVICES.filter((s) => DEFAULT_TAG[s] === 'hard')).toEqual(SERVICES.filter((s) => hardSet.has(s)));
    expect(tagVerdicts(DEFAULT_TAG, DEFAULT_POLICY).filter((v) => v.problem)).toEqual([]);
  });

  it('the sweep of soft subsets covers 2^5 = 32 subsets and finds none that break the journey', () => {
    expect(softSweep(DEFAULT_TAG, DEFAULT_POLICY)).toEqual({ checked: 32, failing: null });
  });

  it('broken mode: the buy button that waits on recommendations breaks the journey for the subset {recs}, found by the same search', () => {
    expect(softSweep(DEFAULT_TAG, DEFAULT_POLICY, { buyWaitsForRecs: true })).toEqual({ checked: 32, failing: ['recs'] });
    expect(journeyWorks(withHealth(allUp(), { recs: 'down' }), DEFAULT_POLICY, { buyWaitsForRecs: true })).toBe(false);
    expect(journeyWorks(withHealth(allUp(), { recs: 'down' }), DEFAULT_POLICY)).toBe(true);
  });

  it('a hard service tagged soft is caught, and so is a soft one tagged hard', () => {
    const wrong = { ...DEFAULT_TAG, pricing: 'soft' as const, reviews: 'hard' as const };
    const problems = tagVerdicts(wrong, DEFAULT_POLICY).filter((v) => v.problem);
    expect(problems.map((v) => v.service)).toEqual(['pricing', 'reviews']);
    expect(problems[0].problem).toContain('tagged soft, but the journey breaks without it');
    expect(problems[1].problem).toContain('tagged hard, but the journey survives');
    expect(softSweep(wrong, DEFAULT_POLICY).failing).toEqual(['pricing']);
  });

  it('what is hard depends on the policy: giving the stock widget a static default makes inventory hard', () => {
    expect(trulyHard({ ...DEFAULT_POLICY, stock: 'static' })).toContain('inventory');
    expect(trulyHard({ ...DEFAULT_POLICY, stock: 'stale' })).not.toContain('inventory');
  });
});

describe('widget states and the page time', () => {
  it('a healthy service always shows live; a down one follows the rung; a slow live-only widget waits', () => {
    for (const r of RUNGS) expect(widgetState(r, 'up')).toBe('live');
    expect(widgetState('live', 'down')).toBe('error');
    expect(widgetState('live', 'slow')).toBe('live-slow');
    expect(widgetState('stale', 'down')).toBe('stale');
    expect(widgetState('static', 'slow')).toBe('static');
    expect(widgetState('hide', 'down')).toBe('hidden');
    expect(widgetState('error', 'slow')).toBe('error');
  });

  it('the widgets that read a failed service are the ones that change', () => {
    const states = widgetStates(withHealth(allUp(), { profile: 'down' }), DEFAULT_POLICY);
    const changed = WIDGETS.filter((w) => states[w] !== 'live');
    expect(changed).toEqual(WIDGETS.filter((w) => WIDGET_SERVICE[w] === 'profile'));
    expect(states.banner).toBe('static');
    expect(states.chat).toBe('hidden');
  });

  it('page time: healthy 120 ms; a slow live-only widget costs the slow reply; a slow fallback costs the timeout; a failure is fast', () => {
    expect(pageMs(allUp(), DEFAULT_POLICY)).toBe(120);
    expect(pageMs(withHealth(allUp(), { catalog: 'slow' }), DEFAULT_POLICY)).toBe(120 + 3000);
    expect(pageMs(withHealth(allUp(), { reviews: 'slow' }), DEFAULT_POLICY)).toBe(120 + 800);
    expect(pageMs(withHealth(allUp(), { reviews: 'down' }), DEFAULT_POLICY)).toBe(120 + 20);
  });

  it('journey reasons name the cause: pricing down says a charge needs the live price', () => {
    const steps = journey(withHealth(allUp(), { pricing: 'down' }), DEFAULT_POLICY);
    expect(steps.map((s) => s.ok)).toEqual([true, true, false]);
    expect(steps[2].reason).toContain('live price');
    const stalePrice = journey(withHealth(allUp(), { pricing: 'down' }), { ...DEFAULT_POLICY, price: 'stale' });
    expect(stalePrice[2].ok).toBe(false);
  });

  it('a stale widget age is the age it had when the outage began plus the outage so far', () => {
    expect(staleAgeMin(0)).toBe(STALE_AGE_AT_FAILURE_MIN);
    expect(staleAgeMin(10)).toBe(STALE_AGE_AT_FAILURE_MIN + 10);
  });
});

describe('brownout: tiers switch off from the top and lower the work per request', () => {
  it('hand-worked costs: the full page is 12 ms, the core alone 5 ms', () => {
    expect(costMs(TIERS.map(() => true))).toBe(12);
    expect(FULL_RATE).toBeCloseTo(1000 / 12, 10);
    expect(CORE_RATE).toBe(200);
    expect(serviceRate([true, true, true, false])).toBeCloseTo(100, 10);
  });

  it('at threshold 0.7: 50/s keeps all tiers, 60/s drops chat, 70/s drops personalisation too, 100/s keeps only the core', () => {
    expect(tiersOn(50, 0.7, true)).toEqual([true, true, true, true]);
    expect(tiersOn(60, 0.7, true)).toEqual([true, true, true, false]);
    expect(tiersOn(70, 0.7, true)).toEqual([true, true, false, false]);
    expect(tiersOn(100, 0.7, true)).toEqual([true, false, false, false]);
  });

  it('with degradation off every tier stays on at any load, and the core page is never switched off', () => {
    for (let l = 20; l <= 180; l += 5) {
      expect(tiersOn(l, 0.7, false)).toEqual([true, true, true, true]);
      expect(tiersOn(l, 0.4, true)[0]).toBe(true);
    }
  });

  it('dropping tiers is not dropping requests: the same load is served, only the work per request falls', () => {
    const on = brownoutPoint(100, 0.7, true);
    const off = brownoutPoint(100, 0.7, false);
    expect(on.mu).toBe(200);
    expect(off.mu).toBeCloseTo(FULL_RATE, 10);
    expect(on.rho).toBeCloseTo(0.5, 12);
    expect(off.rho).toBeGreaterThan(1);
    expect(on.responseS).toBeCloseTo(1 / 100, 12);
    expect(off.responseS).toBe(Infinity);
  });

  it('M/M/1 closed form: 1/(mu - lambda), infinite at or past saturation', () => {
    expect(meanResponseS(50, 100)).toBeCloseTo(0.02, 12);
    expect(meanResponseS(100, 100)).toBe(Infinity);
  });

  it('the simulated mean time in system converges to 1/(mu - lambda) within 10% (pooled over 50 seeds) at utilisation 0.5 and 0.8', () => {
    for (const [lambda, mu] of [[100, 200], [160, 200]] as const) {
      let served = 0;
      let area = 0;
      for (let seed = 0; seed < 50; seed++) {
        const sim = createQueueSim({ seed, lambda, mu });
        sim.run(SIM_TICKS);
        served += sim.state.served;
        area += sim.state.area;
      }
      const simulated = (area * TICK_S) / served;
      const theory = 1 / (mu - lambda);
      expect(Math.abs(simulated - theory) / theory, `rho ${lambda / mu}`).toBeLessThan(0.1);
    }
  });

  it('invariant: with degradation on and the threshold below saturation, the queue stays under the bound on every one of 200 seeds', () => {
    const { mu } = brownoutPoint(100, 0.7, true);
    for (let seed = 0; seed < 200; seed++) {
      const sim = createQueueSim({ seed, lambda: 100, mu });
      sim.run(SIM_TICKS);
      expect(sim.violation, `seed ${seed}`).toBeNull();
      expect(sim.state.maxQueued).toBeLessThanOrEqual(QUEUE_BOUND);
    }
  });

  it('broken mode: a threshold above saturation lets the queue pass the bound on all 200 seeds, and the shown seed is among them', () => {
    const { mu, rho } = brownoutPoint(100, 1.4, true);
    expect(rho).toBeGreaterThan(1);
    const broken: number[] = [];
    for (let seed = 0; seed < 200; seed++) {
      const sim = createQueueSim({ seed, lambda: 100, mu });
      sim.run(SIM_TICKS);
      if (sim.violation) broken.push(seed);
    }
    expect(broken).toHaveLength(200);
    expect(broken[0]).toBe(BROKEN_SEED);
  });

  it('runQueue reports the same break the sim found, and a series that starts at 0', () => {
    const run = runQueue(BROKEN_SEED, 100, brownoutPoint(100, 1.4, true).mu);
    expect(run.brokeAtS).not.toBeNull();
    expect(run.series[0]).toEqual([0, 0]);
    const calm = runQueue(3, 100, 200);
    expect(calm.brokeAtS).toBeNull();
    expect(calm.meanS).toBeGreaterThan(0);
  });

  it('the same seed replays the same queue', () => {
    expect(runQueue(5, 100, 200).series).toEqual(runQueue(5, 100, 200).series);
  });
});

describe('stale on error: age, windows, and failing closed for money', () => {
  const c: CacheConfig = CACHE_DEFAULT;

  it('hand trace at ttl 5, window 30, outage 8 to 48: fresh to minute 5, refreshed at 6, fresh to 11, stale from 12, error from 42, refreshed at 48', () => {
    const rows = runTimeline(c);
    expect(rows[5]).toMatchObject({ served: 'fresh', age: 5 });
    expect(rows[6]).toMatchObject({ served: 'refreshed', age: 0 });
    expect(rows[11]).toMatchObject({ served: 'fresh', age: 5 });
    expect(rows[12]).toMatchObject({ served: 'stale', age: 6, originUp: false });
    expect(rows[41]).toMatchObject({ served: 'stale', age: 35 });
    expect(rows[42]).toMatchObject({ served: 'error', age: null });
    expect(rows[48]).toMatchObject({ served: 'refreshed', age: 0, originUp: true });
  });

  it('a stale value age equals now minus the minute the copy was fetched (checked against a recount of fetch times)', () => {
    const rows = runTimeline(c);
    const fetchTimes = [0, ...rows.filter((r) => r.served === 'refreshed').map((r) => r.t)];
    for (const r of rows.filter((x) => x.served === 'stale')) {
      const fetched = Math.max(...fetchTimes.filter((f) => f <= r.t));
      expect(r.age).toBe(r.t - fetched);
    }
  });

  it('a stale copy is never served beyond ttl + window, and an error needs the origin down', () => {
    for (const ttl of [1, 5, 15]) for (const staleIfError of [0, 10, 60]) for (const outageStart of [0, 8, 40]) for (const outageLength of [0, 20, 60]) {
      const rows = runTimeline({ ttl, staleIfError, outageStart, outageLength });
      for (const r of rows) {
        if (r.served === 'stale') expect(r.age).toBeLessThanOrEqual(ttl + staleIfError);
        if (r.served === 'error' || r.served === 'stale') expect(r.originUp).toBe(false);
        if (r.served === 'stale') expect(r.age).toBeGreaterThan(ttl);
      }
    }
  });

  it('with no outage nothing is stale or an error', () => {
    const rows = runTimeline({ ...c, outageLength: 0 });
    expect(rows.every((r) => r.served === 'fresh' || r.served === 'refreshed')).toBe(true);
  });

  it('with a zero window the first request after expiry during the outage is an error', () => {
    const rows = runTimeline({ ...c, staleIfError: 0 });
    expect(firstMinute(rows, 'stale')).toBeNull();
    expect(firstMinute(rows, 'error')).toBe(12);
  });

  it('segments cover the timeline once, in order, and merge fresh with refreshed', () => {
    const rows = runTimeline(c);
    const segs = segments(rows);
    expect(segs[0].from).toBe(0);
    expect(segs[segs.length - 1].to).toBe(rows.length);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].from).toBe(segs[i - 1].to);
      expect(segs[i].served).not.toBe(segs[i - 1].served);
    }
  });

  it('fail closed: checkout never charges the cached price, at any minute, any copy age, with the origin up or down', () => {
    for (let t = 0; t <= 90; t++) {
      for (const fetchedAt of [0, 6, t]) {
        for (const up of [true, false]) {
          const r = checkout('fail-closed', t, up, Math.min(fetchedAt, t));
          expect(r.outcome).toBe(up ? 'charged-live' : 'refused');
          expect(r.charged).toBe(up ? livePriceAt(t) : null);
        }
      }
    }
  });

  it('the buggy rule charges the old price when the copy predates the price change, which differs from the live price by the amount shown', () => {
    const young = checkout('stale-price', PRICE.changeAtMin - 1, false, 6);
    expect(young.charged).toBe(young.livePrice);
    const old = checkout('stale-price', PRICE.changeAtMin + 2, false, 6);
    expect(old.outcome).toBe('charged-stale');
    expect(old.charged).toBe(PRICE.before);
    expect(old.livePrice - (old.charged ?? 0)).toBeCloseTo(5, 10);
    const refetched = checkout('stale-price', PRICE.changeAtMin + 2, false, PRICE.changeAtMin + 1);
    expect(refetched.charged).toBe(PRICE.after);
  });

  it('the cache records when each copy was fetched, and a refetch while the origin is up replaces it', () => {
    const rows = runTimeline(c);
    expect(rows[5].fetchedAt).toBe(0);
    expect(rows[6].fetchedAt).toBe(6);
    expect(rows[20].fetchedAt).toBe(6);
    expect(rows[48].fetchedAt).toBe(48);
  });
});
