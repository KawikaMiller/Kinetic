// A small CDN simulation. Latency model: one round trip per hop, with light in
// fibre covering ~200 km per ms one way and real routes ~1.4× longer than the
// great circle. TCP/TLS handshakes are ignored (they would multiply the gap).

export interface Place {
  name: string;
  lon: number;
  lat: number;
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

/** Where users come from: [lon, lat, weight]. */
const POPULATION: [number, number, number][] = [
  [-122, 47, 1], [-118, 34, 2], [-87, 42, 2], [-74, 41, 3], [-99, 19, 2], [-74, 4.6, 1], [-46, -23, 2], [-58, -34, 1],
  [-0.1, 51, 2], [2.3, 48.8, 2], [13, 52, 1], [37, 55, 1], [29, 41, 1], [3.4, 6.5, 2], [31, 30, 1], [28, -26, 1],
  [77, 28.6, 3], [72.9, 19, 2], [116, 40, 3], [121, 31, 2], [127, 37.5, 1], [139.7, 35.7, 2], [106.8, -6.2, 2],
  [121, 14.6, 1], [103.8, 1.35, 1], [151, -34, 1], [145, -38, 1],
];

const RAD = Math.PI / 180;
export function km(a: { lon: number; lat: number }, b: { lon: number; lat: number }) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
/** Round-trip time in ms between two points. */
export const rtt = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => 2 + (km(a, b) * 1.4) / 100;

export const ORIGIN_WORK_MS = 30;
export const EDGE_WORK_MS = 2;
export const ASSETS = 30;
/** Animation: real seconds per millisecond of one-way network time. */
const SLOW = 0.0055;

export type LegKind = 'req' | 'hit' | 'miss';
export interface Leg {
  from: { lon: number; lat: number };
  to: { lon: number; lat: number };
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
  requests: number;
}

function zipf(n: number) {
  const w = Array.from({ length: n }, (_, i) => 1 / (i + 1));
  const total = w.reduce((a, b) => a + b, 0);
  return () => {
    let r = Math.random() * total;
    for (let i = 0; i < n; i++) {
      r -= w[i];
      if (r <= 0) return i;
    }
    return n - 1;
  };
}

export class Cdn {
  now = 0;
  settings: Settings = { cdn: true, shield: false, ttl: 30, rate: 18 };
  caches: Map<number, number>[] = EDGES.map(() => new Map());
  shieldCache = new Map<number, number>();
  particles: Particle[] = [];
  samples: Sample[] = [];
  originHits: number[] = [];
  originHistory: number[] = [];
  flash: number[] = EDGES.map(() => -10);
  originFlash = -10;
  selected = 3;
  requests = 0;
  misses = 0;
  private acc = 0;
  private lastHistory = 0;
  private pick = zipf(ASSETS);
  private popTotal = POPULATION.reduce((a, p) => a + p[2], 0);

  purge() {
    this.caches.forEach((c) => c.clear());
    this.shieldCache.clear();
  }

  private spawnUser() {
    let r = Math.random() * this.popTotal;
    let p = POPULATION[0];
    for (const q of POPULATION) {
      r -= q[2];
      if (r <= 0) {
        p = q;
        break;
      }
    }
    return { lon: p[0] + (Math.random() - 0.5) * 8, lat: p[1] + (Math.random() - 0.5) * 6 };
  }

  private nearestEdge(u: { lon: number; lat: number }) {
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

  private request() {
    const { cdn, shield, ttl } = this.settings;
    const user = this.spawnUser();
    const asset = this.pick();
    const now = this.now;
    const legs: Leg[] = [];
    let t = now;
    const go = (from: Leg['from'], to: Leg['to'], kind: LegKind, oneWayMs: number) => {
      const dur = Math.max(0.12, oneWayMs * SLOW);
      legs.push({ from, to, start: t, dur, kind });
      t += dur;
    };
    this.requests++;

    if (!cdn) {
      const ms = rtt(user, ORIGIN) + ORIGIN_WORK_MS;
      go(user, ORIGIN, 'miss', rtt(user, ORIGIN) / 2);
      t += 0.08;
      go(ORIGIN, user, 'miss', rtt(user, ORIGIN) / 2);
      this.originHits.push(now);
      this.originFlash = now;
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
            this.originHits.push(now);
            this.originFlash = now;
          }
          go(SHIELD, edge, 'miss', toShield / 2);
        } else {
          const up = rtt(edge, ORIGIN);
          ms += up + ORIGIN_WORK_MS;
          go(edge, ORIGIN, 'miss', up / 2);
          go(ORIGIN, edge, 'miss', up / 2);
          this.originHits.push(now);
          this.originFlash = now;
        }
        go(edge, user, 'miss', toEdge / 2);
        cache.set(asset, now + ttl);
        this.samples.push({ t: now, ms, hit: false });
      }
    }
    this.particles.push({ legs, end: t });
  }

  step(dt: number) {
    this.now += dt;
    this.acc += this.settings.rate * dt;
    while (this.acc >= 1) {
      this.acc -= 1;
      this.request();
    }
    this.particles = this.particles.filter((p) => p.end > this.now);
    if (this.samples.length > 400) this.samples.splice(0, this.samples.length - 400);
    this.originHits = this.originHits.filter((t) => this.now - t < 5);
    if (this.now - this.lastHistory >= 0.5) {
      this.lastHistory = this.now;
      this.originHistory.push(this.originHits.length / 5);
      if (this.originHistory.length > 80) this.originHistory.shift();
    }
  }

  snapshot(): Snapshot {
    const recent = this.samples.filter((s) => this.now - s.t < 10);
    const sorted = recent.map((s) => s.ms).sort((a, b) => a - b);
    const q = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);
    const cache = this.caches[this.selected];
    const items = [...cache.entries()]
      .filter(([, exp]) => exp > this.now)
      .map(([asset, exp]) => ({ asset, left: exp - this.now }))
      .sort((a, b) => a.asset - b.asset);
    return {
      p50: q(0.5),
      p95: q(0.95),
      hitRatio: recent.length ? recent.filter((s) => s.hit).length / recent.length : null,
      originLoad: this.originHits.length / 5,
      edge: { name: EDGES[this.selected].name, items },
      requests: this.requests,
    };
  }

  cachedCount(i: number) {
    let n = 0;
    for (const exp of this.caches[i].values()) if (exp > this.now) n++;
    return n;
  }
}

