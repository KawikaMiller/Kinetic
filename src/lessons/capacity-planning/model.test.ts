import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  KNEE_PER_INSTANCE, PEAK_BOUNDS, PLAN_DEFAULT, POOL_SIZES, RAMP_LEVELS, SERVICE_DEFAULT, SLO_MS, TIMEOUT_MS, TEST_JOBS,
  capacity, createRamp, errorRate, firstCrossing, forecastPeak, kneeLoad, latencyQuantileMs, meanWaitMs, mmcSurvival, optimised, orderByMonth, parsePeak, planCapacity, roomBeforeCapacity,
  poolRows, safeUtilisation, scaledCapacity, simulateLoad, trendCrossing, trendPeak, usableInstances, yearFactor, type Plan, type Service,
} from './model';

/** ∫₀^∞ S(t) dt by the trapezoid rule: the mean time in system, an independent route to the same number. */
function integrate(f: (t: number) => number, upTo: number, steps = 200_000): number {
  const h = upTo / steps;
  let sum = (f(0) + f(upTo)) / 2;
  for (let i = 1; i < steps; i++) sum += f(i * h);
  return sum * h;
}

describe('Erlang C and the time in system, by hand and by integration', () => {
  const unit: Service = { workers: 2, serviceMs: 1000 };

  it('c = 2, λ = 1, μ = 1: probability of waiting 1/3, mean wait 1/3, mean time in system 4/3', () => {
    expect(meanWaitMs(unit, 1)).toBeCloseTo(1000 / 3, 9);
    expect(integrate((t) => mmcSurvival(2, 1, 1, t), 60)).toBeCloseTo(4 / 3, 5);
    const wait = (1 / 3) * Math.exp(-(2 - 1) * 2);
    expect(errorRate(unit, 1, 2000)).toBeCloseTo(wait, 12);
  });

  it('c = 1 reduces to M/M/1: the survival function is e^(−(μ − λ)t)', () => {
    for (const [mu, lambda] of [[1, 0.5], [10, 9], [3, 0.1]]) {
      for (const t of [0, 0.1, 1, 5]) expect(mmcSurvival(1, mu, lambda, t)).toBeCloseTo(Math.exp(-(mu - lambda) * t), 12);
    }
  });

  it('the survival function is continuous through θ = μ (λ = (c − 1)μ), the case the formula treats separately', () => {
    const c = 3;
    const below = mmcSurvival(c, 1, (c - 1) * 1 - 1e-6, 2);
    const at = mmcSurvival(c, 1, (c - 1) * 1, 2);
    const above = mmcSurvival(c, 1, (c - 1) * 1 + 1e-6, 2);
    expect(at).toBeCloseTo(below, 4);
    expect(at).toBeCloseTo(above, 4);
  });

  it('the survival function integrates to the mean wait plus the service time, for several (c, ρ)', () => {
    for (const [c, rho] of [[1, 0.5], [3, 0.7], [8, 0.85]]) {
      const s: Service = { workers: c, serviceMs: 1000 };
      const lambda = rho * c;
      expect(integrate((t) => mmcSurvival(c, 1, lambda, t), 400, 400_000) * 1000).toBeCloseTo(meanWaitMs(s, lambda)! + 1000, 0);
    }
  });
});

describe('a seeded M/M/c test agrees with the exact numbers', () => {
  const s = SERVICE_DEFAULT;
  for (const rho of [0.5, 0.7, 0.85]) {
    it(`ρ = ${rho}: 200,000 departures, mean within 3% and p99 within 5% of exact`, () => {
      const lambda = rho * capacity(s);
      const r = simulateLoad(s, lambda, TIMEOUT_MS, 200_000, 7);
      const exactMean = meanWaitMs(s, lambda)! + s.serviceMs;
      expect(Math.abs(r.meanSystemMs / exactMean - 1)).toBeLessThan(0.03);
      expect(Math.abs(r.p99Ms / latencyQuantileMs(s, lambda, 0.99)! - 1)).toBeLessThan(0.05);
      expect(Math.abs(r.p50Ms / latencyQuantileMs(s, lambda, 0.5)! - 1)).toBeLessThan(0.05);
      expect(Math.abs(r.throughput / lambda - 1)).toBeLessThan(0.02);
    });
  }

  it('the error rate of the same runs equals P(wait > T) from Erlang C within 8%, averaged over 5 seeds, at a short timeout', () => {
    const timeoutMs = 80;
    const lambda = 0.9 * capacity(s);
    const p = errorRate(s, lambda, timeoutMs)!;
    const seeds = [3, 4, 5, 6, 7];
    const mean = seeds.reduce((sum, seed) => sum + simulateLoad(s, lambda, timeoutMs, 200_000, seed).errors, 0) / seeds.length;
    expect(p).toBeGreaterThan(0.05);
    expect(Math.abs(mean / p - 1)).toBeLessThan(0.08);
  });
  it('past capacity the throughput flattens at c/S while offered load keeps rising, and errors climb', () => {
    const cap = capacity(s);
    const at12 = simulateLoad(s, 1.2 * cap, TIMEOUT_MS, TEST_JOBS, 2);
    const at15 = simulateLoad(s, 1.5 * cap, TIMEOUT_MS, TEST_JOBS, 2);
    expect(Math.abs(at12.throughput / cap - 1)).toBeLessThan(0.06);
    expect(Math.abs(at15.throughput / cap - 1)).toBeLessThan(0.06);
    expect(at15.errors).toBeGreaterThan(at12.errors);
    expect(at12.errors).toBeGreaterThan(0.1);
    expect(latencyQuantileMs(s, 1.2 * cap, 0.99)).toBeNull();
  });

  it('the ramp is a tick sim: level k is the k-th steady test, the same seed gives the same points', () => {
    const a = createRamp(s, TIMEOUT_MS, 4);
    const b = createRamp(s, TIMEOUT_MS, 4);
    a.run(RAMP_LEVELS.length + 10);
    b.run(5);
    expect(a.state.points).toHaveLength(RAMP_LEVELS.length);
    expect(a.at(5)!.points).toEqual(b.state.points);
    expect(a.state.points[3].offered).toBeCloseTo(0.4 * capacity(s), 9);
  });
});

