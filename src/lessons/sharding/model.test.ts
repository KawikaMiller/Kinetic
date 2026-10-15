import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { buildFrames } from './frames';
import lesson from './index';
import {
  ADA, BASE_MS, BUSY_USER, directoryEntries, DIRECTORY_LOOKUP_MS, HOT_FACTOR, HOT_MS, isHot, LAST_HOUR, loadOf, lookupMs, MERGE_MS_PER_SHARD, ORDERS, ordersFor,
  placeAll, queryLatency, rebalance, shardDefs, shardsAsked, SKEWED_ORDERS, START_SHARDS, type Dataset, type Order, type Query, type ShardKey, type Strategy,
} from './model';

/** FNV-1a on bytes with BigInt, written out here instead of importing the lesson's own. */
function fnv32(text: string): number {
  let h = 0x811c_9dc5n; // the published 32-bit offset basis
  for (const byte of new TextEncoder().encode(text)) {
    h ^= BigInt(byte);
    h = (h * 0x01000193n) & 0xffffffffn;
  }
  return Number(h);
}

/** The key string the lesson hashes for an order. */
const hashInput = (o: Order, key: ShardKey) => (key === 'time' ? `2026-12-01T${o.time}` : o.user);

const COMBOS: [Strategy, ShardKey][] = [['range', 'time'], ['range', 'user'], ['hash', 'time'], ['hash', 'user']];
const RANGES = [['a', 'f'], ['g', 'l'], ['m', 'r'], ['s', 'z']];
const place = (s: Strategy, k: ShardKey, n = START_SHARDS) => placeAll(s, k, shardDefs(s, k, n));

describe('placement against independent references', () => {
  it('hash placement is FNV-1a (re-implemented here, with a published vector) mod the shard count', () => {
    expect(fnv32('a')).toBe(0xe40c292c);
    expect(fnv32('foobar')).toBe(0xbf9cf968);
    for (const key of ['time', 'user'] as const) {
      for (const n of [START_SHARDS, START_SHARDS + 1]) {
        const placed = place('hash', key, n);
        for (const o of ORDERS) expect(placed[o.id]).toBe(fnv32(hashInput(o, key)) % n);
      }
    }
  });

  it('range-by-user placement is the letter range containing the first letter', () => {
    const placed = place('range', 'user');
    for (const o of ORDERS) {
      const expected = RANGES.findIndex(([lo, hi]) => o.user[0] >= lo && o.user[0] <= hi);
      expect(placed[o.id]).toBe(expected);
    }
  });

  it('range-by-time puts every order (all placed today) in the newest range', () => {
    expect(new Set(Object.values(place('range', 'time')))).toEqual(new Set([START_SHARDS - 1]));
  });

  it('every layout places all 16 orders on a real shard', () => {
    for (const [s, k] of COMBOS) {
      const counts = loadOf(place(s, k), START_SHARDS).counts;
      expect(counts.reduce((a, b) => a + b, 0)).toBe(ORDERS.length);
      expect(counts).toHaveLength(START_SHARDS);
    }
  });
});

describe('hot shards and load', () => {
  it('range on time sends everything to one shard (4× an even share); the other layouts stay under 2×', () => {
    expect(loadOf(place('range', 'time'), START_SHARDS).busiest).toBe(START_SHARDS);
    for (const [s, k] of COMBOS.slice(1)) expect(loadOf(place(s, k), START_SHARDS).busiest, `${s} ${k}`).toBeLessThan(2);
  });

  it('only range on time makes a hot shard; the stat and the tag use the same rule, so one early write is not hot', () => {
    for (const [s, k] of COMBOS) {
      const { counts, even } = loadOf(place(s, k), START_SHARDS);
      const anyHot = counts.some((c) => isHot(c, even));
      expect(anyHot, `${s} ${k}`).toBe(s === 'range' && k === 'time');
    }
    const first = loadOf({ 1: 3 }, START_SHARDS);
    expect(first.busiest).toBe(START_SHARDS);
    expect(isHot(first.counts[3], first.even)).toBe(false);
  });

  it('an order still in the router is not counted on its shard', () => {
    const l = loadOf({ 1: 0, 2: 0, 3: 1 }, START_SHARDS, 3);
    expect(l.counts).toEqual([2, 0, 0, 0]);
    expect(l.even).toBe(0.5);
  });
});

