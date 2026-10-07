import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  FAN_CAP, LEAF_CAP, MAX_INSERTS, PAGE_ROWS, SCALE, WRITES, allKeys, freshKey, indexLevels, indexLookupPages, insertKey,
  internalSeps, locate, makeDb, pageOf, pickRange, rootSeps, scanPages, starts, type Db,
} from './model';

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

/** Check every structural invariant of the tree and the heap. */
function checkDb(db: Db) {
  const { leaves, fan } = db.tree;
  const keys = allKeys(db);
  expect(keys).toEqual([...keys].sort((a, b) => a - b)); // leaves sorted and in key order left to right
  expect(new Set(keys).size).toBe(keys.length);
  for (const l of leaves) {
    expect(l.length).toBeGreaterThan(0);
    expect(l.length).toBeLessThanOrEqual(LEAF_CAP);
  }
  expect(fan.reduce((a, b) => a + b, 0)).toBe(leaves.length);
  for (const f of fan) expect(f).toBeLessThanOrEqual(FAN_CAP);
  expect(fan.length).toBeLessThanOrEqual(FAN_CAP); // the root never overflows within the insert limit
  // every row is in exactly one heap page, and pages hold at most PAGE_ROWS
  expect(db.pages.flat().sort((a, b) => a - b)).toEqual(keys);
  for (const p of db.pages) expect(p.length).toBeLessThanOrEqual(PAGE_ROWS);
  // separators are each child's smallest key, in increasing order
  const seps = [...rootSeps(db.tree), ...fan.flatMap((_, j) => internalSeps(db.tree, j))];
  for (const s of seps) expect(keys).toContain(s);
}

/** Reference search: the leaf whose first key is the largest one <= key (or the first leaf). */
function referenceLeaf(db: Db, key: number) {
  let leaf = 0;
  db.tree.leaves.forEach((l, i) => {
    if (l[0] <= key) leaf = i;
  });
  return leaf;
}

describe('a fresh table', () => {
  it('is a valid 3-level B+tree of 30 sorted keys over shuffled heap pages', () => {
    for (const seed of SEEDS) {
      const db = makeDb(mulberry32(seed));
      checkDb(db);
      expect(allKeys(db)).toHaveLength(30);
      expect(db.tree.fan).toHaveLength(3);
    }
  });
});

describe('search', () => {
  it('descends to the same leaf as a reference search, for every id 1-99', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const db = makeDb(mulberry32(seed));
      for (let key = 1; key <= 99; key++) {
        const { j, leaf } = locate(db.tree, key);
        expect(leaf).toBe(referenceLeaf(db, key));
        // the leaf belongs to internal node j
        const s = starts(db.tree.fan)[j];
        expect(leaf).toBeGreaterThanOrEqual(s);
        expect(leaf).toBeLessThan(s + db.tree.fan[j]);
        if (allKeys(db).includes(key)) expect(db.tree.leaves[leaf]).toContain(key);
      }
    }
  });
});

describe('insert', () => {
  it('matches a sorted-set reference through the full insert limit, splitting correctly', () => {
    let splits = 0;
    let parentSplits = 0;
    for (const seed of SEEDS) {
      const rnd = mulberry32(seed);
      let db = makeDb(rnd);
      const reference = new Set(allKeys(db));
      for (let n = 0; n < MAX_INSERTS; n++) {
        const key = freshKey(db, rnd);
        const before = db.tree.leaves[locate(db.tree, key).leaf].length;
        const res = insertKey(db, key);
        reference.add(key);
        db = res.next;
        checkDb(db);
        expect(allKeys(db)).toEqual([...reference].sort((a, b) => a - b));
        expect(db.tree.leaves[locate(db.tree, key).leaf]).toContain(key);
        expect(pageOf(db, key)).toBe(res.page);
        // a leaf splits exactly when it was already full
        expect(res.split).toBe(before === LEAF_CAP);
        if (res.split) {
          splits++;
          // the separator pushed up is the first key of the new right-hand leaf
          expect(db.tree.leaves.some((l) => l[0] === res.separator)).toBe(true);
        }
        if (res.parentSplit) parentSplits++;
        expect(res.writes).toBe(WRITES.heap + (res.split ? WRITES.leafSplit + (res.parentSplit ? WRITES.parentSplit : 0) : WRITES.leaf));
      }
      // every key is still findable after all the splits
      for (const key of reference) expect(db.tree.leaves[locate(db.tree, key).leaf]).toContain(key);
    }
    // the sweep really exercised both kinds of split
    expect(splits).toBeGreaterThan(0);
    expect(parentSplits).toBeGreaterThan(0);
  });

  it('a full leaf splits into halves that keep sorted order', () => {
    const db: Db = { tree: { leaves: [[10, 20, 30, 40], [50, 60]], fan: [2] }, pages: [[10, 20, 30, 40], [50, 60]], inserts: 0 };
    const res = insertKey(db, 25);
    expect(res.next.tree.leaves).toEqual([[10, 20, 25], [30, 40], [50, 60]]);
    expect(res.separator).toBe(30);
    expect(res.writes).toBe(1 + 3);
  });
});

describe('the quiz', () => {
  it('a leaf split with room in the parent costs 3 index writes', () => {
    expect(WRITES.leafSplit).toBe(3);
    expect(WRITES.heap + WRITES.leafSplit).toBe(4);
  });
});

describe('at scale', () => {
  it('a billion rows need about four levels at a fan-out of 200', () => {
    expect(indexLevels(1e9)).toBe(4);
    expect(SCALE.fanout ** 3).toBeLessThan(1e9);
    expect(SCALE.fanout ** 4).toBeGreaterThanOrEqual(1e9);
    expect(indexLookupPages(1e9)).toBe(5);
    expect(scanPages(1e9)).toBe(10_000_000);
  });

  it('levels grow by one per factor of the fan-out', () => {
    expect(indexLevels(1)).toBe(1);
    expect(indexLevels(200)).toBe(1);
    expect(indexLevels(201)).toBe(2);
    expect(indexLevels(40_000)).toBe(2);
    expect(indexLevels(40_001)).toBe(3);
  });
});

describe('pickRange', () => {
  it('spans 8 ids and never ends on the largest, so the walk stops past it', () => {
    for (const seed of SEEDS) {
      const rnd = mulberry32(seed);
      const db = makeDb(rnd);
      const [lo, hi] = pickRange(db, rnd);
      const keys = allKeys(db);
      expect(keys.filter((k) => k >= lo && k <= hi)).toHaveLength(8);
      expect(hi).toBeLessThan(keys.at(-1)!);
    }
  });
});
