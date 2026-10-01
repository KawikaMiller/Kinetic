import type { ReactNode } from 'react';
import { pad2 } from '../../core/format';
import { fnv1a } from '../../core/hash';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';

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

export interface ShFrame extends Frame {
  shards: ShardDef[];
  /** order id → shard index, for orders written so far */
  placed: Record<number, number>;
  incoming: Order | null;
  query: { label: string; touched: number[]; latency: number } | null;
  moved: number[];
  /** Index of the shard added by rebalancing, if any. */
  newShard?: number;
  phase: 'intro' | 'write' | 'query' | 'rebalance' | 'done';
}

const USERS = ['ada', 'tia', 'max', 'bo', 'zed', 'lu', 'rae', 'finn', 'sol', 'hana', 'ivo', 'eve', 'wes', 'kai', 'mo', 'cy'];
export const ORDERS: Order[] = USERS.map((user, i) => ({
  id: i + 1,
  time: `09:${pad2(i + 1)}`,
  user,
}));

/** A shard counts as hot once it holds this many times an even share. */
export const HOT_FACTOR = 2;

const TIME_RANGES = ['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'];
const USER_RANGES = ['a–f', 'g–l', 'm–r', 's–z'];

function shardDefs(strategy: Strategy, key: ShardKey, n: number, split = -1): ShardDef[] {
  if (strategy === 'hash') return Array.from({ length: n }, (_, i) => ({ name: `S${i + 1}`, range: `hash % ${n} = ${i}` }));
  const ranges = key === 'time' ? TIME_RANGES.slice() : USER_RANGES.slice();
  if (n === 5 && split >= 0) {
    if (key === 'time') ranges.splice(3, 1, 'Oct–Nov', 'Dec (today)');
    else {
      const [lo, hi] = ranges[split].split('–');
      const mid = String.fromCharCode(Math.floor((lo.charCodeAt(0) + hi.charCodeAt(0)) / 2));
      ranges.splice(split, 1, `${lo}–${mid}`, `${String.fromCharCode(mid.charCodeAt(0) + 1)}–${hi}`);
    }
  }
  return ranges.map((r, i) => ({ name: `S${i + 1}`, range: r }));
}

function shardFor(o: Order, strategy: Strategy, key: ShardKey, defs: ShardDef[]): number {
  const k = key === 'time' ? `2026-12-01T${o.time}` : o.user;
  // FNV-1a: a real (if tiny) hash, so the spread is honest.
  if (strategy === 'hash') return fnv1a(k) % defs.length;
  if (key === 'time') return defs.length - 1; // every order placed today lands in the newest range
  const bounds = defs.map((d) => d.range!.split('–')[1]);
  return bounds.findIndex((b) => o.user[0] <= b[0]);
}

const BASE_MS = 10;
const HOT_MS = 45;

function queryLatency(touched: number[], counts: number[]) {
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const per = touched.map((i) => (counts[i] > avg * HOT_FACTOR ? HOT_MS : BASE_MS));
  return Math.max(...per) + (touched.length > 1 ? 2 * touched.length : 0);
}

