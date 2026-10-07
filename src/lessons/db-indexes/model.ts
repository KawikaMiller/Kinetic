// Pure model behind the db-indexes lesson: a small B+tree over a heap of unsorted pages,
// plus the at-scale arithmetic. The frame builders (captions) live in frames.tsx.
import { freshInt, randInt, shuffle, type Rnd } from '../../core/random';

/** Leaves hold up to LEAF_CAP keys; each internal node up to FAN_CAP children. */
export const LEAF_CAP = 4;
export const FAN_CAP = 5;
export const PAGE_ROWS = 4;
export const MAX_INSERTS = 8;
/** Ids are 1..MAX_KEY. The table starts with 30 and never passes 38, so a free id always exists. */
const MAX_KEY = 99;
const START_ROWS = 30;
/** The starting tree: 10 leaves of 3 keys, under internal pages with 4, 3 and 3 children. */
const START_LEAF_KEYS = 3;
const START_FAN = [4, 3, 3];

/**
 * A 3-level B+tree: root → internal nodes → leaves. Leaves are ordered and
 * linked left to right; internal node j owns the next `fan[j]` leaves.
 */
export interface Tree {
  leaves: number[][];
  fan: number[];
}

export interface Db {
  tree: Tree;
  /** Heap pages: rows stored in insertion order, not sorted. */
  pages: number[][];
  inserts: number;
}

export type Mode = 'scan' | 'index' | 'range' | 'insert';

export function makeDb(rnd: Rnd = Math.random): Db {
  const keys = new Set<number>();
  while (keys.size < START_ROWS) keys.add(randInt(1, MAX_KEY, rnd));
  const sorted = [...keys].sort((a, b) => a - b);
  const leaves: number[][] = [];
  for (let i = 0; i < sorted.length; i += START_LEAF_KEYS) leaves.push(sorted.slice(i, i + START_LEAF_KEYS));
  const fan = [...START_FAN];
  const heap = shuffle(sorted, rnd);
  const pages: number[][] = [];
  for (let i = 0; i < heap.length; i += PAGE_ROWS) pages.push(heap.slice(i, i + PAGE_ROWS));
  return { tree: { leaves, fan }, pages, inserts: 0 };
}

export const allKeys = (db: Db) => db.tree.leaves.flat();
export const pageOf = (db: Db, key: number) => db.pages.findIndex((p) => p.includes(key));

export function starts(fan: number[]) {
  const out: number[] = [];
  let acc = 0;
  for (const f of fan) {
    out.push(acc);
    acc += f;
  }
  return out;
}

/** Separator keys: the smallest key of every child except the first. */
export function internalSeps(tree: Tree, j: number) {
  const s = starts(tree.fan)[j];
  return tree.leaves.slice(s + 1, s + tree.fan[j]).map((l) => l[0]);
}
export function rootSeps(tree: Tree) {
  return starts(tree.fan).slice(1).map((s) => tree.leaves[s][0]);
}

/** Which internal node and leaf a key belongs in (standard B+tree descent). */
export function locate(tree: Tree, key: number) {
  const st = starts(tree.fan);
  let j = 0;
  for (let t = 1; t < tree.fan.length; t++) if (key >= tree.leaves[st[t]][0]) j = t;
  let leaf = st[j];
  for (let l = st[j] + 1; l < st[j] + tree.fan[j]; l++) if (key >= tree.leaves[l][0]) leaf = l;
  return { j, leaf };
}

/** A random id not in the table yet. */
export function freshKey(db: Db, rnd: Rnd = Math.random) {
  const key = freshInt(1, MAX_KEY, allKeys(db), rnd);
  if (key === null) throw new Error('db-indexes: every id is taken');
  return key;
}

/** A range of 8 consecutive ids that never ends on the largest id, so the walk always stops on a leaf past it. */
const RANGE_KEYS = 8;

export function pickRange(db: Db, rnd: Rnd = Math.random) {
  const keys = allKeys(db);
  const i = randInt(0, keys.length - RANGE_KEYS - 1, rnd);
  return [keys[i], keys[i + RANGE_KEYS - 1]] as const;
}

// ── Insert ────────────────────────────────────────────────────────────

/** Page writes for each part of an insert. */
export const WRITES = {
  /** The row, appended to a heap page. */
  heap: 1,
  /** A leaf with room, rewritten with the key in place. */
  leaf: 1,
  /** A full leaf: both halves, plus the parent that gains a separator. */
  leafSplit: 3,
  /** A full parent too: its new sibling, plus the root that gains a child. */
  parentSplit: 2,
} as const;

export interface InsertResult {
  next: Db;
  /** Heap page the row went to. */
  page: number;
  /** Internal node and leaf the key descended to (before any split). */
  j: number;
  leaf: number;
  split: boolean;
  /** The separator pushed up by a leaf split: the first key of the new right leaf. */
  separator: number | null;
  parentSplit: boolean;
  writes: number;
}

/** Insert a key: append the row to the heap, then add it to its leaf, splitting upwards as needed. */
export function insertKey(db: Db, key: number): InsertResult {
  const pages = db.pages.map((p) => p.slice());
  const last = pages[pages.length - 1];
  if (last.length < PAGE_ROWS) last.push(key);
  else pages.push([key]);
  const page = pages.length - 1;

  const { j, leaf } = locate(db.tree, key);
  const leaves = db.tree.leaves.map((l) => l.slice());
  const fan = db.tree.fan.slice();
  const target = [...leaves[leaf], key].sort((a, b) => a - b);
  let writes = WRITES.heap;
  let separator: number | null = null;
  let parentSplit = false;
  if (target.length <= LEAF_CAP) {
    leaves[leaf] = target;
    writes += WRITES.leaf;
  } else {
    const half = Math.ceil(target.length / 2);
    leaves.splice(leaf, 1, target.slice(0, half), target.slice(half));
    separator = target[half];
    fan[j] += 1;
    writes += WRITES.leafSplit;
    if (fan[j] > FAN_CAP) {
      const a = Math.ceil(fan[j] / 2);
      fan.splice(j, 1, a, fan[j] - a);
      parentSplit = true;
      writes += WRITES.parentSplit;
    }
  }
  return { next: { tree: { leaves, fan }, pages, inserts: db.inserts + 1 }, page, j, leaf, split: separator !== null, separator, parentSplit, writes };
}

// ── At scale ──────────────────────────────────────────────────────────

/** Illustrative real-world sizes for the At scale panel. */
export const SCALE = { fanout: 200, rowsPerPage: 100, pageBytes: 8192 } as const;

/** Heap pages a full scan reads. */
export const scanPages = (rows: number) => Math.ceil(rows / SCALE.rowsPerPage);

/** Levels a B+tree needs so fanout^levels reaches `rows` keys (at least one). */
export function indexLevels(rows: number, fanout: number = SCALE.fanout) {
  let levels = 1;
  let reach = fanout;
  while (reach < rows) {
    reach *= fanout;
    levels++;
  }
  return levels;
}

/** Pages an index lookup reads: one per level, plus the row's heap page. */
export const indexLookupPages = (rows: number) => indexLevels(rows) + 1;
