// Offset vs keyset (cursor) pagination over a simulated table sorted by
// created_at DESC, id DESC. Pure: model.test.ts checks duplicates, gaps, the
// tie-breaker bug, cursor round-trips and the scan counts. The scan counts model a
// B-tree index seek, not a real database.
import { b64url, enc } from '../../core/crypto';

export interface Row {
  id: number;
  /** created_at, as minutes after 09:00 (simulated). */
  ts: number;
}

export const LIMIT = 5;
/** Each query fetches one row more than the page: if it comes back, has_more is true. */
export const FETCH = LIMIT + 1;

/** created_at DESC, id DESC: negative when a comes first. */
export const byFeed = (a: Row, b: Row) => b.ts - a.ts || b.id - a.id;
/** created_at DESC only: ties are left in whatever order the table holds them. */
const byTsOnly = (a: Row, b: Row) => b.ts - a.ts;

export const clockOf = (ts: number) => {
  const m = 9 * 60 + ts;
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

// ── Cursors ─────────────────────────────────────────────────────────────

export interface Cursor {
  ts: number;
  id: number;
}

/** An opaque cursor: base64url of the last row's sort key. Clients pass it back unchanged. */
export const encodeCursor = (c: Cursor) => b64url(enc.encode(JSON.stringify({ ts: c.ts, id: c.id })));

/** The inverse, or null for anything that isn't one of ours. (core/crypto has no base64url decoder yet.) */
export function decodeCursor(s: string): Cursor | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
    const v: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))));
    if (typeof v !== 'object' || v === null) return null;
    const { ts, id } = v as Record<string, unknown>;
    return Number.isInteger(ts) && Number.isInteger(id) ? { ts: ts as number, id: id as number } : null;
  } catch {
    return null;
  }
}

// ── The two queries ─────────────────────────────────────────────────────

export interface PageResult {
  rows: Row[];
  hasMore: boolean;
  /** Index entries the database walks to answer: skipped ones included. */
  scanned: number;
}

/** SELECT … ORDER BY created_at DESC, id DESC LIMIT 6 OFFSET :offset. It walks past every skipped row. */
export function offsetPage(table: readonly Row[], offset: number, limit = LIMIT): PageResult {
  const sorted = [...table].sort(byFeed);
  const got = sorted.slice(offset, offset + limit + 1);
  return { rows: got.slice(0, limit), hasMore: got.length > limit, scanned: Math.min(sorted.length, offset + limit + 1) };
}

/** True when b sorts strictly after the cursor: (ts, id) < (c.ts, c.id), or ts < c.ts without the tie-breaker. */
export const afterCursor = (r: Row, c: Cursor, tieBreak: boolean) => (tieBreak ? r.ts < c.ts || (r.ts === c.ts && r.id < c.id) : r.ts < c.ts);

/**
 * WHERE (created_at, id) < (:ts, :id) ORDER BY created_at DESC, id DESC LIMIT 6: a seek in
 * the index, then 6 entries read. Without the tie-breaker, WHERE created_at < :ts and
 * ORDER BY created_at DESC.
 */
export function keysetPage(table: readonly Row[], after: Cursor | null, limit = LIMIT, tieBreak = true): PageResult {
  const sorted = [...table].sort(tieBreak ? byFeed : byTsOnly);
  const got = (after ? sorted.filter((r) => afterCursor(r, after, tieBreak)) : sorted).slice(0, limit + 1);
  return { rows: got.slice(0, limit), hasMore: got.length > limit, scanned: got.length };
}

/** Rows read for page p (1-based) of a big table: offset walks (p-1)·limit + limit + 1; keyset reads limit + 1 after the seek. */
export const offsetCost = (page: number, limit = LIMIT) => (page - 1) * limit + limit + 1;
export const keysetCost = (_page: number, limit = LIMIT) => limit + 1;

// ── Paging sessions under writes ────────────────────────────────────────

