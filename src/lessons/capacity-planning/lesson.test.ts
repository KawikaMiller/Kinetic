import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { expectCaption } from '../../core/testing/captions';
import { forecastCaption, growthNote, loadCaption, msText, rps, scaleCaption } from './frames';
import lesson from './index';
import {
  DB_NO_LIMIT, KNEE_PER_INSTANCE, LEVEL_DEFAULT, LEVEL_RANGE, PLAN_DEFAULT, SERVICE_DEFAULT, SLO_MS, TEST_JOBS, TIMEOUT_MS, capacity, errorRate, firstCrossing, kneeLoad,
  latencyQuantileMs, optimised, orderByMonth, planCapacity, poolRows, scaledCapacity, simulateLoad, yearFactor, type Plan, type Service,
} from './model';
import { pctText } from '../../core/format';

const text = expectCaption;

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: at the default 90% of capacity everything is served but the p99 is over the objective, below the 100% limit', () => {
    expect(LEVEL_DEFAULT).toBe(0.9);
    const offered = LEVEL_DEFAULT * capacity(SERVICE_DEFAULT);
    const p99 = latencyQuantileMs(SERVICE_DEFAULT, offered, 0.99)!;
    expect(p99).toBeGreaterThan(SLO_MS);
    const run = simulateLoad(SERVICE_DEFAULT, offered, TIMEOUT_MS, TEST_JOBS, 1);
    expect(Math.abs(run.throughput / offered - 1)).toBeLessThan(0.03);
    const c = text(loadCaption(SERVICE_DEFAULT, LEVEL_DEFAULT));
    expect(c).toContain(`the p99 is ${msText(p99)}`);
    expect(c).toContain('over the 300 ms objective');
    expect(lesson.tryThis[0]).toContain(msText(p99));
  });

  it('try-this 2: at 80% of capacity the p99 is within the objective', () => {
    const p99 = latencyQuantileMs(SERVICE_DEFAULT, 0.8 * capacity(SERVICE_DEFAULT), 0.99)!;
    expect(p99).toBeLessThanOrEqual(SLO_MS);
    expect(text(loadCaption(SERVICE_DEFAULT, 0.8))).toContain('within the 300 ms objective');
    expect(lesson.tryThis[1]).toContain(msText(p99));
  });

  it('try-this 3: past 100% throughput stays at capacity and errors rise, in a run from the default seed', () => {
    const cap = capacity(SERVICE_DEFAULT);
    const at100 = simulateLoad(SERVICE_DEFAULT, cap, TIMEOUT_MS, TEST_JOBS, 1);
    const at150 = simulateLoad(SERVICE_DEFAULT, 1.5 * cap, TIMEOUT_MS, TEST_JOBS, 1);
    expect(Math.abs(at150.throughput / cap - 1)).toBeLessThan(0.06);
    expect(at150.errors).toBeGreaterThan(at100.errors);
    expect(text(loadCaption(SERVICE_DEFAULT, 1.2))).toContain('no steady state');
  });

  it('try-this 4: the default plan crosses capacity in the spike month, and the order-by month is the crossing less the lead time', () => {
    const crossing = firstCrossing(PLAN_DEFAULT);
    expect(crossing).toEqual({ month: PLAN_DEFAULT.spikeMonth, cause: 'spike' });
    const trend = firstCrossing({ ...PLAN_DEFAULT, spikeFactor: 1 });
    expect(trend.cause).toBe('trend');
    expect(trend.month!).toBeGreaterThan(crossing.month!);
    const order = orderByMonth(crossing, PLAN_DEFAULT.leadWeeks)!;
    expect(order).toBeGreaterThan(0);
    expect(lesson.tryThis[3]).toContain(`month ${crossing.month}`);
    expect(text(forecastCaption(PLAN_DEFAULT))).toContain(`month ${crossing.month}`);
  });

  it('try-this 5: with a 1,500/s database limit, 10 instances are under it and 11 are capped at it', () => {
    expect(scaledCapacity(SERVICE_DEFAULT, 10, 1500)).toBeLessThan(1500);
    expect(scaledCapacity(SERVICE_DEFAULT, 11, 1500)).toBe(1500);
    expect(scaledCapacity(SERVICE_DEFAULT, 30, 1500)).toBe(1500);
    expect(text(scaleCaption(SERVICE_DEFAULT, 0, 11, 1500))).toContain('capped by the shared database at 1,500/s');
  });
});

