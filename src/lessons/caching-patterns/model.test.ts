import { describe, expect, it } from 'vitest';
import {
  behindStart, cached, execute, initialStore, interleavings, isStale, readAside, readThrough, replicaValue, runBehind, timed, writeAside,
  writeThrough, type BehindOp, type Invalidation, type Options, type Step, type Store, type Timed,
} from './model';

const noTtl: Options = { ttl: null, lag: 0 };
/** Steps get consecutive times 1, 2, 3, ... in the order they run. */
const inOrder = (steps: readonly Step[]): Timed[] => steps.map((s, i) => ({ ...s, t: i + 1 }));

describe('interleavings', () => {
  it('has C(n+m, n) members, each in order, none repeated', () => {
    const a = ['a1', 'a2', 'a3'];
    const b = ['b1', 'b2'];
    const all = interleavings(a, b);
    expect(all).toHaveLength(10);
    expect(new Set(all.map((x) => x.join())).size).toBe(10);
    for (const x of all) {
      expect(x.filter((s) => s.startsWith('a'))).toEqual(a);
      expect(x.filter((s) => s.startsWith('b'))).toEqual(b);
    }
  });
  it('handles empty lists', () => {
    expect(interleavings([], [1, 2])).toEqual([[1, 2]]);
    expect(interleavings([1], [])).toEqual([[1]]);
  });
});

describe('update-then-set: two writers, every interleaving', () => {
  const run = (how: Invalidation) =>
    interleavings(writeAside('A', '$12', how), writeAside('B', '$15', how)).map((order) => ({
      order,
      store: execute(initialStore('$10', '$10'), inOrder(order), noTtl).store,
    }));

  it('with set, exactly the two crossing interleavings leave the cache stale, and for good', () => {
    const results = run('set');
    expect(results).toHaveLength(6);
    const stale = results.filter((r) => isStale(r.store, 1e9, null));
    expect(stale).toHaveLength(2);
    for (const { order, store } of results) {
      const dbOrder = order.filter((s) => s.op === 'db-write').map((s) => s.client);
      const cacheOrder = order.filter((s) => s.op === 'set').map((s) => s.client);
      const crossing = dbOrder[1] !== cacheOrder[1];
      expect(isStale(store, 1e9, null)).toBe(crossing);
      expect(store.db).toBe(dbOrder[1] === 'A' ? '$12' : '$15');
      expect(store.cache).toBe(cacheOrder[1] === 'A' ? '$12' : '$15');
    }
  });

  it('the preset order (A writes db, B writes db, B sets, A sets) is one of them: db $15, cache $12', () => {
    const [a, b] = [writeAside('A', '$12', 'set'), writeAside('B', '$15', 'set')];
    const { store } = execute(initialStore('$10', '$10'), inOrder([a[0], b[0], b[1], a[1]]), noTtl);
    expect([store.db, store.cache]).toEqual(['$15', '$12']);
  });

  it('with delete, no interleaving leaves a stale entry: the last step of either writer empties the cache', () => {
    for (const { store } of run('delete')) {
      expect(store.cache).toBeNull();
      expect(isStale(store, 1e9, null)).toBe(false);
    }
  });
});