export type Mode = 'offset' | 'cursor';

export interface Session {
  mode: Mode;
  /** Ids returned, page by page. */
  pages: number[][];
  offset: number;
  cursor: Cursor | null;
  hasMore: boolean;
  /** Rows read by the last query. */
  scanned: number;
}

export interface World {
  table: Row[];
  /** Ids present when paging started: anything else was inserted while paging. */
  initial: number[];
  nextId: number;
  offset: Session;
  cursor: Session;
  tieBreak: boolean;
}

const emptySession = (mode: Mode): Session => ({ mode, pages: [], offset: 0, cursor: null, hasMore: true, scanned: 0 });

/** A table of n rows, one minute apart (ids 1..n, oldest first), or with the given timestamps. */
export function makeTable(n: number, tsOf: (id: number) => number = (id) => id): Row[] {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, ts: tsOf(i + 1) }));
}

export function createWorld(table: Row[], tieBreak = true): World {
  return { table, initial: table.map((r) => r.id), nextId: Math.max(0, ...table.map((r) => r.id)) + 1, offset: emptySession('offset'), cursor: emptySession('cursor'), tieBreak };
}

function fetchNext(table: readonly Row[], s: Session, tieBreak: boolean): Session {
  if (!s.hasMore) return s;
  const r = s.mode === 'offset' ? offsetPage(table, s.offset) : keysetPage(table, s.cursor, LIMIT, tieBreak);
  const last = r.rows[r.rows.length - 1];
  return {
    ...s,
    pages: [...s.pages, r.rows.map((x) => x.id)],
    offset: s.offset + LIMIT,
    cursor: last ? { ts: last.ts, id: last.id } : s.cursor,
    hasMore: r.hasMore,
    scanned: r.scanned,
  };
}

/** Both sessions load their next page from the same table. */
export const nextPage = (w: World): World => ({ ...w, offset: fetchNext(w.table, w.offset, true), cursor: fetchNext(w.table, w.cursor, w.tieBreak) });

/** k new rows at the top of the feed (newer than everything). */
export function insertAtHead(w: World, k: number): World {
  const top = Math.max(0, ...w.table.map((r) => r.ts));
  const rows = Array.from({ length: k }, (_, i) => ({ id: w.nextId + i, ts: top + 1 + i }));
  return { ...w, table: [...w.table, ...rows], nextId: w.nextId + k };
}

/** Delete the newest row in the feed. */
export function deleteNewest(w: World): World {
  const newest = [...w.table].sort(byFeed)[0];
  return newest ? { ...w, table: w.table.filter((r) => r.id !== newest.id) } : w;
}

export const MAX_ROWS = 25;

export type Mark = 'current' | 'duplicate' | 'seen' | 'gap' | 'new' | 'unread';

export interface Analysis {
  marks: Map<number, Mark>;
  /** Ids returned more than once, over the whole session. */
  duplicates: number[];
  /** Ids still in the table that the session skipped past without returning. */
  gaps: number[];
}

/**
 * Marks every row of the current table for one session. A row is a gap when it was there
 * when paging started, was never returned, and sorts before (newer than) the last row the
 * session returned: paging went past it. Rows inserted while paging are new, not gaps.
 */
export function analyse(w: World, s: Session): Analysis {
  const seenCount = new Map<number, number>();
  for (const id of s.pages.flat()) seenCount.set(id, (seenCount.get(id) ?? 0) + 1);
  const current = s.pages[s.pages.length - 1] ?? [];
  const earlier = new Set(s.pages.slice(0, -1).flat());
  const initial = new Set(w.initial);
  const sorted = [...w.table].sort(byFeed);
  const frontierId = current[current.length - 1];
  const frontierAt = frontierId === undefined ? -1 : sorted.findIndex((r) => r.id === frontierId);
  const marks = new Map<number, Mark>();
  const gaps: number[] = [];
  sorted.forEach((r, i) => {
    let m: Mark;
    if (current.includes(r.id)) m = earlier.has(r.id) ? 'duplicate' : 'current';
    else if (seenCount.has(r.id)) m = 'seen';
    else if (!initial.has(r.id)) m = 'new';
    else if (frontierAt >= 0 && i < frontierAt) { m = 'gap'; gaps.push(r.id); }
    else m = 'unread';
    marks.set(r.id, m);
  });
  const duplicates = [...seenCount].filter(([, n]) => n > 1).map(([id]) => id);
  return { marks, duplicates, gaps };
}

