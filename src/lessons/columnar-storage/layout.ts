/**
 * columnar-storage: the two page layouts and the queries run against them. The layouts are built by placing
 * fields into pages one at a time, so the page counts here are not formulas; the tests check them against
 * floor and ceil. One unit for every comparison: pages touched, and bytes touched = pages x page size.
 */
import { COLUMNS, FIELD_BYTES, TARGET_ID, newRowFor, type Cell, type Column, type Row, type Table } from './table';

export const PAGE_SIZES = [32, 64, 128] as const;
export type PageBytes = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_BYTES: PageBytes = 64;

/** A field in a page: which row's which column. A `null` slot is padding the page could not use. */
export interface Slot {
  row: number;
  col: Column;
}
export interface Page {
  /** Position of the page in the layout's page list. */
  index: number;
  /** The column this page belongs to, for a column store; null in a row store. */
  col: Column | null;
  slots: (Slot | null)[];
}
export interface Layout {
  kind: 'row' | 'column';
  pageBytes: number;
  pages: Page[];
}

export const slotsPerPage = (pageBytes: number): number => pageBytes / FIELD_BYTES;

/** Whole rows packed in order; a row never straddles two pages. */
export function rowStore(table: Table, pageBytes: number, cols: readonly Column[] = COLUMNS): Layout {
  const cap = slotsPerPage(pageBytes);
  const pages: Page[] = [];
  let slots: (Slot | null)[] = [];
  const close = () => {
    while (slots.length < cap) slots.push(null);
    pages.push({ index: pages.length, col: null, slots });
    slots = [];
  };
  table.forEach((_, row) => {
    if (slots.length + cols.length > cap) close();
    for (const col of cols) slots.push({ row, col });
  });
  if (slots.length > 0) close();
  return { kind: 'row', pageBytes, pages };
}

/** One column at a time, values in row order, each column starting on its own page. */
export function columnStore(table: Table, pageBytes: number, cols: readonly Column[] = COLUMNS): Layout {
  const cap = slotsPerPage(pageBytes);
  const pages: Page[] = [];
  for (const col of cols) {
    for (let from = 0; from < table.length; from += cap) {
      const slots: (Slot | null)[] = Array.from({ length: cap }, (_, k) => (from + k < table.length ? { row: from + k, col } : null));
      pages.push({ index: pages.length, col, slots });
    }
  }
  return { kind: 'column', pageBytes, pages };
}

export type QueryId = 'sum-price' | 'avg-qty-nl' | 'point' | 'insert' | 'update';
export interface Query {
  id: QueryId;
  label: string;
  sql: string;
  /** A write puts values into pages; a read takes them out. */
  writes: boolean;
}
export const QUERIES: Query[] = [
  { id: 'sum-price', label: 'SUM(price)', sql: 'SELECT SUM(price) FROM t', writes: false },
  { id: 'avg-qty-nl', label: 'AVG(qty) for NL', sql: "SELECT AVG(qty) FROM t WHERE country = 'NL'", writes: false },
  { id: 'point', label: 'One whole row (id 7)', sql: `SELECT * FROM t WHERE id = ${TARGET_ID}`, writes: false },
  { id: 'insert', label: 'INSERT one row', sql: 'INSERT INTO t VALUES (…)', writes: true },
  { id: 'update', label: 'UPDATE one price', sql: `UPDATE t SET price = … WHERE id = ${TARGET_ID}`, writes: true },
];
export const queryOf = (id: QueryId): Query => QUERIES.find((q) => q.id === id)!;

export const cellKey = (row: number, col: Column) => `${row}:${col}`;

/** The table a query runs on: an INSERT runs on the table with its new row appended. */
export const tableFor = (q: QueryId, table: Table): Table => (q === 'insert' ? [...table, newRowFor(table)] : table);

/** The fields a query needs, as `row:col` keys. A page is touched when it holds at least one of them. */
export function neededFields(q: QueryId, table: Table): Set<string> {
  const t = tableFor(q, table);
  const need = new Set<string>();
  const target = t.findIndex((r) => r.id === TARGET_ID);
  switch (q) {
    case 'sum-price':
      t.forEach((_, i) => need.add(cellKey(i, 'price')));
      break;
    case 'avg-qty-nl':
      t.forEach((r, i) => {
        need.add(cellKey(i, 'country'));
        if (r.country === 'NL') need.add(cellKey(i, 'qty'));
      });
      break;
    case 'point':
      for (const col of COLUMNS) need.add(cellKey(target, col));
      break;
    case 'insert':
      for (const col of COLUMNS) need.add(cellKey(t.length - 1, col));
      break;
    case 'update':
      need.add(cellKey(target, 'price'));
      break;
  }
  return need;
}

/** Pages of a layout that hold any needed field. */
export function touchedPages(layout: Layout, need: ReadonlySet<string>): number[] {
  return layout.pages.filter((p) => p.slots.some((s) => s !== null && need.has(cellKey(s.row, s.col)))).map((p) => p.index);
}

export const bytesTouched = (layout: Layout, pages: readonly number[]): number => pages.length * layout.pageBytes;

export interface Side {
  layout: Layout;
  pages: number[];
  bytes: number;
}
export interface Comparison {
  table: Table;
  row: Side;
  column: Side;
  cheaper: 'row' | 'column' | 'tie';
  /** The dearer side's bytes over the cheaper's (1 on a tie). */
  ratio: number;
}

/** Both layouts, the pages each must touch for the query, and which is cheaper: one function for both sides. */
export function compare(q: QueryId, table: Table, pageBytes: number): Comparison {
  const t = tableFor(q, table);
  const need = neededFields(q, table);
  const side = (layout: Layout): Side => {
    const pages = touchedPages(layout, need);
    return { layout, pages, bytes: bytesTouched(layout, pages) };
  };
  const row = side(rowStore(t, pageBytes));
  const column = side(columnStore(t, pageBytes));
  const cheaper = row.bytes === column.bytes ? 'tie' : row.bytes < column.bytes ? 'row' : 'column';
  return { table: t, row, column, cheaper, ratio: Math.max(row.bytes, column.bytes) / Math.min(row.bytes, column.bytes) };
}

/** What a read returns, computed only from the values on the pages it touched. Writes return null. */
export function answerFrom(layout: Layout, pages: readonly number[], q: QueryId, table: Table): Cell[] | number | null {
  const t = tableFor(q, table);
  const seen = new Map<string, Cell>();
  for (const i of pages) {
    for (const s of layout.pages[i].slots) if (s) seen.set(cellKey(s.row, s.col), t[s.row][s.col]);
  }
  const at = (row: number, col: Column) => seen.get(cellKey(row, col));
  switch (q) {
    case 'sum-price':
      return t.reduce((sum, _, i) => sum + (at(i, 'price') as number), 0);
    case 'avg-qty-nl': {
      const nl = t.map((_, i) => i).filter((i) => at(i, 'country') === 'NL');
      return nl.length === 0 ? null : nl.reduce((s, i) => s + (at(i, 'qty') as number), 0) / nl.length;
    }
    case 'point': {
      const i = t.findIndex((r: Row) => r.id === TARGET_ID);
      return COLUMNS.map((c) => at(i, c) as Cell);
    }
    default:
      return null;
  }
}

export const slotText = (table: Table, s: Slot | null): string => (s === null ? '' : String(table[s.row][s.col]));
