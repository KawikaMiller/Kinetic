// A blog page and the queries an ORM sends to build it. The database is a fixed fixture with
// row and byte accounting; the SQL strings in the log are real (the tests run every one of them
// in SQLite and compare), and the time is a serial waterfall over an illustrative latency.
import { mulberry32, pick, randInt } from '../../core/random';

export interface Author {
  id: number;
  name: string;
}
export interface Post {
  id: number;
  author_id: number;
  title: string;
}
export interface Commenter {
  id: number;
  name: string;
}
export interface Comment {
  id: number;
  post_id: number;
  user_id: number;
  body: string;
}

const AUTHORS = ['Ada', 'Linus', 'Grace', 'Alan', 'Margaret', 'Dennis', 'Barbara', 'Ken', 'Radia', 'Edsger'];
const COMMENTERS = ['Zoe', 'Max', 'Ivy', 'Sam', 'Eve', 'Raj', 'Mia', 'Leo', 'Noa', 'Kai', 'Uma', 'Joe', 'Ana', 'Ben'];
const ADJECTIVES = ['Fast', 'Quiet', 'Broken', 'Simple', 'Hidden', 'Tiny', 'Lazy', 'Eager'];
const NOUNS = ['caches', 'queries', 'indexes', 'locks', 'tests', 'builds', 'logs', 'pipes'];
const ENDINGS = ['explained', 'revisited', 'in practice', 'the hard way'];
const REPLIES = ['Great post', 'Disagree on the last point', 'Thanks, this fixed my bug', 'Can you share the code?', 'Same here in production', 'Nice summary'];

export const MAX_POSTS = 200;
export const MAX_COMMENTS_PER_POST = 6;

export interface Fixture {
  authors: Author[];
  commenters: Commenter[];
  posts: Post[];
  comments: Comment[];
}

function buildFixture(): Fixture {
  const rnd = mulberry32(2310);
  const authors = AUTHORS.map((name, i) => ({ id: i + 1, name }));
  const commenters = COMMENTERS.map((name, i) => ({ id: i + 1, name }));
  const posts: Post[] = [];
  const comments: Comment[] = [];
  for (let id = 1; id <= MAX_POSTS; id++) {
    posts.push({ id, author_id: randInt(1, authors.length, rnd), title: `${pick(ADJECTIVES, rnd)} ${pick(NOUNS, rnd)} ${pick(ENDINGS, rnd)}` });
    for (let k = randInt(0, MAX_COMMENTS_PER_POST, rnd); k > 0; k--) {
      comments.push({ id: comments.length + 1, post_id: id, user_id: randInt(1, commenters.length, rnd), body: pick(REPLIES, rnd) });
    }
  }
  return { authors, commenters, posts, comments };
}

export const FIXTURE: Fixture = buildFixture();

// ── The page, and the queries ──────────────────────────────────────────

export type Scene = 'authors' | 'nested';
export type Strategy = 'lazy' | 'join' | 'batch' | 'loader';

export const STRATEGIES: { id: Strategy; label: string }[] = [
  { id: 'lazy', label: 'lazy loading (the trap)' },
  { id: 'join', label: 'eager join' },
  { id: 'batch', label: 'eager batch: IN (…)' },
  { id: 'loader', label: 'DataLoader-style batching' },
];

export type Value = string | number | null;
export type Row = Value[];

/** What kind of query it is, for the colours: the first, one-per-row repeats, or a fix's query. */
export type QueryKind = 'first' | 'each' | 'batch' | 'join';

export interface Query {
  sql: string;
  /** The line of the ORM snippet that caused it. */
  line: number;
  kind: QueryKind;
  cols: string[];
  rows: Row[];
  /** Illustrative wire size of the result. */
  bytes: number;
}

export interface PostView {
  id: number;
  title: string;
  author?: string;
  comments?: { body: string; user: string }[];
}

/** Wire size: a string by its length, a number 8 bytes, NULL 1 byte, plus 8 bytes of row framing per row. */
export const INT_BYTES = 8;
export const NULL_BYTES = 1;
export const ROW_BYTES = 8;
export const rowBytes = (r: Row) => ROW_BYTES + r.reduce<number>((s, v) => s + (v === null ? NULL_BYTES : typeof v === 'number' ? INT_BYTES : v.length), 0);

function query(sql: string, line: number, kind: QueryKind, cols: string[], rows: Row[]): Query {
  return { sql, line, kind, cols, rows, bytes: rows.reduce((s, r) => s + rowBytes(r), 0) };
}

const list = (xs: readonly number[]) => xs.join(', ');
const uniq = (xs: readonly number[]) => [...new Set(xs)];
const authorName = (id: number) => FIXTURE.authors.find((a) => a.id === id)!.name;
const commenterName = (id: number) => FIXTURE.commenters.find((c) => c.id === id)!.name;
const firstPosts = (n: number) => FIXTURE.posts.slice(0, n);

