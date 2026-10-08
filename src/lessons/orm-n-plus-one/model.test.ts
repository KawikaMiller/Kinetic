import { beforeAll, describe, expect, it } from 'vitest';
import {
  FIXTURE, INT_BYTES, MAX_COMMENTS_PER_POST, MAX_POSTS, MS_PER_BYTE, NULL_BYTES, PAGE_MAX, ROW_BYTES, STRATEGIES, WORK_BASE_MS, pageComments, rowBytes,
  runStrategy, snippet, stopsFor, timeline, workMs, type PostView, type Query, type Row, type Scene, type Strategy, type Value,
} from './model';

interface Db {
  exec(sql: string): void;
  prepare(sql: string): { all(): Record<string, Value>[]; setReturnArrays(on: boolean): void };
}
const SQLITE = 'node:sqlite';
let db: Db;
beforeAll(async () => {
  const { DatabaseSync } = (await import(/* @vite-ignore */ SQLITE)) as { DatabaseSync: new (path: string) => Db };
  db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT); CREATE TABLE commenters (id INTEGER PRIMARY KEY, name TEXT);');
  db.exec('CREATE TABLE posts (id INTEGER PRIMARY KEY, author_id INTEGER, title TEXT); CREATE TABLE comments (id INTEGER PRIMARY KEY, post_id INTEGER, user_id INTEGER, body TEXT);');
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  for (const a of FIXTURE.authors) db.exec(`INSERT INTO authors VALUES (${a.id}, ${q(a.name)})`);
  for (const c of FIXTURE.commenters) db.exec(`INSERT INTO commenters VALUES (${c.id}, ${q(c.name)})`);
  for (const p of FIXTURE.posts) db.exec(`INSERT INTO posts VALUES (${p.id}, ${p.author_id}, ${q(p.title)})`);
  for (const c of FIXTURE.comments) db.exec(`INSERT INTO comments VALUES (${c.id}, ${c.post_id}, ${c.user_id}, ${q(c.body)})`);
});

const SCENES: Scene[] = ['authors', 'nested'];
const ALL: Strategy[] = STRATEGIES.map((s) => s.id);
const SIZES = Array.from({ length: PAGE_MAX }, (_, i) => i + 1);

// ── An independent reference page, straight off the fixture ──
function referencePage(scene: Scene, n: number): PostView[] {
  const out: PostView[] = [];
  for (let id = 1; id <= n; id++) {
    const post = FIXTURE.posts.find((p) => p.id === id)!;
    if (scene === 'authors') out.push({ id, title: post.title, author: FIXTURE.authors.find((a) => a.id === post.author_id)!.name });
    else {
      const comments = FIXTURE.comments.filter((c) => c.post_id === id).map((c) => ({ body: c.body, user: FIXTURE.commenters.find((u) => u.id === c.user_id)!.name }));
      out.push({ id, title: post.title, comments });
    }
  }
  return out;
}

describe('the fixture', () => {
  it('has 200 posts with contiguous ids, up to 6 comments each, and every foreign key resolves', () => {
    expect(FIXTURE.posts.map((p) => p.id)).toEqual(Array.from({ length: MAX_POSTS }, (_, i) => i + 1));
    for (let id = 1; id <= MAX_POSTS; id++) expect(FIXTURE.comments.filter((c) => c.post_id === id).length).toBeLessThanOrEqual(MAX_COMMENTS_PER_POST);
    for (const p of FIXTURE.posts) expect(FIXTURE.authors.some((a) => a.id === p.author_id)).toBe(true);
    for (const c of FIXTURE.comments) expect(FIXTURE.commenters.some((u) => u.id === c.user_id)).toBe(true);
    expect(FIXTURE.comments.some((c) => c.post_id <= 20)).toBe(true);
  });
});

