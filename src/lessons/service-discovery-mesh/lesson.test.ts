import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { controlCaption, healthCaption, meshCaption, registryCaption } from './captions';
import lesson from './index';
import { STYLE_REFRESH, healthConfig, initialControl, initialHealth, initialMesh, initialRegistry, meshActive, registryConfig } from './init';
import { actualEndpoints, attempts, callMs, certTimeline, knownEndpoints, observedSplit } from './mesh';
import { BROKEN_SEED, HORIZON_MS, baseConfig } from './registry';
import { notReadyViolation, runRegistry, staleViolation } from './run';

const text = expectCaption;

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: the registry evicts orders-1 4.5 s after the crash, the cache drops it at 4.52 s, the last request that hit it was 4.2 s after, and 5 requests go to the dead instance', () => {
    const r = runRegistry(registryConfig(initialRegistry()));
    expect(r.evictedAfterMs).toBe(4500);
    // Hand check: the eviction sweep is at 14.5 s; the cache refreshes at 0.5 s + 2 s x k, so the first refresh the registry answers after the eviction is the one sent at 14.5 s, delivered 20 ms later (two 10 ms hops).
    expect(r.stoppedAfterMs).toBe(4520);
    expect(r.lastHitAfterMs).toBe(4200);
    expect(r.sentToDead).toBe(5);
    expect(lesson.tryThis[0]).toContain('evicts it 4.5 s later');
    expect(lesson.tryThis[0]).toContain('drops it 4.52 s after the crash');
    expect(lesson.tryThis[0]).toContain('4.2 s after, and 5 requests');
    expect(lesson.tryThis[0]).toContain('only heartbeats are lost');
    expect(lesson.tryThis[0]).toContain('8.52 s bound');
  });

  it('try-this 2: DNS-style refresh is 30 s, 23 requests go to the dead instance, the cache drops it at 20.52 s; caching twice as long never refreshes inside the 40 s run', () => {
    const r = runRegistry({ ...registryConfig(initialRegistry()), refreshMs: STYLE_REFRESH.dns });
    expect(STYLE_REFRESH.dns).toBe(30_000);
    expect(r.sentToDead).toBe(23);
    // Hand check: refreshes at 0.5 s and 30.5 s; the second is the first after the 14.5 s eviction, delivered at 30.52 s.
    expect(r.stoppedAfterMs).toBe(20_520);
    expect(r.lastHitAfterMs).toBe(20_400);
    // Twice as long is a 60 s refresh: the next one is at 60.5 s, past the end of the run, so the clients never stopped.
    const slow = runRegistry({ ...registryConfig(initialRegistry()), refreshMs: STYLE_REFRESH.dns, stubbornFactor: 2 });
    expect(slow.stoppedAfterMs).toBeNull();
    expect(slow.lastHitAfterMs).toBe(29_400);
    expect(500 + 60_000).toBeGreaterThan(HORIZON_MS);
    expect(lesson.tryThis[1]).toContain('23 requests');
    expect(lesson.tryThis[1]).toContain('drops it 20.5 s after the crash');
    expect(lesson.tryThis[1]).toContain('still sending');
  });

  it('try-this 3: with readiness honoured the cached listing lags and 2 requests reach the not-ready instance (0 with a lookup on every request); ignoring it, 15 do and 15 errors come back', () => {
    // Hand check: orders-1 is hit every 900 ms at multiples of 100 ms (..., 10.6, 11.5, 12.4 s, ...). It fails at 10.7 s and the cache refreshes at 12.5 s, so 11.5 and 12.4 are the two stale hits.
    const honoured = runRegistry(healthConfig(initialHealth()));
    expect(honoured.sentWhileUnready).toBe(2);
    expect(runRegistry(healthConfig({ ...initialHealth(), freshLookups: true })).sentWhileUnready).toBe(0);
    // Ignoring it, the hits are at 11.5 s + 0.9 s x i inside [10.7 s, 25 s): i = 0..14.
    const ignored = runRegistry(healthConfig({ ...initialHealth(), honourReadiness: false }));
    expect(ignored.sentWhileUnready).toBe(Array.from({ length: 40 }, (_, i) => 11_500 + 900 * i).filter((t) => t >= 10_700 && t < 25_000).length);
    expect(ignored.sentWhileUnready).toBe(15);
    expect(ignored.errors).toBe(15);
    expect(lesson.tryThis[2]).toContain('2 requests reach it');
    expect(lesson.tryThis[2]).toContain('15 do, and 15 error answers');
  });

  it('try-this 4: the mesh takes a call from 20 to 24 ms and the backend calls per request from 1.75 to 2.00', () => {
    const m = initialMesh();
    expect(m.mesh).toBe(false);
    expect(callMs(false)).toBe(20);
    expect(callMs(true)).toBe(24);
    expect(attempts(m.failProb, m.appRetries, 0).expected).toBeCloseTo(1.75, 12);
    expect(attempts(m.failProb, m.appRetries, m.meshRetries).expected).toBeCloseTo(1.99609375, 12);
    expect(lesson.tryThis[3]).toContain('from 20 ms to 24 ms');
    // Worst case: (1 + 2 app retries) x (1 + 2 mesh retries) = 9 against 3 without the mesh.
    expect(lesson.tryThis[3]).toContain('up to 9 calls per request instead of 3 (2 on average instead of 1.75)');
  });

  it('try-this 5: at the control-plane defaults the proxies know 3 of 4 endpoints at minute 150, orders and payments have expired certificates, the first at minute 120', () => {
    const c = initialControl();
    const outage = { start: c.startMin, length: c.lengthMin };
    expect(knownEndpoints(outage, c.nowMin)).toBe(3);
    expect(actualEndpoints(c.nowMin)).toBe(4);
    const certs = certTimeline(c.lifetimeMin, outage);
    expect(certs.gaps.filter((g) => g.from <= c.nowMin && g.to > c.nowMin).map((g) => g.workload)).toEqual(['orders', 'payments']);
    expect(Math.min(...certs.gaps.map((g) => g.from))).toBe(120);
    expect(lesson.tryThis[4]).toContain('3 of the 4 endpoints');
    expect(lesson.tryThis[4]).toContain('orders and payments');
    expect(lesson.tryThis[4]).toContain('minute 120');
  });
});

