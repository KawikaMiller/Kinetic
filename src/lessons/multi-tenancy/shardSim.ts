/**
 * Eight tenants on four shared shards, as a fixed-tick seeded simulation (core/simTick). A shard has
 * a few worker slots and a queue; a tenant sends requests at a rate and a cost per request. The
 * protections are switches: a per-tenant token bucket, a bulkhead (a per-tenant slot and queue
 * limit) and fair queueing (the tenant that has had the least service goes next). Every number is a
 * named constant and illustrative.
 *
 * Each tenant draws its arrivals from its own random stream, derived from the seed and its index, so
 * turning a protection on, moving a tenant or changing another tenant's rate never reshuffles
 * anyone's arrivals: the same seed is the same traffic. The per-tick states are plain numbers; the
 * requests live in a ledger per sim that only grows, and `init` builds a fresh one.
 */
import { poisson } from '../../core/distributions';
import { mulberry32, type Rnd } from '../../core/random';
import { percentile } from '../../core/sim';
import { createTickSim, type TickSim } from '../../core/simTick';
import { fullBucket, takeToken, type Bucket, type BucketParams } from '../../core/tokenBucket';

export const TICK_MS = 1;
export const SIM_MS = 10_000;
export const SIM_TICKS = SIM_MS / TICK_MS;
export const SHARDS = 4;
export const TENANTS = 8;
/** Worker slots on one shard: it does this many ms of work per ms. */
export const SLOTS = 4;
export const SHARD_CAPACITY = SLOTS * 1000;
export const SHARED_QUEUE = 40;
export const TENANT_QUEUE = 10;
export const CONC_LIMIT = 2;
export const RATE_LIMIT: BucketParams = { rate: 100, capacity: 10 };
export const CHEAP_COST_MS = 10;
export const EXPENSIVE_COST_MS = 200;
export const CALM_RATE = 50;
/** The noisy tenant's two ways of sending the same work: many cheap requests, or a few expensive ones. */
export const NOISY_CHEAP = { rate: 500, costMs: CHEAP_COST_MS } as const;
export const NOISY_EXPENSIVE = { rate: 25, costMs: EXPENSIVE_COST_MS } as const;
export const RATE_RANGE = { min: 5, max: 600, step: 5 } as const;
/** A tenant counts as hurt when its 99th-percentile latency passes this, or when it loses this share of its requests. */
export const P99_LIMIT_MS = 100;
export const ERROR_LIMIT = 0.01;
export const DEFAULT_SEED = 0;

export interface Tenant {
  /** Requests per second. */
  rate: number;
  /** ms of one slot's time per request. */
  costMs: number;
}

export interface Policy {
  rateLimit: boolean;
  bulkhead: boolean;
  fair: boolean;
}

export const NO_POLICY: Policy = { rateLimit: false, bulkhead: false, fair: false };

export interface SimConfig {
  seed: number;
  tenants: readonly Tenant[];
  /** Shard index of each tenant. */
  shardOf: readonly number[];
  policy: Policy;
}

export type Outcome = 'served' | 'throttled' | 'dropped';

interface ShardRuntime {
  running: { tenant: number; finish: number; req: number }[];
  queues: number[][];
  heads: number[];
  vt: number[];
}

interface Ledger {
  rTenant: number[];
  rArrive: number[];
  rFinish: number[];
  rOutcome: (Outcome | null)[];
  shards: ShardRuntime[];
  buckets: Bucket[];
  streams: Rnd[];
}

export interface SimState {
  tick: number;
  arrived: number;
  ledger: Ledger;
}

/** Arrival stream of tenant `i`: a function of the seed and the tenant alone. */
export const tenantStream = (seed: number, i: number): Rnd => mulberry32((seed * 0x9e3779b1 + (i + 1) * 0x85ebca6b) >>> 0);

const freshLedger = (c: SimConfig): Ledger => ({
  rTenant: [], rArrive: [], rFinish: [], rOutcome: [],
  shards: Array.from({ length: SHARDS }, () => ({ running: [], queues: c.tenants.map(() => []), heads: c.tenants.map(() => 0), vt: c.tenants.map(() => 0) })),
  buckets: c.tenants.map(() => fullBucket(RATE_LIMIT)),
  streams: c.tenants.map((_, i) => tenantStream(c.seed, i)),
});