// ── Stylised world map: very rough continent outlines (lon, lat) ─────────
const LAND: [number, number][][] = [
  // North America
  [[-168, 65], [-140, 70], [-95, 72], [-78, 62], [-60, 52], [-66, 44], [-75, 35], [-81, 25], [-97, 26], [-97, 20], [-87, 15], [-83, 9], [-78, 8], [-92, 15], [-105, 20], [-114, 30], [-124, 40], [-125, 49], [-135, 58], [-150, 60], [-165, 60]],
  // Greenland
  [[-55, 60], [-22, 70], [-25, 82], [-60, 82], [-72, 76]],
  // South America
  [[-80, 10], [-62, 11], [-50, 0], [-35, -7], [-40, -22], [-48, -28], [-58, -38], [-66, -55], [-73, -50], [-72, -35], [-70, -18], [-81, -5]],
  // Europe
  [[-10, 36], [-9, 44], [-2, 48], [4, 52], [5, 62], [10, 71], [30, 71], [40, 66], [45, 55], [40, 45], [28, 41], [22, 36], [10, 38], [3, 43]],
  // British Isles
  [[-5.5, 50], [1.5, 51], [-2, 55.5], [-3, 58.6], [-6.5, 57.5], [-5, 54], [-10, 52], [-9, 54.5]],
  // Africa
  [[-17, 21], [-10, 35], [10, 37], [32, 31], [35, 28], [43, 12], [51, 12], [40, -5], [40, -15], [33, -26], [20, -35], [12, -18], [9, 4], [-8, 4], [-17, 14]],
  // Arabia
  [[35, 28], [43, 12], [52, 15], [58, 22], [56, 26], [50, 30], [48, 30], [35, 33]],
  // Asia
  [[28, 41], [45, 42], [52, 47], [60, 40], [55, 26], [60, 25], [67, 24], [72, 20], [77, 8], [80, 15], [88, 22], [92, 21], [98, 16], [100, 5], [104, 1.5], [106, 10], [109, 20], [120, 23], [122, 30], [121, 40], [128, 38], [130, 43], [140, 48], [142, 54], [135, 55], [160, 60], [170, 65], [180, 68], [180, 72], [140, 74], [100, 78], [70, 73], [60, 70], [45, 68], [40, 66], [45, 55], [40, 45]],
  // Indonesia (roughly)
  [[95, 5], [106, -6], [115, -8.5], [125, -9], [140, -8], [141, -2], [131, -1], [119, 2], [110, 2], [104, -2]],
  // Japan
  [[130, 31], [135, 33.5], [140, 35], [141.5, 41], [142, 45.5], [145, 43.5], [140, 39.5], [137, 37]],
  // Australia
  [[114, -22], [122, -17], [130, -12], [137, -12], [142, -10.8], [146, -19], [153, -26], [151, -34], [146, -39], [140, -38], [131, -31.5], [115, -34]],
];

function inside(lon: number, lat: number, poly: [number, number][]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

let landDots: [number, number][] | null = null;
/** Land points on a 2.2° grid, computed once. */
export function getLandDots() {
  if (landDots) return landDots;
  const dots: [number, number][] = [];
  for (let lat = 76; lat > -56; lat -= 2.2) {
    for (let lon = -168; lon < 180; lon += 2.2) {
      if (LAND.some((p) => inside(lon, lat, p))) dots.push([lon, lat]);
    }
  }
  landDots = dots;
  return dots;
}

// Map projection bounds (equirectangular)
export const LON0 = -170;
export const LON1 = 182;
export const LAT0 = 78;
export const LAT1 = -58;
