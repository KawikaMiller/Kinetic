import { describe, expect, it } from 'vitest';
import { enumerateOverlap, exactIdentical, exactShare, monteCarlo, randomSubset, subsets, assignments, maxK, N_RANGE } from './combos';
import { COSTS, ORDERS, SHOPS, TENANT_COUNT, listOrders } from './data';
import {
  CALM_RATE, CHEAP_COST_MS, NOISY_CHEAP, NOISY_EXPENSIVE, NO_POLICY, RATE_LIMIT, SHARD_CAPACITY, SIM_TICKS, SLOTS, admittedTicks, mostInWindow, runShards, tenantStream, waterFill,
  type Policy, type SimConfig, type Tenant,
} from './shardSim';
import { mulberry32 } from '../../core/random';

const SHARD_OF = [0, 0, 1, 1, 2, 2, 3, 3];
const calm = (): Tenant[] => SHARD_OF.map(() => ({ rate: CALM_RATE, costMs: CHEAP_COST_MS }));
const cfg = (over: { seed?: number; tenants?: Tenant[]; shardOf?: number[]; policy?: Partial<Policy> } = {}): SimConfig => ({
  seed: over.seed ?? 0,
  tenants: over.tenants ?? calm(),
  shardOf: over.shardOf ?? SHARD_OF,
  policy: { ...NO_POLICY, ...over.policy },
});
const noisy = (n: Tenant): Tenant[] => calm().map((t, i) => (i === 0 ? n : t));

/** An independent max-min fair allocation: find the water level by bisection instead of sorting. */
function bisectionFill(demands: readonly number[], capacity: number): number[] {
  if (demands.reduce((a, b) => a + b, 0) <= capacity) return [...demands];
  let lo = 0;
  let hi = Math.max(...demands);
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (demands.reduce((a, d) => a + Math.min(d, mid), 0) > capacity) hi = mid;
    else lo = mid;
  }
  return demands.map((d) => Math.min(d, lo));
}

describe('water-filling, against an independent bisection', () => {
  it('hand cases: capacity 10 over demands 2, 4, 10 gives 2, 4, 4', () => {
    expect(waterFill([2, 4, 10], 10)).toEqual([2, 4, 4]);
    expect(waterFill([5, 5], 10)).toEqual([5, 5]);
    expect(waterFill([100, 100, 100], 30)).toEqual([10, 10, 10]);
    expect(waterFill([1, 100], 10)).toEqual([1, 9]);
  });

  it('matches the bisection reference on 300 seeded demand vectors, and never allocates past demand or capacity', () => {
    const rnd = mulberry32(5);
    for (let n = 0; n < 300; n++) {
      const demands = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => Math.floor(rnd() * 1000));
      const cap = Math.floor(rnd() * 3000);
      const got = waterFill(demands, cap);
      const ref = bisectionFill(demands, cap);
      got.forEach((v, i) => {
        expect(v).toBeCloseTo(ref[i], 6);
        expect(v).toBeLessThanOrEqual(demands[i] + 1e-9);
      });
      expect(got.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(cap + 1e-6);
    }
  });
});

