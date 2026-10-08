import { describe, expect, it } from 'vitest';
import { emptyTree, insertKey, LEAF_CAPACITY, POOL_PAGES, RECENT, replay, snapshot, type Tree } from './btree';
import type { FormatId } from './formats';
import { makeIds } from './stream';

const COUNT = 2000;
const EVERY = 50;
const KINDS: FormatId[] = ['autoincrement', 'uuidv4', 'uuidv7', 'ulid', 'snowflake'];

const build = (ids: readonly bigint[]): Tree => {
  const t = emptyTree();
  for (const id of ids) insertKey(t, id);
  return t;
};

describe('the ID streams', () => {
  it('are seeded, distinct and the right size', () => {
    for (const kind of KINDS) {
      const ids = makeIds(kind, COUNT);
      expect(ids).toHaveLength(COUNT);
      expect(new Set(ids).size, kind).toBe(COUNT);
      expect(makeIds(kind, 50)).toEqual(ids.slice(0, 50));
    }
  });
  it('time-ordered formats increase with the clock; random UUIDs do not', () => {
    const increasing = (ids: bigint[]) => ids.every((id, i) => i === 0 || id > ids[i - 1]);
    expect(increasing(makeIds('autoincrement', COUNT))).toBe(true);
    expect(increasing(makeIds('uuidv7', COUNT))).toBe(true);
    expect(increasing(makeIds('snowflake', COUNT))).toBe(true);
    expect(increasing(makeIds('uuidv4', COUNT))).toBe(false);
    // ULIDs from the same millisecond are in random order, but never behind an earlier millisecond
    const ulids = makeIds('ulid', COUNT);
    const sortedWithin = ulids.every((id, i) => i === 0 || id >> 80n >= ulids[i - 1] >> 80n);
    expect(sortedWithin).toBe(true);
  });
});

