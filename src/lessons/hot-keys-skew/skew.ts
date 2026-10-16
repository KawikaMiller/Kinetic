/**
 * hot-keys-skew: 8 shards, 1,000 keys, requests whose key popularity follows a Zipf law.
 *
 * Placement is stated, not studied: a key lives on shard `hash32("user:<k>") mod 8`. Hashing spreads KEYS evenly; skew is that
 * REQUESTS are not spread evenly over keys. Every number here comes from a seeded request stream (or, for the analytic checks,
 * from the Zipf pmf), and each mitigation changes where a request lands, so the shard loads can be counted and compared.
 */
import { harmonic, zipfPmf, zipfSampler } from '../../core/distributions';
import { hash32 } from '../../core/hash';
import { mulberry32 } from '../../core/random';
import { createTickSim, type TickSim } from '../../core/simTick';
import { heavyRun } from '../count-min-heavy-hitters/heavy';

export const SHARDS = 8;
export const KEYS = 1_000;
export const REQUESTS = 20_000;
export const TICK_REQUESTS = 500;
export const SKEW = { min: 0, max: 1.5, step: 0.1, default: 1 } as const;
export const UTILISATION = { min: 0.1, max: 1, step: 0.05, default: 0.7 } as const;
export const READ_SHARE = { min: 0, max: 1, step: 0.1, default: 0.2 } as const;
export const SPLIT_M = { min: 2, max: 8, step: 1, default: 4 } as const;
export const HIT = { min: 0, max: 0.9, step: 0.1, default: 0.8 } as const;
/** A key is hot when it carries at least this share of the stream. */
export const HOT_SHARE = 0.03;
export const CANDIDATES = 6;
export const SKETCH_DEPTH = 4;
export const SKETCH_WIDTH = { min: 4, max: 512 } as const;
/** In a burst the popularity ranking rotates by this many keys halfway through the stream. */
export const BURST_SHIFT = 137;

export const shardOf = (key: number): number => hash32(`user:${key}`) % SHARDS;
/** Sub-key j of a salted key, and replica j of a replicated one, sit on the next shards after the key's own: m of them are m different shards. */
const subShard = (key: number, j: number) => (shardOf(key) + j) % SHARDS;
const replicaShard = subShard;

/** Share of all requests a key carries when its rank is `rank`. */
export const keyShare = (rank: number, s: number) => zipfPmf(rank, KEYS, s);

/** The hottest key's share of the traffic: 1 / H(n, s), computed on screen rather than asserted. */
export const hottestShare = (s: number) => 1 / harmonic(KEYS, s);

/** Utilisation at which the first shard saturates if the hottest key's shard also carries its even share of the rest (the lesson's formula). */
export function saturationEstimate(s: number): number {
  const p1 = hottestShare(s);
  return 1 / SHARDS / (p1 + (1 - p1) / SHARDS);
}

/** Expected share of requests on each shard, from the pmf: no sampling. */
export function expectedShares(s: number): number[] {
  const shares = new Array<number>(SHARDS).fill(0);
  for (let k = 1; k <= KEYS; k++) shares[shardOf(k)] += keyShare(k, s);
  return shares;
}

/** Utilisation at which the first shard saturates for a set of shard shares: 1 / (S * max share). */
export const saturationAt = (shares: readonly number[]): number => 1 / (shares.length * Math.max(...shares));

/* ---------- the stream ---------- */

export interface Req {
  key: number;
  read: boolean;
  /** Two uniforms drawn with the request, so a mitigation's random choice (which salt, which replica, a cache hit) is part of the seeded stream. */
  u1: number;
  u2: number;
}

const keyForRank = (rank: number, phase: 0 | 1) => (phase === 0 ? rank : ((rank - 1 + BURST_SHIFT) % KEYS) + 1);

export interface StreamOptions {
  seed: number;
  skew: number;
  readShare: number;
  /** The hot keys move halfway through (a celebrity event). */
  burst?: boolean;
  requests?: number;
}

export function makeStream(o: StreamOptions): Req[] {
  const rnd = mulberry32(o.seed);
  const draw = zipfSampler(KEYS, o.skew);
  const n = o.requests ?? REQUESTS;
  return Array.from({ length: n }, (_, i) => {
    const rank = draw(rnd);
    const read = rnd() < o.readShare;
    return { key: keyForRank(rank, o.burst && i >= n / 2 ? 1 : 0), read, u1: rnd(), u2: rnd() };
  });
}

