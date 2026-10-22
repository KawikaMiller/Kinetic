import { describe, expect, it } from 'vitest';
import { classificationMetrics } from '../../core/stats';
import {
  BANDWIDTH_FACTOR, CLASS_NAME, DEFENCES, LEGIT_COST, LEGIT_RATE, LOAD_CLASSES, NO_DEFENCE, PER_SOURCE_LIMIT, PRESETS, RESOURCE, TARGET, defaultInput, origin, perSourceAdmitted,
  type DefenceId, type LoadClass,
} from './origin';
import {
  ATTACK_RANGE, CONSERVATION_TOLERANCE, FLOWS_PER_CLASS, LEGIT_TOTAL, POP_CAPACITY, RUN_TICKS, TOTAL_CAPACITY, THRESHOLD_RANGE, capacities, catchment, createPopsSim, pops, runPops, scoreSet, scrubAt, thresholdGrid,
} from './pops';
import { COOKIE_SLOT_TICKS, DRAIN_RATE, HOLD_TICKS, RTT_TICKS, SLOTS, cookieFor, cookieValid, inFlight, runSyn, type Mode } from './syn';

describe('goodput at the origin', () => {
  it('equals legit x capacity / (legit + attack) when the resource saturates, and legit otherwise, for every class', () => {
    for (const cls of LOAD_CLASSES) {
      for (const rate of [0, 100, 500, 1000, 3000, 5000]) {
        const r = origin({ ...defaultInput(cls), rate });
        const res = TARGET[cls];
        const legit = LEGIT_RATE * LEGIT_COST[res];
        const attackLoad = r.loads.find((l) => l.id === res)!.attack;
        const cap = RESOURCE[res].capacity;
        const want = legit + attackLoad <= cap ? LEGIT_RATE : (LEGIT_RATE * cap) / (legit + attackLoad);
        expect(r.goodput, `${cls} ${rate}`).toBeCloseTo(want, 9);
      }
    }
  });

  it('hand cases: a 3,000 Mbit/s flood against 1,000 leaves 1,000 / 3,100 of 200 requests; 3,000 attempts a second hold 9,000 of 4,096 slots; 400 expensive requests ask for 20,000 ms of 8,000', () => {
    expect(origin(defaultInput('volumetric')).goodput).toBeCloseTo((200 * 1000) / 3100, 9);
    expect(origin(defaultInput('state')).goodput).toBeCloseTo((200 * 4096) / (20 + 9000), 9);
    expect(origin(defaultInput('app')).goodput).toBeCloseTo((200 * 8000) / (1000 + 20_000), 9);
  });

  it('only the resource a class runs down saturates, and with no unwanted load nothing does', () => {
    for (const cls of LOAD_CLASSES) {
      expect(origin(defaultInput(cls)).saturated).toEqual([TARGET[cls]]);
      expect(origin({ ...defaultInput(cls), rate: 0 })).toMatchObject({ saturated: [], goodputShare: 1 });
    }
  });

  it('what helps which class, against a hand-written table at the preset loads', () => {
    const helps = (cls: LoadClass, d: DefenceId, sources = 1000) => origin({ ...defaultInput(cls), sources, defences: { ...NO_DEFENCE, [d]: true } }).goodputShare > origin({ ...defaultInput(cls), sources }).goodputShare + 0.01;
    const table: Record<DefenceId, Record<LoadClass, boolean>> = {
      bandwidth: { volumetric: true, state: false, app: false },
      perSource: { volumetric: false, state: false, app: false },
      cache: { volumetric: false, state: false, app: true },
      challenge: { volumetric: false, state: false, app: true },
      scrub: { volumetric: true, state: true, app: true },
    };
    for (const d of DEFENCES) for (const cls of LOAD_CLASSES) expect(helps(cls, d), `${d} on ${CLASS_NAME[cls]}`).toBe(table[d][cls]);
    expect(origin({ ...defaultInput('volumetric'), defences: { ...NO_DEFENCE, bandwidth: true } }).loads[0].capacity).toBe(RESOURCE.bandwidth.capacity * BANDWIDTH_FACTOR);
  });

  it('a per-source limit helps when there are few sources and does nothing when each of many stays under it', () => {
    const on = { ...NO_DEFENCE, perSource: true };
    expect(origin({ ...defaultInput('app'), sources: 10, defences: on }).goodputShare).toBe(1);
    expect(origin({ ...defaultInput('app'), sources: 1000, defences: on }).goodputShare).toBeCloseTo(origin({ ...defaultInput('app'), sources: 1000 }).goodputShare, 12);
    expect(origin({ ...defaultInput('app'), sources: 1000, defences: on }).admittedRate).toBe(400);
  });

  it('boundary: exactly at the limit passes, one over blocks the excess', () => {
    expect(perSourceAdmitted(100, 10, PER_SOURCE_LIMIT)).toBe(100);
    expect(perSourceAdmitted(110, 10, PER_SOURCE_LIMIT)).toBe(100);
    expect(perSourceAdmitted(99, 10, PER_SOURCE_LIMIT)).toBe(99);
    expect(perSourceAdmitted(10_000, 1000, PER_SOURCE_LIMIT)).toBe(10_000);
  });

  it('the source count changes nothing unless the per-source limit is on', () => {
    for (const cls of LOAD_CLASSES) {
      for (const d of DEFENCES.filter((x) => x !== 'perSource')) {
        const a = origin({ ...defaultInput(cls), sources: 1, defences: { ...NO_DEFENCE, [d]: true } });
        const b = origin({ ...defaultInput(cls), sources: 1000, defences: { ...NO_DEFENCE, [d]: true } });
        expect(a).toEqual(b);
      }
    }
  });

  it('a rate of zero is allowed and leaves every legitimate user served; the presets are valid inputs', () => {
    expect(origin({ ...defaultInput('app'), rate: 0 }).goodput).toBe(LEGIT_RATE);
    for (const p of PRESETS) expect(origin(p.input()).goodput).toBeGreaterThan(0);
    expect(origin(PRESETS[3].input()).goodputShare).toBeCloseTo(origin({ ...PRESETS[3].input(), defences: { ...NO_DEFENCE } }).goodputShare, 12);
  });
});