export function createShardSim(c: SimConfig): TickSim<SimState> {
  return createTickSim<SimState>({
    seed: c.seed,
    init: () => ({ tick: 0, arrived: 0, ledger: freshLedger(c) }),
    step: (s, _rnd, tick) => stepShards(s, tick, c),
  });
}

const queuedOn = (sh: ShardRuntime, i: number) => sh.queues[i].length - sh.heads[i];
const queuedTotal = (sh: ShardRuntime) => sh.queues.reduce((a, q, i) => a + q.length - sh.heads[i], 0);
const runningOf = (sh: ShardRuntime, i: number) => sh.running.filter((r) => r.tenant === i).length;

function stepShards(s: SimState, tick: number, c: SimConfig): SimState {
  const L = s.ledger;
  const p = c.policy;
  let arrived = s.arrived;

  for (const sh of L.shards) {
    sh.running = sh.running.filter((r) => {
      if (r.finish > tick) return true;
      L.rFinish[r.req] = tick;
      L.rOutcome[r.req] = 'served';
      return false;
    });
  }

  c.tenants.forEach((t, i) => {
    const sh = L.shards[c.shardOf[i]];
    for (let n = poisson(L.streams[i], (t.rate * TICK_MS) / 1000); n > 0; n--) {
      const req = L.rTenant.length;
      L.rTenant.push(i);
      L.rArrive.push(tick);
      L.rFinish.push(-1);
      L.rOutcome.push(null);
      arrived++;
      const refuse = (o: Outcome) => {
        L.rOutcome[req] = o;
        L.rFinish[req] = tick;
      };
      if (p.rateLimit) {
        const r = takeToken(L.buckets[i], tick / 1000, RATE_LIMIT);
        L.buckets[i] = r.bucket;
        if (!r.allowed) {
          refuse('throttled');
          continue;
        }
      }
      if (p.bulkhead && queuedOn(sh, i) >= TENANT_QUEUE) {
        refuse('dropped');
        continue;
      }
      if (!p.bulkhead && queuedTotal(sh) >= SHARED_QUEUE) {
        if (!p.fair) {
          refuse('dropped');
          continue;
        }
        const longest = c.tenants.reduce((best, _, j) => (queuedOn(sh, j) > queuedOn(sh, best) ? j : best), 0);
        if (queuedOn(sh, i) >= queuedOn(sh, longest)) {
          refuse('dropped');
          continue;
        }
        const victim = sh.queues[longest].pop() as number;
        L.rOutcome[victim] = 'dropped';
        L.rFinish[victim] = tick;
      }
      if (p.fair && queuedOn(sh, i) === 0 && runningOf(sh, i) === 0) {
        const backlogged = c.tenants.flatMap((_, j) => (queuedOn(sh, j) > 0 ? [sh.vt[j]] : []));
        if (backlogged.length) sh.vt[i] = Math.max(sh.vt[i], Math.min(...backlogged));
      }
      sh.queues[i].push(req);
    }
  });

  for (const sh of L.shards) {
    while (sh.running.length < SLOTS) {
      let pick = -1;
      for (let i = 0; i < c.tenants.length; i++) {
        if (queuedOn(sh, i) === 0) continue;
        if (p.bulkhead && runningOf(sh, i) >= CONC_LIMIT) continue;
        if (pick < 0) pick = i;
        else if (p.fair ? sh.vt[i] < sh.vt[pick] : L.rArrive[sh.queues[i][sh.heads[i]]] < L.rArrive[sh.queues[pick][sh.heads[pick]]]) pick = i;
      }
      if (pick < 0) break;
      const req = sh.queues[pick][sh.heads[pick]++];
      sh.running.push({ tenant: pick, finish: tick + c.tenants[pick].costMs, req });
      if (p.fair) sh.vt[pick] += c.tenants[pick].costMs;
    }
  }
  return { tick, arrived, ledger: L };
}

// ── Reading a run ─────────────────────────────────────────────────────────────

export interface TenantStats {
  tenant: number;
  shard: number;
  arrivals: number;
  served: number;
  throttled: number;
  dropped: number;
  /** Requests still queued or running when the run ended. */
  pending: number;
  /** 99th-percentile latency of the served requests, ms; null when none was served. */
  p99Ms: number | null;
  /** Share of arrivals that were throttled or dropped. */
  errorRate: number;
  /** Work asked for, ms of slot time per second. */
  demandWork: number;
  /** Work done, ms of slot time per second. */
  servedWork: number;
  /** The max-min fair share of its shard's capacity given everyone's demand on it. */
  fairWork: number;
  hurt: boolean;
}