describe('read-fill: a cache-aside reader against a writer, every interleaving', () => {
  const reader = readAside('A', 'db');
  const cases = (how: Invalidation, warm: boolean) =>
    interleavings(reader, writeAside('B', '$12', how)).map((order) => ({
      order,
      store: execute(initialStore('$10', warm ? '$10' : null), inOrder(order), noTtl).store,
    }));
  const pos = (order: Step[], client: string, op: string) => order.findIndex((s) => s.client === client && s.op === op);

  it('from an empty cache, delete leaves a stale value exactly when the reader loaded before the write and filled after the delete', () => {
    const results = cases('delete', false);
    expect(results).toHaveLength(10);
    let staleCount = 0;
    for (const { order, store } of results) {
      const loadedOld = pos(order, 'A', 'load') < pos(order, 'B', 'db-write');
      const filledLate = pos(order, 'A', 'fill') > pos(order, 'B', 'delete');
      expect(isStale(store, 1e9, null)).toBe(loadedOld && filledLate);
      if (loadedOld && filledLate) staleCount += 1;
    }
    expect(staleCount).toBe(1);
  });

  it('from a warm cache, delete never leaves a stale value: the reader either hits or loads after the write', () => {
    for (const { store } of cases('delete', true)) expect(isStale(store, 1e9, null)).toBe(false);
  });

  it('overwriting the key instead of deleting it has the same race, and one more hazard', () => {
    const stale = cases('set', false).filter((c) => isStale(c.store, 1e9, null));
    expect(stale).toHaveLength(1);
  });

  it('delete never leaves a stale value without a concurrent stale fill: across all pairs of operations', () => {
    // Pairs: writer vs writer, writer vs reader. With delete, a stale final cache needs a fill that loaded before a write.
    const ops: [string, Step[]][] = [['reader', readAside('A', 'db')], ['writer', writeAside('A', '$12', 'delete')]];
    const others: [string, Step[]][] = [['reader', readAside('B', 'db')], ['writer', writeAside('B', '$15', 'delete')]];
    for (const [nameA, a] of ops) for (const [nameB, b] of others) for (const warm of [true, false]) {
      for (const order of interleavings(a, b)) {
        const store = execute(initialStore('$10', warm ? '$10' : null), inOrder(order), noTtl).store;
        if (!isStale(store, 1e9, null)) continue;
        const fills = order.filter((s) => s.op === 'fill');
        expect(fills.length, `${nameA} vs ${nameB}`).toBeGreaterThan(0);
        // some fill stored a value read before a database write that came after that read
        const stale = fills.some((f) => {
          const loadAt = order.findIndex((s) => s.client === f.client && s.op === 'load');
          return order.some((s, i) => s.op === 'db-write' && i > loadAt);
        });
        expect(stale).toBe(true);
      }
    }
  });
});

describe('TTL bounds staleness in every case', () => {
  const TTL = 30;
  const o: Options = { ttl: TTL, lag: 0 };
  const pairs: [Step[], Step[]][] = [
    [writeAside('A', '$12', 'set'), writeAside('B', '$15', 'set')],
    [readAside('A'), writeAside('B', '$12', 'delete')],
    [readAside('A'), writeAside('B', '$12', 'set')],
    [readAside('A', 'replica'), writeAside('B', '$12', 'delete')],
  ];

  it('whatever interleaving ran, a read at TTL after the last store misses, so the next read loads the database value', () => {
    for (const [a, b] of pairs) for (const warm of [true, false]) {
      for (const order of interleavings(a, b)) {
        const steps = inOrder(order);
        const store = execute(initialStore('$10', warm ? '$10' : null), steps, o).store;
        const expiresAt = store.cacheSetAt + TTL;
        expect(cached(store, expiresAt, TTL)).toBeNull();
        const reread = execute(store, timed(readAside('A')).map((s, i) => ({ ...s, t: expiresAt + i })), o);
        expect(reread.served.at(-1)!.value).toBe(store.db);
        expect(reread.served.at(-1)!.stale).toBe(false);
      }
    }
  });

  it('the time an entry spends stale is at most the TTL', () => {
    for (const [a, b] of pairs) {
      for (const order of interleavings(a, b)) {
        const steps = inOrder(order);
        const store = execute(initialStore('$10', null), steps, o).store;
        if (store.cache === null || store.cache === store.db) continue;
        const lastWrite = Math.max(...steps.filter((s) => s.op === 'db-write').map((s) => s.t));
        const becameStale = Math.max(store.cacheSetAt, lastWrite);
        expect(store.cacheSetAt + TTL - becameStale).toBeLessThanOrEqual(TTL);
        expect(store.cacheSetAt + TTL - becameStale).toBeGreaterThan(0);
      }
    }
  });
});

describe('read replica lag', () => {
  const run = (lag: number, source: 'db' | 'replica') => {
    const w = writeAside('B', '$12', 'delete');
    const r = readAside('A', source);
    const o: Options = { ttl: null, lag };
    return execute(initialStore('$10', '$10'), inOrder([...w, ...r]), o).store;
  };

  it('the replica shows a write only once the lag has passed', () => {
    const store = execute(initialStore('$10'), [{ client: 'A', op: 'db-write', value: '$12', t: 10 }], noTtl).store;
    expect(replicaValue(store, 9, 5)).toBe('$10');
    expect(replicaValue(store, 14.9, 5)).toBe('$10');
    expect(replicaValue(store, 15, 5)).toBe('$12');
  });

  it('a fill from the replica 3 s after the write is stale exactly when the lag is over 3 s', () => {
    for (let lag = 0; lag <= 8; lag++) expect(isStale(run(lag, 'replica'), 5, null)).toBe(lag > 3);
  });

  it('filling from the database is never stale, whatever the lag', () => {
    for (let lag = 0; lag <= 8; lag++) expect(isStale(run(lag, 'db'), 5, null)).toBe(false);
  });
});

