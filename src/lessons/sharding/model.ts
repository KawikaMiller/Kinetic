import { pad2 } from '../../core/format';
import { fnv1a } from '../../core/hash';

export type Strategy = 'range' | 'hash';
export type ShardKey = 'time' | 'user';

export interface Order {
  id: number;
  time: string; // HH:MM today
  user: string;
}

export interface ShardDef {
  name: string;
  range?: string;
}

/** Shards the lesson starts with, and the number it adds one shard to. */
export const START_SHARDS = 4;

const USERS = ['ada', 'tia', 'max', 'bo', 'zed', 'lu', 'rae', 'finn', 'sol', 'hana', 'ivo', 'eve', 'wes', 'kai', 'mo', 'cy'];
export const ORDERS: Order[] = USERS.map((user, i) => ({
  id: i + 1,
  time: `09:${pad2(i + 1)}`,
  user,
}));

/** The day every order was placed on, for the created_at that gets hashed. */
const TODAY = '2026-12-01';

/** A shard counts as hot once it holds more than this many times an even share... */
export const HOT_FACTOR = 2;
/** ...and at least this many orders, so one early write doesn't count. */
export const HOT_MIN_ORDERS = 4;

const TIME_RANGES = ['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'];
const USER_RANGES = ['a–f', 'g–l', 'm–r', 's–z'];

/** Illustrative per-shard query times: made up, not measured. */
export const BASE_MS = 10;
export const HOT_MS = 45;
/** Illustrative cost of merging answers, per shard asked, when more than one is. */
export const MERGE_MS_PER_SHARD = 2;

export const keyName = (key: ShardKey) => (key === 'time' ? 'created_at' : 'user_id');

/** The shards for `n` machines; a range layout with `n` = 5 has the shard at `split` cut in two. */
export function shardDefs(strategy: Strategy, key: ShardKey, n: number, split = -1): ShardDef[] {
  if (strategy === 'hash') return Array.from({ length: n }, (_, i) => ({ name: `S${i + 1}`, range: `hash % ${n} = ${i}` }));
  const ranges = key === 'time' ? TIME_RANGES.slice() : USER_RANGES.slice();
  if (n === START_SHARDS + 1 && split >= 0) {
    if (key === 'time') ranges.splice(3, 1, 'Oct–Nov', 'Dec (today)');
    else {
      const [lo, hi] = ranges[split].split('–');
      const mid = String.fromCharCode(Math.floor((lo.charCodeAt(0) + hi.charCodeAt(0)) / 2));
      ranges.splice(split, 1, `${lo}–${mid}`, `${String.fromCharCode(mid.charCodeAt(0) + 1)}–${hi}`);
    }
  }
  return ranges.map((r, i) => ({ name: `S${i + 1}`, range: r }));
}

/** Which shard (index into `defs`) an order is written to. */
export function shardFor(o: Order, strategy: Strategy, key: ShardKey, defs: ShardDef[]): number {
  const k = key === 'time' ? `${TODAY}T${o.time}` : o.user;
  // FNV-1a: a real (if tiny) hash, used as it is; its low bits spread unevenly, so % N can be lumpy.
  if (strategy === 'hash') return fnv1a(k) % defs.length;
  if (key === 'time') return defs.length - 1; // every order placed today lands in the newest range
  const bounds = defs.map((d) => d.range!.split('–')[1]);
  return bounds.findIndex((b) => o.user[0] <= b[0]);
}

/** Every order's shard, by order id. */
export function placeAll(strategy: Strategy, key: ShardKey, defs: ShardDef[]): Record<number, number> {
  return Object.fromEntries(ORDERS.map((o) => [o.id, shardFor(o, strategy, key, defs)]));
}

export interface Load {
  /** Orders on each shard (an order still in the router doesn't count). */
  counts: number[];
  /** An even share: placed orders ÷ shards. */
  even: number;
  /** The busiest shard's load as a multiple of the even share. */
  busiest: number;
}