export interface Run {
  config: SimConfig;
  tenants: TenantStats[];
  /** Tenants other than `actor` that are hurt. */
  blast: (actor: number) => number;
  /** Per shard: demand and served work, ms per second, and the capacity. */
  shards: { demandWork: number; servedWork: number }[];
  state: SimState;
}

/** The max-min fair allocation of `capacity` to `demands`: nobody gets more than they asked for, and what is left is shared equally among those who want more. */
export function waterFill(demands: readonly number[], capacity: number): number[] {
  const out = demands.map(() => 0);
  const order = demands.map((_, i) => i).sort((a, b) => demands[a] - demands[b]);
  let left = capacity;
  order.forEach((i, rank) => {
    const share = left / (order.length - rank);
    out[i] = Math.min(demands[i], share);
    left -= out[i];
  });
  return out;
}

export function runShards(c: SimConfig, ticks = SIM_TICKS): Run {
  const sim = createShardSim(c);
  sim.run(ticks);
  return readRun(c, sim.state);
}

export function readRun(c: SimConfig, s: SimState): Run {
  const L = s.ledger;
  const seconds = s.tick / 1000;
  const per = c.tenants.map((t, i) => {
    const mine = L.rTenant.flatMap((tn, r) => (tn === i ? [r] : []));
    const served = mine.filter((r) => L.rOutcome[r] === 'served');
    const lat = served.map((r) => (L.rFinish[r] - L.rArrive[r]) * TICK_MS).sort((a, b) => a - b);
    const throttled = mine.filter((r) => L.rOutcome[r] === 'throttled').length;
    const dropped = mine.filter((r) => L.rOutcome[r] === 'dropped').length;
    return { t, i, arrivals: mine.length, served: served.length, throttled, dropped, pending: mine.length - served.length - throttled - dropped, p99: lat.length ? percentile(lat, 0.99) : null };
  });
  const demandWork = per.map((x) => (x.arrivals * x.t.costMs) / seconds);
  const fair = c.tenants.map(() => 0);
  for (let sh = 0; sh < SHARDS; sh++) {
    const ids = per.flatMap((x) => (c.shardOf[x.i] === sh ? [x.i] : []));
    waterFill(ids.map((i) => demandWork[i]), SHARD_CAPACITY).forEach((v, k) => (fair[ids[k]] = v));
  }
  const tenants: TenantStats[] = per.map((x) => {
    const errorRate = x.arrivals ? (x.throttled + x.dropped) / x.arrivals : 0;
    return {
      tenant: x.i, shard: c.shardOf[x.i], arrivals: x.arrivals, served: x.served, throttled: x.throttled, dropped: x.dropped, pending: x.pending, p99Ms: x.p99, errorRate,
      demandWork: demandWork[x.i], servedWork: (x.served * x.t.costMs) / seconds, fairWork: fair[x.i], hurt: (x.p99 ?? 0) > P99_LIMIT_MS || errorRate >= ERROR_LIMIT,
    };
  });
  return {
    config: c,
    tenants,
    blast: (actor) => tenants.filter((t) => t.hurt && t.tenant !== actor).length,
    shards: Array.from({ length: SHARDS }, (_, sh) => ({
      demandWork: tenants.filter((t) => t.shard === sh).reduce((a, t) => a + t.demandWork, 0),
      servedWork: tenants.filter((t) => t.shard === sh).reduce((a, t) => a + t.servedWork, 0),
    })),
    state: s,
  };
}

/** Admission times (ticks) of one tenant's requests that got past the rate limit, for the window check. */
export function admittedTicks(run: Run, tenant: number): number[] {
  const L = run.state.ledger;
  return L.rTenant.flatMap((tn, r) => (tn === tenant && L.rOutcome[r] !== 'throttled' ? [L.rArrive[r]] : []));
}

/** Most requests admitted in any window of `windowMs` (closed), from the admission times. */
export function mostInWindow(ticks: readonly number[], windowMs: number): number {
  let best = 0;
  let lo = 0;
  ticks.forEach((t, hi) => {
    while (ticks[lo] < t - windowMs / TICK_MS) lo++;
    best = Math.max(best, hi - lo + 1);
  });
  return best;
}