/** Counts of each shard over the first `n` requests of the stream by plain placement: the independent count the sim is checked against. */
export function plainLoads(stream: readonly Req[], n = stream.length): number[] {
  const loads = new Array<number>(SHARDS).fill(0);
  for (let i = 0; i < n; i++) loads[shardOf(stream[i].key)]++;
  return loads;
}

/* ---------- scene 1: the stream filling the bars, on the tick sim ---------- */

export interface Fill {
  loads: number[];
  requests: number;
}

/** The first scene's stream: each tick draws TICK_REQUESTS keys from a seeded Zipf sampler and counts them per shard. */
export function fillSim(seed: number, skew: number): TickSim<Fill> {
  const draw = zipfSampler(KEYS, skew);
  return createTickSim<Fill>({
    seed,
    init: () => ({ loads: new Array<number>(SHARDS).fill(0), requests: 0 }),
    step: (s, rnd) => {
      const loads = s.loads.slice();
      for (let i = 0; i < TICK_REQUESTS; i++) loads[shardOf(draw(rnd))]++;
      return { loads, requests: s.requests + TICK_REQUESTS };
    },
  });
}
export const FILL_TICKS = REQUESTS / TICK_REQUESTS;

/* ---------- scene 2: mitigations ---------- */

export type MitigationKind = 'none' | 'salt' | 'split' | 'cache' | 'replicate';
export const MITIGATIONS: readonly MitigationKind[] = ['none', 'salt', 'split', 'cache', 'replicate'];
export const MITIGATION_LABEL: Record<MitigationKind, string> = {
  none: 'None',
  salt: 'Salt the hot keys',
  split: 'Split the hot shard',
  cache: 'Cache in front',
  replicate: 'Replicate hot reads',
};

export interface Mitigation {
  kind: MitigationKind;
  /** Salt suffixes, or replicas (2 to 8). */
  m: number;
  /** Cache hit ratio on a hot key's reads. */
  hit: number;
  /** The keys the mitigation is applied to. */
  hot: ReadonlySet<number>;
  /** Broken variant: salting that sends reads to one salted sub-key as well, with no gather. */
  readsWithoutGather?: boolean;
}

/** `split`: the other keys on the hottest key's shard move to the shards that carry the least, heaviest first. */
export function splitTable(s: number, hot: ReadonlySet<number>): number[] {
  const table = Array.from({ length: KEYS + 1 }, (_, k) => (k === 0 ? 0 : shardOf(k)));
  const load = expectedShares(s);
  const hotShards = new Set([...hot].map((k) => table[k]));
  const movable = Array.from({ length: KEYS }, (_, i) => i + 1).filter((k) => hotShards.has(table[k]) && !hot.has(k)).sort((a, b) => keyShare(a, s) - keyShare(b, s)).reverse();
  for (const k of movable) {
    const from = table[k];
    const to = load.reduce((best, v, i) => (hotShards.has(i) ? best : v < load[best] ? i : best), load.findIndex((_, i) => !hotShards.has(i)));
    load[from] -= keyShare(k, s);
    load[to] += keyShare(k, s);
    table[k] = to;
  }
  return table;
}

export interface Loads {
  loads: number[];
  /** Requests in the stream. */
  requests: number;
  /** Reads a cache answered before the shards saw them. */
  absorbed: number;
  /** Extra shard requests: a salted read gathers m shards, a replicated write updates m. */
  extra: number;
  /** Reads of a salted key that came back missing parts (only the broken variant). */
  partialReads: number;
}

export function shardLoads(stream: readonly Req[], mit: Mitigation, skew: number): Loads {
  const loads = new Array<number>(SHARDS).fill(0);
  let absorbed = 0;
  let extra = 0;
  let partialReads = 0;
  const table = mit.kind === 'split' ? splitTable(skew, mit.hot) : null;
  for (const r of stream) {
    const hot = mit.hot.has(r.key);
    if (mit.kind === 'salt' && hot) {
      if (r.read && !mit.readsWithoutGather) {
        for (let j = 0; j < mit.m; j++) loads[subShard(r.key, j)]++;
        extra += mit.m - 1;
      } else {
        loads[subShard(r.key, Math.floor(r.u1 * mit.m))]++;
        if (r.read) partialReads++;
      }
    } else if (mit.kind === 'cache' && hot && r.read && r.u2 < mit.hit) {
      absorbed++;
    } else if (mit.kind === 'replicate' && hot) {
      if (r.read) {
        loads[replicaShard(r.key, Math.floor(r.u1 * mit.m))]++;
      } else {
        for (let j = 0; j < mit.m; j++) loads[replicaShard(r.key, j)]++;
        extra += mit.m - 1;
      }
    } else {
      loads[table ? table[r.key] : shardOf(r.key)]++;
    }
  }
  return { loads, requests: stream.length, absorbed, extra, partialReads };
}