describe('which shards a query asks', () => {
  const queries: Query[] = [
    LAST_HOUR,
    ADA,
    { label: 'orders since 09:08', matches: (o) => o.time >= '09:08', on: 'time' },
    { label: "finn's orders", matches: (o) => o.user === 'finn', on: 'user', user: 'finn' },
  ];

  it('never misses a shard that holds a matching order (brute force over every layout and query)', () => {
    for (const [s, k] of COMBOS) {
      const defs = shardDefs(s, k, START_SHARDS);
      const placed = placeAll(s, k, defs);
      for (const q of queries) {
        const holders = new Set(ORDERS.filter(q.matches).map((o) => placed[o.id]));
        const asked = new Set(shardsAsked(q, s, k, defs));
        for (const h of holders) expect(asked.has(h), `${s} ${k} ${q.label}`).toBe(true);
      }
    }
  });

  it('a query on the shard key asks one shard (range time, or user either way), except a time range on a hashed key; any other asks all', () => {
    const asked = (q: Query, s: Strategy, k: ShardKey) => shardsAsked(q, s, k, shardDefs(s, k, START_SHARDS)).length;
    expect(asked(LAST_HOUR, 'range', 'time')).toBe(1);
    expect(asked(LAST_HOUR, 'hash', 'time')).toBe(START_SHARDS);
    expect(asked(LAST_HOUR, 'range', 'user')).toBe(START_SHARDS);
    expect(asked(LAST_HOUR, 'hash', 'user')).toBe(START_SHARDS);
    expect(asked(ADA, 'range', 'user')).toBe(1);
    expect(asked(ADA, 'hash', 'user')).toBe(1);
    expect(asked(ADA, 'range', 'time')).toBe(START_SHARDS);
    expect(asked(ADA, 'hash', 'time')).toBe(START_SHARDS);
  });

  it('asking one shard for a query that is not on the key would miss rows (why scatter-gather is needed)', () => {
    const defs = shardDefs('hash', 'time', START_SHARDS);
    const placed = placeAll('hash', 'time', defs);
    const aToF: Query = { label: 'users a to f', matches: (o) => o.user[0] <= 'f', on: 'user' };
    const holders = new Set(ORDERS.filter(aToF.matches).map((o) => placed[o.id]));
    expect(holders.size).toBeGreaterThan(1);
    expect(shardsAsked(aToF, 'hash', 'time', defs)).toHaveLength(START_SHARDS);
  });

  it('latency is the slowest shard asked plus the merge cost; a hot shard is slow', () => {
    expect(queryLatency([0], [4, 4, 4, 4])).toBe(BASE_MS);
    expect(queryLatency([0, 1, 2, 3], [4, 4, 4, 4])).toBe(BASE_MS + MERGE_MS_PER_SHARD * 4);
    expect(queryLatency([3], [0, 0, 0, 16])).toBe(HOT_MS);
    expect(queryLatency([0, 1, 2, 3], [0, 0, 0, 16])).toBe(HOT_MS + MERGE_MS_PER_SHARD * 4);
  });
});

describe('adding a fifth shard', () => {
  it('hash: the orders moved are exactly those whose hash % 4 differs from hash % 5 (independent count)', () => {
    for (const key of ['time', 'user'] as const) {
      const re = rebalance('hash', key, place('hash', key));
      const expected = ORDERS.filter((o) => fnv32(hashInput(o, key)) % 4 !== fnv32(hashInput(o, key)) % 5).map((o) => o.id);
      expect(re.moved).toEqual(expected);
      expect(re.newShard).toBe(START_SHARDS);
    }
  });

  it('hash % N moves about 4/5 of keys on a 4 to 5 change (20,000 FNV-1a keys, so the caption can say "about")', () => {
    let moved = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) if (fnv32(`order-${i}`) % 4 !== fnv32(`order-${i}`) % 5) moved++;
    expect(Math.abs(moved / N - 4 / 5)).toBeLessThan(0.03);
  });

  it('range on user: only the orders in the upper half of the split range move', () => {
    const placed = place('range', 'user');
    const re = rebalance('range', 'user', placed);
    expect(re.hottest).toBe(0);
    const upper = ORDERS.filter((o) => o.user[0] >= 'd' && o.user[0] <= 'f').map((o) => o.id);
    expect(re.moved).toEqual(upper);
    expect(re.defs.map((d) => d.range)).toEqual(['a–c', 'd–f', 'g–l', 'm–r', 's–z']);
    // Everything outside the split range keeps its machine.
    for (const o of ORDERS.filter((x) => x.user[0] > 'f')) expect(re.before[o.id] - 1).toBe(re.next[o.id] - 1);
  });

  it('range on time: all 16 orders are from today, so all of them move and one shard still holds everything', () => {
    const placed = place('range', 'time');
    const re = rebalance('range', 'time', placed);
    expect(re.moved).toHaveLength(ORDERS.length);
    const after = loadOf(re.next, START_SHARDS + 1);
    expect(after.counts.filter((c) => c > 0)).toEqual([ORDERS.length]);
    expect(isHot(after.counts[re.newShard], after.even)).toBe(true);
  });

  it('every order keeps a shard that exists in the new layout', () => {
    for (const [s, k] of COMBOS) {
      const re = rebalance(s, k, place(s, k));
      for (const o of ORDERS) {
        expect(re.next[o.id]).toBeLessThan(re.defs.length);
        expect(re.before[o.id]).toBeLessThan(re.defs.length);
      }
    }
  });
});

