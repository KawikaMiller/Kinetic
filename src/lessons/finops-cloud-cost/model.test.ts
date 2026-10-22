import { describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  BREAK_EVEN_READS, HOURS, P_C, P_OD, P_SPOT_EFFECTIVE, PRESETS, RPS_LIMITS, STORED_GB, bill, crossingShare, dailyGb, dayCost, hoursAtLeast, instanceHours,
  needed, neededPerHour, optimumByRule, optimumByScan, overCommitted, peakNeed, requestsPerDay, spotAllowed, storagePerDay, tierPerGbMonth, transfer,
  type Profile,
} from './cost';
import { parseBoundedIntField as parseLength } from '../../components/boundedIntParse';

// The seeded sweeps are exact but slow when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 120_000 });

const WEB = PRESETS.web.profile;
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

describe('the web profile: 2, 4 and 8 instances for 8 hours each', () => {
  it('needs 112 instance-hours and 20,160,000 requests a day', () => {
    expect(neededPerHour(WEB).slice(0, 24).filter((n) => n === 2)).toHaveLength(8);
    expect(instanceHours(WEB)).toBe(112);
    // (100 + 200 + 400) x 8 x 3,600
    expect(requestsPerDay(WEB)).toBe(20_160_000);
    expect(peakNeed(WEB)).toBe(8);
  });

  it('cost per day at C = 0, 2, 3, 4, 6, 8 is 112.00, 92.80, 91.20, 89.60, 102.40, 115.20', () => {
    // C = 2: 2 x 24 x 0.6 = 28.8 committed plus (112 - 48 = 64) on demand
    expect(dayCost(WEB, 0).total).toBeCloseTo(112.0, 9);
    near(dayCost(WEB, 2).total, 28.8 + 64);
    near(dayCost(WEB, 3).total, 43.2 + (8 * 1 + 8 * 5));
    near(dayCost(WEB, 4).total, 57.6 + 32);
    near(dayCost(WEB, 6).total, 86.4 + 16);
    near(dayCost(WEB, 8).total, 115.2);
    [112, 92.8, 91.2, 89.6, 102.4, 115.2].forEach((v, i) => near(dayCost(WEB, [0, 2, 3, 4, 6, 8][i]).total, v));
  });

  it('cost per million requests 5.556 at C = 0 and 4.444 at C = 4; paid capacity used 87.5% at C = 4 and 58.3% at C = 8', () => {
    expect(dayCost(WEB, 0).perMillion as number).toBeCloseTo(112 / 20.16, 9);
    expect(dayCost(WEB, 4).perMillion as number).toBeCloseTo(89.6 / 20.16, 9);
    expect(dayCost(WEB, 4).utilisation as number).toBeCloseTo(112 / (96 + 32), 12);
    expect(dayCost(WEB, 8).utilisation as number).toBeCloseTo(112 / 192, 12);
    expect(dayCost(WEB, 0).utilisation).toBe(1);
  });

  it('the cheapest level is 4: a level is worth committing when the profile reaches it for more than 14.4 of 24 hours', () => {
    expect(hoursAtLeast(WEB, 2)).toBe(24);
    expect(hoursAtLeast(WEB, 3)).toBe(16);
    expect(hoursAtLeast(WEB, 4)).toBe(16);
    expect(hoursAtLeast(WEB, 5)).toBe(8);
    expect(HOURS * P_C / P_OD).toBeCloseTo(14.4, 12);
    expect(optimumByScan(WEB)).toBe(4);
    expect(optimumByRule(WEB)).toBe(4);
  });

  it('interruptible burst at C = 4: 57.6 + 32 x 0.3 / 0.95 = 67.7053', () => {
    expect(P_SPOT_EFFECTIVE).toBeCloseTo(0.3 / 0.95, 12);
    expect(dayCost(WEB, 4, true).total).toBeCloseTo(57.6 + 32 * (0.3 / 0.95), 9);
    expect(dayCost(WEB, 4, true).total).toBeCloseTo(67.7053, 4);
  });

  it('the failing state, pinned: committing the peak costs 115.20 against 112.00, because 24 x 0.6 x 8 = 115.2 exceeds 112', () => {
    const counterexample = { committed: peakNeed(WEB), cost: dayCost(WEB, 8).total, nothing: dayCost(WEB, 0).total };
    expect(counterexample.committed).toBe(8);
    near(counterexample.cost, 115.2);
    near(counterexample.nothing, 112);
    expect(24 * 0.6 * 8).toBeCloseTo(115.2, 12);
    expect(overCommitted(WEB)).toBe(true);
    expect(overCommitted(PRESETS.flat.profile)).toBe(false);
    // not trivially one-sided: the cheapest level is neither end
    expect(optimumByScan(WEB)).toBeGreaterThan(0);
    expect(optimumByScan(WEB)).toBeLessThan(peakNeed(WEB));
  });
});