describe('write-through', () => {
  const ops: [string, Step[]][] = [
    ['read', readThrough('A')], ['write $12', writeThrough('A', '$12')], ['write $15', writeThrough('A', '$15')],
  ];
  it('never leaves a stale value and never serves one, in any interleaving of any two operations', () => {
    let runs = 0;
    for (const [, a] of ops) for (const [, bSteps] of ops) for (const warm of [true, false]) {
      for (const order of interleavings(a, bSteps.map((s) => ({ ...s, client: 'B' as const })))) {
        const out = execute(initialStore('$10', warm ? '$10' : null), inOrder(order), noTtl);
        expect(isStale(out.store, 1e9, null)).toBe(false);
        expect(out.served.every((s) => !s.stale)).toBe(true);
        runs += 1;
      }
    }
    expect(runs).toBeGreaterThan(10);
  });
  it('the cache and the database hold the last write', () => {
    const { store } = execute(initialStore('$10'), inOrder([...writeThrough('A', '$12'), ...writeThrough('B', '$15')]), noTtl);
    expect([store.db, store.cache]).toEqual(['$15', '$15']);
  });
});

describe('write-behind', () => {
  /** An independent account of the same story, written from the definition rather than the model. */
  function reference(ops: readonly BehindOp[], db0: string) {
    let db = db0;
    let cache: string | null = db0;
    let unflushed: string[] = [];
    let lost = 0;
    for (const op of ops) {
      if (op.op === 'write') { cache = op.value; unflushed.push(op.value); }
      else if (op.op === 'flush') { if (unflushed.length) db = unflushed[unflushed.length - 1]; unflushed = []; }
      else { cache = null; lost += unflushed.length; unflushed = []; }
    }
    return { db, cache, pending: unflushed.length, lost };
  }

  const alphabet: BehindOp[] = [{ op: 'write', value: 'a' }, { op: 'write', value: 'b' }, { op: 'flush' }, { op: 'crash' }];
  const sequences: BehindOp[][] = [[]];
  for (let n = 1; n <= 7; n++) {
    const prev = sequences.filter((s) => s.length === n - 1);
    for (const s of prev) for (const op of alphabet) sequences.push([...s, op]);
  }

  it('matches the reference over every sequence of up to seven writes, flushes and crashes', () => {
    expect(sequences.length).toBeGreaterThan(21_000);
    for (const ops of sequences) {
      const got = runBehind(behindStart('x'), ops);
      const want = reference(ops, 'x');
      expect({ db: got.db, cache: got.cache, pending: got.queue.length, lost: got.lost }).toEqual(want);
    }
  });

  it('a crash loses exactly the writes queued since the last flush, and the database keeps the last flushed value', () => {
    const ops: BehindOp[] = [
      { op: 'write', value: '$11' }, { op: 'write', value: '$12' }, { op: 'flush' }, { op: 'write', value: '$13' }, { op: 'write', value: '$14' }, { op: 'crash' },
    ];
    const s = runBehind(behindStart('$10'), ops);
    expect(s.lost).toBe(2);
    expect(s.db).toBe('$12');
    expect(s.cache).toBeNull();
    expect(s.queue).toEqual([]);
  });

  it('without a crash, a flush brings the database level with the cache', () => {
    const s = runBehind(behindStart('$10'), [{ op: 'write', value: '$11' }, { op: 'write', value: '$12' }, { op: 'flush' }]);
    expect(s).toMatchObject({ db: '$12', cache: '$12', lost: 0 });
  });

  it('while writes are queued the database is behind the cache', () => {
    const s = runBehind(behindStart('$10'), [{ op: 'write', value: '$11' }]);
    expect(s.db).toBe('$10');
    expect(s.cache).toBe('$11');
    expect(s.queue).toHaveLength(1);
  });
});

describe('a store', () => {
  it('starts with the database value in history so a replica can read it', () => {
    const s: Store = initialStore('$10');
    expect(replicaValue(s, 0, 100)).toBe('$10');
    expect(cached(s, 0, null)).toBeNull();
  });
});