const STRATEGIES: Strategy[] = ['range', 'hash', 'directory'];
const KEYS: ShardKey[] = ['time', 'user'];
const DATASETS: Dataset[] = ['even', 'skewed'];
const placeOn = (s: Strategy, k: ShardKey, d: Dataset, n = START_SHARDS) => placeAll(s, k, shardDefs(s, k, n), ordersFor(d));

describe('directory placement: a lookup table from key to shard', () => {
  it('on one-order-per-user data the directory is hand-worked: the first four keys take S1 to S4 in turn, and the 16 land 4 on each shard', () => {
    const placed = place('directory', 'user');
    expect([1, 2, 3, 4].map((id) => placed[id])).toEqual([0, 1, 2, 3]);
    expect(loadOf(placed, START_SHARDS).counts).toEqual([4, 4, 4, 4]);
    // The same balance on created_at, where every order is a new key: the directory ignores that every order is from today.
    expect(loadOf(place('directory', 'time'), START_SHARDS).counts).toEqual([4, 4, 4, 4]);
  });

  it('the table is consistent: every order of one key is on the shard its table entry names, for both datasets', () => {
    for (const d of DATASETS) {
      const orders = ordersFor(d);
      const placed = placeOn('directory', 'user', d);
      for (const user of new Set(orders.map((o) => o.user))) {
        expect(new Set(orders.filter((o) => o.user === user).map((o) => placed[o.id])).size, `${d} ${user}`).toBe(1);
      }
      expect(directoryEntries(placed, 'user', orders)).toBe(new Set(orders.map((o) => o.user)).size);
    }
    expect(directoryEntries(place('directory', 'user'), 'user')).toBe(16);
    expect(directoryEntries(placeOn('directory', 'user', 'skewed'), 'user', SKEWED_ORDERS)).toBe(8);
    expect(directoryEntries({ 1: 0, 2: 1 }, 'user')).toBe(2);
  });

  it('a query on the key asks exactly the shards that hold its matches (brute force over every layout, key, dataset and query)', () => {
    const queries: Query[] = [
      LAST_HOUR,
      ADA,
      { label: 'orders since 09:08', matches: (o) => o.time >= '09:08', on: 'time' },
      { label: "finn's orders", matches: (o) => o.user === 'finn', on: 'user', user: 'finn' },
    ];
    for (const s of STRATEGIES) {
      for (const k of KEYS) {
        for (const d of DATASETS) {
          const orders = ordersFor(d);
          const defs = shardDefs(s, k, START_SHARDS);
          const placed = placeAll(s, k, defs, orders);
          for (const q of queries) {
            const holders = new Set(orders.filter(q.matches).map((o) => placed[o.id]));
            const asked = new Set(shardsAsked(q, s, k, defs, undefined, orders));
            if (s === 'directory') {
              // The directory is exact: it names every shard that holds a match and no other when the query is on the key.
              const table = shardsAsked(q, s, k, defs, Object.fromEntries(orders.map((o) => [k === 'time' ? `2026-12-01T${o.time}` : o.user, placed[o.id]])), orders);
              if (q.on === k) expect(new Set(table), `${s} ${k} ${d} ${q.label}`).toEqual(holders);
            }
            for (const h of holders) expect(asked.has(h), `${s} ${k} ${d} ${q.label}`).toBe(true);
          }
        }
      }
    }
  });

  it('only a directory pays a lookup on each request, and it is part of the latency a query shows', () => {
    expect(lookupMs('directory')).toBe(DIRECTORY_LOOKUP_MS);
    expect(lookupMs('hash')).toBe(0);
    expect(lookupMs('range')).toBe(0);
    expect(queryLatency([0], [4, 4, 4, 4], DIRECTORY_LOOKUP_MS)).toBe(BASE_MS + DIRECTORY_LOOKUP_MS);
    const frames = buildFrames('directory', 'user', false).frames;
    const ada = frames.find((f) => f.query?.label === ADA.label)!;
    expect(ada.query!.latency).toBe(BASE_MS + DIRECTORY_LOOKUP_MS);
    const hashAda = buildFrames('hash', 'user', false).frames.find((f) => f.query?.label === ADA.label)!;
    expect(hashAda.query!.latency).toBe(BASE_MS);
  });

  it('re-sharding a directory moves only the keys it is told to: the new shard ends with a fair share, nothing else moves, and the cost is counted in keys', () => {
    for (const k of KEYS) {
      const orders = ordersFor('even');
      const placed = place('directory', k);
      const re = rebalance('directory', k, placed, orders);
      const fairShare = Math.floor(ORDERS.length / (START_SHARDS + 1));
      const after = loadOf(re.next, START_SHARDS + 1);
      expect(after.counts[re.newShard], k).toBe(fairShare);
      // Orders that did not move are on exactly the machine they were on.
      for (const o of ORDERS) if (!re.moved.includes(o.id)) expect(re.next[o.id], `${k} order ${o.id}`).toBe(placed[o.id]);
      expect(re.moved.every((id) => re.next[id] === re.newShard)).toBe(true);
      expect(re.moved).toHaveLength(fairShare);
      expect(re.movedKeys).toBe(fairShare);
    }
  });

  it('it beats hash % N on the cost of re-sharding, and moves far fewer orders than range on created_at', () => {
    const moved = (s: Strategy, k: ShardKey) => rebalance(s, k, place(s, k)).moved.length;
    expect(moved('directory', 'user')).toBeLessThan(moved('hash', 'user'));
    expect(moved('directory', 'time')).toBeLessThan(moved('range', 'time'));
  });

  it('the cost shown for hash and range is counted in keys too: moved keys are the distinct keys of the moved orders', () => {
    for (const [s, k] of COMBOS) {
      const re = rebalance(s, k, place(s, k));
      expect(re.movedKeys, `${s} ${k}`).toBe(new Set(re.moved.map((id) => (k === 'time' ? ORDERS[id - 1].time : ORDERS[id - 1].user))).size);
    }
  });
});