const POSTS_COLS = ['id', 'author_id', 'title'];
const postsQuery = (n: number, line: number) =>
  query(`SELECT id, author_id, title FROM posts ORDER BY id LIMIT ${n}`, line, 'first', POSTS_COLS, firstPosts(n).map((p) => [p.id, p.author_id, p.title]));

const authorOne = (id: number, line: number) =>
  query(`SELECT id, name FROM authors WHERE id = ${id}`, line, 'each', ['id', 'name'], FIXTURE.authors.filter((a) => a.id === id).map((a) => [a.id, a.name]));
const authorsIn = (ids: readonly number[], line: number, kind: QueryKind) =>
  query(`SELECT id, name FROM authors WHERE id IN (${list(ids)})`, line, kind, ['id', 'name'], FIXTURE.authors.filter((a) => ids.includes(a.id)).map((a) => [a.id, a.name]));

const COMMENT_COLS = ['id', 'post_id', 'user_id', 'body'];
const commentRow = (c: Comment): Row => [c.id, c.post_id, c.user_id, c.body];
const commentsOne = (postId: number, line: number) =>
  query(`SELECT id, post_id, user_id, body FROM comments WHERE post_id = ${postId} ORDER BY id`, line, 'each', COMMENT_COLS, FIXTURE.comments.filter((c) => c.post_id === postId).map(commentRow));
const commentsIn = (postIds: readonly number[], line: number, kind: QueryKind) =>
  query(`SELECT id, post_id, user_id, body FROM comments WHERE post_id IN (${list(postIds)}) ORDER BY post_id, id`, line, kind, COMMENT_COLS, FIXTURE.comments.filter((c) => postIds.includes(c.post_id)).map(commentRow));

const commenterOne = (id: number, line: number) =>
  query(`SELECT id, name FROM commenters WHERE id = ${id}`, line, 'each', ['id', 'name'], FIXTURE.commenters.filter((c) => c.id === id).map((c) => [c.id, c.name]));
const commentersIn = (ids: readonly number[], line: number, kind: QueryKind) =>
  query(`SELECT id, name FROM commenters WHERE id IN (${list(ids)})`, line, kind, ['id', 'name'], FIXTURE.commenters.filter((c) => ids.includes(c.id)).map((c) => [c.id, c.name]));

function authorsJoin(n: number): Query {
  const rows = firstPosts(n).map((p): Row => [p.id, p.title, authorName(p.author_id)]);
  return query(`SELECT p.id, p.title, a.name FROM posts p JOIN authors a ON a.id = p.author_id ORDER BY p.id LIMIT ${n}`, 0, 'join', ['id', 'title', 'name'], rows);
}

function nestedJoin(n: number): Query {
  const rows: Row[] = [];
  for (const p of firstPosts(n)) {
    const cs = FIXTURE.comments.filter((c) => c.post_id === p.id);
    if (cs.length === 0) rows.push([p.id, p.title, null, null, null]);
    for (const c of cs) rows.push([p.id, p.title, c.id, c.body, commenterName(c.user_id)]);
  }
  return query(
    `SELECT p.id, p.title, c.id, c.body, u.name FROM (SELECT * FROM posts ORDER BY id LIMIT ${n}) p LEFT JOIN comments c ON c.post_id = p.id LEFT JOIN commenters u ON u.id = c.user_id ORDER BY p.id, c.id`,
    0, 'join', ['id', 'title', 'id', 'body', 'name'], rows,
  );
}

export interface Run {
  queries: Query[];
  page: PostView[];
}

/** The lines of the ORM snippet each strategy shows; `line` on a query indexes into them. */
export function snippet(scene: Scene, strategy: Strategy, n: number): string[] {
  const all = `Post.all(limit=${n})`;
  if (scene === 'authors') {
    const load = { lazy: all, join: `${all}.join(Author)`, batch: `${all}.preload(Author)`, loader: all }[strategy];
    return [`posts = ${load}`, 'for p in posts:', strategy === 'loader' ? '    show(p.title, await authors.load(p.author_id))' : '    show(p.title, p.author.name)'];
  }
  const load = { lazy: all, join: `${all}.join(Comment).join(User)`, batch: `${all}.preload(Comment, User)`, loader: all }[strategy];
  return [
    `posts = ${load}`,
    'for p in posts:',
    strategy === 'loader' ? '    for c in await comments.load(p.id):' : '    for c in p.comments:',
    strategy === 'loader' ? '        show(c.body, await users.load(c.user_id))' : '        show(c.body, c.user.name)',
  ];
}

