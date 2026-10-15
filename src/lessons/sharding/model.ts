import { pad2 } from '../../core/format';
import { fnv1a } from '../../core/hash';

export type Strategy = 'range' | 'hash' | 'directory';
/** The orders the run places: one per user, or one busy user who placed more than half of them. */
export type Dataset = 'even' | 'skewed';
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

const orderAt = (i: number, user: string): Order => ({ id: i + 1, time: `09:${pad2(i + 1)}`, user });

const USERS = ['ada', 'tia', 'max', 'bo', 'zed', 'lu', 'rae', 'finn', 'sol', 'hana', 'ivo', 'eve', 'wes', 'kai', 'mo', 'cy'];
export const ORDERS: Order[] = USERS.map((user, i) => orderAt(i, user));

/** The busy user of the skewed dataset, and how many of the 16 orders are theirs. */
export const BUSY_USER = 'ada';
/** Everyone else orders once; ada orders in between all of them and then some. */
const SKEWED_USERS = ['ada', 'tia', 'ada', 'max', 'ada', 'bo', 'ada', 'zed', 'ada', 'lu', 'ada', 'rae', 'ada', 'finn', 'ada', 'ada'];
export const SKEWED_ORDERS: Order[] = SKEWED_USERS.map((user, i) => orderAt(i, user));
export const ordersFor = (dataset: Dataset): Order[] => (dataset === 'skewed' ? SKEWED_ORDERS : ORDERS);

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
/** Illustrative cost of the directory lookup the router makes before it can route anything. */
export const DIRECTORY_LOOKUP_MS = 1;
/** What each shard's header says under directory placement: nothing about the key decides it, the table does. */
export const DIRECTORY_LABEL = 'per the directory';

export const keyName = (key: ShardKey) => (key === 'time' ? 'created_at' : 'user_id');

/** The lookup table of directory placement: each key value the router has seen, and the shard it was assigned to. */
export type Directory = Record<string, number>;

/** The text of an order's shard key: what is hashed, what the ranges cut, what the directory lists. */
export const keyValue = (o: Order, key: ShardKey) => (key === 'time' ? `${TODAY}T${o.time}` : o.user);

/**
 * The directory after the orders are written in order: a key seen for the first time is assigned to the shard holding
 * the fewest orders at that moment (ties go to the lowest shard); a key already listed stays where it is.
 */
export function buildDirectory(key: ShardKey, shards: number, orders: Order[] = ORDERS): Directory {
  const table: Directory = {};
  const counts = Array.from({ length: shards }, () => 0);
  for (const o of orders) {
    const k = keyValue(o, key);
    if (!(k in table)) table[k] = counts.indexOf(Math.min(...counts));
    counts[table[k]]++;
  }
  return table;
}

/** The directory implied by where every order already is. */
export function directoryOf(placed: Record<number, number>, key: ShardKey, orders: Order[] = ORDERS): Directory {
  return Object.fromEntries(orders.filter((o) => o.id in placed).map((o) => [keyValue(o, key), placed[o.id]]));
}

/** How many entries the directory holds: one for each distinct key written so far. */
export const directoryEntries = (placed: Record<number, number>, key: ShardKey, orders: Order[] = ORDERS) => Object.keys(directoryOf(placed, key, orders)).length;

