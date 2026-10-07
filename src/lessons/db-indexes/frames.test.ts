import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { mulberry32, pick } from '../../core/random';
import { BILLION, indexFrames, insertFrames, rangeFrames, scanFrames, type IxFrame } from './frames';
import { MAX_INSERTS, allKeys, freshKey, indexLevels, insertKey, locate, makeDb, pageOf, pickRange, type Db } from './model';

const SEEDS = Array.from({ length: 120 }, (_, i) => i + 1);
const dbs = () => SEEDS.map((seed) => ({ rnd: mulberry32(seed), db: makeDb(mulberry32(seed)) }));
const everyCaptioned = (frames: IxFrame[]) => frames.forEach((f, i) => expect(text(f.say).length, `frame ${i}`).toBeGreaterThan(0));

describe('full table scan', () => {
  it('reads every heap page once, keeps going after the match, and says so', () => {
    for (const { rnd, db } of dbs()) {
      const target = pick(allKeys(db), rnd);
      const frames = scanFrames(db, target);
      everyCaptioned(frames);
      const last = frames.at(-1)!;
      expect(last.reads).toBe(db.pages.length);
      expect(text(last.say)).toContain(`${db.pages.length} page reads`);
      const hit = frames.findIndex((f) => f.found === target);
      expect(frames[hit].hotPage).toBe(pageOf(db, target));
      for (const f of frames.slice(hit + 1, -1)) expect(text(f.say)).toContain('no more');
    }
  });
});

describe('index lookup', () => {
  it('reads root, internal, leaf and one heap page, and quotes the modelled billion-row depth', () => {
    for (const { rnd, db } of dbs()) {
      const target = pick(allKeys(db), rnd);
      const frames = indexFrames(db, target);
      everyCaptioned(frames);
      const last = frames.at(-1)!;
      expect(last.reads).toBe(4);
      expect(last.walked).toEqual(['r', `i${locate(db.tree, target).j}`, `l${locate(db.tree, target).leaf}`]);
      expect(last.readPages).toEqual([pageOf(db, target)]);
      expect(text(last.say)).toContain(`4 page reads instead of ${db.pages.length}`);
      expect(text(last.say)).toContain(`only ${indexLevels(BILLION)} levels deep`);
    }
  });
});

describe('range query', () => {
  it('collects exactly the ids in range, walking leaves until one passes the end', () => {
    for (const { rnd, db } of dbs()) {
      const [lo, hi] = pickRange(db, rnd);
      const frames = rangeFrames(db, lo, hi);
      everyCaptioned(frames);
      const last = frames.at(-1)!;
      const expected = allKeys(db).filter((k) => k >= lo && k <= hi);
      expect(last.rangeKeys).toEqual(expected);
      // leaves walked: from lo's leaf up to the first leaf whose last key is past hi
      const first = locate(db.tree, lo).leaf;
      let end = first;
      while (db.tree.leaves[end].at(-1)! <= hi) end++;
      const leavesRead = end - first + 1;
      const pages = new Set(expected.map((k) => pageOf(db, k))).size;
      expect(last.reads).toBe(2 + leavesRead + pages);
      expect(text(last.say)).toContain(`${last.reads} reads for ${expected.length} rows`);
    }
  });

  it('stops at the last leaf, with a true caption, when the range runs to the end', () => {
    const db = makeDb(mulberry32(5));
    const keys = allKeys(db);
    const frames = rangeFrames(db, keys.at(-3)!, keys.at(-1)!);
    everyCaptioned(frames);
    expect(frames.some((f) => text(f.say).includes('is the last leaf'))).toBe(true);
    expect(frames.at(-1)!.rangeKeys).toEqual(keys.slice(-3));
  });
});

describe('insert', () => {
  it('reports the writes the model counts, and every frame has a caption', () => {
    for (const { rnd, db: start } of dbs()) {
      let db: Db = start;
      for (let n = 0; n < MAX_INSERTS; n++) {
        const key = freshKey(db, rnd);
        const expected = insertKey(db, key);
        const { frames, next } = insertFrames(db, key);
        everyCaptioned(frames);
        const last = frames.at(-1)!;
        expect(last.writes).toBe(expected.writes);
        expect(text(last.say)).toContain(`cost ${expected.writes} page writes plus 3 reads`);
        expect(frames.some((f) => text(f.say).includes('splits in two'))).toBe(expected.split);
        expect(frames.some((f) => text(f.say).includes('parent is over capacity'))).toBe(expected.parentSplit);
        expect(next).toEqual(expected.next);
        db = next;
      }
    }
  });
});