describe('a hot shard under skew: one very busy key', () => {
  const adaOrders = SKEWED_ORDERS.filter((o) => o.user === BUSY_USER).length;

  it('the skewed data is what it says: one user placed more than half of the 16 orders, and everyone else ordered once', () => {
    expect(SKEWED_ORDERS).toHaveLength(ORDERS.length);
    expect(adaOrders).toBe(9);
    expect(adaOrders).toBeGreaterThan(SKEWED_ORDERS.length / 2);
    const others = SKEWED_ORDERS.filter((o) => o.user !== BUSY_USER).map((o) => o.user);
    expect(new Set(others).size).toBe(others.length);
    expect(new Set(SKEWED_ORDERS.map((o) => o.time)).size).toBe(SKEWED_ORDERS.length);
  });

  it('under every placement rule on user_id, the busy user\'s shard holds all their orders and is hot; the same rules are not hot on even data', () => {
    for (const s of STRATEGIES) {
      const skewed = loadOf(placeOn(s, 'user', 'skewed'), START_SHARDS);
      // Pigeonhole, not placement logic: one key's orders share a shard, so the busiest shard holds at least all of them.
      expect(Math.max(...skewed.counts), s).toBeGreaterThanOrEqual(adaOrders);
      expect(skewed.counts.some((c) => isHot(c, skewed.even)), s).toBe(true);
      expect(skewed.busiest, s).toBeGreaterThan(HOT_FACTOR);
      expect(loadOf(placeOn(s, 'user', 'even'), START_SHARDS).counts.some((c, _i, all) => isHot(c, ORDERS.length / all.length)), s).toBe(false);
    }
  });

  it('the busy user\'s own query lands on that hot shard and is slow, whichever rule placed it', () => {
    for (const s of STRATEGIES) {
      const { frames } = buildFrames(s, 'user', false, 'skewed');
      const ada = frames.find((f) => f.query?.label === ADA.label)!;
      expect(ada.query!.touched, s).toHaveLength(1);
      expect(ada.query!.latency, s).toBe(HOT_MS + lookupMs(s));
    }
  });

  it('a directory can keep every other key off the busy key\'s shard, yet the shard stays hot; moving the key on re-sharding would only move the heat, so it stays', () => {
    const placed = placeOn('directory', 'user', 'skewed');
    const adaShard = placed[SKEWED_ORDERS.find((o) => o.user === BUSY_USER)!.id];
    const onAdaShard = SKEWED_ORDERS.filter((o) => placed[o.id] === adaShard);
    expect(onAdaShard.every((o) => o.user === BUSY_USER)).toBe(true);
    const re = rebalance('directory', 'user', placed, SKEWED_ORDERS);
    for (const o of SKEWED_ORDERS.filter((x) => x.user === BUSY_USER)) expect(re.next[o.id]).toBe(adaShard);
    const after = loadOf(re.next, START_SHARDS + 1);
    expect(isHot(after.counts[adaShard], after.even)).toBe(true);
    expect(after.counts[re.newShard]).toBe(Math.floor(SKEWED_ORDERS.length / (START_SHARDS + 1)));
  });

  it('the caption on the last write frame says the busy key makes one hot shard, with the same number the stat shows', () => {
    for (const s of STRATEGIES) {
      const { frames } = buildFrames(s, 'user', false, 'skewed');
      const writes = frames.filter((f) => f.phase === 'write').at(-1)!;
      const busiest = loadOf(writes.placed, START_SHARDS).busiest;
      const t = captionText(frames.at(-1)!.say, { strict: true });
      expect(t, s).toContain('One busy user');
      expect(t, s).toContain(`${busiest.toFixed(2)}×`);
    }
  });

  it('the busy user does not exist under created_at (every order has its own time), so the layouts there are the same numbers as on even data', () => {
    for (const s of STRATEGIES) {
      expect(loadOf(placeOn(s, 'time', 'skewed'), START_SHARDS).counts, s).toEqual(loadOf(placeOn(s, 'time', 'even'), START_SHARDS).counts);
    }
  });
});