describe('the knee is defined by the objective', () => {
  it('the p99 at the knee is within 0.5% of the objective, and capacity is higher than the knee (100% busy is not the limit)', () => {
    const knee = kneeLoad(SERVICE_DEFAULT, SLO_MS)!;
    expect(Math.abs(latencyQuantileMs(SERVICE_DEFAULT, knee, 0.99)! / SLO_MS - 1)).toBeLessThan(0.005);
    expect(knee).toBeLessThan(capacity(SERVICE_DEFAULT));
    expect(knee / capacity(SERVICE_DEFAULT)).toBeLessThan(0.95);
    expect(knee).toBe(KNEE_PER_INSTANCE);
  });

  it('the knee rises with the objective and with the workers, over a grid', () => {
    let last = 0;
    for (const slo of [260, 300, 400, 800, 3000]) {
      const knee = kneeLoad(SERVICE_DEFAULT, slo)!;
      expect(knee).toBeGreaterThan(last);
      last = knee;
    }
    last = 0;
    for (let c = 1; c <= 64; c++) {
      const knee = kneeLoad({ workers: c, serviceMs: 50 }, SLO_MS)!;
      expect(knee).toBeGreaterThan(last);
      last = knee;
    }
  });

  it('a service whose own p99 misses the objective has no knee (null), never a number', () => {
    expect(kneeLoad({ workers: 8, serviceMs: 100 }, SLO_MS)).toBeNull();
    expect(safeUtilisation({ workers: 8, serviceMs: 100 }, SLO_MS)).toBeNull();
  });

  it('the knee equals a brute-force scan over offered load', () => {
    const s: Service = { workers: 4, serviceMs: 40 };
    const cap = capacity(s);
    let best = 0;
    for (let lambda = 0.01; lambda < cap; lambda += 0.01) {
      const p99 = latencyQuantileMs(s, lambda, 0.99)!;
      if (p99 <= SLO_MS) best = lambda;
    }
    expect(kneeLoad(s, SLO_MS)!).toBeCloseTo(best, 1);
  });

  it('safe utilisation is increasing in the number of workers, c = 1 … 32, at several service times', () => {
    for (const serviceMs of [10, 50, 60]) {
      let last = 0;
      for (let c = 1; c <= 32; c++) {
        const u = safeUtilisation({ workers: c, serviceMs }, SLO_MS)!;
        expect(u, `c = ${c}, S = ${serviceMs}`).toBeGreaterThan(last);
        last = u;
      }
    }
  });

  it('one pool beats the same workers as separate queues: the pooled column is at or above the separate one and rises', () => {
    const rows = poolRows(SERVICE_DEFAULT.serviceMs);
    expect(rows.map((r) => r.workers)).toEqual([...POOL_SIZES]);
    expect(rows[0].pooled).toBe(rows[0].separate);
    for (const r of rows) expect(r.pooled!).toBeGreaterThanOrEqual(r.separate!);
    expect(rows[5].pooled!).toBeGreaterThan(rows[1].pooled!);
  });

  it('a profiling win (service time cut) raises the knee, and so does adding instances, until a shared limit caps it', () => {
    const base = kneeLoad(SERVICE_DEFAULT, SLO_MS)!;
    expect(kneeLoad(optimised(SERVICE_DEFAULT, 0.3), SLO_MS)!).toBeGreaterThan(base);
    expect(scaledCapacity(SERVICE_DEFAULT, 10, 10_000)).toBeCloseTo(10 * base, 6);
    expect(scaledCapacity(SERVICE_DEFAULT, 40, 1500)).toBe(1500);
    expect(scaledCapacity(SERVICE_DEFAULT, 20, 1500)).toBe(1500);
    expect(scaledCapacity(SERVICE_DEFAULT, 1, 1500)).toBeCloseTo(base, 6);
  });
});