/** The ids the last page repeated from earlier pages. */
export function repeatedOnLastPage(s: Session): number[] {
  const current = s.pages[s.pages.length - 1] ?? [];
  const earlier = new Set(s.pages.slice(0, -1).flat());
  return current.filter((id) => earlier.has(id));
}

/** The JSON a cursor API sends back with a page. */
export function cursorResponse(table: readonly Row[], s: Session): string[] {
  const ids = s.pages[s.pages.length - 1] ?? [];
  const byId = new Map(table.map((r) => [r.id, r]));
  const next = s.hasMore && s.cursor ? `"${encodeCursor(s.cursor)}"` : 'null';
  return [
    '{',
    `  "data": [${ids.map((id) => (byId.has(id) ? `{ "id": ${id}, … }` : `{ "id": ${id} }`)).slice(0, 2).join(', ')}${ids.length > 2 ? ', …' : ''}],`,
    `  "next_cursor": ${next},`,
    `  "has_more": ${s.hasMore}`,
    '}',
  ];
}

// ── The tie-breaker table ───────────────────────────────────────────────

/** Ids 1..12 with three rows sharing 09:05 across the first page boundary (ids 8, 7, 6). */
export const TIE_TS: Record<number, number> = { 12: 9, 11: 8, 10: 7, 9: 6, 8: 5, 7: 5, 6: 5, 5: 4, 4: 3, 3: 2, 2: 1, 1: 1 };
export const tieTable = () => makeTable(12, (id) => TIE_TS[id]);

/** Pages a whole table with the cursor; every id returned, in order. */
export function pageAll(table: readonly Row[], tieBreak: boolean): number[][] {
  const pages: number[][] = [];
  let after: Cursor | null = null;
  for (let guard = 0; guard < table.length + 1; guard++) {
    const r = keysetPage(table, after, LIMIT, tieBreak);
    if (!r.rows.length) break;
    pages.push(r.rows.map((x) => x.id));
    const last = r.rows[r.rows.length - 1];
    after = { ts: last.ts, id: last.id };
    if (!r.hasMore) break;
  }
  return pages;
}

/** The depth stops on the cost slider. */
export const DEPTHS = [1, 10, 100, 1000, 10000] as const;

// ── What the offset session's next page would do ────────────────────────

export interface Preview {
  /** Ids the next OFFSET page would return. */
  rows: number[];
  /** Of those, ids the session already showed. */
  repeated: number[];
  /** Rows sorting after the last row shown but before the page's first row: jumped over. */
  skipped: number[];
}

/** Looks ahead at the offset session's next page on the table as it is now, without loading it. */
export function previewOffset(w: World): Preview {
  const s = w.offset;
  const rows = offsetPage(w.table, s.offset).rows;
  const seen = new Set(s.pages.flat());
  const sorted = [...w.table].sort(byFeed);
  const frontier = s.cursor;
  const afterFrontier = frontier ? sorted.filter((r) => afterCursor(r, frontier, true)) : sorted;
  const first = rows[0];
  return {
    rows: rows.map((r) => r.id),
    repeated: rows.filter((r) => seen.has(r.id)).map((r) => r.id),
    skipped: (first ? afterFrontier.filter((r) => byFeed(r, first) < 0) : afterFrontier).map((r) => r.id),
  };
}