describe('captions say what the model computed', () => {
  const text = (s: Strategy, k: ShardKey, added: boolean, idx: number) => {
    const { frames } = buildFrames(s, k, added);
    return captionText(frames[idx].say, { strict: true });
  };
  const lastIdx = (s: Strategy, k: ShardKey, added: boolean) => buildFrames(s, k, added).frames.length - 1;

  it('the sixth write on range + time says one shard takes all the writes; on the other layouts it reports reach and load', () => {
    expect(text('range', 'time', false, 6)).toContain('S4 takes all the writes');
    for (const [s, k] of COMBOS.slice(1)) {
      const { frames } = buildFrames(s, k, false);
      const placed = frames[6].placed;
      const l = loadOf(placed, START_SHARDS);
      const used = l.counts.filter((c) => c > 0).length;
      const t = captionText(frames[6].say, { strict: true });
      expect(t, `${s} ${k}`).toContain(`reached ${used} of ${START_SHARDS} shards`);
      expect(t).toContain(`${l.busiest.toFixed(2)}×`);
    }
  });

  it('the rebalance caption quotes the moved count the model found, for each layout', () => {
    for (const [s, k] of COMBOS) {
      const re = rebalance(s, k, place(s, k));
      const t = text(s, k, true, lastIdx(s, k, true));
      expect(t, `${s} ${k}`).toContain(`${re.moved.length} of ${ORDERS.length}`);
    }
    expect(text('hash', 'time', true, lastIdx('hash', 'time', true))).toContain('about 4/5');
  });

  it('range + time: "last hour" names the hot shard\'s latency, and the stat latency is that same number', () => {
    const { frames } = buildFrames('range', 'time', false);
    const q = frames.find((f) => f.query?.label === LAST_HOUR.label)!;
    expect(q.query!.touched).toEqual([3]);
    expect(q.query!.latency).toBe(HOT_MS);
    expect(captionText(q.say, { strict: true })).toContain(`still takes ${HOT_MS} ms`);
  });

  it('range + user: the user query names one shard and the time query says every shard', () => {
    const { frames } = buildFrames('range', 'user', false);
    const asks = frames.filter((f) => f.query).map((f) => [f.query!.label, f.query!.touched.length]);
    expect(asks).toEqual([[LAST_HOUR.label, START_SHARDS], [ADA.label, 1]]);
    expect(text('range', 'user', false, lastIdx('range', 'user', false))).toContain('1.25×');
  });
});