export function loadOf(placed: Record<number, number>, shards: number, inFlightId?: number): Load {
  const counts = Array.from({ length: shards }, () => 0);
  for (const [id, s] of Object.entries(placed)) if (Number(id) !== inFlightId) counts[s]++;
  const total = counts.reduce((a, b) => a + b, 0);
  const even = total / shards;
  return { counts, even, busiest: even === 0 ? 0 : Math.max(...counts) / even };
}

/** One shard is hot when it holds more than HOT_FACTOR times an even share and at least HOT_MIN_ORDERS orders. */
export const isHot = (count: number, even: number) => count > even * HOT_FACTOR && count >= HOT_MIN_ORDERS;

export interface Query {
  label: string;
  /** Which orders the query is looking for. */
  matches: (o: Order) => boolean;
  /** The column the predicate is on: it can be routed only when that is the shard key. */
  on: ShardKey;
  /** For a query on `user`: the user asked for. */
  user?: string;
}

export const LAST_HOUR: Query = { label: 'orders from the last hour', matches: (o) => o.time >= '09:00', on: 'time' };
export const ADA: Query = { label: "ada's orders", matches: (o) => o.user === 'ada', on: 'user', user: 'ada' };

/**
 * The shards the router has to ask. A query on the shard key can be routed: by range it goes to the
 * shard whose range holds it, by user it goes to the one shard its hash or letter names. Anything else
 * could be on any shard, so every shard is asked (scatter-gather). A hash gives no order, so a
 * time-range query on a hashed key is not routable either.
 */
export function shardsAsked(q: Query, strategy: Strategy, key: ShardKey, defs: ShardDef[]): number[] {
  const all = defs.map((_, i) => i);
  if (q.on !== key) return all;
  if (q.on === 'user') return [shardFor({ id: 0, time: '', user: q.user ?? '' }, strategy, key, defs)];
  return strategy === 'range' ? [defs.length - 1] : all;
}

/** Slowest shard asked, plus the merge cost when more than one is. */
export function queryLatency(asked: number[], counts: number[]): number {
  const even = counts.reduce((a, b) => a + b, 0) / counts.length;
  const slowest = Math.max(...asked.map((i) => (isHot(counts[i], even) ? HOT_MS : BASE_MS)));
  return slowest + (asked.length > 1 ? MERGE_MS_PER_SHARD * asked.length : 0);
}

export interface Rebalance {
  defs: ShardDef[];
  /** Every order on its old machine, drawn in the new layout. */
  before: Record<number, number>;
  /** Every order in its new shard. */
  next: Record<number, number>;
  /** Ids of the orders whose machine changed. */
  moved: number[];
  /** The shard that was split (range) and the index of the new shard. */
  hottest: number;
  newShard: number;
}

/** Add a fifth shard: hash % 4 becomes hash % 5; a range layout splits its busiest range in two. */
export function rebalance(strategy: Strategy, key: ShardKey, placed: Record<number, number>): Rebalance {
  const { counts } = loadOf(placed, START_SHARDS);
  const hottest = counts.indexOf(Math.max(...counts));
  const split = key === 'time' ? START_SHARDS - 1 : hottest;
  const defs = shardDefs(strategy, key, START_SHARDS + 1, split);
  // Which physical machine each new shard index is. Splitting shard s keeps its lower half on
  // the old machine; the upper half (s + 1) is the new machine.
  const machine = (j: number) => (strategy === 'hash' || j <= split ? j : j === split + 1 ? -1 : j - 1);
  const next: Record<number, number> = {};
  const before: Record<number, number> = {};
  const moved: number[] = [];
  for (const o of ORDERS) {
    next[o.id] = shardFor(o, strategy, key, defs);
    const m = placed[o.id];
    before[o.id] = strategy === 'hash' || m <= split ? m : m + 1;
    if (machine(next[o.id]) !== m) moved.push(o.id);
  }
  return { defs, before, next, moved, hottest, newShard: strategy === 'hash' ? START_SHARDS : split + 1 };
}