describe('the index', () => {
  it('keeps every key, in order, with no page over capacity, for every format', () => {
    for (const kind of KINDS) {
      const ids = makeIds(kind, COUNT);
      const t = build(ids);
      const stored = t.pages.flatMap((p) => p.keys);
      expect(stored, kind).toEqual([...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
      for (const p of t.pages) {
        expect(p.keys.length).toBeLessThanOrEqual(LEAF_CAPACITY);
        expect(p.keys.length).toBeGreaterThan(0);
        expect(p.keys).toEqual([...p.keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
      }
      expect(t.inserts).toBe(COUNT);
    }
  });

  it('keys that only ever increase fill every page: ceil(n / capacity) pages, no middle splits, no page reads', () => {
    for (const kind of ['autoincrement', 'uuidv7', 'snowflake'] as FormatId[]) {
      const t = build(makeIds(kind, COUNT));
      expect(t.pages.length, kind).toBe(Math.ceil(COUNT / LEAF_CAPACITY));
      expect(t.middleSplits, kind).toBe(0);
      expect(t.appendedPages, kind).toBe(t.pages.length - 1);
      expect(t.misses, kind).toBe(0);
      expect(snapshot(t).fill).toBeGreaterThan(0.99);
    }
  });

  it('random keys leave pages about 69% full (ln 2), so a third more pages, every extra one made by a middle split', () => {
    const t = build(makeIds('uuidv4', COUNT));
    const s = snapshot(t);
    expect(s.fill).toBeGreaterThan(0.6);
    expect(s.fill).toBeLessThan(0.78);
    expect(t.pages.length).toBeGreaterThan(Math.ceil(COUNT / LEAF_CAPACITY) * 1.25);
    expect(t.middleSplits + t.appendedPages).toBe(t.pages.length - 1);
    expect(t.middleSplits).toBeGreaterThan(t.appendedPages * 10);
  });

  it('time-ordered IDs touch at most 2 pages in any 100 inserts; ULIDs at most 3; random UUIDs almost all of them', () => {
    for (const kind of ['autoincrement', 'uuidv7', 'snowflake'] as FormatId[]) {
      for (const shot of replay(makeIds(kind, COUNT), EVERY).slice(RECENT / EVERY)) expect(shot.touched, `${kind} @${shot.inserts}`).toBeLessThanOrEqual(2);
    }
    for (const shot of replay(makeIds('ulid', COUNT), EVERY).slice(RECENT / EVERY)) expect(shot.touched).toBeLessThanOrEqual(3);
    for (const shot of replay(makeIds('uuidv4', COUNT), EVERY).slice(1000 / EVERY)) {
      expect(shot.touched).toBeGreaterThanOrEqual(shot.pages.length * 0.8);
      expect(shot.touched).toBeGreaterThan(10);
    }
  });

  it('random UUIDs read most pages from disk once the index outgrows the pool; sequential IDs read none', () => {
    // by 1,000 inserts the index has well over the pool's 8 pages; from then on most inserts need a page read
    const shots = replay(makeIds('uuidv4', COUNT), EVERY);
    const late = shots.at(-1)!.misses - shots[1000 / EVERY].misses;
    expect(shots[1000 / EVERY].pages.length).toBeGreaterThan(POOL_PAGES);
    expect(late).toBeGreaterThan(1000 * 0.5);
    expect(build(makeIds('uuidv7', COUNT)).misses).toBe(0);
    expect(build(makeIds('ulid', COUNT)).misses).toBeLessThanOrEqual(5);
  });

  it('the pool evicts the least recently used page: rotating through more pages than it holds misses every time', () => {
    const t = emptyTree();
    // 10 pages of sequential keys, then revisit them round-robin
    for (let i = 0; i < 10 * LEAF_CAPACITY; i++) insertKey(t, BigInt(i * 1000));
    expect(t.pages.length).toBe(10);
    const before = t.misses;
    for (let round = 0; round < 3; round++) for (let p = 0; p < 10; p++) insertKey(t, BigInt(p * LEAF_CAPACITY * 1000 + 1));
    expect(POOL_PAGES).toBeLessThan(10);
    expect(t.misses - before).toBe(30 - 0);
  });

  it('a split in the middle moves half the keys and flags the new page; an append moves none', () => {
    const t = emptyTree();
    for (let i = 0; i < LEAF_CAPACITY; i++) insertKey(t, BigInt(i * 10));
    expect(insertKey(t, 5n)).toBe('split');
    expect(t.pages).toHaveLength(2);
    expect(t.pages[0].keys.length + t.pages[1].keys.length).toBe(LEAF_CAPACITY + 1);
    expect(t.pages[1].bornBySplit).toBe(true);
    const shot = snapshot(t);
    expect(shot.pages.filter((p) => p.recentSplit)).toHaveLength(1);
    const u = emptyTree();
    for (let i = 0; i < LEAF_CAPACITY; i++) insertKey(u, BigInt(i));
    expect(insertKey(u, BigInt(LEAF_CAPACITY))).toBe('append');
    expect(u.pages[0].keys).toHaveLength(LEAF_CAPACITY);
    expect(u.pages[1].keys).toEqual([BigInt(LEAF_CAPACITY)]);
    expect(u.middleSplits).toBe(0);
  });

  it('snapshots every 50 inserts: 41 of them for 2,000 inserts, the last one the final state', () => {
    const shots = replay(makeIds('uuidv4', COUNT), EVERY);
    expect(shots).toHaveLength(41);
    expect(shots[0].inserts).toBe(0);
    expect(shots.at(-1)).toEqual(snapshot(build(makeIds('uuidv4', COUNT))));
    for (let i = 1; i < shots.length; i++) {
      expect(shots[i].middleSplits).toBeGreaterThanOrEqual(shots[i - 1].middleSplits);
      expect(shots[i].misses).toBeGreaterThanOrEqual(shots[i - 1].misses);
    }
  });
});