describe('hidden controls do not feed visible numbers', () => {
  it('without a mesh, the mesh features are off whatever their switches say', () => {
    const m = { ...initialMesh(), mesh: false, mtls: true, split: true, retries: true, meshRetries: 4 };
    expect(meshActive(m)).toEqual({ mtls: false, split: false, meshRetries: 0 });
    expect(meshActive({ ...m, mesh: true })).toEqual({ mtls: true, split: true, meshRetries: 4 });
    expect(meshActive({ ...m, mesh: true, retries: false }).meshRetries).toBe(0);
  });

  it('the DNS "caches twice as long" switch matters only for the DNS style', () => {
    const base = initialRegistry();
    expect(registryConfig({ ...base, stubborn: true }).stubbornFactor).toBe(1);
    expect(registryConfig({ ...base, style: 'dns', stubborn: true }).stubbornFactor).toBe(2);
    expect(registryConfig({ ...base, style: 'lb' }).cacheOwner).toBe('lb');
  });

  it('the seed changes the lost heartbeats and nothing else when there is no loss', () => {
    const a = runRegistry(registryConfig({ ...initialRegistry(), seed: 1 }));
    const b = runRegistry(registryConfig({ ...initialRegistry(), seed: 2 }));
    expect([a.evictedAfterMs, a.stoppedAfterMs, a.lastHitAfterMs, a.sentToDead]).toEqual([b.evictedAfterMs, b.stoppedAfterMs, b.lastHitAfterMs, b.sentToDead]);
  });
});