describe('query counts for every page size 1-200', () => {
  it('authors: lazy = 1 + N, join = 1, batch = 2, loader = 2', () => {
    for (const n of SIZES) {
      const count = (s: Strategy) => runStrategy('authors', s, n).queries.length;
      expect([count('lazy'), count('join'), count('batch'), count('loader')]).toEqual([1 + n, 1, 2, 2]);
    }
  });

  it('nested: lazy = 1 + N + (comments on the page), join = 1, batch and loader = 3 (2 when there are no comments)', () => {
    for (const n of SIZES) {
      const c = FIXTURE.comments.filter((x) => x.post_id <= n).length;
      expect(pageComments(n)).toBe(c);
      const count = (s: Strategy) => runStrategy('nested', s, n).queries.length;
      expect([count('lazy'), count('join'), count('batch'), count('loader')]).toEqual([1 + n + c, 1, c > 0 ? 3 : 2, c > 0 ? 3 : 2]);
    }
  });

  it('by hand at N = 20: the nested lazy page asks 1 + 20 + C queries, hundreds at N = 200', () => {
    const c20 = pageComments(20);
    expect(runStrategy('nested', 'lazy', 20).queries.length).toBe(21 + c20);
    expect(runStrategy('nested', 'lazy', 200).queries.length).toBeGreaterThan(400);
  });

  it('a one-per-row query repeats once per row of the query before it, and the fixes send none', () => {
    for (const s of ['join', 'batch', 'loader'] as Strategy[])
      for (const scene of SCENES) expect(runStrategy(scene, s, 20).queries.every((q) => q.kind !== 'each')).toBe(true);
    const lazy = runStrategy('authors', 'lazy', 20).queries;
    expect(lazy.filter((q) => q.kind === 'each').length).toBe(20);
    expect(lazy[0].kind).toBe('first');
  });

  it('every query is attributed to a line of the snippet that exists', () => {
    for (const scene of SCENES)
      for (const s of ALL) {
        const lines = snippet(scene, s, 20);
        for (const q of runStrategy(scene, s, 20).queries) expect(q.line).toBeLessThan(lines.length);
      }
  });
});

describe('every strategy builds the same page', () => {
  it('matches the reference for many page sizes and both scenes', () => {
    for (const scene of SCENES)
      for (const n of [1, 2, 3, 10, 20, 57, 100, 199, 200])
        for (const s of ALL) expect(runStrategy(scene, s, n).page, `${scene} ${s} ${n}`).toEqual(referencePage(scene, n));
  });
});

describe('time is a serial waterfall: count x latency + work', () => {
  it('total = queries x latency + the work of each, for every strategy, size and latency', () => {
    for (const scene of SCENES)
      for (const s of ALL)
        for (const n of [1, 20, 100, 200])
          for (const latency of [0.2, 1, 5, 20]) {
            const qs = runStrategy(scene, s, n).queries;
            const t = timeline(qs, latency);
            const work = qs.reduce((sum, q) => sum + WORK_BASE_MS + q.bytes * MS_PER_BYTE, 0);
            expect(t.total).toBeCloseTo(qs.length * latency + work, 9);
            expect(t.waiting).toBeCloseTo(qs.length * latency, 9);
          }
  });

  it('queries never overlap: each starts when the one before it ends', () => {
    const t = timeline(runStrategy('nested', 'lazy', 20).queries, 5);
    expect(t.items[0].start).toBe(0);
    for (let i = 1; i < t.items.length; i++) expect(t.items[i].start).toBe(t.items[i - 1].end);
    expect(t.items.at(-1)!.end).toBe(t.total);
  });

  it('by hand: 21 lazy author queries at 5 ms wait 105 ms for the network alone, and the fix does it in about 2 round trips', () => {
    const lazy = timeline(runStrategy('authors', 'lazy', 20).queries, 5);
    expect(lazy.waiting).toBe(105);
    expect(lazy.total).toBeGreaterThan(105);
    expect(lazy.total).toBeLessThan(107);
    const batch = timeline(runStrategy('authors', 'batch', 20).queries, 5);
    expect(batch.waiting).toBe(10);
    expect(batch.total).toBeLessThan(11);
  });

  it('the N+1 matters at every latency: even at 0.2 ms the lazy page is slower than the batch, and the gap grows with latency', () => {
    let gap = 0;
    for (const latency of [0.2, 1, 5, 20]) {
      const lazy = timeline(runStrategy('authors', 'lazy', 20).queries, latency).total;
      const batch = timeline(runStrategy('authors', 'batch', 20).queries, latency).total;
      expect(lazy).toBeGreaterThan(batch);
      expect(lazy - batch).toBeGreaterThan(gap);
      gap = lazy - batch;
    }
  });

  it('uses the named constants for work and bytes', () => {
    const q: Query = { sql: '', line: 0, kind: 'first', cols: [], rows: [], bytes: 1000 };
    expect(workMs(q)).toBeCloseTo(WORK_BASE_MS + 1000 * MS_PER_BYTE, 12);
    expect(rowBytes(['ab', 5, null])).toBe(ROW_BYTES + 2 + INT_BYTES + NULL_BYTES);
  });
});

