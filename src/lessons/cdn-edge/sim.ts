// A small CDN simulation. Latency model: one round trip per hop, with light in
// fibre covering ~200 km per ms one way and real routes ~1.4× longer than the
// great circle. TCP/TLS handshakes are ignored (they would multiply the gap).
import { mulberry32, weightedPick, type Rnd } from '../../core/random';
import { createSampler, percentile } from '../../core/sim';
import type { LonLat } from './map';

export interface Place extends LonLat {
  name: string;
}

export const ORIGIN: Place = { name: 'Origin · Virginia', lon: -77.5, lat: 39 };
export const SHIELD: Place = { name: 'Shield', lon: -80, lat: 33.5 };

export const EDGES: Place[] = [
  { name: 'Los Angeles', lon: -118.2, lat: 34.1 },
  { name: 'Chicago', lon: -87.6, lat: 41.9 },
  { name: 'São Paulo', lon: -46.6, lat: -23.5 },
  { name: 'London', lon: -0.1, lat: 51.5 },
  { name: 'Johannesburg', lon: 28, lat: -26.2 },
  { name: 'Mumbai', lon: 72.9, lat: 19.1 },
  { name: 'Singapore', lon: 103.8, lat: 1.35 },
  { name: 'Tokyo', lon: 139.7, lat: 35.7 },
  { name: 'Sydney', lon: 151.2, lat: -33.9 },
];

/** The edge the side panel shows until the learner clicks another (London). */
export const DEFAULT_EDGE = 3;

/** Where users come from: [lon, lat, weight]. */
const POPULATION: [number, number, number][] = [
  [-122, 47, 1], [-118, 34, 2], [-87, 42, 2], [-74, 41, 3], [-99, 19, 2], [-74, 4.6, 1], [-46, -23, 2], [-58, -34, 1],
  [-0.1, 51, 2], [2.3, 48.8, 2], [13, 52, 1], [37, 55, 1], [29, 41, 1], [3.4, 6.5, 2], [31, 30, 1], [28, -26, 1],
  [77, 28.6, 3], [72.9, 19, 2], [116, 40, 3], [121, 31, 2], [127, 37.5, 1], [139.7, 35.7, 2], [106.8, -6.2, 2],
  [121, 14.6, 1], [103.8, 1.35, 1], [151, -34, 1], [145, -38, 1],
];
/** Users are scattered this far (degrees) around their population centre. */
const USER_SPREAD = { lon: 8, lat: 6 };

const RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;
export const ROUTE_STRETCH = 1.4; // real routes vs the great circle
const KM_PER_MS_RTT = 100; // ~200 km/ms one way in fibre, so 100 km of distance per ms of round trip
const BASE_RTT_MS = 2;

export function km(a: LonLat, b: LonLat) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Index of the edge nearest a user by great-circle distance (a simplification: real routing is by DNS or anycast). */
export function nearestEdge(u: LonLat): number {
  let best = 0;
  let bestKm = Infinity;
  EDGES.forEach((e, i) => {
    const d = km(u, e);
    if (d < bestKm) {
      bestKm = d;
      best = i;
    }
  });
  return best;
}

/** Round-trip time in ms between two points. */
export const rtt = (a: LonLat, b: LonLat) => BASE_RTT_MS + (km(a, b) * ROUTE_STRETCH) / KM_PER_MS_RTT;

export const ORIGIN_WORK_MS = 30;
export const EDGE_WORK_MS = 2;
export const ASSETS = 30;
/** Origin load chart samples. */
export const ORIGIN_HISTORY = 80;

/** Animation: real seconds per millisecond of one-way network time. */
const SLOW = 0.0055;
const MIN_LEG_S = 0.12; // so short hops are still visible
const ORIGIN_TURNAROUND_S = 0.08; // the origin "thinking" before it replies (no-CDN path)
const ORIGIN_LOAD_WINDOW_S = 5;
const STATS_WINDOW_S = 10;
const MAX_SAMPLES = 400;
const HISTORY_EVERY_S = 0.5;

/** Zipf popularity: asset i is requested in proportion to 1 / (i + 1). */
const ASSET_IDS = Array.from({ length: ASSETS }, (_, i) => i);
const assetWeight = (i: number) => 1 / (i + 1);

export type LegKind = 'req' | 'hit' | 'miss';
export interface Leg {
  from: LonLat;
  to: LonLat;
  start: number;
  dur: number;
  kind: LegKind;
}
export interface Particle {
  legs: Leg[];
  end: number;
}