/** The shards for `n` machines; a range layout with `n` = 5 has the shard at `split` cut in two. */
export function shardDefs(strategy: Strategy, key: ShardKey, n: number, split = -1): ShardDef[] {
  if (strategy === 'hash') return Array.from({ length: n }, (_, i) => ({ name: `S${i + 1}`, range: `hash % ${n} = ${i}` }));
  if (strategy === 'directory') return Array.from({ length: n }, (_, i) => ({ name: `S${i + 1}`, range: DIRECTORY_LABEL }));
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

/** Which shard (index into `defs`) an order is written to. Directory placement reads `directory` (built from the even orders when none is given). */
export function shardFor(o: Order, strategy: Strategy, key: ShardKey, defs: ShardDef[], directory?: Directory): number {
  const k = keyValue(o, key);
  if (strategy === 'directory') return (directory ?? buildDirectory(key, defs.length))[k];
  // FNV-1a: a real (if tiny) hash, used as it is; its low bits spread unevenly, so % N can be lumpy.
  if (strategy === 'hash') return fnv1a(k) % defs.length;
  if (key === 'time') return defs.length - 1; // every order placed today lands in the newest range
  const bounds = defs.map((d) => d.range!.split('–')[1]);
  return bounds.findIndex((b) => o.user[0] <= b[0]);
}

/** Every order's shard, by order id. */
export function placeAll(strategy: Strategy, key: ShardKey, defs: ShardDef[], orders: Order[] = ORDERS): Record<number, number> {
  const directory = strategy === 'directory' ? buildDirectory(key, defs.length, orders) : undefined;
  return Object.fromEntries(orders.map((o) => [o.id, shardFor(o, strategy, key, defs, directory)]));
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
 * time-range query on a hashed key is not routable either. A directory routes by looking up each key the query
 * names: the shards its table lists for them (a time range lists whichever shards hold those times).
 */
export function shardsAsked(q: Query, strategy: Strategy, key: ShardKey, defs: ShardDef[], directory?: Directory, orders: Order[] = ORDERS): number[] {
  const all = defs.map((_, i) => i);
  if (q.on !== key) return all;
  if (strategy === 'directory') {
    const table = directory ?? buildDirectory(key, defs.length, orders);
    return [...new Set(orders.filter(q.matches).map((o) => table[keyValue(o, key)]))].sort((a, b) => a - b);
  }
  if (q.on === 'user') return [shardFor({ id: 0, time: '', user: q.user ?? '' }, strategy, key, defs)];
  return strategy === 'range' ? [defs.length - 1] : all;
}

/** The cost of the lookup before routing: only a directory has one. */
export const lookupMs = (strategy: Strategy) => (strategy === 'directory' ? DIRECTORY_LOOKUP_MS : 0);

/** Slowest shard asked, plus the merge cost when more than one is, plus the directory lookup when there is one. */
export function queryLatency(asked: number[], counts: number[], lookup = 0): number {
  const even = counts.reduce((a, b) => a + b, 0) / counts.length;
  const slowest = Math.max(...asked.map((i) => (isHot(counts[i], even) ? HOT_MS : BASE_MS)));
  return slowest + (asked.length > 1 ? MERGE_MS_PER_SHARD * asked.length : 0) + lookup;
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
  /** How many distinct keys changed machine: the entries a directory has to rewrite, or the key ranges a split moves. */
  movedKeys: number;
}

/**
 * Directory re-sharding moves only the keys it is told to. Policy used here: the new shard should end with a fair share
 * (the total divided by the new shard count, rounded down). Donors are visited busiest first and give up their smallest
 * keys; a key that alone would overshoot the fair share is left where it is, since moving it only moves the heat.
 */
function rebalanceDirectory(key: ShardKey, placed: Record<number, number>, orders: Order[]): Rebalance {
  const defs = shardDefs('directory', key, START_SHARDS + 1);
  const newShard = START_SHARDS;
  const table = directoryOf(placed, key, orders);
  const sizes: Record<string, number> = {};
  for (const o of orders) sizes[keyValue(o, key)] = (sizes[keyValue(o, key)] ?? 0) + 1;
  const counts = [...loadOf(placed, START_SHARDS).counts, 0];
  const target = Math.floor(orders.length / defs.length);
  const donors = counts.slice(0, START_SHARDS).map((c, i) => [c, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, i]) => i);
  const next = { ...table };
  for (const donor of donors) {
    const keys = Object.keys(table).filter((k) => table[k] === donor).sort((a, b) => sizes[a] - sizes[b] || a.localeCompare(b));
    for (const k of keys) {
      if (counts[newShard] + sizes[k] > target) continue;
      next[k] = newShard;
      counts[newShard] += sizes[k];
    }
  }
  const nextPlaced = Object.fromEntries(orders.map((o) => [o.id, next[keyValue(o, key)]]));
  const moved = orders.filter((o) => nextPlaced[o.id] !== placed[o.id]).map((o) => o.id);
  const movedKeys = new Set(orders.filter((o) => moved.includes(o.id)).map((o) => keyValue(o, key))).size;
  const hottest = loadOf(placed, START_SHARDS).counts.reduce((best, c, i, all) => (c > all[best] ? i : best), 0);
  return { defs, before: { ...placed }, next: nextPlaced, moved, hottest, newShard, movedKeys };
}

/** Add a fifth shard: hash % 4 becomes hash % 5; a range layout splits its busiest range in two. */
export function rebalance(strategy: Strategy, key: ShardKey, placed: Record<number, number>, orders: Order[] = ORDERS): Rebalance {
  if (strategy === 'directory') return rebalanceDirectory(key, placed, orders);
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
  for (const o of orders) {
    next[o.id] = shardFor(o, strategy, key, defs);
    const m = placed[o.id];
    before[o.id] = strategy === 'hash' || m <= split ? m : m + 1;
    if (machine(next[o.id]) !== m) moved.push(o.id);
  }
  const movedKeys = new Set(orders.filter((o) => moved.includes(o.id)).map((o) => keyValue(o, key))).size;
  return { defs, before, next, moved, hottest, newShard: strategy === 'hash' ? START_SHARDS : split + 1, movedKeys };
}