describe('the over-eager trap: one join duplicates the post on every comment row', () => {
  it('returns one row per comment (a post with none keeps one row), and each row carries the post title again', () => {
    for (const n of [10, 20, 50, 200]) {
      const q = runStrategy('nested', 'join', n).queries[0];
      const expected = FIXTURE.posts.slice(0, n).reduce((s, p) => s + Math.max(1, FIXTURE.comments.filter((c) => c.post_id === p.id).length), 0);
      expect(q.rows.length).toBe(expected);
      expect(q.rows.length).toBeGreaterThan(n);
    }
  });

  it('transfers more bytes than the batch fix for every page size from 10 up', () => {
    for (let n = 10; n <= PAGE_MAX; n++) {
      const bytes = (s: Strategy) => runStrategy('nested', s, n).queries.reduce((sum, q) => sum + q.bytes, 0);
      expect(bytes('join'), `N = ${n}`).toBeGreaterThan(bytes('batch'));
    }
  });

  it('a post with no comments still appears, with NULLs for the comment side', () => {
    const empty = FIXTURE.posts.find((p) => !FIXTURE.comments.some((c) => c.post_id === p.id))!;
    const q = runStrategy('nested', 'join', empty.id).queries[0];
    expect(q.rows.some((r) => r[0] === empty.id && r[2] === null && r[3] === null && r[4] === null)).toBe(true);
  });
});

describe('the SQL is real: every statement runs in SQLite and returns the rows the page used', () => {
  const sorted = (rows: Row[]) => rows.map((r) => JSON.stringify(r)).sort();
  const sqliteRows = (sql: string): Row[] => {
    const stmt = db.prepare(sql);
    stmt.setReturnArrays(true);
    return stmt.all() as unknown as Row[];
  };

  for (const scene of SCENES)
    for (const s of ALL)
      for (const n of [1, 20, 200])
        it(`${scene} ${s} at N = ${n}`, () => {
          const run = runStrategy(scene, s, n);
          for (const q of run.queries) expect(sorted(sqliteRows(q.sql)), q.sql).toEqual(sorted(q.rows));
        });

  it('a page assembled only from SQLite rows equals the reference page, for every strategy', () => {
    for (const n of [1, 20, 200]) {
      for (const s of ALL) {
        // authors
        const a = runStrategy('authors', s, n).queries.map((q) => sqliteRows(q.sql));
        const authors = new Map<number, string>();
        let pageA: PostView[];
        if (s === 'join') pageA = a[0].map((r) => ({ id: r[0] as number, title: r[1] as string, author: r[2] as string }));
        else {
          for (const rows of a.slice(1)) for (const r of rows) authors.set(r[0] as number, r[1] as string);
          pageA = a[0].map((r) => ({ id: r[0] as number, title: r[2] as string, author: authors.get(r[1] as number)! }));
        }
        expect(pageA).toEqual(referencePage('authors', n));
      }
      // nested, from the batch queries (join is covered by the row-for-row check above)
      const [posts, comments, users] = runStrategy('nested', 'batch', n).queries.map((q) => sqliteRows(q.sql));
      const names = new Map((users ?? []).map((r) => [r[0] as number, r[1] as string]));
      const pageB = posts.map((p) => ({
        id: p[0] as number,
        title: p[2] as string,
        comments: comments.filter((c) => c[1] === p[0]).map((c) => ({ body: c[3] as string, user: names.get(c[2] as number)! })),
      }));
      expect(pageB.map(({ id, title, comments: cs }) => ({ id, title, comments: cs }))).toEqual(referencePage('nested', n));
    }
  });
});

describe('frame stops', () => {
  it('end on the last query, rise strictly, and number at most 14', () => {
    for (let count = 1; count <= 700; count++) {
      const stops = stopsFor(count);
      expect(stops.at(-1)).toBe(count);
      expect(stops.length).toBeLessThanOrEqual(14);
      for (let i = 1; i < stops.length; i++) expect(stops[i]).toBeGreaterThan(stops[i - 1]);
    }
  });

  it('show every query one at a time while there are few', () => {
    expect(stopsFor(2)).toEqual([1, 2]);
    expect(stopsFor(14)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(stopsFor(21).slice(0, 6)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