export interface Settings {
  cdn: boolean;
  shield: boolean;
  ttl: number;
  rate: number;
}

/** What the lesson loads with, and the ranges its sliders allow. */
export const DEFAULT_SETTINGS: Settings = { cdn: true, shield: false, ttl: 30, rate: 18 };
export const TTL_RANGE = { min: 3, max: 120 } as const;
export const RATE_RANGE = { min: 4, max: 50 } as const;
/** The seed the lesson loads with, shown on its Provenance chip. */
export const CDN_SEED = 11;

/** What happened to one request: where it went and what it cost, for tests and the audit trail. */
export interface RequestRecord {
  t: number;
  /** Index into EDGES, or -1 when the CDN is off. */
  edge: number;
  asset: number;
  /** Served by the edge's own fresh copy. */
  hit: boolean;
  /** Whether the shield had a fresh copy (null when the shield wasn't asked). */
  shieldHit: boolean | null;
  /** The request reached the origin. */
  originFetch: boolean;
  ms: number;
}

interface Sample {
  t: number;
  ms: number;
  hit: boolean;
}

export interface EdgeView {
  name: string;
  items: { asset: number; left: number }[];
}

/**
 * The full length of the side panel's TTL bars: the current TTL, or the longest time still left on a listed copy when one was cached
 * under a longer TTL and the slider has been lowered since (entries keep the expiry they were given).
 */
export const ttlBarMax = (ttl: number, items: readonly { left: number }[]) => Math.max(ttl, ...items.map((it) => it.left));

export interface Snapshot {
  p50: number;
  p95: number;
  hitRatio: number | null;
  originLoad: number;
  edge: EdgeView;
}

export class Cdn {
  now = 0;
  settings: Settings = { ...DEFAULT_SETTINGS };
  /** Every request so far, when a test switches it on (it grows without bound, so the live lesson leaves it off). */
  trace: RequestRecord[] | null = null;
  caches: Map<number, number>[] = EDGES.map(() => new Map());
  shieldCache = new Map<number, number>();
  particles: Particle[] = [];
  samples: Sample[] = [];
  originHits: number[] = [];
  originHistory = createSampler<number>({ every: HISTORY_EVERY_S, cap: ORIGIN_HISTORY });
  flash: number[] = EDGES.map(() => -10);
  originFlash = -10;
  selected = DEFAULT_EDGE;
  misses = 0;
  private acc = 0;
  private readonly rnd: Rnd;

  constructor(seed: number) {
    this.rnd = mulberry32(seed);
  }

  purge() {
    this.caches.forEach((c) => c.clear());
    this.shieldCache.clear();
  }

  private spawnUser(): LonLat {
    const [lon, lat] = weightedPick(POPULATION, (p) => p[2], this.rnd);
    return { lon: lon + (this.rnd() - 0.5) * USER_SPREAD.lon, lat: lat + (this.rnd() - 0.5) * USER_SPREAD.lat };
  }

  private originFetched(now: number) {
    this.originHits.push(now);
    this.originFlash = now;
  }

