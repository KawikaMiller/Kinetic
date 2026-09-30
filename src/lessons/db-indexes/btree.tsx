import type { ReactNode } from 'react';
import { freshInt, randInt, shuffle } from '../../core/random';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';

/** Leaves hold up to LEAF_CAP keys; each internal node up to FAN_CAP children. */
export const LEAF_CAP = 4;
export const FAN_CAP = 5;
export const PAGE_ROWS = 4;
export const MAX_INSERTS = 8;
/** Ids are 1..MAX_KEY. The table starts with 30 and never passes 38, so a free id always exists. */
const MAX_KEY = 99;
const START_ROWS = 30;

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

export interface IxFrame extends Frame {
  db: Db;
  hotNode: string | null;
  walked: string[];
  hotPage: number | null;
  readPages: number[];
  hotKey: number | null;
  found: number | null;
  rangeKeys: number[];
  newKey: number | null;
  pointer: { leaf: number; page: number } | null;
  reads: number;
  writes: number;
}

export function makeDb(): Db {
  const keys = new Set<number>();
  while (keys.size < START_ROWS) keys.add(randInt(1, MAX_KEY));
  const sorted = [...keys].sort((a, b) => a - b);
  const leaves: number[][] = [];
  for (let i = 0; i < sorted.length; i += 3) leaves.push(sorted.slice(i, i + 3));
  const fan = [4, 3, 3];
  const heap = shuffle(sorted);
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

function recorder(db: Db) {
  const r = createRecorder<IxFrame>({
    db, hotNode: null, walked: [], hotPage: null, readPages: [], hotKey: null, found: null,
    rangeKeys: [], newKey: null, pointer: null, reads: 0, writes: 0,
  });
  return {
    ...r,
    /** Read an index page: highlight it, remember it was walked, count the read. */
    readNode(id: string) {
      const s = r.get();
      r.set({ hotNode: id, walked: s.walked.includes(id) ? s.walked : [...s.walked, id], reads: s.reads + 1 });
    },
    /** Read a heap page: re-reading one already fetched costs nothing. */
    readPage(p: number) {
      const s = r.get();
      const fresh = !s.readPages.includes(p);
      r.set({ hotPage: p, readPages: fresh ? [...s.readPages, p] : s.readPages, reads: s.reads + (fresh ? 1 : 0) });
    },
  };
}

function descend(r: ReturnType<typeof recorder>, tree: Tree, key: number) {
  const { j, leaf } = locate(tree, key);
  const rs = rootSeps(tree);
  r.readNode('r');
  r.snap(
    <>Read the <b>root</b> page. Its separators {rs.join(', ')} say {key} belongs under child{' '}
      <span className="hl">#{j + 1}</span>.</>,
  );
  r.readNode(`i${j}`);
  const is = internalSeps(tree, j);
  r.snap(
    <>Read an <b>internal</b> page ({is.length ? `separators ${is.join(', ')}` : 'one child'}): go down to leaf{' '}
      <span className="hl">#{leaf + 1}</span>.</>,
  );
  r.readNode(`l${leaf}`);
  return { j, leaf };
}

export function scanFrames(db: Db, target: number): IxFrame[] {
  const r = recorder(db);
  r.snap(<>SELECT * FROM users WHERE id = <span className="hl">{target}</span>, with <b>no index</b>. The rows sit in heap pages in no particular order.</>);
  db.pages.forEach((page, p) => {
    r.readPage(p);
    const here = page.includes(target);
    if (here) r.set({ found: target });
    r.snap(
      here ? (
        <>Page {p + 1}: <span className="hl ok">found {target}</span>! But the scan can't stop: nothing tells it there
          isn't another {target} further on.</>
      ) : p === 0 ? (
        <>Read page 1 from disk and check every row…</>
      ) : undefined,
      here ? 1.6 : 0.55,
    );
  });
  r.set({ hotPage: null });
  r.snap(
    <><span className="hl bad">{db.pages.length} page reads</span>: every page, every time. Double the table, double
      the reads: O(n).</>,
    2,
  );
  return r.frames;
}

export function indexFrames(db: Db, target: number): IxFrame[] {
  const r = recorder(db);
  r.snap(<>Same query, but now there's a <b>B+tree index</b> on id. Start at the top.</>);
  const { leaf } = descend(r, db.tree, target);
  r.set({ hotKey: target, found: target });
  r.snap(<>Leaf #{leaf + 1} holds <span className="hl ok">{target}</span>, plus a pointer to where the row really lives.</>);
  const page = pageOf(db, target);
  r.set({ pointer: { leaf, page }, hotNode: null });
  r.readPage(page);
  r.snap(<>Follow the pointer: fetch heap page <span className="hl">{page + 1}</span>. Just one more read.</>);
  r.set({ hotPage: null });
  r.snap(
    <><span className="hl ok">{r.get().reads} page reads</span> instead of {db.pages.length}. At a billion rows the tree
      is still only ~4 levels deep: O(log n).</>,
    2,
  );
  return r.frames;
}

export function rangeFrames(db: Db, lo: number, hi: number): IxFrame[] {
  const r = recorder(db);
  r.snap(<>WHERE id BETWEEN <span className="hl">{lo}</span> AND <span className="hl">{hi}</span>. First find where {lo} would live.</>);
  let { leaf } = descend(r, db.tree, lo);
  const hits: number[] = [];
  for (;;) {
    const keys = db.tree.leaves[leaf];
    keys.forEach((k) => k >= lo && k <= hi && hits.push(k));
    r.set({ rangeKeys: [...hits] });
    const pastEnd = keys[keys.length - 1] > hi || leaf === db.tree.leaves.length - 1;
    r.snap(
      pastEnd ? (
        <>Leaf #{leaf + 1} goes past {hi}, so the walk <span className="hl ok">stops here</span>. Sorted leaves mean no
          need to look further.</>
      ) : (
        <>Leaves are <b>sorted and linked</b>: collect matches, then hop right to the next leaf.</>
      ),
    );
    if (pastEnd) break;
    leaf += 1;
    r.readNode(`l${leaf}`);
  }
  const pages = [...new Set(hits.map((k) => pageOf(db, k)))];
  r.set({ hotNode: null });
  pages.forEach((p, i) => {
    r.readPage(p);
    r.snap(
      i === 0 ? (
        <>{hits.length} matching ids, but their rows are <b>scattered</b> across {pages.length} heap pages: one fetch
          per page.</>
      ) : undefined,
      0.7,
    );
  });
  r.set({ hotPage: null });
  r.snap(
    <>{r.get().reads} reads for {hits.length} rows. Range scans are where B+trees shine, and a hash index can't do them
      at all.</>,
    2,
  );
  return r.frames;
}

export function insertFrames(db: Db, key: number): { frames: IxFrame[]; next: Db } {
  const pages = db.pages.map((p) => p.slice());
  const last = pages[pages.length - 1];
  let page: number;
  if (last.length < PAGE_ROWS) {
    last.push(key);
    page = pages.length - 1;
  } else {
    pages.push([key]);
    page = pages.length - 1;
  }
  const r = recorder(db);
  r.set({ newKey: key });
  r.snap(<>INSERT a row with id <span className="hl info">{key}</span>. Two things must be written: the row, and the index.</>);
  r.set({ db: { ...db, pages }, hotPage: page, readPages: [page], writes: 1 });
  r.snap(<>The row itself is appended to heap page {page + 1}: <span className="hl">1 write</span>.</>);
  r.set({ hotPage: null });
  const { j, leaf } = descend(r, db.tree, key);
  r.snap(<>The index must stay sorted, so descend to the leaf where {key} belongs: leaf #{leaf + 1}.</>);

  const leaves = db.tree.leaves.map((l) => l.slice());
  const fan = db.tree.fan.slice();
  const target = [...leaves[leaf], key].sort((a, b) => a - b);
  let splitNote: ReactNode;
  if (target.length <= LEAF_CAP) {
    leaves[leaf] = target;
    r.set({ db: { tree: { leaves, fan }, pages, inserts: db.inserts + 1 }, writes: r.get().writes + 1, hotKey: key });
    splitNote = <>The leaf had room: {key} slots into sorted position. <span className="hl">1 more write</span>.</>;
    r.snap(splitNote);
  } else {
    const half = Math.ceil(target.length / 2);
    leaves.splice(leaf, 1, target.slice(0, half), target.slice(half));
    fan[j] += 1;
    let writes = r.get().writes + 3;
    r.set({ db: { tree: { leaves, fan }, pages, inserts: db.inserts + 1 }, writes, hotKey: key, hotNode: `i${j}` });
    r.snap(
      <>Leaf was full ({LEAF_CAP}/{LEAF_CAP}), so it <span className="hl bad">splits</span> in two and pushes a new
        separator ({target[half]}) up to its parent. <span className="hl">3 writes</span>.</>,
      1.5,
    );
    if (fan[j] > FAN_CAP) {
      const a = Math.ceil(fan[j] / 2);
      fan.splice(j, 1, a, fan[j] - a);
      writes += 2;
      r.set({ db: { tree: { leaves, fan }, pages, inserts: db.inserts + 1 }, writes, hotNode: 'r' });
      r.snap(<>Now the parent is over capacity too, so it splits and the <b>root</b> gets another child. Splits can cascade.</>, 1.5);
    }
  }
  r.set({ hotNode: null });
  r.snap(
    <>This INSERT cost <span className="hl bad">{r.get().writes} page writes</span> plus {r.get().reads} reads.
      Every extra index on the table repeats the index part: indexes speed up reads and slow down writes.</>,
    2,
  );
  const f = r.frames;
  return { frames: f, next: f[f.length - 1].db };
}

/** A random id not in the table yet. */
export function freshKey(db: Db) {
  const key = freshInt(1, MAX_KEY, allKeys(db));
  if (key === null) throw new Error('db-indexes: every id is taken');
  return key;
}
