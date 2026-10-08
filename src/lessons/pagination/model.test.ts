import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  FETCH, LIMIT, analyse, byFeed, createWorld, cursorResponse, decodeCursor, deleteNewest, encodeCursor, insertAtHead, keysetCost, keysetPage, makeTable,
  nextPage, offsetCost, offsetPage, pageAll, repeatedOnLastPage, tieTable, type World,
} from './model';

const ids = (rows: { id: number }[]) => rows.map((r) => r.id);

describe('the two queries on a still table', () => {
  const t = makeTable(15);
  it('offset and keyset return the same pages when nothing changes', () => {
    expect(ids(offsetPage(t, 0).rows)).toEqual([15, 14, 13, 12, 11]);
    expect(ids(offsetPage(t, 5).rows)).toEqual([10, 9, 8, 7, 6]);
    expect(ids(keysetPage(t, { ts: 11, id: 11 }).rows)).toEqual([10, 9, 8, 7, 6]);
    expect(offsetPage(t, 10).hasMore).toBe(false);
    expect(offsetPage(t, 5).hasMore).toBe(true);
  });
  it('scanned rows: offset = offset + limit (+1 for has_more), keyset = limit (+1)', () => {
    const big = makeTable(400);
    for (let page = 1; page <= 50; page++) {
      const offset = (page - 1) * LIMIT;
      expect(offsetPage(big, offset).scanned).toBe(offset + LIMIT + 1);
      expect(offsetPage(big, offset).scanned).toBe(offsetCost(page));
      const last = [...big].sort(byFeed)[offset - 1];
      expect(keysetPage(big, last ? { ts: last.ts, id: last.id } : null).scanned).toBe(LIMIT + 1);
      expect(keysetCost(page)).toBe(FETCH);
    }
  });
  it('page 10,000 of 5 makes offset walk 50,001 rows and keyset read 6', () => {
    expect(offsetCost(10000)).toBe(50001);
    expect(keysetCost(10000)).toBe(6);
  });
});

/** Pages from the top, applying `between(world, pageIndex)` before each page after the first. */
function run(n: number, pages: number, between: (w: World, i: number) => World): World {
  let w = nextPage(createWorld(makeTable(n)));
  for (let i = 1; i < pages; i++) w = nextPage(between(w, i));
  return w;
}

describe('offset under writes', () => {
  it.each([1, 2, 3, 4, 5])('k = %i inserts at the head between pages duplicate exactly k rows', (k) => {
    const w = run(20, 2, (x) => insertAtHead(x, k));
    expect(repeatedOnLastPage(w.offset)).toHaveLength(k);
    expect(analyse(w, w.offset).duplicates).toHaveLength(k);
    expect(repeatedOnLastPage(w.cursor)).toEqual([]);
  });
  it.each([1, 2, 3])('d = %i deletes at the head between pages skip exactly d rows', (d) => {
    const w = run(20, 2, (x) => Array.from({ length: d }).reduce<World>((y) => deleteNewest(y), x));
    expect(analyse(w, w.offset).gaps).toHaveLength(d);
    expect(analyse(w, w.cursor).gaps).toEqual([]);
  });
  it('the worked example: insert 2 after page 1, and page 2 repeats #12 and #11', () => {
    const w = run(15, 2, (x) => insertAtHead(x, 2));
    expect(w.offset.pages[1]).toEqual([12, 11, 10, 9, 8]);
    expect(repeatedOnLastPage(w.offset)).toEqual([12, 11]);
    expect(w.cursor.pages[1]).toEqual([10, 9, 8, 7, 6]);
  });
  it('inserted rows that were never shown are new, not gaps', () => {
    const w = run(15, 2, (x) => insertAtHead(x, 2));
    const a = analyse(w, w.cursor);
    expect(a.marks.get(16)).toBe('new');
    expect(a.marks.get(17)).toBe('new');
    expect(a.gaps).toEqual([]);
  });
});

describe('cursor pagination is stable (seeded property test)', () => {
  for (let seed = 1; seed <= 200; seed++) {
    it(`seed ${seed}: every surviving row exactly once, in order`, () => {
      const rnd = mulberry32(seed);
      let w = createWorld(makeTable(10 + Math.floor(rnd() * 20)));
      const ever = new Map(w.table.map((r) => [r.id, r]));
      for (let guard = 0; guard < 40 && w.cursor.hasMore; guard++) {
        w = nextPage(w);
        const inserts = Math.floor(rnd() * 4);
        w = insertAtHead(w, inserts);
        for (const r of w.table) ever.set(r.id, r);
        if (rnd() < 0.5) w = deleteNewest(w);
      }
      const got = w.cursor.pages.flat();
      expect(new Set(got).size).toBe(got.length);
      const present = new Set(w.table.map((r) => r.id));
      for (const id of w.initial) if (present.has(id)) expect(got).toContain(id);
      // strictly descending sort key across the whole session
      const keyed = got.map((id) => ever.get(id)!);
      for (let i = 1; i < keyed.length; i++) expect(byFeed(keyed[i - 1], keyed[i])).toBeLessThan(0);
    });
  }
  it('offset is not stable under the same writes (some seed duplicates or skips)', () => {
    let broken = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const rnd = mulberry32(seed);
      let w = createWorld(makeTable(20));
      for (let p = 0; p < 4; p++) {
        w = nextPage(w);
        w = insertAtHead(w, Math.floor(rnd() * 3));
        if (rnd() < 0.5) w = deleteNewest(w);
      }
      const a = analyse(w, w.offset);
      if (a.duplicates.length || a.gaps.length) broken++;
    }
    expect(broken).toBeGreaterThan(25);
  });
});

describe('the tie-breaker trap', () => {
  it('created_at alone skips the rows that share the boundary timestamp', () => {
    const pages = pageAll(tieTable(), false);
    const got = pages.flat();
    expect(got).toHaveLength(10);
    const missing = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((id) => !got.includes(id));
    expect(missing).toHaveLength(2);
    for (const id of missing) expect(tieTable().find((r) => r.id === id)!.ts).toBe(5);
  });
  it('(created_at, id) returns all 12, once each', () => {
    const got = pageAll(tieTable(), true).flat();
    expect([...got].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('cursors', () => {
  it('round-trip through b64url for many keys', () => {
    for (let ts = -3; ts < 400; ts += 7) for (const id of [0, 1, 99, 123456]) expect(decodeCursor(encodeCursor({ ts, id }))).toEqual({ ts, id });
  });
  it('are opaque base64url text', () => {
    expect(encodeCursor({ ts: 11, id: 11 })).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(atob(encodeCursor({ ts: 11, id: 11 }))).toBe('{"ts":11,"id":11}');
  });
  it.each(['', 'not a cursor!', 'e30', btoa('[1,2]'), btoa('{"ts":1.5,"id":2}')])('refuse %j', (s) => {
    expect(decodeCursor(s.replace(/=+$/, ''))).toBeNull();
  });
  it('the response shows next_cursor and has_more from the session', () => {
    const w = nextPage(createWorld(makeTable(15)));
    const lines = cursorResponse(w.table, w.cursor);
    expect(lines).toContain(`  "next_cursor": "${encodeCursor({ ts: 11, id: 11 })}",`);
    expect(lines).toContain('  "has_more": true');
  });
});
