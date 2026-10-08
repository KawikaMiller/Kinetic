import { describe, expect, it } from 'vitest';
import { cacheKey, contentFor, DEPENDS_ON, KEY_PARTS, keyProblems, makeRequests, REQUESTS, simulateKeys, USERS, type KeyChoice, type PageKind } from './keys';
import { expireHotKey, expireMany, LOAD_TIME } from './stampede';
import { makeEvents, simulateTtl, TTL_GRID, ttlCurve, WORKLOAD, type Event } from './ttl';

describe('the seeded workload', () => {
  const events = makeEvents();
  it('is the same every time and time-ordered', () => {
    expect(makeEvents().slice(0, 50)).toEqual(events.slice(0, 50));
    for (let i = 1; i < events.length; i++) expect(events[i].t).toBeGreaterThanOrEqual(events[i - 1].t);
    expect(events.filter((e) => e.kind === 'read')).toHaveLength(WORKLOAD.reads);
  });
  it('reads follow a Zipf curve: the hottest key takes far more than its fair share', () => {
    const counts = new Map<number, number>();
    for (const e of events) if (e.kind === 'read') counts.set(e.key, (counts.get(e.key) ?? 0) + 1);
    expect(counts.get(0)! / WORKLOAD.reads).toBeGreaterThan(0.15);
    expect(counts.get(0)!).toBeGreaterThan(counts.get(50)! * 10);
  });
  it('writes land on every key at about the configured rate', () => {
    const horizon = events.at(-1)!.t;
    const writes = events.filter((e) => e.kind === 'write').length;
    const expected = WORKLOAD.keys * WORKLOAD.writeRate * horizon;
    expect(writes).toBeGreaterThan(expected * 0.9);
    expect(writes).toBeLessThan(expected * 1.1);
  });
});

/** The same replay, worked out per key after the fact instead of event by event. */
function reference(events: readonly Event[], ttl: number) {
  let reads = 0;
  let hits = 0;
  let stale = 0;
  for (let key = 0; key < WORKLOAD.keys; key++) {
    const mine = events.filter((e) => e.key === key);
    const writes = mine.filter((e) => e.kind === 'write').map((e) => e.t);
    let filledAt = -Infinity;
    for (const e of mine) {
      if (e.kind !== 'read') continue;
      reads += 1;
      if (e.t < filledAt + ttl) {
        hits += 1;
        // stale when some write landed after the entry was stored and before this read
        if (writes.some((w) => w > filledAt && w < e.t)) stale += 1;
      } else filledAt = e.t;
    }
  }
  return { reads, hits, stale };
}

describe('the TTL replay', () => {
  const events = makeEvents();
  it('matches an independent per-key reference exactly, for every TTL on the grid', () => {
    for (const ttl of TTL_GRID) {
      const got = simulateTtl(events, ttl);
      const want = reference(events, ttl);
      expect({ reads: got.reads, hits: got.hits, stale: got.stale }, `ttl ${ttl}`).toEqual(want);
    }
  });
  it('never serves a stale value for longer than the TTL', () => {
    for (const ttl of TTL_GRID) expect(simulateTtl(events, ttl).maxStaleness).toBeLessThanOrEqual(ttl);
  });
  it('a longer TTL never lowers the hit rate on the same stream', () => {
    const rates = TTL_GRID.map((ttl) => simulateTtl(events, ttl).hitRate);
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThanOrEqual(rates[i - 1]);
  });
  it('the trade-off is real: hit rate climbs with the TTL, and so do the stale reads', () => {
    const { curve } = ttlCurve();
    const shortest = curve[0];
    const longest = curve.at(-1)!;
    expect(longest.hitRate).toBeGreaterThan(shortest.hitRate + 0.3);
    expect(shortest.staleRate).toBeLessThan(0.01);
    expect(longest.staleRate).toBeGreaterThan(0.02);
    expect(longest.staleRate).toBeGreaterThan(shortest.staleRate);
    expect(curve.length).toBe(TTL_GRID.length);
  });
  it('with no TTL at all (never expires) every key goes stale after its first write and stays that way', () => {
    const forever = simulateTtl(events, 1e9);
    expect(forever.hits).toBe(forever.reads - WORKLOAD.keys);
    expect(forever.stale).toBeGreaterThan(forever.hits * 0.3);
  });
  it('is cached: the curve is computed once', () => {
    expect(ttlCurve()).toBe(ttlCurve());
  });
});

describe('a hot key expiring', () => {
  it('without coalescing every request that arrives during the load goes to the database; with it, one load', () => {
    for (const rate of [20, 100, 400]) {
      for (let seed = 1; seed <= 20; seed++) {
        const herd = expireHotKey(rate, false, seed);
        const single = expireHotKey(rate, true, seed);
        expect(herd.loads).toBe(herd.misses);
        expect(single.loads).toBe(1);
        expect(single.misses).toBe(herd.misses);
        expect(single.waited).toBe(single.misses - 1);
        expect(herd.loadStarts).toHaveLength(herd.loads);
        expect(single.loads).toBeLessThanOrEqual(herd.loads);
        for (const t of herd.loadStarts) expect(t - herd.loadStarts[0]).toBeLessThan(LOAD_TIME);
      }
    }
  });
  it('the herd grows with the request rate: about 1 + rate x load time loads, over many seeds', () => {
    for (const rate of [20, 100, 400]) {
      const loads = Array.from({ length: 300 }, (_, i) => expireHotKey(rate, false, i + 1).loads);
      const mean = loads.reduce((a, b) => a + b, 0) / loads.length;
      expect(mean).toBeGreaterThan((1 + rate * LOAD_TIME) * 0.9);
      expect(mean).toBeLessThan((1 + rate * LOAD_TIME) * 1.1);
    }
  });
});

