import { describe, expect, it } from 'vitest';
import { checkInvariants } from '../../core/distSim';
import { mulberry32 } from '../../core/random';
import {
  APP_CALL_MS, BASE_ENDPOINTS, CANARY_RANGE, FIRST_ISSUE_MIN, HORIZON_MIN, LIFETIME_RANGE, NEW_INSTANCE_MIN, RENEW_FRACTION, RETRY_MIN, SPLIT_REQUESTS, WORKLOADS,
  actualEndpoints, attempts, callMs, certTimeline, certValidAt, extraHopMs, failingAt, inOutage, knownEndpoints, observedSplit, type Outage,
} from './mesh';
import {
  HEARTBEAT_MS, HORIZON_MS, LATENCY_MS, READY_AGAIN_MS, SERVICES, SWEEP_MS, UNREADY_AT_MS, VICTIM, baseConfig, buildCluster, effectiveRefreshMs, instanceIds, noNotReadyListed,
  noStaleRoute, staleBound, ttlMs, type RegistryConfig,
} from './registry';
import { emptyServices, runRegistry } from './run';

const cfg = (over: Partial<RegistryConfig> = {}, seed = 0): RegistryConfig => ({ ...baseConfig(seed), ...over });

describe('the registry on distSim', () => {
  it('is deterministic by seed, and the instance list is every service times its count', () => {
    const a = runRegistry(cfg({ loss: 0.2 }, 3));
    expect(runRegistry(cfg({ loss: 0.2 }, 3)).cluster.trace).toEqual(a.cluster.trace);
    expect(runRegistry(cfg({ loss: 0.2 }, 4)).cluster.trace).not.toEqual(a.cluster.trace);
    expect(instanceIds(baseConfig().counts)).toHaveLength(9);
    expect(instanceIds({ orders: 1, payments: 0, search: 2 })).toEqual(['orders-1', 'search-1', 'search-2']);
  });

  it('the hand numbers: TTL is 3 heartbeats = 6 s, the stale bound is TTL + T + sweep + two wire hops', () => {
    const c = cfg();
    expect(ttlMs(c)).toBe(3 * HEARTBEAT_MS);
    expect(effectiveRefreshMs(c)).toBe(2000);
    expect(staleBound(c)).toBe(6000 + 2000 + SWEEP_MS + 2 * LATENCY_MS);
    expect(staleBound(cfg({ stubbornFactor: 2 }))).toBe(6000 + 4000 + SWEEP_MS + 2 * LATENCY_MS);
  });

  it('with no loss, the crashed instance is evicted between TTL minus one heartbeat and TTL plus one sweep after the crash, and nothing live is evicted', () => {
    const r = runRegistry(cfg());
    expect(r.evictedAfterMs).not.toBeNull();
    expect(r.evictedAfterMs as number).toBeGreaterThan(ttlMs(cfg()) - HEARTBEAT_MS - 1);
    expect(r.evictedAfterMs as number).toBeLessThanOrEqual(ttlMs(cfg()) + SWEEP_MS + LATENCY_MS);
    expect(r.falseEvictions).toBe(0);
    expect(r.sentToDead).toBeGreaterThan(0);
    expect(r.stopAfterMs as number).toBeLessThanOrEqual(staleBound(cfg()));
    expect(r.requests).toBeGreaterThan(150);
  });

  it('a longer cache refresh keeps sending to the dead instance longer, on 20 seeds', () => {
    const mean = (refreshMs: number) => Array.from({ length: 20 }, (_, s) => runRegistry(cfg({ refreshMs }, s)).sentToDead).reduce((a, b) => a + b, 0) / 20;
    expect(mean(500)).toBeLessThanOrEqual(mean(2000));
    expect(mean(2000)).toBeLessThan(mean(8000));
  });

  it('a service with no instances shows "no endpoints": its requests fail visibly and the others carry on', () => {
    const r = runRegistry(cfg({ counts: { orders: 3, payments: 0, search: 3 }, crash: false }));
    expect(emptyServices(cfg({ counts: { orders: 3, payments: 0, search: 3 } }))).toEqual(['payments']);
    expect(r.noEndpoint).toBeGreaterThan(50);
    expect(r.requests).toBeGreaterThan(100);
    const none = runRegistry(cfg({ counts: { orders: 0, payments: 0, search: 0 }, crash: false }));
    expect(none.requests).toBe(0);
    expect(none.noEndpoint).toBeGreaterThan(150);
  });

  it('the load balancer and DNS-style resolvers obey the same bound', () => {
    for (const over of [{ cacheOwner: 'lb' as const }, { refreshMs: 8000 }, { stubbornFactor: 2, refreshMs: 3000 }]) {
      for (let seed = 0; seed < 10; seed++) {
        const c = cfg(over, seed);
        const r = runRegistry(c);
        expect(r.stopAfterMs ?? 0, JSON.stringify(over)).toBeLessThanOrEqual(staleBound(c));
      }
    }
  });
});