describe('anycast sites', () => {
  it('conservation: the site loads add up to attack plus legitimate traffic, for a grid of skews, attacks and capacities', () => {
    for (const skew of [0, 30, 80, 100]) {
      for (let a = ATTACK_RANGE.min; a <= ATTACK_RANGE.max; a += 350) {
        for (const extra of [0, 500, 1000]) {
          const r = pops(a, LEGIT_TOTAL, skew, extra);
          expect(r.sites.reduce((s, x) => s + x.load, 0)).toBeCloseTo(a + LEGIT_TOTAL, 9);
          expect(catchment(skew, capacities(extra)).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
        }
      }
    }
  });

  it('with the load shared in proportion to capacity nothing is dropped; with the skew it is, though the total capacity covers the attack', () => {
    expect(TOTAL_CAPACITY).toBe(1400);
    expect(pops(1000, LEGIT_TOTAL, 0, 0).legitDropped).toBeCloseTo(0, 9);
    const skewed = pops(1000, LEGIT_TOTAL, 80, 0);
    expect(TOTAL_CAPACITY).toBeGreaterThanOrEqual(1000);
    expect(skewed.overloaded).toEqual([0]);
    expect(skewed.legitDropped).toBeGreaterThan(0);
    const site = skewed.sites[0];
    expect(site.legitServed).toBeCloseTo((site.legit * site.capacity) / site.load, 9);
  });

  it('adding capacity at the overloaded site removes the loss', () => {
    expect(pops(1000, LEGIT_TOTAL, 80, 1000).legitDropped).toBeCloseTo(0, 9);
    expect(capacities(100)[0]).toBe(POP_CAPACITY[0] + 100);
  });

  it('invariant over 200 seeds: conservation at every tick, and the skewed run drops legitimate traffic on every seed', () => {
    for (let seed = 0; seed < 200; seed++) {
      const sim = createPopsSim({ seed, attack: 1000, skewPct: 80, extra: 0 });
      sim.run(RUN_TICKS);
      expect(sim.violation, `seed ${seed}`).toBeNull();
      for (const s of sim.history) expect(Math.abs(s.loads.reduce((a, b) => a + b, 0) - (s.attack + s.legit))).toBeLessThanOrEqual(CONSERVATION_TOLERANCE);
      const { worstDropped } = runPops({ seed, attack: 1000, skewPct: 80, extra: 0 });
      expect(worstDropped, `seed ${seed}`).toBeGreaterThan(0);
      expect(runPops({ seed, attack: 1000, skewPct: 0, extra: 0 }).worstDropped).toBeCloseTo(0, 9);
    }
  });
});

describe('scrubbing metrics', () => {
  const scored = scoreSet(3);
  it('the confusion counts equal a brute-force count at every threshold on the grid, and the metrics are the shared ones', () => {
    for (const t of thresholdGrid()) {
      let tp = 0;
      let fp = 0;
      let fn = 0;
      let tn = 0;
      for (const { score, label } of scored) {
        if (score >= t) label ? tp++ : fp++;
        else label ? fn++ : tn++;
      }
      const p = scrubAt(scored, t);
      expect(p.confusion).toEqual({ tp, fp, fn, tn });
      expect(p.attackRemoved).toBeCloseTo(classificationMetrics({ tp, fp, fn, tn }).recall, 12);
      expect(p.legitDropped).toBeCloseTo(classificationMetrics({ tp, fp, fn, tn }).fpr, 12);
    }
  });

  it('hand cases: a threshold of 0 drops everything in both classes; one above the top drops nothing in either', () => {
    expect(scrubAt(scored, THRESHOLD_RANGE.min)).toMatchObject({ attackRemoved: 1, legitDropped: 1 });
    expect(scrubAt(scored, THRESHOLD_RANGE.max)).toMatchObject({ attackRemoved: 0, legitDropped: 0 });
    expect(scored).toHaveLength(2 * FLOWS_PER_CLASS);
  });

  it('raising the threshold never removes more of either class, and the same seed gives the same scores', () => {
    let last = scrubAt(scored, 0);
    for (const t of thresholdGrid().slice(1)) {
      const p = scrubAt(scored, t);
      expect(p.attackRemoved).toBeLessThanOrEqual(last.attackRemoved);
      expect(p.legitDropped).toBeLessThanOrEqual(last.legitDropped);
      last = p;
    }
    expect(scoreSet(3)).toEqual(scored);
    expect(scoreSet(4)).not.toEqual(scored);
  });
});

describe('SYN cookies', () => {
  const FLOODS = (seed: number) => 0.3 + (seed % 18) / 10;
  const mode = (m: Mode, seed: number, flood = FLOODS(seed)) => runSyn({ seed, flood, mode: m });

  it('the toy cookie: stable for a four-tuple and slot, different across them, accepted in its slot and the next and refused after', () => {
    const c = cookieFor('a:1>b:2', 5);
    expect(cookieFor('a:1>b:2', 5)).toBe(c);
    expect(cookieFor('a:1>b:3', 5)).not.toBe(c);
    expect(cookieFor('a:1>b:2', 6)).not.toBe(c);
    expect(cookieValid('a:1>b:2', c, 5)).toBe(true);
    expect(cookieValid('a:1>b:2', c, 6)).toBe(true);
    expect(cookieValid('a:1>b:2', c, 7)).toBe(false);
    expect(cookieValid('a:1>b:2', c + 1, 5)).toBe(false);
    expect(COOKIE_SLOT_TICKS).toBeGreaterThan(0);
  });

  it('the table drains at 8 / 40 = 0.2 entries a tick, so a flood above that fills it', () => {
    expect(DRAIN_RATE).toBeCloseTo(0.2, 12);
    expect(SLOTS).toBe(8);
    expect(HOLD_TICKS).toBe(40);
  });

  it('invariant over 200 seeds with random flood rates: with cookies the table stays empty at every tick and every legitimate handshake completes', () => {
    for (let seed = 0; seed < 200; seed++) {
      const { sim, final } = mode('cookies', seed);
      expect(sim.violation, `seed ${seed}`).toBeNull();
      expect(sim.history.every((s) => s.table.length === 0)).toBe(true);
      expect(final.dropped).toBe(0);
      expect(final.completed + inFlight(final)).toBe(final.started);
      expect(inFlight(final)).toBeLessThanOrEqual(RTT_TICKS);
      expect(final.floodSeen).toBeGreaterThan(0);
    }
  });

  it('broken mode: with the entry allocated first the table fills and legitimate SYNs are dropped on every seed whose flood is above the drain rate; the lowest seed is 0', () => {
    const dropped: number[] = [];
    for (let seed = 0; seed < 200; seed++) {
      const flood = FLOODS(seed);
      expect(flood).toBeGreaterThan(DRAIN_RATE);
      const { final, sim } = mode('broken', seed);
      expect(Math.max(...sim.history.map((s) => s.table.length)), `seed ${seed}`).toBe(SLOTS);
      if (final.dropped > 0) dropped.push(seed);
    }
    expect(dropped).toHaveLength(200);
    expect(dropped[0]).toBe(0);
  });

  it('without cookies a flood below the drain rate does not starve a legitimate user, and no flood means no drops', () => {
    for (let seed = 0; seed < 50; seed++) expect(runSyn({ seed, flood: 0, mode: 'plain' }).final.dropped).toBe(0);
    const low = runSyn({ seed: 1, flood: 0.05, mode: 'plain' }).final;
    expect(low.dropped).toBeLessThanOrEqual(1);
  });

  it('plain and broken agree: the bug is that cookies buy nothing when an entry is held anyway', () => {
    for (let seed = 0; seed < 20; seed++) expect(mode('plain', seed).final).toEqual(mode('broken', seed).final);
  });
});
