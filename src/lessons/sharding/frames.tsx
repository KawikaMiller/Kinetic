import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import {
  ADA, BUSY_USER, buildDirectory, directoryEntries, DIRECTORY_LOOKUP_MS, isHot, keyName, LAST_HOUR, loadOf, lookupMs, ordersFor, placeAll,
  queryLatency, rebalance, shardDefs, shardFor, shardsAsked, START_SHARDS, type Dataset, type Order, type ShardDef, type ShardKey, type Strategy,
} from './model';

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

const times = (x: number) => `${x.toFixed(2)}×`;

const STRATEGY_WORD: Record<Strategy, string> = { range: 'range', hash: 'hash', directory: 'directory' };

/** The frames of one run: write every order, run two queries, then (optionally) add a fifth shard. */
export function buildFrames(strategy: Strategy, key: ShardKey, addShard: boolean, dataset: Dataset = 'even'): { frames: ShFrame[]; rebalanceAt: number } {
  const orders = ordersFor(dataset);
  const defs = shardDefs(strategy, key, START_SHARDS);
  const final = placeAll(strategy, key, defs, orders);
  const directory = strategy === 'directory' ? buildDirectory(key, defs.length, orders) : undefined;
  const lookup = lookupMs(strategy);
  const busyOrders = orders.filter((o) => o.user === BUSY_USER).length;
  const placed: Record<number, number> = {};
  const col = keyName(key);
  // The incoming order and the running query are on screen for one frame each.
  const r = createRecorder<ShFrame>(
    { shards: defs, placed: {}, incoming: null, query: null, moved: [], phase: 'intro' },
    { transient: { incoming: null, query: null } },
  );

  r.snap(
    <>
      Orders are split across <b>{START_SHARDS} shards</b> by <span className="hl">{STRATEGY_WORD[strategy]}</span> of{' '}
      <code>{col}</code>. {dataset === 'skewed' ? <>One user, <b>{BUSY_USER}</b>, placed {busyOrders} of the {orders.length} orders. </> : null}Watch where today's orders land.
    </>,
  );

  orders.forEach((o, i) => {
    const s = shardFor(o, strategy, key, defs, directory);
    placed[o.id] = s;
    const so_far = loadOf(placed, defs.length);
    const used = so_far.counts.filter((c) => c > 0).length;
    let say: ReactNode | undefined;
    if (i === 0)
      say =
        strategy === 'hash' ? (
          <>
            The router hashes <code>{col}</code> and takes it mod {defs.length}: shard <b>S{s + 1}</b>.
          </>
        ) : strategy === 'directory' ? (
          <>
            The router looks <code>{col}</code> up in the <b>directory</b>, a table of key to shard. A key it has not seen goes to the shard with
            the fewest orders, here <b>S{s + 1}</b>, and the table gets a new entry.
          </>
        ) : (
          <>
            The router looks up which range <code>{col}</code> falls in: shard <b>S{s + 1}</b>.
          </>
        );
    if (i === 5)
      say =
        used === 1 ? (
          <>
            Every new order is from <b>today</b>, and today lives in one range. <span className="hl bad">S{s + 1} takes all the
            writes</span> while the other {defs.length - 1} sit idle.
          </>
        ) : (
          <>
            After {plural(i + 1, 'order')}, writes have reached {used} of {defs.length} shards and the busiest holds{' '}
            {times(so_far.busiest)} an even share.
          </>
        );
    r.snap(say, undefined, { placed: { ...placed }, incoming: o, phase: 'write' });
  });

  const full = loadOf(final, defs.length);
  const { counts } = full;

  const askLast = shardsAsked(LAST_HOUR, strategy, key, defs, directory, orders);
  const askedHot = askLast.length === 1 && isHot(counts[askLast[0]], full.even);
  r.snap(
    askLast.length === 1 ? (
      <>
        "Orders from the last hour" is a range on the shard key, so the router asks <span className="hl ok">one shard</span>
        {askedHot && <>, but it is the hot one, so the answer still takes {queryLatency(askLast, counts, lookup)} ms</>}.
      </>
    ) : (
      <>
        "Orders from the last hour" isn't something the router can locate{' '}
        {strategy === 'directory' ? 'from one shard: the table lists their times on several' : key === 'time' ? 'after hashing' : 'by user'}, so it must ask{' '}
        <span className="hl bad">every shard</span> and merge the answers: <b>scatter-gather</b>.
      </>
    ),
    undefined,
    { query: { label: LAST_HOUR.label, touched: askLast, latency: queryLatency(askLast, counts, lookup) }, phase: 'query' },
  );

  const askAda = shardsAsked(ADA, strategy, key, defs, directory, orders);
  const adaHot = askAda.length === 1 && isHot(counts[askAda[0]], full.even);
  r.snap(
    askAda.length === 1 ? (
      <>
        "ada's orders": the shard key is the user, so it goes to <span className="hl ok">exactly one shard</span>
        {strategy === 'directory' && <>, after a {DIRECTORY_LOOKUP_MS} ms directory lookup</>}
        {adaHot && <>, but that shard is hot, so the answer still takes {queryLatency(askAda, counts, lookup)} ms</>}.
      </>
    ) : (
      <>
        "ada's orders": the shard key is time, so ada's orders could be anywhere. <span className="hl bad">Every shard</span>{' '}
        gets asked.
      </>
    ),
    undefined,
    { query: { label: ADA.label, touched: askAda, latency: queryLatency(askAda, counts, lookup) }, phase: 'query' },
  );

  const entries = directoryEntries(final, key, orders);
  r.snap(
    dataset === 'skewed' && key === 'user' ? (
      <>
        One busy user: all {busyOrders} of {BUSY_USER}'s orders share one key, so they sit on <b>one shard</b> under any placement rule, and that shard is{' '}
        <span className="hl bad">hot</span> ({times(full.busiest)} an even share). Hash, range and a directory can only choose <i>which</i> shard holds a key, not
        split it.
      </>
    ) : strategy === 'directory' ? (
      <>
        Directory: placement is whatever the table says, so writes spread ({times(full.busiest)} an even share for the busiest) and a query on the key goes to the
        shard it lists. The price: a lookup on each request ({DIRECTORY_LOOKUP_MS} ms here), {entries} table entries to store, and a table that, if it goes down,
        takes routing with it.
      </>
    ) : strategy === 'range' && key === 'time' ? (
      <>
        Range on time: time-range queries go to one shard, but that shard is a <span className="hl bad">hot shard</span> for
        every write ({times(full.busiest)} an even share). Try hash, or shard by user.
      </>
    ) : strategy === 'hash' ? (
      <>
        Hash: writes spread (the busiest shard holds {times(full.busiest)} an even share), but range queries turn into
        scatter-gather. The shard key decides which queries stay cheap.
      </>
    ) : (
      <>
        Range on user: writes spread ({times(full.busiest)} an even share for the busiest) and per-user queries are cheap,
        but time queries hit every shard.
      </>
    ),
    2,
    { phase: 'done' },
  );

  const rebalanceAt = r.frames.length;
  if (!addShard) return { frames: r.frames, rebalanceAt };

  const re = rebalance(strategy, key, final, orders);
  const { moved } = re;
  const newDefs = re.defs;
  const afterLoad = loadOf(re.next, newDefs.length);
  r.snap(
    strategy === 'directory' ? (
      <>
        Add a {START_SHARDS + 1}th shard. A directory moves only the keys you tell it to: here, enough to give the new shard a fair share of the orders.
      </>
    ) : strategy === 'hash' ? (
      <>
        Add a {START_SHARDS + 1}th shard. With <code>hash % N</code>, N just changed from {START_SHARDS} to {START_SHARDS + 1}…
      </>
    ) : (
      <>
        Add a {START_SHARDS + 1}th shard by <b>splitting the {key === 'time' ? 'newest' : 'busiest'} range</b> (S{re.hottest + 1}) in two.
      </>
    ),
    undefined,
    { shards: newDefs, placed: re.before, phase: 'rebalance', newShard: re.newShard },
  );
  r.snap(
    strategy === 'directory' ? (
      <>
        <span className="hl ok">{moved.length} of {orders.length}</span> orders moved ({re.movedKeys} directory {re.movedKeys === 1 ? 'entry' : 'entries'} rewritten),
        just enough to give the new shard a fair share, and nothing else moves.
        {dataset === 'skewed' && key === 'user' ? <> {BUSY_USER}'s {busyOrders} orders stay together: moving that key would only move the heat to the new shard.</> : null}
      </>
    ) : strategy === 'hash' ? (
      <>
        …so <span className="hl bad">{moved.length} of {orders.length}</span> orders have to move (hash % N moves about{' '}
        {START_SHARDS}/{START_SHARDS + 1} of the keys when N goes from {START_SHARDS} to {START_SHARDS + 1}). That is why many
        real systems use <b>consistent hashing</b> or many small fixed partitions instead of <code>% N</code>.
      </>
    ) : key === 'time' ? (
      <>
        <span className="hl bad">{moved.length} of {orders.length}</span> orders moved: every order here is from today, so
        all of them sit in the half that became the new "today" shard. <span className="hl bad">Still one hot shard</span>
        ({times(afterLoad.busiest)} an even share): splitting can't fix a sequential key.
      </>
    ) : (
      <>
        Just the split shard's upper half moves: <span className="hl ok">{moved.length} of {orders.length}</span> orders. The
        rest stay put.
      </>
    ),
    2.5,
    { placed: re.next, moved },
  );
  return { frames: r.frames, rebalanceAt };
}
