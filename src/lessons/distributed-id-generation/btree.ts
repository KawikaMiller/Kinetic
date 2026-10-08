// The leaf level of a B-tree index, simplified: pages in key order, each holding up to LEAF_CAPACITY
// keys, and a small buffer pool of recently used pages. It only models what the lesson shows: which
// page every insert lands on, how a full page splits, and how many pages have to be read in.

/** Keys a leaf page holds. A toy number: real pages hold anywhere from dozens to hundreds. */
export const LEAF_CAPACITY = 100;
/** Pages the buffer pool keeps in memory, least recently used out first. */
export const POOL_PAGES = 8;
/** The window "recently touched" looks back over, in inserts. */
export const RECENT = 100;

export interface Page {
  id: number;
  keys: bigint[];
  /** Insert number (from 1) that last wrote this page. */
  lastTouch: number;
  /** Insert number that created it. */
  born: number;
  /** It was made by splitting a full page in the middle, which moves half its keys. */
  bornBySplit: boolean;
}

export interface Tree {
  /** Pages in key order, left to right. */
  pages: Page[];
  nextId: number;
  inserts: number;
  /** Full pages split in the middle: half the keys move to a new page. */
  middleSplits: number;
  /** A new page started at the right edge, with no keys moved. */
  appendedPages: number;
  /** Page reads: a page that was not among the POOL_PAGES most recently used. */
  misses: number;
  /** Page ids, most recently used last. */
  pool: number[];
}

export const emptyTree = (): Tree => ({ pages: [], nextId: 1, inserts: 0, middleSplits: 0, appendedPages: 0, misses: 0, pool: [] });

function newPage(t: Tree, keys: bigint[], bornBySplit: boolean): Page {
  const page: Page = { id: t.nextId++, keys, lastTouch: t.inserts, born: t.inserts, bornBySplit };
  return page;
}

/** Use a page: a read from disk unless it is in the pool; then it is the most recently used. */
function access(t: Tree, id: number, existing: boolean) {
  const at = t.pool.indexOf(id);
  if (at >= 0) t.pool.splice(at, 1);
  else if (existing) t.misses += 1;
  t.pool.push(id);
  if (t.pool.length > POOL_PAGES) t.pool.shift();
}

/** The index of the page a key belongs on: the last page whose smallest key is not above it. */
function pageFor(t: Tree, key: bigint): number {
  let lo = 0;
  let hi = t.pages.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (t.pages[mid].keys[0] <= key) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function insertSorted(keys: bigint[], key: bigint) {
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid] < key) lo = mid + 1;
    else hi = mid;
  }
  keys.splice(lo, 0, key);
}

export type InsertKind = 'fit' | 'append' | 'split';

/** Insert one key. Returns what happened, for the tests and the captions. */
export function insertKey(t: Tree, key: bigint): InsertKind {
  t.inserts += 1;
  if (t.pages.length === 0) {
    const first = newPage(t, [key], false);
    t.pages.push(first);
    access(t, first.id, false);
    return 'fit';
  }
  const at = pageFor(t, key);
  const page = t.pages[at];
  access(t, page.id, true);
  if (page.keys.length < LEAF_CAPACITY) {
    insertSorted(page.keys, key);
    page.lastTouch = t.inserts;
    return 'fit';
  }
  const isLast = at === t.pages.length - 1;
  if (isLast && key > page.keys[page.keys.length - 1]) {
    // a new key past the end of a full last page: start a new page, nothing else moves
    const fresh = newPage(t, [key], false);
    t.pages.push(fresh);
    t.appendedPages += 1;
    access(t, fresh.id, false);
    return 'append';
  }
  const half = Math.floor(page.keys.length / 2);
  const right = newPage(t, page.keys.splice(half), true);
  t.pages.splice(at + 1, 0, right);
  t.middleSplits += 1;
  const target = key >= right.keys[0] ? right : page;
  insertSorted(target.keys, key);
  page.lastTouch = t.inserts;
  right.lastTouch = t.inserts;
  access(t, right.id, false);
  return 'split';
}

export interface PageView {
  id: number;
  count: number;
  /** Written in the last RECENT inserts. */
  recent: boolean;
  /** Made by a middle split in the last RECENT inserts. */
  recentSplit: boolean;
}

export interface Snapshot {
  inserts: number;
  pages: PageView[];
  /** Distinct pages written in the last RECENT inserts. */
  touched: number;
  middleSplits: number;
  appendedPages: number;
  misses: number;
  /** Mean share of a page's room that is used. */
  fill: number;
}

export function snapshot(t: Tree): Snapshot {
  const since = t.inserts - RECENT;
  const pages = t.pages.map((p) => ({ id: p.id, count: p.keys.length, recent: p.lastTouch > since, recentSplit: p.bornBySplit && p.born > since }));
  const keys = t.pages.reduce((s, p) => s + p.keys.length, 0);
  return {
    inserts: t.inserts,
    pages,
    touched: pages.filter((p) => p.recent).length,
    middleSplits: t.middleSplits,
    appendedPages: t.appendedPages,
    misses: t.misses,
    fill: t.pages.length ? keys / (t.pages.length * LEAF_CAPACITY) : 0,
  };
}

/** Insert all `ids`, taking a snapshot every `every` inserts (and at 0). */
export function replay(ids: readonly bigint[], every: number): Snapshot[] {
  const t = emptyTree();
  const shots = [snapshot(t)];
  ids.forEach((id, i) => {
    insertKey(t, id);
    if ((i + 1) % every === 0) shots.push(snapshot(t));
  });
  return shots;
}
