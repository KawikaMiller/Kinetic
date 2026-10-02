import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { blank, opFrames } from './frames';
import { bucketOf, build, hashOf, hashSteps, MAX_BUCKETS, MAX_KEYS, MOD, needsGrow, THRESHOLD, type OpKind, type Table } from './model';

const finalTable = (table: Table, kind: OpKind, key: string, bad = false) => opFrames(table, kind, key, bad).at(-1)!.table;

describe('the toy hash', () => {
  it('folds each character in as h = h×31 + code, kept below MOD', () => {
    expect(hashSteps('cat', false)).toEqual([99, (99 * 31 + 97) % MOD, ((99 * 31 + 97) * 31 + 116) % MOD]);
    for (const k of ['a', 'zebra', 'zzzzzzzz']) expect(hashOf(k, false)).toBeLessThan(MOD);
  });
  it('the bad hash is just the length', () => {
    expect(hashSteps('horse', true)).toEqual([5]);
  });
});

describe('placement', () => {
  it('puts every key in bucket hash % size, and loses none', () => {
    const keys = ['cat', 'horse', 'owl', 'zebra', 'bee', 'panda', 'tiger'];
    for (const n of [4, 8, 16]) {
      const t = build(keys, n, false);
      expect(t).toHaveLength(n);
      expect(t.flat().sort()).toEqual([...keys].sort());
      t.forEach((chain, b) => chain.forEach((k) => expect(bucketOf(k, n, false)).toBe(b)));
    }
  });
  it('same key, same slot, every time', () => {
    expect(bucketOf('lynx', 8, false)).toBe(bucketOf('lynx', 8, false));
  });
});

describe('resize rule', () => {
  it(`grows only when keys / buckets goes above ${THRESHOLD}`, () => {
    expect(needsGrow(3, 4)).toBe(false); // exactly 0.75 stays
    expect(needsGrow(4, 4)).toBe(true);
  });
  it('the 4th insert into 4 buckets doubles the table and rehashes every key into hash % 8', () => {
    const t = build(['cat', 'owl', 'bee'], 4, false);
    const after = finalTable(t, 'insert', 'yak');
    expect(after).toHaveLength(8);
    expect(after.flat().sort()).toEqual(['bee', 'cat', 'owl', 'yak']);
    after.forEach((chain, b) => chain.forEach((k) => expect(bucketOf(k, 8, false)).toBe(b)));
  });
  it(`stops doubling at ${MAX_BUCKETS} buckets and says so`, () => {
    let t: Table = build([], MAX_BUCKETS, false);
    const words = ['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg', 'hh', 'ii', 'jj', 'kk', 'll', 'mm'];
    for (const w of words) t = finalTable(t, 'insert', w);
    expect(t).toHaveLength(MAX_BUCKETS);
  });
  it(`refuses a ${MAX_KEYS + 1}th key`, () => {
    let t: Table = build([], MAX_BUCKETS, false);
    for (let i = 0; i < MAX_KEYS; i++) t = finalTable(t, 'insert', `k${String.fromCharCode(97 + i)}`);
    const frames = opFrames(t, 'insert', 'zz', false);
    expect(frames).toHaveLength(1);
    expect(frames[0].table.flat()).toHaveLength(MAX_KEYS);
  });
});

describe('operations against a reference Set', () => {
  it('500 random inserts, lookups and deletes agree with Set, and chains stay correct', () => {
    const rand = mulberry32(7);
    const pool = ['cat', 'dog', 'owl', 'bee', 'eel', 'yak', 'koala', 'lynx', 'bison', 'otter', 'zebra', 'crab'];
    let table: Table = build([], 4, false);
    const ref = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const key = pool[Math.floor(rand() * pool.length)];
      const kind: OpKind = (['insert', 'lookup', 'delete'] as const)[Math.floor(rand() * 3)];
      const frames = opFrames(table, kind, key, false);
      const last = frames.at(-1)!;
      if (kind === 'insert') ref.add(key);
      if (kind === 'delete') ref.delete(key);
      if (kind === 'lookup') expect(frames.some((f) => f.probe?.hit)).toBe(ref.has(key));
      table = last.table;
      expect(new Set(table.flat())).toEqual(ref);
      expect(table.flat()).toHaveLength(ref.size); // never a duplicate
      table.forEach((chain, b) => chain.forEach((k) => expect(bucketOf(k, table.length, false)).toBe(b)));
    }
  });

  it('a lookup counts one probe per chain node it compares, stopping at the match', () => {
    const chain = ['ant', 'bat', 'cow'];
    const placed: Table = [[], [], [], []];
    placed[bucketOf('bat', 4, false)] = chain; // the chain the lookup walks
    expect(opFrames(placed, 'lookup', 'bat', false).at(-1)!.probes).toBe(2);
  });

  it('a miss in an empty bucket takes zero probes', () => {
    const empty = blank([[], [], [], []]).table;
    expect(opFrames(empty, 'lookup', 'cat', false).at(-1)!.probes).toBe(0);
  });
});

describe('bad hash', () => {
  it('piles every same-length word into one bucket', () => {
    const t = build(['cat', 'dog', 'owl', 'bee', 'eel', 'yak'], 8, true);
    expect(Math.max(...t.map((c) => c.length))).toBe(6);
  });
});
