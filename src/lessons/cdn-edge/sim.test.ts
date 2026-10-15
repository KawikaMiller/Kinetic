import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { cdnCaption, introCaption, missCaption, purgeCaption, shieldCaption, warmCaption } from './captions';
import lesson from './index';
import {
  ASSETS, Cdn, CDN_SEED, createWorld, DEFAULT_SETTINGS, EDGES, FIRST_MISSES, km, narrationDue, nearestEdge, ORIGIN, ORIGIN_WORK_MS,
  rtt, ROUTE_STRETCH, ttlBarMax, type RequestRecord, type Settings, type Snapshot,
} from './sim';

const DT = 0.05;
const ORIGIN_WINDOW_S = 5;
const STATS_WINDOW_S = 10;

/** Run a sim with a trace for `seconds`, applying `settings` from the start. */
function run(seconds: number, settings: Partial<Settings> = {}, seed = CDN_SEED, cdn = new Cdn(seed)) {
  cdn.settings = { ...DEFAULT_SETTINGS, ...settings };
  cdn.trace ??= [];
  const end = cdn.now + seconds;
  while (cdn.now < end - 1e-9) cdn.step(DT);
  return cdn;
}

/**
 * Reference TTL cache, written from the definition and replayed over the sim's own request stream:
 * an entry filled at time f is fresh for requests at t < f + ttl; a miss refills it.
 */
function replay(trace: readonly RequestRecord[], s: { cdn: boolean; shield: boolean; ttl: number }) {
  const edgeFill = new Map<string, number>();
  let shieldFill = new Map<number, number>();
  return trace.map((r) => {
    if (!s.cdn) return { hit: false, shieldHit: null, originFetch: true };
    const key = `${r.edge}:${r.asset}`;
    const fresh = (edgeFill.get(key) ?? -Infinity) + s.ttl > r.t;
    if (fresh) return { hit: true, shieldHit: null, originFetch: false };
    edgeFill.set(key, r.t);
    if (!s.shield) return { hit: false, shieldHit: null, originFetch: true };
    const shieldFresh = (shieldFill.get(r.asset) ?? -Infinity) + s.ttl > r.t;
    if (!shieldFresh) shieldFill.set(r.asset, r.t);
    return { hit: false, shieldHit: shieldFresh, originFetch: !shieldFresh };
  });
}