describe('invariant: no request is routed to an instance later than TTL + T (and the sweep and the wire) after it stopped', () => {
  const faulted = (seed: number): RegistryConfig =>
    cfg({ loss: [0, 0.1, 0.2, 0.3][seed % 4], duplicate: seed % 3 === 0 ? 0.1 : 0, jitterMs: seed % 2 ? 5 : 0, crashAtMs: 3000 + ((seed * 397) % 12_000), ttlBeats: 2 + (seed % 4), refreshMs: 1000 + 500 * (seed % 6) }, seed);

  it('holds at every step on 200 seeds with delay jitter, heartbeat loss, duplication and a crash at a different time on each', () => {
    let exercised = 0;
    for (let seed = 0; seed < 200; seed++) {
      const c = faulted(seed);
      const { cluster } = buildCluster(c);
      const result = checkInvariants(cluster, [noStaleRoute(c)], { until: HORIZON_MS });
      expect(result.ok, `seed ${seed}: ${result.ok ? '' : result.message}`).toBe(true);
      if (runRegistry(c).sentToDead > 0) exercised++;
    }
    expect(exercised).toBeGreaterThan(150);
  });

  it('is not vacuous: the bound is tight enough that a tenth of it is broken by a registry that waits too long to evict', () => {
    const c = cfg();
    const run = runRegistry(c);
    expect(run.stopAfterMs as number).toBeGreaterThan(ttlMs(c) / 2);
    expect(staleBound(c)).toBeLessThan(2 * (run.stopAfterMs as number) + 6000);
  });

  it('broken mode: a registry that never evicts breaks it on every seed that has a crash; the lowest is seed 0, and the trace shows the late request', () => {
    const broken: number[] = [];
    for (let seed = 0; seed < 200; seed++) {
      const c = { ...faulted(seed), neverEvict: true };
      const result = checkInvariants(buildCluster(c).cluster, [noStaleRoute(c)], { until: HORIZON_MS });
      if (!result.ok) broken.push(seed);
      if (seed === 0) {
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.message).toContain(`a request went to ${VICTIM}`);
          expect(result.trace.length).toBeGreaterThan(50);
          expect(result.trace[result.trace.length - 1].t).toBeCloseTo(result.time, 6);
        }
      }
    }
    expect(broken).toHaveLength(200);
    expect(broken[0]).toBe(0);
  });

  it('without a crash there is nothing to violate, whatever the registry does', () => {
    const c = cfg({ crash: false, neverEvict: true });
    expect(checkInvariants(buildCluster(c).cluster, [noStaleRoute(c)], { until: HORIZON_MS }).ok).toBe(true);
  });
});