  private request() {
    const { cdn, shield, ttl } = this.settings;
    const user = this.spawnUser();
    const asset = weightedPick(ASSET_IDS, assetWeight, this.rnd);
    const now = this.now;
    const legs: Leg[] = [];
    let t = now;
    const go = (from: LonLat, to: LonLat, kind: LegKind, oneWayMs: number) => {
      const dur = Math.max(MIN_LEG_S, oneWayMs * SLOW);
      legs.push({ from, to, start: t, dur, kind });
      t += dur;
    };

    if (!cdn) {
      const ms = rtt(user, ORIGIN) + ORIGIN_WORK_MS;
      go(user, ORIGIN, 'miss', rtt(user, ORIGIN) / 2);
      t += ORIGIN_TURNAROUND_S;
      go(ORIGIN, user, 'miss', rtt(user, ORIGIN) / 2);
      this.originFetched(now);
      this.samples.push({ t: now, ms, hit: false });
      this.trace?.push({ t: now, edge: -1, asset, hit: false, shieldHit: null, originFetch: true, ms });
      this.misses++;
    } else {
      const ei = nearestEdge(user);
      const edge = EDGES[ei];
      const cache = this.caches[ei];
      const toEdge = rtt(user, edge);
      go(user, edge, 'req', toEdge / 2);
      const fresh = (cache.get(asset) ?? -1) > now;
      if (fresh) {
        go(edge, user, 'hit', toEdge / 2);
        this.flash[ei] = now;
        this.samples.push({ t: now, ms: toEdge + EDGE_WORK_MS, hit: true });
        this.trace?.push({ t: now, edge: ei, asset, hit: true, shieldHit: null, originFetch: false, ms: toEdge + EDGE_WORK_MS });
      } else {
        this.misses++;
        let ms = toEdge;
        let shieldHit: boolean | null = null;
        let originFetch = false;
        if (shield) {
          const toShield = rtt(edge, SHIELD);
          ms += toShield;
          go(edge, SHIELD, 'miss', toShield / 2);
          shieldHit = (this.shieldCache.get(asset) ?? -1) > now;
          if (shieldHit) {
            ms += EDGE_WORK_MS;
          } else {
            originFetch = true;
            const up = rtt(SHIELD, ORIGIN);
            ms += up + ORIGIN_WORK_MS;
            go(SHIELD, ORIGIN, 'miss', up / 2);
            go(ORIGIN, SHIELD, 'miss', up / 2);
            this.shieldCache.set(asset, now + ttl);
            this.originFetched(now);
          }
          go(SHIELD, edge, 'miss', toShield / 2);
        } else {
          const up = rtt(edge, ORIGIN);
          ms += up + ORIGIN_WORK_MS;
          go(edge, ORIGIN, 'miss', up / 2);
          go(ORIGIN, edge, 'miss', up / 2);
          originFetch = true;
          this.originFetched(now);
        }
        go(edge, user, 'miss', toEdge / 2);
        cache.set(asset, now + ttl);
        this.samples.push({ t: now, ms, hit: false });
        this.trace?.push({ t: now, edge: ei, asset, hit: false, shieldHit, originFetch, ms });
      }
    }
    this.particles.push({ legs, end: t });
  }

  /** Requests per second reaching the origin, over the last few seconds. */
  get originLoad() {
    return this.originHits.length / ORIGIN_LOAD_WINDOW_S;
  }

  step(dt: number) {
    this.now += dt;
    this.acc += this.settings.rate * dt;
    while (this.acc >= 1) {
      this.acc -= 1;
      this.request();
    }
    this.particles = this.particles.filter((p) => p.end > this.now);
    if (this.samples.length > MAX_SAMPLES) this.samples.splice(0, this.samples.length - MAX_SAMPLES);
    this.originHits = this.originHits.filter((t) => this.now - t < ORIGIN_LOAD_WINDOW_S);
    this.originHistory.tick(this.now, () => this.originLoad);
  }

  snapshot(): Snapshot {
    const recent = this.samples.filter((s) => this.now - s.t < STATS_WINDOW_S);
    const sorted = recent.map((s) => s.ms).sort((a, b) => a - b);
    const cache = this.caches[this.selected];
    const items = [...cache.entries()]
      .filter(([, exp]) => exp > this.now)
      .map(([asset, exp]) => ({ asset, left: exp - this.now }))
      .sort((a, b) => a.asset - b.asset);
    return {
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      hitRatio: recent.length ? recent.filter((s) => s.hit).length / recent.length : null,
      originLoad: this.originLoad,
      edge: { name: EDGES[this.selected].name, items },
    };
  }

  cachedCount(i: number) {
    let n = 0;
    for (const exp of this.caches[i].values()) if (exp > this.now) n++;
    return n;
  }
}

/* ─── The lesson's world: the sim plus which one-off captions have already played ─── */

export interface World {
  cdn: Cdn;
  told: { miss: boolean; warm: boolean };
}

export const createWorld = (seed = CDN_SEED): World => ({ cdn: new Cdn(seed), told: { miss: false, warm: false } });

/** The one-off captions: a few misses after the first second, then warm caches later on. */
export const FIRST_MISSES = 3;
export const WARM_AFTER_S = 9;
export const WARM_HIT_RATIO = 0.7;

/** Which one-off caption is due now, if any. Pure: the caller records that it was told. */
export function narrationDue(cdn: Cdn, told: World['told'], snap: Snapshot): 'miss' | 'warm' | null {
  if (!cdn.settings.cdn) return null;
  if (!told.miss && cdn.misses > FIRST_MISSES && cdn.now > 1) return 'miss';
  if (told.miss && !told.warm && cdn.now > WARM_AFTER_S && (snap.hitRatio ?? 0) > WARM_HIT_RATIO) return 'warm';
  return null;
}