describe('the room before the plan capacity', () => {
  it('is the hand-worked share of the capacity left, and null (not minus infinity) when N + 1 on one instance leaves nothing usable', () => {
    const plan: Plan = { ...PLAN_DEFAULT, redundancy: 'n+1', instances: 5, headroom: 0.3, peak: 1000 };
    const cap = plan.kneePerInstance * 4 * 0.7;
    expect(roomBeforeCapacity(plan)).toBeCloseTo((cap - 1000) / cap, 12);
    const alone: Plan = { ...plan, instances: 1 };
    expect(usableInstances(alone)).toBe(0);
    expect(roomBeforeCapacity(alone)).toBeNull();
  });
});

describe('the forecast', () => {
  it('5% a month is 79.6% a year compounded, not 60%', () => {
    expect(yearFactor(0.05, 'compound')).toBeCloseTo(1.795856, 5);
    expect(1.05 ** 12).toBeCloseTo(1.7959, 4);
    expect(yearFactor(0.05, 'linear')).toBeCloseTo(1.6, 12);
  });

  it('the redundancy rules: N + 1 loses one instance, three zones lose a third, none loses nothing', () => {
    const plan = { ...PLAN_DEFAULT, instances: 9 };
    expect(usableInstances({ ...plan, redundancy: 'none' })).toBe(9);
    expect(usableInstances({ ...plan, redundancy: 'n+1' })).toBe(8);
    expect(usableInstances({ ...plan, redundancy: 'zone' })).toBe(6);
    // 17 instances over three zones are 6 / 6 / 5: losing a zone of 6 keeps 11, always a whole number.
    expect(usableInstances({ ...plan, instances: 17, redundancy: 'zone' })).toBe(11);
    for (let n = 1; n <= 60; n++) expect(Number.isInteger(usableInstances({ ...plan, instances: n, redundancy: 'zone' }))).toBe(true);
    expect(planCapacity({ ...plan, redundancy: 'n+1', headroom: 0.25 })).toBeCloseTo(plan.kneePerInstance * 8 * 0.75, 9);
  });

  it('the crossing month equals a month-by-month loop for 1,000 seeded parameter sets, and negative growth never crosses', () => {
    const rnd = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const plan: Plan = {
        peak: 100 + Math.floor(rnd() * 20_000),
        growth: -0.2 + rnd() * 0.7,
        growthKind: rnd() < 0.5 ? 'compound' : 'linear',
        spikeMonth: 1 + Math.floor(rnd() * 24),
        spikeFactor: rnd() < 0.5 ? 1 : 1 + rnd() * 2,
        instances: 1 + Math.floor(rnd() * 60),
        kneePerInstance: 50 + rnd() * 500,
        headroom: rnd() * 0.5,
        redundancy: (['none', 'n+1', 'zone'] as const)[Math.floor(rnd() * 3)],
        leadWeeks: Math.floor(rnd() * 27),
      };
      const cap = planCapacity(plan);
      let expectedMonth: number | null = null;
      let cause: string | null = null;
      for (let m = 0; m <= 100_000 && expectedMonth === null; m++) {
        if (forecastPeak(plan, m) >= cap) {
          expectedMonth = m;
          cause = trendPeak(plan, m) >= cap ? (m === 0 ? 'now' : 'trend') : 'spike';
        }
      }
      const got = firstCrossing(plan);
      expect(got.month, JSON.stringify(plan)).toBe(expectedMonth);
      if (expectedMonth !== null) expect(got.cause).toBe(cause);
      if (plan.growth <= 0 && plan.peak < cap && !(plan.spikeFactor > 1 && forecastPeak(plan, plan.spikeMonth) >= cap)) expect(got.month).toBeNull();
    }
  });

  it('the closed form m = ln(cap ÷ peak) ÷ ln(1 + g) is the real-valued crossing, checked by evaluating the trend there', () => {
    const plan = { ...PLAN_DEFAULT, spikeFactor: 1 };
    const m = trendCrossing(plan)!;
    expect(trendPeak(plan, m)).toBeCloseTo(planCapacity(plan), 6);
    expect(m).toBeCloseTo(Math.log(planCapacity(plan) / plan.peak) / Math.log(1.05), 12);
  });

  it('the order-by month is the crossing less the lead time, negative when already late, null when it never crosses', () => {
    expect(orderByMonth({ month: 10, cause: 'trend' }, 26 / 2)).toBeCloseTo(10 - 13 / (52 / 12), 12);
    expect(orderByMonth({ month: 2, cause: 'trend' }, 26)).toBeLessThan(0);
    expect(orderByMonth({ month: null, cause: null }, 8)).toBeNull();
  });
});

describe('the one typed number', () => {
  it('peak requests per second is read through parseBoundedInt, with refusals in plain words', () => {
    expect(parsePeak('1,000')).toEqual({ ok: true, value: 1000 });
    expect(parsePeak(String(PEAK_BOUNDS.max))).toEqual({ ok: true, value: PEAK_BOUNDS.max });
    for (const bad of ['', '0', '-5', '1e3', '10000001', 'abc', '2.5']) {
      const r = parsePeak(bad);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/^[A-Z"]/);
    }
  });
});
