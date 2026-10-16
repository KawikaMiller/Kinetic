/** columnar-storage: the 16-row table every scene uses, and the seeded tables the tests use. Every field is a fixed 4 bytes. */
import { mulberry32, pick, randInt, type Rnd } from '../../core/random';

export const COLUMNS = ['id', 'country', 'product', 'qty', 'price'] as const;
export type Column = (typeof COLUMNS)[number];
export type Cell = number | string;

export interface Row {
  id: number;
  country: string;
  product: string;
  qty: number;
  price: number;
}
export type Table = readonly Row[];

/** Every field of this lesson is this many bytes (a number or a short text padded to 4), so the arithmetic is exact. */
export const FIELD_BYTES = 4;
export const ROW_BYTES = COLUMNS.length * FIELD_BYTES;
export const ROW_COUNT = 16;
/** A learner-edited cell takes a whole number from 0 up to this. */
export const CELL_MAX = 9999;
export const NUMERIC_COLUMNS: readonly Column[] = ['id', 'qty', 'price'];
export const isNumeric = (c: Column): boolean => NUMERIC_COLUMNS.includes(c);

const COUNTRIES = ['NL', 'DE', 'FR', 'US'] as const;
const PRODUCTS = ['pen', 'cup', 'bag', 'hat', 'mug'] as const;

const COUNTRY_ORDER = ['NL', 'NL', 'DE', 'NL', 'FR', 'US', 'US', 'NL', 'DE', 'FR', 'NL', 'US', 'DE', 'NL', 'FR', 'DE'];
const PRODUCT_ORDER = ['pen', 'cup', 'pen', 'bag', 'hat', 'cup', 'mug', 'pen', 'bag', 'hat', 'pen', 'mug', 'cup', 'bag', 'pen', 'hat'];
/** Four rows per group: every group holds a quantity above 8 in this order, and sorting by quantity separates them. */
const QTY_ORDER = [9, 3, 5, 1, 10, 2, 6, 8, 12, 4, 7, 3, 11, 5, 8, 1];
const PRICE_ORDER = [12, 45, 30, 8, 99, 23, 15, 60, 42, 17, 75, 33, 9, 52, 28, 66];

export const DEFAULT_TABLE: Table = Array.from({ length: ROW_COUNT }, (_, i) => ({
  id: i + 1,
  country: COUNTRY_ORDER[i],
  product: PRODUCT_ORDER[i],
  qty: QTY_ORDER[i],
  price: PRICE_ORDER[i],
}));

/** The row the INSERT query adds (an id one past the table's last). */
export const newRowFor = (table: Table): Row => ({ id: table.length + 1, country: 'NL', product: 'pen', qty: 5, price: 20 });

/** The row the point lookup and the UPDATE touch: id 7, which sits at position 6. */
export const TARGET_ID = 7;

/** A seeded table of `n` rows (ids 1..n) with the same kinds of values, for the correctness tests. */
export function randomTable(seed: number, n = ROW_COUNT): Table {
  const rnd: Rnd = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    country: pick(COUNTRIES, rnd),
    product: pick(PRODUCTS, rnd),
    qty: randInt(0, 12, rnd),
    price: randInt(0, CELL_MAX, rnd),
  }));
}

export type SortKey = 'none' | 'country' | 'price' | 'qty';
export const SORT_KEYS: { value: SortKey; label: string }[] = [
  { value: 'none', label: 'Unsorted' },
  { value: 'country', label: 'By country' },
  { value: 'price', label: 'By price' },
  { value: 'qty', label: 'By qty' },
];

/** The rows ordered by a key (stable: equal keys keep their insert order). */
export function sortRows(table: Table, key: SortKey): Row[] {
  const rows = [...table];
  if (key === 'none') return rows;
  return rows.sort((a, b) => (key === 'country' ? a.country.localeCompare(b.country) : a[key] - b[key]));
}

/** One column's values, top to bottom. */
export const columnOf = (table: Table, col: Column): Cell[] => table.map((r) => r[col]);

/** Replace one numeric cell; the table keeps its length. */
export function withCell(table: Table, row: number, col: 'qty' | 'price', value: number): Table {
  return table.map((r, i) => (i === row ? { ...r, [col]: value } : r));
}