describe('false evictions: a live instance is evicted exactly when its heartbeats go quiet for longer than the TTL', () => {
  /** An independent count from the trace: gaps between arrivals longer than the TTL that a registry sweep fell inside. */
  function expectedEvictions(c: RegistryConfig, until: number): number {
    const run = runRegistry({ ...c, crash: false }, until);
    const arrivals = new Map<string, number[]>();
    for (const r of run.cluster.trace) {
      if (r.kind === 'deliver' && r.to === 'registry' && (r.payload?.type === 'register' || r.payload?.type === 'heartbeat')) {
        const id = (r.payload as { id: string }).id;
        arrivals.set(id, [...(arrivals.get(id) ?? []), r.t]);
      }
    }
    const ttl = ttlMs(c);
    let count = 0;
    for (const times of arrivals.values()) {
      times.forEach((t, i) => {
        const next = times[i + 1] ?? Infinity;
        const firstSweep = (Math.floor((t + ttl) / SWEEP_MS) + 1) * SWEEP_MS;
        if (firstSweep < next && firstSweep <= until) count++;
      });
    }
    return count;
  }

  it('matches the trace recount on 50 seeds at 30% loss, for TTLs of 1, 2 and 3 heartbeats', () => {
    for (const ttlBeats of [1, 2, 3]) {
      for (let seed = 0; seed < 50; seed++) {
        const c = cfg({ ttlBeats, loss: 0.3, crash: false }, seed);
        expect(runRegistry(c).falseEvictions, `ttl ${ttlBeats} seed ${seed}`).toBe(expectedEvictions(c, HORIZON_MS));
      }
    }
  });

  it('with no loss nothing is falsely evicted, even at a TTL of one heartbeat', () => {
    for (let seed = 0; seed < 20; seed++) expect(runRegistry(cfg({ ttlBeats: 1, crash: false }, seed)).falseEvictions).toBe(0);
  });

  it('k heartbeats of TTL need k lost in a row: the share of k-long windows that are all lost is p^k, within sampling error, over 200 seeds', () => {
    const p = 0.3;
    for (const k of [1, 2, 3]) {
      let windows = 0;
      let allLost = 0;
      for (let seed = 0; seed < 200; seed++) {
        const run = runRegistry(cfg({ loss: p, crash: false }, seed));
        const byInstance = new Map<string, boolean[]>();
        for (const b of run.log.beats) byInstance.set(b.id, [...(byInstance.get(b.id) ?? []), b.lost]);
        for (const seq of byInstance.values()) {
          for (let i = 0; i + k <= seq.length; i++) {
            windows++;
            if (seq.slice(i, i + k).every(Boolean)) allLost++;
          }
        }
      }
      const q = p ** k;
      const se = Math.sqrt((q * (1 - q)) / (windows / k));
      expect(Math.abs(allLost / windows - q), `k ${k}`).toBeLessThan(4 * se);
    }
  });
});

describe('health feeds the registry: not ready means out of rotation, with no restart', () => {
  const unready = (over: Partial<RegistryConfig> = {}, seed = 0) => cfg({ crash: false, unready: true, ...over }, seed);

  it('honouring readiness takes the instance out of rotation within about one cache refresh, and it comes back; ignoring it leaves it in until it recovers', () => {
    const honour = runRegistry(unready());
    const ignore = runRegistry(unready({ honourReadiness: false }));
    expect(honour.unreadyStopAfterMs ?? 0).toBeLessThanOrEqual(effectiveRefreshMs(unready()) + 3 * LATENCY_MS);
    expect(ignore.unreadyStopAfterMs as number).toBeGreaterThan(READY_AGAIN_MS - UNREADY_AT_MS - 2000);
    expect(honour.sentWhileUnready).toBeLessThan(ignore.sentWhileUnready / 3);
    expect(honour.errors).toBeLessThan(ignore.errors);
    const after = honour.cluster.trace.filter((r) => r.kind === 'send' && r.to === VICTIM && r.payload?.type === 'req' && r.t > READY_AGAIN_MS);
    expect(after.length).toBeGreaterThan(0);
  });

  it('the instance never restarts: no crash or restart row in the trace', () => {
    const rows = runRegistry(unready()).cluster.trace;
    expect(rows.some((r) => r.kind === 'crash' || r.kind === 'restart')).toBe(false);
  });

  it('invariant: with a fresh lookup on every request, no listing contains an instance the registry has marked not ready, on 200 seeds', () => {
    for (let seed = 0; seed < 200; seed++) {
      const c = unready({ freshLookups: true, loss: [0, 0.1, 0.2][seed % 3], duplicate: seed % 2 ? 0.1 : 0 }, seed);
      const result = checkInvariants(buildCluster(c).cluster, [noNotReadyListed], { until: HORIZON_MS });
      expect(result.ok, `seed ${seed}`).toBe(true);
    }
  });

  it('broken mode: a registry that ignores readiness lists the not-ready instance on every seed; the lowest seed is 0', () => {
    let broken = 0;
    let first = -1;
    for (let seed = 0; seed < 200; seed++) {
      const c = unready({ freshLookups: true, honourReadiness: false, loss: [0, 0.1, 0.2][seed % 3] }, seed);
      const result = checkInvariants(buildCluster(c).cluster, [noNotReadyListed], { until: HORIZON_MS });
      if (!result.ok) {
        broken++;
        if (first < 0) first = seed;
        if (seed === 0) expect(result.message).toContain(`listed ${VICTIM}`);
      }
    }
    expect(broken).toBe(200);
    expect(first).toBe(0);
  });

  it('SERVICES order and counts are what the scene says', () => {
    expect([...SERVICES]).toEqual(['orders', 'payments', 'search']);
  });
});