describe('try-this, from the lesson as it loads (Range + created_at)', () => {
  it('try-this 1: every order lands on S4 and the busiest number reaches 4×', () => {
    const { frames } = buildFrames('range', 'time', false);
    const last = frames.filter((f) => f.phase === 'write').at(-1)!;
    expect(Object.values(last.placed)).toEqual(Array(ORDERS.length).fill(3));
    expect(loadOf(last.placed, START_SHARDS).busiest).toBe(4);
  });

  it('try-this 2: on Hash no shard is hot, and "last hour" asks all 4', () => {
    const { frames } = buildFrames('hash', 'time', false);
    const last = frames.filter((f) => f.phase === 'write').at(-1)!;
    const { counts, even } = loadOf(last.placed, START_SHARDS);
    expect(counts.some((c) => isHot(c, even))).toBe(false);
    expect(frames.find((f) => f.query?.label === LAST_HOUR.label)!.query!.touched).toHaveLength(START_SHARDS);
  });

  it('try-this 3: on Range + user_id one query asks all 4 shards and the other asks 1', () => {
    const { frames } = buildFrames('range', 'user', false);
    expect(frames.filter((f) => f.query).map((f) => f.query!.touched.length).sort()).toEqual([1, START_SHARDS]);
  });

  it('try-this 4: adding a shard leaves range + time hot, moves most orders on hash, and just the split range on range + user', () => {
    const range = rebalance('range', 'time', place('range', 'time'));
    const hash = rebalance('hash', 'time', place('hash', 'time'));
    const user = rebalance('range', 'user', place('range', 'user'));
    const hot = loadOf(range.next, START_SHARDS + 1);
    expect(isHot(Math.max(...hot.counts), hot.even)).toBe(true);
    expect(hash.moved.length / ORDERS.length).toBeGreaterThan(0.6);
    expect(user.moved.length).toBeLessThanOrEqual(3);
    // Directory + user_id: just the keys the directory moves, a fair share for the new shard and nothing else.
    const directory = rebalance('directory', 'user', place('directory', 'user'));
    expect(directory.moved.length).toBe(Math.floor(ORDERS.length / (START_SHARDS + 1)));
    expect(directory.moved.length).toBeLessThan(hash.moved.length);
  });
});

describe('try-this 5, as written: Directory + user_id, then the busy user on each layout', () => {
  it('try-this 5: Directory + user_id spreads the writes, counts one entry for each user and charges the lookup; with the busy user every layout is left with a hot shard', () => {
    const { frames } = buildFrames('directory', 'user', false);
    const lastWrite = frames.filter((f) => f.phase === 'write').at(-1)!;
    expect(loadOf(lastWrite.placed, START_SHARDS).busiest).toBe(1);
    expect(directoryEntries(lastWrite.placed, 'user')).toBe(ORDERS.length);
    for (const f of frames.filter((x) => x.query)) expect(f.query!.latency).toBeGreaterThanOrEqual(BASE_MS + DIRECTORY_LOOKUP_MS);
    for (const s of STRATEGIES) {
      const { counts, even } = loadOf(placeOn(s, 'user', 'skewed'), START_SHARDS);
      expect(counts.some((c) => isHot(c, even)), s).toBe(true);
    }
  });

  it('the re-shard caption for the directory quotes the moved count and the rewritten entries the model found', () => {
    const { frames } = buildFrames('directory', 'user', true);
    const re = rebalance('directory', 'user', place('directory', 'user'));
    const t = captionText(frames.at(-1)!.say, { strict: true });
    expect(t).toContain(`${re.moved.length} of ${ORDERS.length}`);
    expect(t).toContain(`${re.movedKeys} directory entries rewritten`);
  });
});

describe('the lesson text', () => {
  it('has five try-this entries and a quiz that names the sequential-key misconception', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz.some((q) => /auto-increment/.test(q.q))).toBe(true);
  });
});