describe('the simulation', () => {
  it('is deterministic by seed, and a tenant stream does not depend on anyone else', () => {
    const a = runShards(cfg({ seed: 3 }));
    expect(runShards(cfg({ seed: 3 })).tenants).toEqual(a.tenants);
    expect(runShards(cfg({ seed: 4 })).tenants).not.toEqual(a.tenants);
    expect(tenantStream(7, 2)()).toBe(tenantStream(7, 2)());
    expect(tenantStream(7, 2)()).not.toBe(tenantStream(7, 3)());
  });

  it('every arrival is served, throttled, dropped or still pending, in every policy', () => {
    for (const policy of [{}, { rateLimit: true }, { bulkhead: true }, { fair: true }, { rateLimit: true, bulkhead: true, fair: true }] as Partial<Policy>[]) {
      const run = runShards(cfg({ tenants: noisy(NOISY_CHEAP), policy }));
      for (const t of run.tenants) {
        expect(t.served + t.throttled + t.dropped + t.pending).toBe(t.arrivals);
        expect(t.pending).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('calm traffic is served in full, with latency near the cost of a request, and nobody is hurt', () => {
    const run = runShards(cfg());
    for (const t of run.tenants) {
      expect(t.hurt).toBe(false);
      expect(t.errorRate).toBe(0);
      expect(t.servedWork).toBeGreaterThan(0.95 * t.demandWork - 20);
      expect(t.p99Ms).toBeLessThan(100);
      expect(t.p99Ms).toBeGreaterThanOrEqual(CHEAP_COST_MS);
    }
    expect(run.blast(0)).toBe(0);
  });

  it('a noisy tenant hurts exactly the tenants that share its shard, and the other shards keep their numbers', () => {
    const base = runShards(cfg());
    const run = runShards(cfg({ tenants: noisy(NOISY_CHEAP) }));
    expect(run.tenants[1].hurt).toBe(true);
    expect(run.blast(0)).toBe(1);
    for (const i of [2, 3, 4, 5, 6, 7]) expect(run.tenants[i]).toEqual(base.tenants[i]);
  });

  it('the shard demand adds up: the noisy shard asks for more than its capacity', () => {
    const run = runShards(cfg({ tenants: noisy(NOISY_CHEAP) }));
    expect(run.shards[0].demandWork).toBeGreaterThan(SHARD_CAPACITY);
    expect(run.shards[0].servedWork).toBeLessThanOrEqual(SHARD_CAPACITY + 1);
    expect(run.shards[1].demandWork).toBeLessThan(SHARD_CAPACITY / 2);
  });

  it('arrivals do not depend on the policy: the same seed asks for the same work whatever protects it', () => {
    const plain = runShards(cfg({ tenants: noisy(NOISY_CHEAP) }));
    const guarded = runShards(cfg({ tenants: noisy(NOISY_CHEAP), policy: { rateLimit: true, bulkhead: true, fair: true } }));
    plain.tenants.forEach((t, i) => expect(guarded.tenants[i].arrivals).toBe(t.arrivals));
  });
});

describe('the protections, and what each does not do', () => {
  const hurtOthers = (n: Tenant, policy: Partial<Policy>) => runShards(cfg({ tenants: noisy(n), policy })).blast(0);

  it('many cheap requests: a rate limit, a bulkhead and fair queueing each protect the neighbour', () => {
    expect(hurtOthers(NOISY_CHEAP, {})).toBe(1);
    expect(hurtOthers(NOISY_CHEAP, { rateLimit: true })).toBe(0);
    expect(hurtOthers(NOISY_CHEAP, { bulkhead: true })).toBe(0);
    expect(hurtOthers(NOISY_CHEAP, { fair: true })).toBe(0);
  });

  it('a few expensive requests: the same work at a rate under the limit, so the rate limit does nothing; the bulkhead protects, and fair queueing keeps the neighbour served but cannot interrupt a request that is running', () => {
    expect(NOISY_EXPENSIVE.rate).toBeLessThan(RATE_LIMIT.rate);
    expect(NOISY_EXPENSIVE.rate * NOISY_EXPENSIVE.costMs).toBe(NOISY_CHEAP.rate * NOISY_CHEAP.costMs);
    const open = runShards(cfg({ tenants: noisy(NOISY_EXPENSIVE) }));
    expect(open.blast(0)).toBe(1);
    const limited = runShards(cfg({ tenants: noisy(NOISY_EXPENSIVE), policy: { rateLimit: true } }));
    expect(limited.tenants[0].throttled).toBeLessThan(0.05 * limited.tenants[0].arrivals);
    expect(limited.tenants[1].p99Ms).toBe(open.tenants[1].p99Ms);
    expect(limited.tenants[1].hurt).toBe(true);
    expect(hurtOthers(NOISY_EXPENSIVE, { bulkhead: true })).toBe(0);
    const fair = runShards(cfg({ tenants: noisy(NOISY_EXPENSIVE), policy: { fair: true } }));
    expect(fair.tenants[1].errorRate).toBe(0);
    expect(fair.tenants[1].p99Ms as number).toBeLessThan((open.tenants[1].p99Ms as number) / 2);
    expect(fair.tenants[1].p99Ms as number).toBeGreaterThanOrEqual(NOISY_EXPENSIVE.costMs * 0.9);
  });

  it('throttling shows up as the noisy tenant\'s own errors, not the neighbour\'s', () => {
    const run = runShards(cfg({ tenants: noisy(NOISY_CHEAP), policy: { rateLimit: true } }));
    expect(run.tenants[0].throttled).toBeGreaterThan(0.75 * run.tenants[0].arrivals);
    expect(run.tenants[1].errorRate).toBeLessThan(0.01);
  });

  it('token bucket invariant: no tenant is admitted above rate x window + burst in any 1-second window, checked on every admission', () => {
    for (let seed = 0; seed < 20; seed++) {
      const run = runShards(cfg({ seed, tenants: noisy(NOISY_CHEAP), policy: { rateLimit: true } }));
      for (let i = 0; i < run.tenants.length; i++) {
        expect(mostInWindow(admittedTicks(run, i), 1000), `seed ${seed} tenant ${i}`).toBeLessThanOrEqual(RATE_LIMIT.rate + RATE_LIMIT.capacity);
      }
    }
    const heavy = runShards(cfg({ tenants: noisy(NOISY_CHEAP), policy: { rateLimit: true } }));
    expect(mostInWindow(admittedTicks(heavy, 0), 1000)).toBeGreaterThanOrEqual(RATE_LIMIT.rate);
  });

  it('mostInWindow counts a closed window', () => {
    expect(mostInWindow([0, 500, 1000, 1500], 1000)).toBe(3);
    expect(mostInWindow([0, 1001], 1000)).toBe(1);
    expect(mostInWindow([], 1000)).toBe(0);
  });

  it('the bulkhead caps the noisy tenant at its slots: at most 2 of the 4 slots busy with it, so the neighbour always has the other 2', () => {
    const run = runShards(cfg({ tenants: noisy(NOISY_EXPENSIVE), policy: { bulkhead: true } }));
    expect(run.tenants[0].servedWork).toBeLessThanOrEqual((SHARD_CAPACITY / SLOTS) * 2 + 20);
    expect(run.tenants[1].errorRate).toBe(0);
  });
});

describe('invariant: fair queueing serves the max-min fair allocation, on 200 seeded demand vectors', () => {
  const COSTS_MS = [5, 10, 20, 50];
  const vector = (seed: number, overload: number): Tenant[] => {
    const rnd = mulberry32(seed + 1000);
    const raw = Array.from({ length: 6 }, () => ({ rate: 5 + Math.floor(rnd() * 395), costMs: COSTS_MS[Math.floor(rnd() * COSTS_MS.length)] }));
    const total = raw.reduce((a, t) => a + t.rate * t.costMs, 0);
    const scale = (SHARD_CAPACITY * overload) / total;
    return raw.map((t) => ({ rate: Math.max(1, Math.round(t.rate * scale)), costMs: t.costMs }));
  };
  const SHARD_ALL_ZERO = [0, 0, 0, 0, 0, 0];
  const horizon = 10_000;
  const single = (seed: number, tenants: Tenant[], policy: Partial<Policy>) => runShards({ seed, tenants, shardOf: SHARD_ALL_ZERO, policy: { ...NO_POLICY, ...policy } }, horizon);

  it('served work per tenant equals the water-filling allocation of what was actually asked, within the backlog the run ends with', () => {
    let overloaded = 0;
    for (let seed = 0; seed < 200; seed++) {
      const tenants = vector(seed, 0.6 + (seed % 10) * 0.15);
      const run = single(seed, tenants, { fair: true });
      const demand = run.tenants.map((t) => t.demandWork);
      const ref = bisectionFill(demand, SHARD_CAPACITY);
      if (demand.reduce((a, b) => a + b, 0) > SHARD_CAPACITY) overloaded++;
      run.tenants.forEach((t, i) => {
        expect(Math.abs(t.servedWork - ref[i]), `seed ${seed} tenant ${i}`).toBeLessThanOrEqual(0.06 * SHARD_CAPACITY);
        if (demand[i] <= 0.8 * Math.max(...ref) && demand.reduce((a, b) => a + b, 0) > SHARD_CAPACITY) {
          expect((t.dropped + t.throttled) / t.arrivals, `seed ${seed} tenant ${i} well below its fair share lost requests`).toBeLessThan(0.03);
        }
      });
    }
    expect(overloaded).toBeGreaterThan(100);
  });

  it('broken mode: with a FIFO shared queue, a tenant below its fair share still loses requests on every overloaded vector that has one; the lowest such seed is the one shown', () => {
    const cases: number[] = [];
    for (let seed = 0; seed < 200; seed++) {
      const tenants = vector(seed, 1.3 + (seed % 5) * 0.2);
      const fifo = single(seed, tenants, {});
      const demand = fifo.tenants.map((t) => t.demandWork);
      const fair = bisectionFill(demand, SHARD_CAPACITY);
      const below = fifo.tenants.filter((_, i) => demand[i] < fair[i] - 1e-9 || (demand[i] <= fair[i] + 1e-9 && demand.some((d, j) => d > fair[j] + 1e-9)));
      if (demand.reduce((a, b) => a + b, 0) > SHARD_CAPACITY && below.length > 0) {
        cases.push(seed);
        expect(below.some((t) => t.dropped > 0), `seed ${seed}`).toBe(true);
        expect(below.some((t) => t.servedWork < 0.97 * t.demandWork), `seed ${seed}`).toBe(true);
      }
    }
    expect(cases.length).toBeGreaterThan(150);
    expect(cases[0]).toBe(0);
  });
});

describe('shuffle sharding: exact, brute force and Monte Carlo agree', () => {
  it('the spec case: N = 8, k = 2 has 28 pairs, 13/28 share a worker, 1/28 are identical', () => {
    expect(assignments(8, 2)).toBe(28);
    expect(exactShare(8, 2)).toBeCloseTo(13 / 28, 12);
    expect(exactIdentical(8, 2)).toBeCloseTo(1 / 28, 12);
    expect(enumerateOverlap(8, 2)).toEqual({ sharing: 13, identical: 1, total: 28 });
  });

  it('the formulas equal a brute-force enumeration for every (N, k) the sliders allow', () => {
    for (let n = N_RANGE.min; n <= N_RANGE.max; n++) {
      for (let k = 1; k <= maxK(n); k++) {
        const e = enumerateOverlap(n, k);
        expect(e.total, `${n},${k}`).toBe(assignments(n, k));
        expect(exactShare(n, k), `${n},${k}`).toBeCloseTo(e.sharing / e.total, 12);
        expect(exactIdentical(n, k), `${n},${k}`).toBeCloseTo(e.identical / e.total, 12);
      }
    }
  });

  it('a 100,000-sample Monte Carlo is within 1% of the exact values (absolute), for several (N, k)', () => {
    for (const [n, k] of [[8, 2], [8, 3], [12, 2], [6, 1], [10, 4]] as const) {
      const est = monteCarlo(n, k, 100_000, 7);
      expect(Math.abs(est.share - exactShare(n, k)), `${n},${k} share`).toBeLessThan(0.01);
      expect(Math.abs(est.identical - exactIdentical(n, k)), `${n},${k} identical`).toBeLessThan(0.01);
    }
  });

  it('k = 1 is plain sharding: the chance of sharing is the chance of the same worker, 1/N; and more workers per tenant makes losing all of them rarer', () => {
    expect(exactShare(8, 1)).toBeCloseTo(1 / 8, 12);
    expect(exactIdentical(8, 1)).toBeCloseTo(1 / 8, 12);
    expect(exactIdentical(8, 2)).toBeLessThan(exactIdentical(8, 1));
    expect(exactIdentical(8, 3)).toBeLessThan(exactIdentical(8, 2));
  });

  it('subsets lists each combination once, and a random subset is sorted, distinct and in range', () => {
    expect(subsets(4, 2)).toEqual([[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]);
    const rnd = mulberry32(1);
    for (let i = 0; i < 200; i++) {
      const s = randomSubset(8, 3, rnd);
      expect(new Set(s).size).toBe(3);
      expect(s).toEqual([...s].sort((a, b) => a - b));
      expect(Math.min(...s)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...s)).toBeLessThan(8);
    }
  });
});

describe('data isolation', () => {
  const me = SHOPS[0];
  const others = ORDERS.filter((r) => r.tenant !== me).length;

  it('a pooled query without the tenant filter returns the other tenants\' rows, and the leak count is exactly those rows', () => {
    const r = listOrders('pooled', me, { filtered: false, rowLevelSecurity: false });
    expect(r.rows).toHaveLength(ORDERS.length);
    expect(r.leaked).toBe(others);
    expect(r.leaked).toBe(r.rows.filter((x) => x.tenant !== me).length);
  });

  it('with the filter, or with row-level security on, nothing leaks, even when the query forgets the filter', () => {
    expect(listOrders('pooled', me, { filtered: true, rowLevelSecurity: false }).leaked).toBe(0);
    expect(listOrders('pooled', me, { filtered: false, rowLevelSecurity: true }).leaked).toBe(0);
    expect(listOrders('pooled', me, { filtered: false, rowLevelSecurity: true }).rows.every((x) => x.tenant === me)).toBe(true);
  });

  it('a schema or database per tenant only reaches the caller\'s own rows, with or without the switch', () => {
    for (const model of ['schema', 'database'] as const) {
      for (const rowLevelSecurity of [false, true]) {
        const r = listOrders(model, me, { filtered: false, rowLevelSecurity });
        expect(r.leaked).toBe(0);
        expect(r.rows).toEqual(ORDERS.filter((x) => x.tenant === me));
      }
    }
  });

  it('the cost table: the pooled design is cheapest per tenant and has the widest reach, and the database per tenant is the opposite', () => {
    expect(COSTS.pooled.costPerTenant).toBeLessThan(COSTS.schema.costPerTenant);
    expect(COSTS.schema.costPerTenant).toBeLessThan(COSTS.database.costPerTenant);
    expect(COSTS.pooled.leakReach(TENANT_COUNT)).toBe(TENANT_COUNT);
    expect(COSTS.database.sharedFate(TENANT_COUNT)).toBe(1);
    expect(COSTS.schema.sharedFate(TENANT_COUNT)).toBe(TENANT_COUNT);
    expect(COSTS.schema.migrations(TENANT_COUNT)).toBe(TENANT_COUNT);
    expect(SIM_TICKS).toBe(10_000);
  });
});
