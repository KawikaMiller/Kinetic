import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { deleteCaption, insertCaption, pageCaption, pageNews } from './frames';
import { mulberry32 } from '../../core/random';
import { analyse, byFeed, createWorld, deleteNewest, insertAtHead, makeTable, nextPage, previewOffset, repeatedOnLastPage, type World } from './model';

const text = (n: Parameters<typeof expectCaption>[0]) => expectCaption(n).replace(/\s+/g, ' ');
const start = () => nextPage(createWorld(makeTable(15)));

describe('feed captions are derived from the sessions', () => {
  it('insert 2 then next: offset repeats #12, #11; the cursor is stable', () => {
    const before = insertAtHead(start(), 2);
    const t = text(pageCaption(before, nextPage(before)));
    expect(t).toContain('Offset: repeats #12, #11.');
    expect(t).toContain('Cursor: no repeats.');
    expect(t).toContain('The cursor stays stable.');
  });
  it('delete then next: offset skips #10, and only on that page', () => {
    const before = deleteNewest(start());
    const p2 = nextPage(before);
    expect(text(pageCaption(before, p2))).toContain('Offset: no repeats, skipped #10.');
    const p3 = nextPage(p2);
    const t3 = text(pageCaption(p2, p3));
    expect(t3).toContain('Offset: no repeats.');
    expect(t3).not.toContain('skipped');
  });
  it('a finished session says so instead of repeating its last page', () => {
    let w: World = start();
    for (let i = 0; i < 2; i++) w = nextPage(w);
    const after = nextPage(w);
    expect(pageNews(w, after, 'offset').done).toBe(true);
    expect(text(pageCaption(w, after))).toContain('Offset has nothing left.');
  });
  it('every caption over a seeded action walk names only real repeats and skips', () => {
    let w: World = start();
    const acts = ['ins', 'next', 'del', 'next', 'ins', 'ins', 'next', 'del', 'del', 'next', 'next', 'next'];
    for (const a of acts) {
      if (a !== 'next') { w = a === 'ins' ? insertAtHead(w, 2) : deleteNewest(w); continue; }
      const n = nextPage(w);
      for (const mode of ['offset', 'cursor'] as const) {
        const news = pageNews(w, n, mode);
        const last = n[mode].pages[n[mode].pages.length - 1] ?? [];
        for (const id of news.repeated) expect(last).toContain(id);
        for (const id of news.skipped) expect(n[mode].pages.flat()).not.toContain(id);
        if (mode === 'cursor') expect(news.repeated).toEqual([]);
      }
      w = n;
    }
  });
  it('insert then delete: the caption reports the net effect (a duplicate, not a skip)', () => {
    // The review's repro: default feed, insert 2 rows, delete the newest (#17), then Next page.
    let w: World = start();
    w = insertAtHead(w, 2);
    const afterInsert = text(insertCaption([16, 17], w));
    expect(afterInsert).toContain('repeat #12, #11');
    const gone = [...w.table].sort(byFeed)[0].id;
    expect(gone).toBe(17);
    w = deleteNewest(w);
    const t = text(deleteCaption(gone, !w.initial.includes(gone), w));
    expect(t).toContain('(one of the new rows)');
    expect(t).toContain('repeat #11');
    expect(t).not.toContain('skip');
    const next = nextPage(w);
    expect(repeatedOnLastPage(next.offset)).toEqual([11]);
    expect(analyse(next, next.offset).gaps).toEqual([]);
  });
  it('a delete alone says it will skip a row, and that is what happens', () => {
    const w = deleteNewest(start());
    expect(text(deleteCaption(15, false, w))).toContain('skip #10');
    expect(analyse(nextPage(w), nextPage(w).offset).gaps).toEqual([10]);
  });
  it('the look-ahead matches what Next page then does, over seeded insert/delete walks', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const rnd = mulberry32(seed);
      let w: World = start();
      for (let step = 0; step < 4 && w.offset.hasMore; step++) {
        for (let k = Math.floor(rnd() * 4); k > 0; k--) w = rnd() < 0.55 ? insertAtHead(w, 1 + Math.floor(rnd() * 2)) : deleteNewest(w);
        const p = previewOffset(w);
        const before = w.offset.cursor!;
        const next = nextPage(w);
        const page = next.offset.pages[next.offset.pages.length - 1];
        expect(p.rows, `seed ${seed}`).toEqual(page);
        expect(p.repeated).toEqual(page.filter((id) => w.offset.pages.flat().includes(id)));
        // Independent oracle for skips: table rows strictly between the last row shown and the page's first row.
        const sorted = [...w.table].sort(byFeed);
        const firstAt = page.length ? sorted.findIndex((r) => r.id === page[0]) : sorted.length;
        const afterAt = sorted.findIndex((r) => r.ts < before.ts || (r.ts === before.ts && r.id < before.id));
        const between = afterAt < 0 ? [] : sorted.slice(afterAt, Math.max(afterAt, firstAt)).map((r) => r.id);
        expect(p.skipped).toEqual(between);
        w = next;
      }
    }
  });
  it('the offset clause is dropped once offset has no more pages', () => {
    let w: World = start();
    for (let i = 0; i < 2; i++) w = nextPage(w);
    expect(text(insertCaption([16], insertAtHead(w, 1)))).not.toContain('OFFSET');
  });
});