export function buildFrames(strategy: Strategy, key: ShardKey, addShard: boolean): { frames: ShFrame[]; rebalanceAt: number } {
  const defs = shardDefs(strategy, key, 4);
  const placed: Record<number, number> = {};
  const keyName = key === 'time' ? 'created_at' : 'user_id';
  // The incoming order and the running query are on screen for one frame each.
  const r = createRecorder<ShFrame>(
    { shards: defs, placed: {}, incoming: null, query: null, moved: [], phase: 'intro' },
    { transient: { incoming: null, query: null } },
  );

  r.snap(
    <>
      Orders are split across <b>4 shards</b> by <span className="hl">{strategy === 'range' ? 'range' : 'hash'}</span> of{' '}
      <code>{keyName}</code>. Watch where today's orders land.
    </>,
  );

  ORDERS.forEach((o, i) => {
    const s = shardFor(o, strategy, key, defs);
    placed[o.id] = s;
    let say: ReactNode | undefined;
    if (i === 0)
      say =
        strategy === 'hash' ? (
          <>
            The router hashes <code>{keyName}</code> and takes it mod 4: shard <b>S{s + 1}</b>.
          </>
        ) : (
          <>
            The router looks up which range <code>{keyName}</code> falls in: shard <b>S{s + 1}</b>.
          </>
        );
    if (i === 5)
      say =
        strategy === 'range' && key === 'time' ? (
          <>
            Every new order is from <b>today</b>, and today lives in one range. <span className="hl bad">S4 takes all the
            writes</span> while S1 to S3 sit idle.
          </>
        ) : (
          <>Writes spread across the shards. No single machine takes the whole load.</>
        );
    r.snap(say, undefined, { placed: { ...placed }, incoming: o, phase: 'write' });
  });

  const counts = defs.map((_, i) => Object.values(placed).filter((s) => s === i).length);
  const all = defs.map((_, i) => i);

  // Query 1: a time-range query.
  const q1 = strategy === 'range' && key === 'time' ? [3] : all;
  r.snap(
    q1.length === 1 ? (
      <>
        "Orders from the last hour" is a range on the shard key, so the router asks <span className="hl ok">one shard</span>.
      </>
    ) : (
      <>
        "Orders from the last hour" isn't something the router can locate {key === 'time' ? 'after hashing' : 'by user'},
        so it must ask <span className="hl bad">every shard</span> and merge the answers: <b>scatter-gather</b>.
      </>
    ),
    undefined,
    { query: { label: 'orders from the last hour', touched: q1, latency: queryLatency(q1, counts) }, phase: 'query' },
  );

  // Query 2: one user's orders.
  const ada = ORDERS[0];
  const q2 = key === 'user' ? [shardFor(ada, strategy, key, defs)] : all;
  r.snap(
    q2.length === 1 ? (
      <>
        "ada's orders": the shard key is the user, so it goes to <span className="hl ok">exactly one shard</span>.
      </>
    ) : (
      <>
        "ada's orders": the shard key is time, so ada's orders could be anywhere.{' '}
        <span className="hl bad">Every shard</span> gets asked.
      </>
    ),
    undefined,
    { query: { label: "ada's orders", touched: q2, latency: queryLatency(q2, counts) }, phase: 'query' },
  );

  r.snap(
    strategy === 'range' && key === 'time' ? (
      <>
        Range on time: cheap time-range queries, but a <span className="hl bad">hot shard</span> for every write. Try hash,
        or shard by user.
      </>
    ) : strategy === 'hash' ? (
      <>
        Hash: even writes, but range queries turn into scatter-gather. The shard key decides which queries stay cheap.
      </>
    ) : (
      <>Range on user: even-ish writes and cheap per-user queries, but time queries hit every shard.</>
    ),
    2,
    { phase: 'done' },
  );

  const rebalanceAt = r.frames.length;
  if (!addShard) return { frames: r.frames, rebalanceAt };

  // Rebalance onto 5 shards.
  const hottest = counts.indexOf(Math.max(...counts));
  const defs5 = shardDefs(strategy, key, 5, key === 'time' ? 3 : hottest);
  // Which physical machine each new shard index is. Splitting shard s keeps its
  // lower half on the old machine; the upper half (s + 1) is the new machine.
  const split = key === 'time' ? 3 : hottest;
  const machine = (j: number) => (strategy === 'hash' || j <= split ? j : j === split + 1 ? -1 : j - 1);
  const next: Record<number, number> = {};
  const moved: number[] = [];
  for (const o of ORDERS) {
    next[o.id] = shardFor(o, strategy, key, defs5);
    if (machine(next[o.id]) !== placed[o.id]) moved.push(o.id);
  }

  // Before moving anything, show every order on its old machine in the new layout.
  const before: Record<number, number> = {};
  for (const o of ORDERS) {
    const m = placed[o.id];
    before[o.id] = strategy === 'hash' || m <= split ? m : m + 1;
  }
  const newShard = strategy === 'hash' ? 4 : split + 1;
  r.snap(
    strategy === 'hash' ? (
      <>
        Add a 5th shard. With <code>hash % N</code>, N just changed from 4 to 5…
      </>
    ) : (
      <>
        Add a 5th shard by <b>splitting the busiest range</b> (S{hottest + 1}) in two.
      </>
    ),
    undefined,
    { shards: defs5, placed: before, phase: 'rebalance', newShard },
  );
  r.snap(
    strategy === 'hash' ? (
      <>
        …so <span className="hl bad">{moved.length} of {ORDERS.length}</span> orders have to move. That's why real systems use{' '}
        <b>consistent hashing</b> or many small fixed partitions instead of <code>% N</code>.
      </>
    ) : key === 'time' ? (
      <>
        Only S4's orders moved ({moved.length}), and they all landed in the new "today" shard.{' '}
        <span className="hl bad">Still one hot shard.</span> Splitting can't fix a sequential key.
      </>
    ) : (
      <>
        Only the split shard's orders move: <span className="hl ok">{moved.length} of {ORDERS.length}</span>. The rest stay
        put.
      </>
    ),
    2.5,
    { placed: next, moved },
  );
  return { frames: r.frames, rebalanceAt };
}