describe('captions are computed from the model', () => {
  it('the load caption quotes the exact p99, the knee and says "no steady state" exactly at and past 100%, for several services', () => {
    const services: Service[] = [SERVICE_DEFAULT, { workers: 1, serviceMs: 50 }, { workers: 64, serviceMs: 10 }, { workers: 8, serviceMs: 2 }];
    for (const s of services) {
      for (let level = LEVEL_RANGE.min; level <= LEVEL_RANGE.max + 1e-9; level += LEVEL_RANGE.step) {
        const l = Math.round(level * 20) / 20;
        const c = text(loadCaption(s, l));
        const knee = kneeLoad(s, SLO_MS);
        expect(c.includes('no steady state'), `${JSON.stringify(s)} ${l}`).toBe(l >= 1);
        if (knee !== null) {
          expect(c).toContain(`${rps(knee)}`);
          if (l < 1) expect(c).toContain(msText(latencyQuantileMs(s, l * capacity(s), 0.99)!));
        }
      }
    }
  });

  it('a service whose own p99 is over the objective says no load meets it, at every offered load', () => {
    const slow: Service = { workers: 8, serviceMs: 100 };
    for (const l of [0.1, 0.9, 1.5]) expect(text(loadCaption(slow, l))).toContain('no load meets it');
  });

  it('the forecast caption says "never crosses" exactly when the loop finds no crossing, over 300 seeded plans', () => {
    const rnd = mulberry32(5);
    for (let i = 0; i < 300; i++) {
      const plan: Plan = {
        ...PLAN_DEFAULT,
        peak: 100 + Math.floor(rnd() * 5000),
        growth: -0.2 + rnd() * 0.7,
        growthKind: rnd() < 0.5 ? 'compound' : 'linear',
        spikeFactor: rnd() < 0.5 ? 1 : 1 + rnd() * 2,
        spikeMonth: 1 + Math.floor(rnd() * 24),
        instances: 1 + Math.floor(rnd() * 60),
        headroom: rnd() * 0.5,
      };
      const c = text(forecastCaption(plan));
      const crossing = firstCrossing(plan);
      expect(c.includes('never crosses capacity'), JSON.stringify(plan)).toBe(crossing.month === null);
      expect(c).toContain(rps(planCapacity(plan)));
      if (crossing.month !== null && crossing.month > 0) expect(c).toContain(`month ${crossing.month}`);
      const order = orderByMonth(crossing, plan.leadWeeks);
      if (order !== null) expect(c.includes('months ago'), JSON.stringify(plan)).toBe(order < 0);
    }
  });

  it('the growth note quotes the compound and the linear year at the slider extremes', () => {
    for (const g of [-0.2, 0, 0.05, 0.5]) {
      const c = text(growthNote(g));
      expect(c).toContain(`${pctText(g, 0)} a month`);
      expect(c.includes('that adding it up gives'), `g=${g}`).toBe(1 + 12 * g > 0);
      expect(c).not.toMatch(/-\d\.\d+ that adding/);
    }
    expect(yearFactor(0.05, 'compound')).toBeCloseTo(1.05 ** 12, 12);
  });

  it('the scale caption quotes the total, and the cap only when the database is what stops it', () => {
    for (const cut of [0, 0.25, 0.5]) {
      for (const n of [1, 10, 40]) {
        for (const limit of [500, 5000, DB_NO_LIMIT]) {
          const c = text(scaleCaption(SERVICE_DEFAULT, cut, n, limit));
          const total = scaledCapacity(optimised(SERVICE_DEFAULT, cut), n, limit);
          expect(c).toContain(rps(total));
          const knee = kneeLoad(optimised(SERVICE_DEFAULT, cut), SLO_MS)!;
          expect(c.includes('capped by the shared database'), `${cut} ${n} ${limit}`).toBe(limit < DB_NO_LIMIT && n * knee > limit);
        }
      }
    }
  });
});

describe('quiz answers, from independent oracles', () => {
  it('Q1: at 90% of capacity the p99 is over the objective while the knee is below capacity', () => {
    expect(latencyQuantileMs(SERVICE_DEFAULT, 0.9 * capacity(SERVICE_DEFAULT), 0.99)!).toBeGreaterThan(SLO_MS);
    expect(kneeLoad(SERVICE_DEFAULT, SLO_MS)!).toBeLessThan(0.9 * capacity(SERVICE_DEFAULT));
  });

  it('Q2: capacity c / S is above the knee, which is the load that meets the objective', () => {
    expect(capacity(SERVICE_DEFAULT)).toBeGreaterThan(KNEE_PER_INSTANCE);
    expect(latencyQuantileMs(SERVICE_DEFAULT, KNEE_PER_INSTANCE, 0.99)!).toBeCloseTo(SLO_MS, 0);
  });

  it('Q3: 32 workers pooled meet the objective at a higher utilisation than 32 separate single-worker servers', () => {
    const row = poolRows(SERVICE_DEFAULT.serviceMs).find((r) => r.workers === 32)!;
    expect(row.pooled!).toBeGreaterThan(row.separate!);
    const separateKnee = 32 * kneeLoad({ workers: 1, serviceMs: SERVICE_DEFAULT.serviceMs }, SLO_MS)!;
    expect(separateKnee).toBeLessThan(kneeLoad({ workers: 32, serviceMs: SERVICE_DEFAULT.serviceMs }, SLO_MS)!);
  });

  it('Q4: 1.05^12 is 1.796 (79.6%), while adding 5% twelve times is 60%', () => {
    let product = 1;
    for (let i = 0; i < 12; i++) product *= 1.05;
    expect(product).toBeCloseTo(1.796, 3);
    expect(yearFactor(0.05, 'linear')).toBeCloseTo(1.6, 12);
  });
});

describe('hidden controls do not feed numbers', () => {
  it('scene 2 takes each instance\'s knee from the default service, whatever scene 1 is set to', () => {
    expect(PLAN_DEFAULT.kneePerInstance).toBe(KNEE_PER_INSTANCE);
    expect(KNEE_PER_INSTANCE).toBe(kneeLoad(SERVICE_DEFAULT, SLO_MS));
  });

  it('the exact columns of scene 1 do not read the seed, and with no shared limit scene 3 reads no limit', () => {
    const offered = 0.7 * capacity(SERVICE_DEFAULT);
    expect(errorRate(SERVICE_DEFAULT, offered, TIMEOUT_MS)).toBe(errorRate(SERVICE_DEFAULT, offered, TIMEOUT_MS));
    const a = scaledCapacity(SERVICE_DEFAULT, 20, DB_NO_LIMIT);
    expect(a).toBeCloseTo(20 * KNEE_PER_INSTANCE, 6);
  });
});