/** A seeded random 24-hour profile in the page's range. */
const randomProfile = (rnd: () => number): Profile => {
  const level = 1 + Math.floor(rnd() * 20);
  return Array.from({ length: HOURS }, () => 50 * Math.floor(rnd() * level));
};

describe('the optimum by two formulations', () => {
  it('the scan argmin equals the critical-ratio rule on the presets', () => {
    for (const id of ['web', 'flat', 'spiky', 'none'] as const) {
      const p = PRESETS[id].profile;
      expect(optimumByScan(p), id).toBe(optimumByRule(p));
    }
    expect(optimumByScan(PRESETS.flat.profile)).toBe(4);
    expect(optimumByScan(PRESETS.none.profile)).toBe(0);
  });

  it('equal on 1,000 seeded random profiles with the commitment ratio varied from 0.3 to 0.95, on demand and on interruptible burst', () => {
    const rnd = mulberry32(2026);
    for (let i = 0; i < 1000; i += 1) {
      const p = randomProfile(rnd);
      const ratio = 0.3 + rnd() * 0.65;
      for (const spot of [false, true]) {
        const commitPrice = ratio * (spot ? P_SPOT_EFFECTIVE : P_OD);
        expect(optimumByScan(p, spot, commitPrice), `profile ${i} ratio ${ratio.toFixed(3)} spot ${spot}`).toBe(optimumByRule(p, spot, commitPrice));
      }
    }
  });

  it('the cost is non-increasing and then non-decreasing in C (unimodal) for the presets and 300 random profiles', () => {
    const rnd = mulberry32(7);
    const profiles = [...Object.values(PRESETS).map((p) => p.profile), ...Array.from({ length: 300 }, () => randomProfile(rnd))];
    for (const p of profiles) {
      const costs = Array.from({ length: peakNeed(p) + 1 }, (_, c) => dayCost(p, c).total);
      let rising = false;
      for (let c = 1; c < costs.length; c += 1) {
        const d = costs[c] - costs[c - 1];
        if (d > 1e-9) rising = true;
        if (rising) expect(d).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });

  it('over-commitment is exactly the condition 24 x P_C x peak > on-demand cost of the profile, on 500 seeded profiles', () => {
    const rnd = mulberry32(99);
    for (let i = 0; i < 500; i += 1) {
      const p = randomProfile(rnd);
      const direct = dayCost(p, peakNeed(p)).total > dayCost(p, 0).total + 1e-9;
      expect(overCommitted(p), `profile ${i}`).toBe(direct);
    }
  });
});

describe('extremes', () => {
  it('C at 0 and at the peak work; one beyond either end is refused with the stated limit', () => {
    expect(() => dayCost(WEB, 0)).not.toThrow();
    expect(() => dayCost(WEB, 8)).not.toThrow();
    expect(() => dayCost(WEB, 9)).toThrow('from 0 to 8');
    expect(() => dayCost(WEB, -1)).toThrow(RangeError);
    expect(() => dayCost(WEB, 1.5)).toThrow(RangeError);
    const typed = parseLength('9', 'committed instances', 0, 8);
    expect(typed.ok ? '' : typed.error).toContain('the largest allowed value is 8');
    expect(parseLength('0', 'committed instances', 0, 8).ok).toBe(true);
    expect(parseLength('-1', 'committed instances', 0, 8).ok).toBe(false);
  });

  it('a flat profile: the optimum is the need and the cost is need x 24 x P_C', () => {
    const flat = PRESETS.flat.profile;
    expect(optimumByScan(flat)).toBe(4);
    near(dayCost(flat, 4).total, 4 * 24 * 0.6);
    expect(dayCost(flat, 4).utilisation).toBe(1);
  });

  it('a zero-traffic profile has no unit cost, no utilisation and no NaN or Infinity anywhere', () => {
    const none = PRESETS.none.profile;
    const c = dayCost(none, 0);
    expect(c.perMillion).toBeNull();
    expect(c.utilisation).toBeNull();
    expect(c.total).toBe(0);
    expect(requestsPerDay(none)).toBe(0);
    expect(bill(none, 0, 3, 0, 'standard', 1).perMillion).toBeNull();
    expect(Number.isFinite(bill(none, 0, 3, 0, 'standard', 1).total)).toBe(true);
    expect(transfer(0, 3, 0).cost).toBe(0);
  });

  it('requests per second at the limits: 0 needs 0 instances, 1,000 needs 20, 1 needs 1', () => {
    expect([needed(RPS_LIMITS.min), needed(RPS_LIMITS.max), needed(1), needed(50), needed(51)]).toEqual([0, 20, 1, 1, 2]);
  });

  it('the interruptible option is refused for user-facing work, with the reason, and allowed for queue work', () => {
    const refused = spotAllowed('user');
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.reason).toContain('cannot be redone for free');
    expect(spotAllowed('queue')).toEqual({ ok: true });
  });
});

describe('moving bytes', () => {
  it('3 zones, nothing kept in-zone: 10,080 GB a day, 2/3 cross, 6,720 GB, 134.40; at 90% in-zone 672 GB and 13.44', () => {
    expect(dailyGb(requestsPerDay(WEB))).toBe(10_080);
    near(crossingShare(3, 0), 2 / 3);
    near(transfer(requestsPerDay(WEB), 3, 0).crossingGb, 6720);
    near(transfer(requestsPerDay(WEB), 3, 0).cost, 134.4);
    near(crossingShare(3, 0.9), (0.1 * 2) / 3);
    near(transfer(requestsPerDay(WEB), 3, 0.9).crossingGb, 672);
    near(transfer(requestsPerDay(WEB), 3, 0.9).cost, 13.44);
  });

  it('the transfer line exceeds the compute line at q = 0 and is a smaller share of it at q = 90%', () => {
    const compute = dayCost(WEB, optimumByScan(WEB)).total;
    expect(transfer(requestsPerDay(WEB), 3, 0).cost).toBeGreaterThan(compute);
    expect(transfer(requestsPerDay(WEB), 3, 0.9).cost / compute).toBeCloseTo(0.15, 12);
  });

  it('2 zones cross (1 - q) / 2; q at 0 and 100% give 1/2 and 0; one beyond is refused', () => {
    near(crossingShare(2, 0), 0.5);
    near(crossingShare(2, 0.5), 0.25);
    expect(crossingShare(2, 1)).toBe(0);
    expect(crossingShare(3, 1)).toBe(0);
    expect(() => transfer(1000, 3, 1.01)).toThrow(RangeError);
    expect(() => transfer(1000, 3, -0.01)).toThrow(RangeError);
  });
});

describe('storage tiers and the bill board', () => {
  it('the colder tier is 0.4 S + 0.5 S r against S: they tie at r = (1 - 0.4) / 0.5 = 1.2 and the colder tier is cheaper below it', () => {
    expect(BREAK_EVEN_READS).toBeCloseTo(1.2, 12);
    near(tierPerGbMonth('cold', 1.2), tierPerGbMonth('standard', 1.2));
    expect(tierPerGbMonth('cold', 1.1)).toBeLessThan(tierPerGbMonth('standard', 1.1));
    expect(tierPerGbMonth('cold', 1.3)).toBeGreaterThan(tierPerGbMonth('standard', 1.3));
    expect(tierPerGbMonth('cold', 0)).toBeCloseTo(0.008, 12);
  });

  it('the tier prices are ratios of the standard price, not copies of another lesson\'s table', () => {
    expect(tierPerGbMonth('cold', 0) / tierPerGbMonth('standard', 0)).toBeCloseTo(0.4, 12);
    expect((tierPerGbMonth('cold', 1) - tierPerGbMonth('cold', 0)) / tierPerGbMonth('standard', 0)).toBeCloseTo(0.5, 12);
  });

  it('storage for 5,000 GB: 3.33 a day standard, 1.33 colder at 0 reads, 6.33 colder at 3 reads', () => {
    expect(STORED_GB).toBe(5000);
    near(storagePerDay('standard', 0), (5000 * 0.02) / 30);
    near(storagePerDay('cold', 0), (5000 * 0.008) / 30);
    near(storagePerDay('cold', 3), (5000 * 0.038) / 30);
    expect(storagePerDay('standard', 0, 0)).toBe(0);
  });

  it('the bill board at C = 4, 3 zones: 227.33 per day and 11.28 per million with no zone-local routing; 106.37 and 5.28 at 90%', () => {
    const none = bill(WEB, 4, 3, 0, 'standard', 1.2);
    near(none.total, 89.6 + 134.4 + 5000 * 0.02 / 30);
    expect(none.total).toBeCloseTo(227.3333, 4);
    expect(none.perMillion as number).toBeCloseTo(227.3333 / 20.16, 3);
    const local = bill(WEB, 4, 3, 0.9, 'standard', 1.2);
    near(local.total, 89.6 + 13.44 + 5000 * 0.02 / 30);
    expect(local.total).toBeCloseTo(106.3733, 4);
    expect(local.perMillion as number).toBeCloseTo(5.2765, 3);
  });
});