describe('many keys expiring together', () => {
  it('every key is reloaded exactly once, whatever the jitter', () => {
    for (const jitter of [0, 0.1, 0.2, 0.5]) expect(expireMany(200, 60, jitter, 3).loads).toBe(200);
  });
  it('with one shared TTL they all land in the same second; jitter spreads them out', () => {
    const same = expireMany(200, 60, 0, 3);
    expect(same.peak).toBe(200);
    expect(same.perSecond.filter((n) => n > 0)).toHaveLength(1);
    const jittered = expireMany(200, 60, 0.2, 3);
    expect(jittered.peak).toBeLessThan(25);
    expect(jittered.peak).toBeLessThan(same.peak / 5);
    expect(jittered.perSecond.filter((n) => n > 0).length).toBeGreaterThan(15);
  });
  it('jittered expiries stay inside the TTL plus or minus the jitter', () => {
    const run = expireMany(500, 60, 0.2, 9);
    run.perSecond.forEach((n, second) => {
      if (n > 0) {
        expect(second).toBeGreaterThanOrEqual(48);
        expect(second).toBeLessThanOrEqual(72);
      }
    });
  });
});

describe('what goes in the key', () => {
  const requests = makeRequests();
  const choice = (parts: Partial<KeyChoice>): KeyChoice => ({ user: false, locale: false, version: false, ...parts });
  const kinds: PageKind[] = ['catalog', 'account'];

  it('the request stream is seeded and spans every locale and a deploy', () => {
    expect(requests).toHaveLength(REQUESTS);
    expect(makeRequests()).toEqual(requests);
    expect(new Set(requests.map((r) => r.locale)).size).toBe(3);
    expect(new Set(requests.map((r) => r.version))).toEqual(new Set([3, 4]));
    expect(new Set(requests.map((r) => r.user)).size).toBeLessThanOrEqual(USERS);
  });

  it('serves a wrong page exactly when the key leaves out something the page depends on, for every key choice', () => {
    for (const kind of kinds) {
      for (let mask = 0; mask < 8; mask++) {
        const c: KeyChoice = { user: !!(mask & 1), locale: !!(mask & 2), version: !!(mask & 4) };
        const run = simulateKeys(kind, c, requests);
        const { missing } = keyProblems(kind, c);
        expect(run.wrong > 0, `${kind} ${JSON.stringify(c)}`).toBe(missing.length > 0);
      }
    }
  });

  it('forgetting the locale serves one language to another: German readers get what a French reader cached', () => {
    const run = simulateKeys('catalog', choice({ version: true }), requests);
    expect(run.wrong).toBeGreaterThan(requests.length * 0.3);
    const bad = run.sample.find((s) => s.wrong)!;
    expect(bad.hit).toBe(true);
    expect(bad.served).not.toBe(contentFor('catalog', bad.request));
    // the right key never does
    expect(simulateKeys('catalog', DEPENDS_ON.catalog, requests).wrong).toBe(0);
  });

  it('forgetting the version keeps serving the old deploy after it changes', () => {
    const run = simulateKeys('catalog', choice({ locale: true }), requests);
    const after = requests.slice(200);
    expect(run.wrong).toBe(after.length);
  });

  it('putting in more than the page needs is never wrong, but fragments the cache and lowers the hit rate', () => {
    const exact = simulateKeys('catalog', DEPENDS_ON.catalog, requests);
    const greedy = simulateKeys('catalog', { user: true, locale: true, version: true }, requests);
    expect(greedy.wrong).toBe(0);
    expect(greedy.entries).toBeGreaterThan(exact.entries);
    expect(greedy.hitRate).toBeLessThan(exact.hitRate);
    expect(keyProblems('catalog', { user: true, locale: true, version: true })).toEqual({ missing: [], extra: ['user'] });
  });

  it('hits and entries are consistent: misses are exactly the first sight of each key', () => {
    for (const kind of kinds) for (let mask = 0; mask < 8; mask++) {
      const c: KeyChoice = { user: !!(mask & 1), locale: !!(mask & 2), version: !!(mask & 4) };
      const run = simulateKeys(kind, c, requests);
      expect(run.misses).toBe(run.entries);
      expect(new Set(requests.map((r) => cacheKey(kind, c, r))).size).toBe(run.entries);
      expect(run.hits + run.misses).toBe(requests.length);
    }
  });

  it('every part is named', () => {
    expect(KEY_PARTS).toEqual(['user', 'locale', 'version']);
  });
});
