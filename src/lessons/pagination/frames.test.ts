import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { deleteCaption, insertCaption, pageCaption, pageNews } from './frames';
import { createWorld, deleteNewest, insertAtHead, makeTable, nextPage, type World } from './model';

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
  it('insert and delete captions drop the OFFSET clause once offset is finished', () => {
    expect(text(insertCaption([16, 17], 5, false))).toContain('OFFSET 5 now lands 2 rows earlier');
    expect(text(insertCaption([16, 17], 15, true))).not.toContain('OFFSET');
    expect(text(deleteCaption(15, 5, false))).toContain('jump over a row');
  });
});