describe('traffic splitting', () => {
  it('the observed canary share is within three standard errors of the weight over 10,000 requests, for 4 weights on 10 seeds', () => {
    for (const pct of [5, 10, 25, 50]) {
      for (let seed = 0; seed < 10; seed++) {
        const s = observedSplit(seed, pct);
        expect(s.canary + s.stable).toBe(SPLIT_REQUESTS);
        expect(Math.abs(s.observedPct - s.expectedPct), `${pct}% seed ${seed}`).toBeLessThanOrEqual(s.threeSePct);
      }
    }
  });

  it('the three-standard-error margin at 10% is 3 x sqrt(0.1 x 0.9 / 10,000) = 0.9 points; at 0% nothing is routed to the canary', () => {
    expect(observedSplit(0, 10).threeSePct).toBeCloseTo(0.9, 12);
    expect(observedSplit(3, 0).canary).toBe(0);
    expect(CANARY_RANGE.default).toBe(10);
  });
});

describe('retries that stack', () => {
  it('hand cases: 2 app retries x 2 mesh retries is 9 calls to the backend when everything fails; no failures is 1', () => {
    expect(attempts(1, 2, 2)).toEqual({ expected: 9, worst: 9 });
    expect(attempts(0, 2, 2)).toEqual({ expected: 1, worst: 9 });
    expect(attempts(0.5, 0, 0).expected).toBe(1);
    expect(attempts(1, 0, 3).worst).toBe(4);
  });

  it('the closed form matches a 300,000-trial seeded simulation of the two retry loops, within 1%', () => {
    const rnd = mulberry32(9);
    for (const [f, ra, rm] of [[0.5, 2, 2], [0.3, 1, 3], [0.8, 3, 1], [0.6, 0, 2]] as const) {
      let calls = 0;
      const trials = 300_000;
      for (let t = 0; t < trials; t++) {
        for (let a = 0; a <= ra; a++) {
          let ok = false;
          for (let m = 0; m <= rm && !ok; m++) {
            calls++;
            ok = rnd() >= f;
          }
          if (ok) break;
        }
      }
      expect(Math.abs(calls / trials - attempts(f, ra, rm).expected) / attempts(f, ra, rm).expected, `${f},${ra},${rm}`).toBeLessThan(0.01);
    }
  });

  it('stacking multiplies: more attempts than either layer alone whenever there is something to retry', () => {
    const both = attempts(0.5, 2, 2).expected;
    expect(both).toBeGreaterThan(attempts(0.5, 2, 0).expected);
    expect(both).toBeGreaterThan(attempts(0.5, 0, 2).expected);
  });
});

describe('the extra hop', () => {
  it('a mesh adds two sidecar traversals to each call, and no mesh adds none', () => {
    expect(extraHopMs(false)).toBe(0);
    expect(extraHopMs(true)).toBe(4);
    expect(callMs(false)).toBe(APP_CALL_MS);
    expect(callMs(true)).toBe(APP_CALL_MS + 4);
  });
});