/**
 * What the read at position `i` of the stream returns for its key under salting: the writes (their positions) to that key before it, from the
 * salted sub-keys the read asked. With a gather it asks all `m`; without one only the sub-key its own uniform picks, so it can miss writes.
 */
export function saltedReadResult(stream: readonly Req[], i: number, m: number, gather: boolean): number[] {
  const read = stream[i];
  const sub = Math.floor(read.u1 * m);
  const out: number[] = [];
  for (let j = 0; j < i; j++) {
    const w = stream[j];
    if (!w.read && w.key === read.key && (gather || Math.floor(w.u1 * m) === sub)) out.push(j);
  }
  return out;
}

/** The hottest `n` keys of the stream's first phase (rank 1 is key 1). */
export const hottestKeys = (n: number): Set<number> => new Set(Array.from({ length: n }, (_, i) => i + 1));

export interface Summary {
  maxOverMean: number;
  hottestShard: number;
  /** Load on the hottest shard as a share of one shard's capacity, at total utilisation `u`. */
  hottestLoad: number;
  /** Utilisation at which the first shard saturates, from these loads. */
  saturatesAt: number;
}

/**
 * Shard load relative to capacity. Capacity is sized for the plain request count: at total utilisation `u` a shard that serves share_i of the
 * requests is at u * S * share_i, so work a mitigation adds (a gather, a replica write) counts against the shards and a cache hit counts for them.
 * `maxOverMean` is the imbalance of the loads as they are.
 */
export function summarise(l: Loads, u: number): Summary {
  const shares = l.loads.map((x) => x / l.requests);
  const max = Math.max(...shares);
  const mean = l.loads.reduce((a, b) => a + b, 0) / SHARDS;
  return { maxOverMean: Math.max(...l.loads) / mean, hottestShard: shares.indexOf(max), hottestLoad: u * SHARDS * max, saturatesAt: saturationAt(shares) };
}

/* ---------- scene 3: finding the hot keys ---------- */

export interface Detection {
  flagged: number[];
  /** Keys that really carry at least HOT_SHARE of the stream. */
  hot: number[];
  missed: number[];
  falseAlarms: number[];
  /** Counters the sketch holds. */
  cells: number;
}

/** Run the stream through a count-min sketch with a small candidate set (the heavy-hitter lesson's) and flag the candidates that look hot. */
export function detect(stream: readonly Req[], width: number, seed = 1): Detection {
  const keys = stream.map((r) => r.key);
  const state = heavyRun(keys, width, SKETCH_DEPTH, seed, keys.length, CANDIDATES);
  const count = new Map<number, number>();
  for (const k of keys) count.set(k, (count.get(k) ?? 0) + 1);
  const threshold = HOT_SHARE * keys.length;
  const flagged = state.heap.filter((c) => c.est >= threshold).map((c) => c.item).sort((a, b) => a - b);
  const hot = [...count].filter(([, n]) => n >= threshold).map(([k]) => k).sort((a, b) => a - b);
  return { flagged, hot, missed: hot.filter((k) => !flagged.includes(k)), falseAlarms: flagged.filter((k) => !hot.includes(k)), cells: width * SKETCH_DEPTH };
}

/* ---------- scene 4: a hot key that moves ---------- */

export interface PhaseLoads {
  first: Loads;
  second: Loads;
}

/** The loads of each half of a burst stream under salting of `salted` keys. */
export function burstLoads(stream: readonly Req[], salted: ReadonlySet<number>, m: number, skew: number): PhaseLoads {
  const half = stream.length / 2;
  const mit: Mitigation = { kind: 'salt', m, hit: 0, hot: salted };
  return { first: shardLoads(stream.slice(0, half), mit, skew), second: shardLoads(stream.slice(half), mit, skew) };
}