describe('the broken modes are on screen with a pinned seed', () => {
  it('a registry that never evicts breaks the stale-route invariant on the pinned seed with a message that names the late request; the normal one does not', () => {
    const v = staleViolation(registryConfig({ ...initialRegistry(), neverEvict: true, seed: BROKEN_SEED }));
    expect(v).not.toBeNull();
    expect(v?.message).toContain('a request went to orders-1');
    expect(v?.time).toBeGreaterThan(10_000);
    expect(staleViolation(registryConfig(initialRegistry()))).toBeNull();
    expect(BROKEN_SEED).toBe(0);
  });

  it('a registry that ignores readiness lists the not-ready instance to a fresh lookup on the pinned seed; honouring it does not', () => {
    const base = { ...initialHealth(), freshLookups: true, seed: BROKEN_SEED };
    expect(notReadyViolation(healthConfig({ ...base, honourReadiness: false }))?.message).toContain('orders-1');
    expect(notReadyViolation(healthConfig(base))).toBeNull();
  });
});

describe('captions say what the run measured', () => {
  it('the registry caption quotes the eviction, the last request, the bound and the false evictions, across styles, losses and counts', () => {
    for (const over of [{}, { loss: 0.3, ttlBeats: 1 }, { crash: false }, { counts: { orders: 3, payments: 0, search: 3 } }, { style: 'lb' as const }, { refreshMs: 30_000 }]) {
      const r = runRegistry(registryConfig({ ...initialRegistry(), ...over }));
      const t = text(registryCaption(r));
      expect(t.includes('falsely evicted'), JSON.stringify(over)).toBe(r.falseEvictions > 0);
      expect(t.includes('no endpoints for payments')).toBe(over.counts !== undefined);
      if (over.crash !== false && r.evictedAfterMs !== null) expect(t.includes('had not refreshed')).toBe(r.stoppedAfterMs === null);
      if (r.evictedAfterMs !== null) expect(t).toContain(`evicted it ${(r.evictedAfterMs / 1000).toPrecision(3).replace(/\.?0+$/, '')} s later`);
    }
  });

  it('the health caption names the requests that reached the instance and the errors, for both registry settings', () => {
    for (const honourReadiness of [true, false]) {
      const r = runRegistry(healthConfig({ ...initialHealth(), honourReadiness }));
      const t = text(healthCaption(r));
      expect(t).toContain(`${r.sentWhileUnready} request`);
      expect(t.includes('ignores readiness')).toBe(!honourReadiness);
    }
  });

  it('the mesh caption states the hop, the split against its margin and the retry multiplication', () => {
    const split = observedSplit(0, 10);
    const att = attempts(0.5, 2, 2);
    const t = text(meshCaption(true, split, att, 2, 2));
    expect(t).toContain('24 ms');
    expect(t).toContain('10.4%');
    expect(t).toContain('0.9 points');
    expect(t).toContain('9 at worst');
    expect(t).toContain('the retries multiply');
    expect(text(meshCaption(false, null, attempts(0.5, 2, 0), 2, 0))).toContain('No mesh: a call takes 20 ms');
  });

  it('the control-plane caption follows the minute: away or up, endpoints known, and which certificates have expired', () => {
    const outage = { start: 30, length: 150 };
    const certs = certTimeline(120, outage);
    expect(text(controlCaption(outage, certs, 100))).toContain('control plane is away');
    expect(text(controlCaption(outage, certs, 100))).toContain('every certificate is still valid');
    expect(text(controlCaption(outage, certs, 150))).toContain('expired for orders, payments');
    expect(text(controlCaption(outage, certs, 200))).toContain('control plane is up');
    expect(text(controlCaption(outage, certs, 200))).toContain('Proxies know 4 of the 4');
  });

  it('the opening configuration is the base configuration with the crash on', () => {
    expect(registryConfig(initialRegistry())).toEqual({ ...baseConfig(0) });
  });
});