/** Haversine, written out here: the lesson's `km` must agree with it. */
function haversine(a: { lon: number; lat: number }, b: { lon: number; lat: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const quantile = (xs: number[], p: number) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;
};

describe('the side panel TTL bars never overflow after the slider is lowered', () => {
  it('copies cached under a 60 s TTL outlive a lowered 3 s TTL, and every bar still fits its track', () => {
    const cdn = run(20, { ttl: 60 });
    cdn.selected = 3;
    run(1, { ttl: 3 }, CDN_SEED, cdn);
    const { items } = cdn.snapshot().edge;
    expect(items.length).toBeGreaterThan(0);
    // The premise of the bug: some copy has more time left than the new TTL.
    expect(Math.max(...items.map((it) => it.left))).toBeGreaterThan(3);
    const max = ttlBarMax(3, items);
    for (const it of items) expect(it.left / max).toBeLessThanOrEqual(1);
  });

  it('with no older copies the bars are scaled to the TTL itself', () => {
    expect(ttlBarMax(30, [{ left: 12 }, { left: 29.5 }])).toBe(30);
    expect(ttlBarMax(30, [])).toBe(30);
    expect(ttlBarMax(3, [{ left: 40 }, { left: 2 }])).toBe(40);
  });
});

describe('distance and round-trip time', () => {
  it('km matches closed forms: a quarter and half of the great circle on the equator', () => {
    const R = 6371;
    expect(km({ lon: 0, lat: 0 }, { lon: 90, lat: 0 })).toBeCloseTo((Math.PI / 2) * R, 6);
    expect(km({ lon: 0, lat: 0 }, { lon: 180, lat: 0 })).toBeCloseTo(Math.PI * R, 6);
    expect(km({ lon: 10, lat: 20 }, { lon: 10, lat: 20 })).toBe(0);
  });

  it('London to New York is about 5,570 km (a published great-circle figure)', () => {
    const d = km({ lon: -0.13, lat: 51.51 }, { lon: -74.01, lat: 40.71 });
    expect(Math.abs(d - 5570)).toBeLessThan(30);
  });

  it('round trip is 2 ms plus the route-stretched distance at 100 km per ms, and never beats light in fibre', () => {
    const a = { lon: 151.2, lat: -33.9 };
    expect(rtt(a, ORIGIN)).toBeCloseTo(2 + (haversine(a, ORIGIN) * ROUTE_STRETCH) / 100, 6);
    for (const e of EDGES) expect(rtt(e, ORIGIN)).toBeGreaterThanOrEqual((2 * haversine(e, ORIGIN)) / 200);
  });

  it('Sydney to Virginia is about 220 ms in this model, and a user next to the Sydney edge is within 12 ms of it', () => {
    const sydney = EDGES.find((e) => e.name === 'Sydney')!;
    expect(rtt(sydney, ORIGIN)).toBeGreaterThan(200);
    expect(rtt(sydney, ORIGIN)).toBeLessThan(250);
    expect(rtt({ lon: 151 + 4, lat: -34 - 3 }, sydney)).toBeLessThan(12);
  });

  it('nearestEdge is the brute-force nearest edge on a 10-degree grid, and an edge city maps to itself', () => {
    for (let lon = -170; lon <= 180; lon += 10) {
      for (let lat = -50; lat <= 70; lat += 10) {
        const u = { lon, lat };
        const best = EDGES.map((e, i) => ({ i, d: haversine(u, e) })).sort((a, b) => a.d - b.d)[0].i;
        expect(nearestEdge(u), `${lon},${lat}`).toBe(best);
      }
    }
    EDGES.forEach((e, i) => expect(nearestEdge(e)).toBe(i));
  });
});

describe('the cache against an independent TTL reference', () => {
  const configs: [string, Partial<Settings>][] = [
    ['CDN, ttl 30', {}],
    ['CDN, ttl 3', { ttl: 3 }],
    ['CDN + shield, ttl 30', { shield: true }],
    ['CDN + shield, ttl 3', { shield: true, ttl: 3 }],
    ['no CDN', { cdn: false }],
    ['CDN, ttl 120, busy', { ttl: 120, rate: 50 }],
  ];

  it.each(configs)('every request is a hit, shield hit and origin fetch exactly as the reference says (%s)', (_name, s) => {
    const cdn = run(90, s);
    const trace = cdn.trace!;
    const expected = replay(trace, { ...DEFAULT_SETTINGS, ...s });
    expect(trace.length).toBeGreaterThan(300);
    trace.forEach((r, i) => {
      expect({ hit: r.hit, shieldHit: r.shieldHit, originFetch: r.originFetch }, `request ${i} at ${r.t.toFixed(2)} s`).toEqual(expected[i]);
    });
  });

  it('the reference is sharp: a TTL one second off, or a missing shield, disagrees with the sim somewhere', () => {
    const trace = run(90, { shield: true }).trace!;
    const same = (expected: ReturnType<typeof replay>) => trace.every((r, i) => r.hit === expected[i].hit && r.originFetch === expected[i].originFetch);
    expect(same(replay(trace, { cdn: true, shield: true, ttl: DEFAULT_SETTINGS.ttl }))).toBe(true);
    expect(same(replay(trace, { cdn: true, shield: true, ttl: DEFAULT_SETTINGS.ttl + 1 }))).toBe(false);
    expect(same(replay(trace, { cdn: true, shield: false, ttl: DEFAULT_SETTINGS.ttl }))).toBe(false);
  });

  it('with the CDN off a shield changes nothing: no request is shield-served and every request reaches the origin', () => {
    const cdn = run(30, { cdn: false, shield: true });
    expect(cdn.trace!.every((r) => r.shieldHit === null && r.originFetch && !r.hit)).toBe(true);
  });

  it('the first request for each file at each edge misses', () => {
    const seen = new Set<string>();
    for (const r of run(60).trace!) {
      const key = `${r.edge}:${r.asset}`;
      if (!seen.has(key)) expect(r.hit, key).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBeGreaterThan(50);
  });

  it('same seed, same stream; another seed, another stream', () => {
    const a = run(20, {}, 5).trace!;
    const b = run(20, {}, 5).trace!;
    const c = run(20, {}, 6).trace!;
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });

  it('the world starts with the seed the chip shows and the lesson\'s default settings', () => {
    const w = createWorld();
    expect(w.cdn.settings).toEqual(DEFAULT_SETTINGS);
    expect(CDN_SEED).toBe(11);
  });
});

describe('hit ratio and origin offload under the lesson\'s own popularity skew', () => {
  it('requests follow 1 / (rank) popularity: the top file gets about 1 / H(30) of them', () => {
    const trace = run(300, { rate: 50 }).trace!;
    const harmonic = Array.from({ length: ASSETS }, (_, i) => 1 / (i + 1)).reduce((a, b) => a + b, 0);
    const counts = Array.from({ length: ASSETS }, () => 0);
    for (const r of trace) counts[r.asset]++;
    expect(Math.abs(counts[0] / trace.length - 1 / harmonic)).toBeLessThan(0.015);
    expect(Math.abs(counts[9] / trace.length - 1 / 10 / harmonic)).toBeLessThan(0.01);
  });

  it('the measured edge hit ratio matches the closed form sum of lambda T / (1 + lambda T), from the rates the same run measured', () => {
    const TTL = 5;
    const SECONDS = 900;
    const trace = run(SECONDS, { ttl: TTL, rate: 50 }).trace!;
    const perPair = new Map<string, number>();
    for (const r of trace) perPair.set(`${r.edge}:${r.asset}`, (perPair.get(`${r.edge}:${r.asset}`) ?? 0) + 1);
    let predictedHits = 0;
    for (const n of perPair.values()) {
      const lambdaT = (n / SECONDS) * TTL;
      predictedHits += n * (lambdaT / (1 + lambdaT));
    }
    const measured = trace.filter((r) => r.hit).length / trace.length;
    expect(Math.abs(measured - predictedHits / trace.length)).toBeLessThan(0.03);
  });

  it('a longer TTL raises the hit ratio and cuts origin fetches (3 s < 30 s < 120 s)', () => {
    const ratio = (ttl: number) => {
      const t = run(240, { ttl }).trace!;
      return { hit: t.filter((r) => r.hit).length / t.length, fetches: t.filter((r) => r.originFetch).length };
    };
    const [a, b, c] = [ratio(3), ratio(30), ratio(120)];
    expect(a.hit).toBeLessThan(b.hit);
    expect(b.hit).toBeLessThan(c.hit);
    expect(a.fetches).toBeGreaterThan(b.fetches);
    expect(b.fetches).toBeGreaterThan(c.fetches);
  });

  it('an origin shield never adds origin fetches, and fetches a file at most once per TTL; without it each edge refetches on its own', () => {
    const TTL = 10;
    const withShield = run(200, { ttl: TTL, shield: true }).trace!;
    const without = run(200, { ttl: TTL }).trace!;
    expect(withShield.filter((r) => r.originFetch).length).toBeLessThan(without.filter((r) => r.originFetch).length);
    const lastFetch = new Map<number, number>();
    for (const r of withShield.filter((x) => x.originFetch)) {
      expect(r.t - (lastFetch.get(r.asset) ?? -Infinity), `asset ${r.asset}`).toBeGreaterThanOrEqual(TTL);
      lastFetch.set(r.asset, r.t);
    }
    const sameEdge = new Map<string, number>();
    let edgesFetchingTheSameFile = 0;
    for (const r of without.filter((x) => x.originFetch)) {
      const k = `${r.edge}:${r.asset}`;
      expect(r.t - (sameEdge.get(k) ?? -Infinity)).toBeGreaterThanOrEqual(TTL);
      sameEdge.set(k, r.t);
    }
    for (let asset = 0; asset < ASSETS; asset++) {
      if (new Set(without.filter((x) => x.originFetch && x.asset === asset).map((x) => x.edge)).size > 1) edgesFetchingTheSameFile++;
    }
    expect(edgesFetchingTheSameFile).toBeGreaterThan(5);
  });
});

describe('the numbers on screen are the trace, recomputed', () => {
  it('origin load, p50, p95 and hit ratio equal the same figures computed from the request trace at every snapshot', () => {
    const cdn = new Cdn(CDN_SEED);
    cdn.trace = [];
    cdn.settings = { ...DEFAULT_SETTINGS, shield: true };
    let checked = 0;
    for (let i = 0; i < 60 / DT; i++) {
      cdn.step(DT);
      if (i % 40 !== 39) continue;
      const snap = cdn.snapshot();
      const now = cdn.now;
      const trace = cdn.trace;
      const recent = trace.filter((r) => now - r.t < STATS_WINDOW_S);
      expect(snap.originLoad).toBeCloseTo(trace.filter((r) => r.originFetch && now - r.t < ORIGIN_WINDOW_S).length / ORIGIN_WINDOW_S, 9);
      expect(snap.p50).toBe(quantile(recent.map((r) => r.ms), 0.5));
      expect(snap.p95).toBe(quantile(recent.map((r) => r.ms), 0.95));
      expect(snap.hitRatio).toBeCloseTo(recent.filter((r) => r.hit).length / recent.length, 9);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('a hit costs the round trip to the edge plus 2 ms; a miss without a shield adds the edge-to-origin round trip and the origin\'s work', () => {
    const cdn = run(40);
    const hit = cdn.trace!.find((r) => r.hit)!;
    const miss = cdn.trace!.find((r) => !r.hit)!;
    const edgeToOrigin = (i: number) => rtt(EDGES[i], ORIGIN);
    expect(miss.ms).toBeGreaterThan(edgeToOrigin(miss.edge) + ORIGIN_WORK_MS);
    expect(hit.ms).toBeLessThan(miss.ms);
    for (const r of cdn.trace!.filter((x) => !x.hit)) expect(r.ms).toBeGreaterThanOrEqual(edgeToOrigin(r.edge) + ORIGIN_WORK_MS);
  });

  it('purge empties every edge and the shield: the next request for each file at each edge misses', () => {
    const cdn = run(40, { shield: true });
    cdn.purge();
    const from = cdn.trace!.length;
    run(30, { shield: true }, CDN_SEED, cdn);
    const after = cdn.trace!.slice(from);
    const seen = new Set<string>();
    for (const r of after) {
      const key = `${r.edge}:${r.asset}`;
      if (!seen.has(key)) {
        expect(r.hit, key).toBe(false);
        seen.add(key);
      }
    }
    expect(after.find((r) => r.originFetch)).toBeDefined();
  });
});

describe('captions and one-off narration', () => {
  const snap = (hitRatio: number | null): Snapshot => ({ p50: 0, p95: 0, hitRatio, originLoad: 0, edge: { name: '', items: [] } });

  it('narrationDue fires the miss caption after the first misses and the warm one once the hit ratio is high', () => {
    const cdn = new Cdn(CDN_SEED);
    const told = { miss: false, warm: false };
    expect(narrationDue(cdn, told, snap(null))).toBeNull();
    run(3, {}, CDN_SEED, cdn);
    expect(cdn.misses).toBeGreaterThan(FIRST_MISSES);
    expect(narrationDue(cdn, told, snap(0.2))).toBe('miss');
    told.miss = true;
    expect(narrationDue(cdn, told, snap(0.99))).toBeNull();
    run(10, {}, CDN_SEED, cdn);
    expect(narrationDue(cdn, told, snap(0.71))).toBe('warm');
    expect(narrationDue(cdn, told, snap(0.7))).toBeNull();
    cdn.settings = { ...cdn.settings, cdn: false };
    expect(narrationDue(cdn, told, snap(0.9))).toBeNull();
  });

  it('captions quote the ratio and counts they are given', () => {
    const t = (n: Parameters<typeof captionText>[0]) => captionText(n, { strict: true });
    expect(t(warmCaption(0.734))).toContain('73% of requests');
    expect(t(shieldCaption(true, true))).toContain(`up to ${EDGES.length} cities`);
    expect(t(shieldCaption(true, false))).toContain('does nothing while the CDN is off');
    expect(t(shieldCaption(false, true))).toContain('Shield off');
    expect(t(cdnCaption(false))).toContain('straight to the origin');
    expect(t(cdnCaption(true))).toContain('inside its TTL');
    expect(t(introCaption())).toContain('nearest edge');
    expect(t(missCaption())).toContain('Cache miss');
    expect(t(purgeCaption())).toContain('Purged');
  });
});

describe('try-this, from the lesson as it loads (CDN on, no shield, TTL 30 s, 18 requests a second)', () => {
  const hitRatioAt = (cdn: Cdn) => cdn.snapshot().hitRatio ?? 0;

  it('try-this 1: the first request for every file at an edge misses, so the hit ratio starts low and climbs', () => {
    const cdn = new Cdn(CDN_SEED);
    cdn.trace = [];
    run(3, {}, CDN_SEED, cdn);
    const early = hitRatioAt(cdn);
    run(17, {}, CDN_SEED, cdn);
    const warm = hitRatioAt(cdn);
    expect(early).toBeLessThan(0.4);
    expect(warm).toBeGreaterThan(0.7);
    expect(cdn.trace!.slice(0, 5).some((r) => r.hit)).toBe(false);
  });

  it('try-this 2: without the CDN p50 is several times higher and the origin hears every request', () => {
    const on = run(40);
    const off = run(40, { cdn: false });
    expect(off.snapshot().p50).toBeGreaterThan(3 * on.snapshot().p50);
    expect(Math.abs(off.snapshot().originLoad - DEFAULT_SETTINGS.rate)).toBeLessThan(DEFAULT_SETTINGS.rate * 0.1);
    expect(on.snapshot().originLoad).toBeLessThan(DEFAULT_SETTINGS.rate / 2);
  });

  it('try-this 3: purging all caches spikes the origin load well above its warm level, and it comes back down as caches refill', () => {
    const cdn = run(30);
    const warm = cdn.snapshot().originLoad;
    cdn.purge();
    let peak = 0;
    for (let i = 0; i < 20 / DT; i++) {
      cdn.step(DT);
      peak = Math.max(peak, cdn.originLoad);
    }
    expect(peak).toBeGreaterThan(3 * Math.max(warm, 1));
    expect(cdn.originLoad).toBeLessThan(0.7 * peak);
  });

  it('try-this 4: with TTL 3 s, turning on the shield cuts origin load to well under what the edges send on their own', () => {
    const load = (shield: boolean) => {
      const cdn = run(30, { ttl: 3, shield });
      let sum = 0;
      let n = 0;
      for (let i = 0; i < 20 / DT; i++) {
        cdn.step(DT);
        sum += cdn.originLoad;
        n++;
      }
      return sum / n;
    };
    expect(load(true)).toBeLessThan(0.6 * load(false));
  });
});

describe('the lesson text', () => {
  it('has four try-this entries', () => {
    expect(lesson.tryThis).toHaveLength(4);
  });

  it('quiz 4: a 3 s TTL with no shield leaves the hit ratio around 30% and the origin serving over half the traffic', () => {
    const cdn = run(60, { ttl: 3 });
    const late = cdn.trace!.filter((r) => r.t > 20);
    const hit = late.filter((r) => r.hit).length / late.length;
    const fetched = late.filter((r) => r.originFetch).length / late.length;
    expect(hit).toBeGreaterThan(0.2);
    expect(hit).toBeLessThan(0.4);
    expect(fetched).toBeGreaterThan(0.5);
  });

  it('quiz 1: a Sydney round trip to Virginia is over 200 ms and a hit for a Sydney-area user is about ten ms', () => {
    const sydney = EDGES.find((e) => e.name === 'Sydney')!;
    expect(rtt(sydney, ORIGIN)).toBeGreaterThan(200);
    const farthestSydneyUser = { lon: sydney.lon + 4, lat: sydney.lat - 3 };
    expect(rtt(farthestSydneyUser, sydney) + 2).toBeLessThan(13);
  });
});
