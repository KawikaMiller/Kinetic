import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { LEAF_CAP, SCALE, WRITES, indexLevels, insertKey, internalSeps, locate, pageOf, rootSeps, type Db, type Tree } from './model';

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

/** The table size the index caption quotes. */
export const BILLION = 1e9;

export function scanFrames(db: Db, target: number): IxFrame[] {
  const r = recorder(db);
  r.snap(<>SELECT * FROM users WHERE id = <span className="hl">{target}</span>, with <b>no index</b>. The rows sit in heap pages in no particular order.</>);
  let foundOn: number | null = null;
  db.pages.forEach((page, p) => {
    r.readPage(p);
    const here = page.includes(target);
    if (here) {
      foundOn = p;
      r.set({ found: target });
    }
    r.snap(
      here ? (
        <>Page {p + 1}: <span className="hl ok">found {target}</span>! But the scan can't stop: with no index there's no
          uniqueness guarantee, so nothing says there isn't another {target} further on.</>
      ) : foundOn !== null ? (
        <>Page {p + 1}: no more {target}s, but the scan still has to read every remaining page.</>
      ) : (
        <>Read page {p + 1} from disk and check every row: no {target} here.</>
      ),
      here ? 1.6 : 0.55,
    );
  });
  r.set({ hotPage: null });
  r.snap(
    <><span className="hl bad">{r.get().reads} page reads</span>: every page, every time. Double the table, double
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
    <><span className="hl ok">{r.get().reads} page reads</span> instead of {db.pages.length}. With ~{SCALE.fanout} keys per
      page, a billion-row tree is still only {indexLevels(BILLION)} levels deep: O(log n).</>,
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
    const lastLeaf = leaf === db.tree.leaves.length - 1;
    const pastEnd = keys[keys.length - 1] > hi;
    r.snap(
      pastEnd ? (
        <>Leaf #{leaf + 1} goes past {hi}, so the walk <span className="hl ok">stops here</span>. Sorted leaves mean no
          need to look further.</>
      ) : lastLeaf ? (
        <>Leaf #{leaf + 1} is the last leaf, so the walk <span className="hl ok">stops here</span>.</>
      ) : (
        <>Leaves are <b>sorted and linked</b>: collect matches, then hop right to the next leaf.</>
      ),
    );
    if (pastEnd || lastLeaf) break;
    leaf += 1;
    r.readNode(`l${leaf}`);
  }
  const pages = [...new Set(hits.map((k) => pageOf(db, k)))];
  r.set({ hotNode: null });
  pages.forEach((p, i) => {
    r.readPage(p);
    r.snap(
      <>{hits.length} matching ids, their rows spread over {pages.length} heap pages: fetch page {p + 1} ({i + 1} of {pages.length}).</>,
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
  const res = insertKey(db, key);
  const { next } = res;
  const r = recorder(db);
  r.set({ newKey: key });
  r.snap(<>INSERT a row with id <span className="hl violet">{key}</span>. Two things must be written: the row, and the index.</>);
  r.set({ db: { ...db, pages: next.pages }, hotPage: res.page, readPages: [res.page], writes: WRITES.heap });
  r.snap(<>The row itself is appended to heap page {res.page + 1}: <span className="hl">{WRITES.heap} write</span>.</>);
  r.set({ hotPage: null });
  const { leaf } = descend(r, db.tree, key);
  r.snap(<>The index must stay sorted, so descend to the leaf where {key} belongs: leaf #{leaf + 1}.</>);

  if (!res.split) {
    r.set({ db: next, writes: res.writes, hotKey: key });
    r.snap(<>The leaf had room: {key} slots into sorted position. <span className="hl">{WRITES.leaf} more write</span>.</>);
  } else {
    // show the leaf split on its own, before any parent split
    const leafOnly = res.parentSplit ? { ...next, tree: { ...next.tree, fan: splitFanOnly(db, res.j) } } : next;
    r.set({ db: leafOnly, writes: WRITES.heap + WRITES.leafSplit, hotKey: key, hotNode: `i${res.j}` });
    r.snap(
      <>Leaf was full ({LEAF_CAP}/{LEAF_CAP}), so it <span className="hl bad">splits</span> in two and pushes a new
        separator ({res.separator}) up to its parent. <span className="hl">{WRITES.leafSplit} writes</span>: both halves and the parent.</>,
      1.5,
    );
    if (res.parentSplit) {
      r.set({ db: next, writes: res.writes, hotNode: 'r' });
      r.snap(
        <>Now the parent is over capacity too, so it splits and the <b>root</b> gets another child:{' '}
          <span className="hl">{WRITES.parentSplit} more writes</span>. Splits can cascade.</>,
        1.5,
      );
    }
  }
  r.set({ hotNode: null });
  r.snap(
    <>This INSERT cost <span className="hl bad">{r.get().writes} page writes</span> plus {r.get().reads} reads.
      Every extra index on the table repeats the index part: indexes speed up reads and slow down writes.</>,
    2,
  );
  const f = r.frames;
  return { frames: f, next };
}

/** The parent's child count after a leaf split but before the parent itself splits. */
function splitFanOnly(db: Db, j: number) {
  const fan = db.tree.fan.slice();
  fan[j] += 1;
  return fan;
}