/** Runs one strategy for a page of `n` posts: the queries it sends, in order, and the page it builds. */
export function runStrategy(scene: Scene, strategy: Strategy, n: number): Run {
  const posts = postsQuery(n, 0);
  const ps = firstPosts(n);
  if (scene === 'authors') {
    const authorOf = (id: number) => authorName(id);
    const page = (): PostView[] => ps.map((p) => ({ id: p.id, title: p.title, author: authorOf(p.author_id) }));
    switch (strategy) {
      case 'lazy':
        return { queries: [posts, ...ps.map((p) => authorOne(p.author_id, 2))], page: page() };
      case 'join': {
        const q = authorsJoin(n);
        return { queries: [q], page: q.rows.map((r) => ({ id: r[0] as number, title: r[1] as string, author: r[2] as string })) };
      }
      case 'batch':
        return { queries: [posts, authorsIn(uniq(ps.map((p) => p.author_id)), 0, 'batch')], page: page() };
      case 'loader':
        // Every load() in the loop is collected until the loop yields, then sent as one query.
        return { queries: [posts, authorsIn(uniq(ps.map((p) => p.author_id)), 2, 'batch')], page: page() };
    }
  }
  const commentsOf = (postId: number) => FIXTURE.comments.filter((c) => c.post_id === postId);
  const page = (): PostView[] => ps.map((p) => ({ id: p.id, title: p.title, comments: commentsOf(p.id).map((c) => ({ body: c.body, user: commenterName(c.user_id) })) }));
  const pageComments = ps.flatMap((p) => commentsOf(p.id));
  switch (strategy) {
    case 'lazy':
      return {
        queries: [posts, ...ps.flatMap((p) => [commentsOne(p.id, 2), ...commentsOf(p.id).map((c) => commenterOne(c.user_id, 3))])],
        page: page(),
      };
    case 'join': {
      const q = nestedJoin(n);
      const byPost = new Map<number, PostView>();
      for (const r of q.rows) {
        const v = byPost.get(r[0] as number) ?? { id: r[0] as number, title: r[1] as string, comments: [] };
        if (r[2] !== null) v.comments!.push({ body: r[3] as string, user: r[4] as string });
        byPost.set(v.id, v);
      }
      return { queries: [q], page: [...byPost.values()] };
    }
    case 'batch':
    case 'loader': {
      const line = (l: number) => (strategy === 'loader' ? l : 0);
      const kind: QueryKind = 'batch';
      const queries = [posts, commentsIn(ps.map((p) => p.id), line(2), kind)];
      if (pageComments.length > 0) queries.push(commentersIn(uniq(pageComments.map((c) => c.user_id)), line(3), kind));
      return { queries, page: page() };
    }
  }
}

// ── Time: a serial waterfall ──────────────────────────────────────────

/** Illustrative: the database's own work for any query, and the cost of each byte it returns. */
export const WORK_BASE_MS = 0.05;
export const MS_PER_BYTE = 0.00002;
export const LATENCY_MIN_MS = 0.2;
export const LATENCY_MAX_MS = 20;
export const LATENCY_DEFAULT_MS = 5;
export const PAGE_MIN = 10;
export const PAGE_MAX = 200;
export const PAGE_DEFAULT = 20;

export const workMs = (q: Query) => WORK_BASE_MS + q.bytes * MS_PER_BYTE;

export interface Timed {
  query: Query;
  start: number;
  end: number;
  work: number;
}

export interface Timeline {
  items: Timed[];
  total: number;
  /** Time the application spent waiting on the round trip rather than the database working. */
  waiting: number;
  bytes: number;
}

/** Each query waits for the one before it (the code can't ask until it has the answer), and costs latency + work. */
export function timeline(queries: readonly Query[], latencyMs: number): Timeline {
  let at = 0;
  const items = queries.map((query) => {
    const work = workMs(query);
    const t = { query, start: at, end: at + latencyMs + work, work };
    at = t.end;
    return t;
  });
  return { items, total: at, waiting: queries.length * latencyMs, bytes: queries.reduce((s, q) => s + q.bytes, 0) };
}

/** The frames' stops: every query for the first few, then evenly spaced, always ending on the last. */
export function stopsFor(count: number, maxStops = 14, singles = 6): number[] {
  if (count <= maxStops) return Array.from({ length: count }, (_, i) => i + 1);
  const stops = Array.from({ length: singles }, (_, i) => i + 1);
  const rest = maxStops - singles;
  for (let k = 1; k <= rest; k++) stops.push(singles + Math.round(((count - singles) * k) / rest));
  return stops;
}

export function pageComments(n: number): number {
  return FIXTURE.comments.filter((c) => c.post_id <= n).length;
}