describe('certificates and the control plane', () => {
  const NO_OUTAGE: Outage = { start: 0, length: 0 };

  /** A minute-by-minute oracle: renew when due and the control plane is up, and count the minutes a workload has no valid certificate. */
  function bruteGapMinutes(lifetime: number, outage: Outage): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    for (const w of WORKLOADS) {
      let expiry = FIRST_ISSUE_MIN[w] + lifetime;
      let attempt = FIRST_ISSUE_MIN[w] + lifetime * RENEW_FRACTION;
      const bad: number[] = [];
      for (let t = FIRST_ISSUE_MIN[w]; t < HORIZON_MIN; t++) {
        if (t === attempt) {
          if (inOutage(outage, t)) attempt += RETRY_MIN;
          else {
            expiry = Math.max(expiry, t + lifetime);
            attempt = t + lifetime * RENEW_FRACTION;
          }
        }
        if (t >= expiry) bad.push(t);
      }
      out[w] = bad;
    }
    return out;
  }

  it('matches the minute-by-minute oracle for every lifetime and a grid of outages: the same minutes with no valid certificate', () => {
    for (let lifetime = LIFETIME_RANGE.min; lifetime <= LIFETIME_RANGE.max; lifetime += LIFETIME_RANGE.step) {
      for (const start of [0, 30, 90, 200]) {
        for (const length of [0, 30, 75, 150, 240]) {
          const outage = { start, length };
          const run = certTimeline(lifetime, outage);
          const brute = bruteGapMinutes(lifetime, outage);
          for (const w of WORKLOADS) {
            const minutes: number[] = [];
            for (const g of run.gaps.filter((x) => x.workload === w)) for (let t = g.from; t < Math.min(g.to, HORIZON_MIN); t++) minutes.push(t);
            expect(minutes, `L ${lifetime} outage ${start}+${length} ${w}`).toEqual(brute[w]);
          }
        }
      }
    }
  });

  it('a certificate stops being valid at issued + lifetime exactly, and with no outage nobody ever has a gap', () => {
    const run = certTimeline(120, NO_OUTAGE);
    for (const c of run.certs) expect(c.expiresAt - c.issuedAt).toBe(120);
    expect(run.gaps).toEqual([]);
    for (const w of WORKLOADS) {
      const first = run.certs.find((c) => c.workload === w)!;
      expect(certValidAt(run, w, first.expiresAt - 1)).toBe(true);
      expect(certValidAt(run, w, first.expiresAt)).toBe(run.certs.some((c) => c.workload === w && c !== first && c.issuedAt <= first.expiresAt && first.expiresAt < c.expiresAt));
    }
    expect(run.certs.filter((c) => c.workload === 'orders')[1].issuedAt).toBe(60);
  });

  it('an outage shorter than half a lifetime breaks nothing; one long enough lets certificates expire, and calls fail from that minute', () => {
    expect(certTimeline(120, { start: 30, length: 45 }).gaps).toEqual([]);
    const long = certTimeline(120, { start: 30, length: 150 });
    expect(long.gaps.length).toBeGreaterThan(0);
    const g = long.gaps.find((x) => x.workload === 'orders')!;
    expect(g.from).toBe(120);
    expect(failingAt(long, g.from)).toContain('orders');
    expect(failingAt(long, g.from - 1)).not.toContain('orders');
    expect(long.stalled.length).toBeGreaterThan(0);
  });

  it('while the control plane is away the known endpoints never change; they catch up the minute it returns', () => {
    const outage = { start: 30, length: 150 };
    const known = Array.from({ length: outage.length }, (_, i) => knownEndpoints(outage, outage.start + i));
    expect(new Set(known).size).toBe(1);
    expect(known[0]).toBe(BASE_ENDPOINTS);
    expect(actualEndpoints(NEW_INSTANCE_MIN)).toBe(BASE_ENDPOINTS + 1);
    expect(knownEndpoints(outage, outage.start + outage.length)).toBe(BASE_ENDPOINTS + 1);
    expect(knownEndpoints({ start: 0, length: 0 }, NEW_INSTANCE_MIN)).toBe(BASE_ENDPOINTS + 1);
  });
});
