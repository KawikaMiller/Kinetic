import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { controlCaption, healthCaption, meshCaption, registryCaption } from './captions';
import lesson from './index';
import { STYLE_REFRESH, healthConfig, initialControl, initialHealth, initialMesh, initialRegistry, meshActive, registryConfig } from './init';
import { actualEndpoints, attempts, callMs, certTimeline, knownEndpoints, observedSplit } from './mesh';
import { baseConfig } from './registry';
import { runRegistry } from './run';

const text = expectCaption;

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: the registry evicts orders-1 4.5 s after the crash, the last request goes to it 4.2 s after, and 5 requests go to the dead instance', () => {
    const r = runRegistry(registryConfig(initialRegistry()));
    expect(r.evictedAfterMs).toBe(4500);
    expect(r.stopAfterMs).toBe(4200);
    expect(r.sentToDead).toBe(5);
    expect(lesson.tryThis[0]).toContain('evicts it 4.5 s later');
    expect(lesson.tryThis[0]).toContain('4.2 s after the crash, and 5 requests');
    expect(lesson.tryThis[0]).toContain('8.52 s bound');
  });

  it('try-this 2: DNS-style refresh is 30 s, 23 requests go to the dead instance and the last is 20.4 s after the crash', () => {
    const r = runRegistry({ ...registryConfig(initialRegistry()), refreshMs: STYLE_REFRESH.dns });
    expect(STYLE_REFRESH.dns).toBe(30_000);
    expect(r.sentToDead).toBe(23);
    expect(r.stopAfterMs).toBe(20_400);
    expect(lesson.tryThis[1]).toContain('23 requests');
    expect(lesson.tryThis[1]).toContain('20.4 s after the crash');
  });

  it('try-this 3: with readiness honoured no request reaches the not-ready instance; ignoring it, 16 do and 16 errors come back', () => {
    expect(runRegistry(healthConfig(initialHealth())).sentWhileUnready).toBe(0);
    const ignored = runRegistry(healthConfig({ ...initialHealth(), honourReadiness: false }));
    expect(ignored.sentWhileUnready).toBe(16);
    expect(ignored.errors).toBe(16);
    expect(lesson.tryThis[2]).toContain('0 requests reach it');
    expect(lesson.tryThis[2]).toContain('16 do, and 16 error answers');
  });

  it('try-this 4: the mesh takes a call from 20 to 24 ms and the backend calls per request from 1.75 to 2.00', () => {
    const m = initialMesh();
    expect(m.mesh).toBe(false);
    expect(callMs(false)).toBe(20);
    expect(callMs(true)).toBe(24);
    expect(attempts(m.failProb, m.appRetries, 0).expected).toBeCloseTo(1.75, 12);
    expect(attempts(m.failProb, m.appRetries, m.meshRetries).expected).toBeCloseTo(1.99609375, 12);
    expect(lesson.tryThis[3]).toContain('from 20 ms to 24 ms');
    expect(lesson.tryThis[3]).toContain('2 calls per request instead of 1.75');
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
    expect([a.evictedAfterMs, a.stopAfterMs, a.sentToDead]).toEqual([b.evictedAfterMs, b.stopAfterMs, b.sentToDead]);
  });
});

describe('captions say what the run measured', () => {
  it('the registry caption quotes the eviction, the last request, the bound and the false evictions, across styles, losses and counts', () => {
    for (const over of [{}, { loss: 0.3, ttlBeats: 1 }, { crash: false }, { counts: { orders: 3, payments: 0, search: 3 } }, { style: 'lb' as const }, { refreshMs: 30_000 }]) {
      const r = runRegistry(registryConfig({ ...initialRegistry(), ...over }));
      const t = text(registryCaption(r));
      expect(t.includes('falsely evicted'), JSON.stringify(over)).toBe(r.falseEvictions > 0);
      expect(t.includes('no endpoints for payments')).toBe(over.counts !== undefined);
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
