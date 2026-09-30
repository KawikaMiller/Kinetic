// A small CDN simulation. Latency model: one round trip per hop, with light in
// fibre covering ~200 km per ms one way and real routes ~1.4× longer than the
// great circle. TCP/TLS handshakes are ignored (they would multiply the gap).
import { weightedPick } from '../../core/random';
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
const ROUTE_STRETCH = 1.4; // real routes vs the great circle
const KM_PER_MS_RTT = 100; // ~200 km/ms one way in fibre, so 100 km of distance per ms of round trip
const BASE_RTT_MS = 2;

export function km(a: LonLat, b: LonLat) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
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

interface Sample {
  t: number;
  ms: number;
  hit: boolean;
}

export interface EdgeView {
  name: string;
  items: { asset: number; left: number }[];
}

export interface Snapshot {
  p50: number;
  p95: number;
  hitRatio: number | null;
  originLoad: number;
  edge: EdgeView;
}

export class Cdn {
  now = 0;
  settings: Settings = { cdn: true, shield: false, ttl: 30, rate: 18 };
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

  purge() {
    this.caches.forEach((c) => c.clear());
    this.shieldCache.clear();
  }

  private spawnUser(): LonLat {
    const [lon, lat] = weightedPick(POPULATION, (p) => p[2]);
    return { lon: lon + (Math.random() - 0.5) * USER_SPREAD.lon, lat: lat + (Math.random() - 0.5) * USER_SPREAD.lat };
  }

  private nearestEdge(u: LonLat) {
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

  private originFetched(now: number) {
    this.originHits.push(now);
    this.originFlash = now;
  }

  private request() {
    const { cdn, shield, ttl } = this.settings;
    const user = this.spawnUser();
    const asset = weightedPick(ASSET_IDS, assetWeight);
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
      this.misses++;
    } else {
      const ei = this.nearestEdge(user);
      const edge = EDGES[ei];
      const cache = this.caches[ei];
      const toEdge = rtt(user, edge);
      go(user, edge, 'req', toEdge / 2);
      const fresh = (cache.get(asset) ?? -1) > now;
      if (fresh) {
        go(edge, user, 'hit', toEdge / 2);
        this.flash[ei] = now;
        this.samples.push({ t: now, ms: toEdge + EDGE_WORK_MS, hit: true });
      } else {
        this.misses++;
        let ms = toEdge;
        if (shield) {
          const toShield = rtt(edge, SHIELD);
          ms += toShield;
          go(edge, SHIELD, 'miss', toShield / 2);
          if ((this.shieldCache.get(asset) ?? -1) > now) {
            ms += EDGE_WORK_MS;
          } else {
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
          this.originFetched(now);
        }
        go(edge, user, 'miss', toEdge / 2);
        cache.set(asset, now + ttl);
        this.samples.push({ t: now, ms, hit: false });
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

export const createWorld = (): World => ({ cdn: new Cdn(), told: { miss: false, warm: false } });
