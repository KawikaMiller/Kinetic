import { parseBoundedInt, type FieldParse } from '../../core/parse';
import { mulberry32, shuffle } from '../../core/random';
import type { Row, Tables } from './join';

/** How the keys of the two tables relate. */
export type Shape = 'default' | 'manyToMany' | 'nulls';

export const SIZE_RANGE = { min: 4, max: 16 } as const;
export const DEFAULT_SIZES = { a: 8, b: 12 } as const;
export const TABLE_SEED = 5;
/** Orders may name customers that do not exist (and customers may have no orders): keys reach this far past the customer count. */
const UNMATCHED_KEYS = 2;
/** Many-to-many: both tables draw from this few keys, so duplicates appear on both sides. */
const DUPLICATE_KEYS = 4;
/** NULL keys: every row whose id is a multiple of this has none. */
const NULL_EVERY = 4;
/** The customer the "one customer" filter keeps. */
export const FILTER_ID = 3;
export const KEY_RANGE = { min: -99, max: 99 } as const;

export interface TableSpec {
  shape: Shape;
  sizeA: number;
  sizeB: number;
  /** Keep only customer FILTER_ID before joining: a tiny outer table. */
  oneCustomer: boolean;
}

export const DEFAULT_SPEC: TableSpec = { shape: 'default', sizeA: DEFAULT_SIZES.a, sizeB: DEFAULT_SIZES.b, oneCustomer: false };

const clampSize = (n: number): number => Math.min(SIZE_RANGE.max, Math.max(SIZE_RANGE.min, Math.round(n)));

/** Customers and orders for a spec, seeded: the same spec always gives the same rows. */
export function makeTables(spec: TableSpec): Tables {
  const sizeA = clampSize(spec.sizeA);
  const sizeB = clampSize(spec.sizeB);
  const rnd = mulberry32(TABLE_SEED);
  const drawKeys = (n: number, pool: number): number[] => Array.from({ length: n }, () => 1 + Math.floor(rnd() * pool));
  const aKeys = spec.shape === 'manyToMany' ? drawKeys(sizeA, DUPLICATE_KEYS) : shuffle(Array.from({ length: sizeA }, (_, i) => i + 1), rnd);
  const bKeys = spec.shape === 'manyToMany' ? drawKeys(sizeB, DUPLICATE_KEYS) : drawKeys(sizeB, sizeA + UNMATCHED_KEYS);
  const rows = (keys: number[]): Row[] => keys.map((key, i) => ({ id: i + 1, key: spec.shape === 'nulls' && (i + 1) % NULL_EVERY === 0 ? null : key }));
  const a = rows(aKeys);
  return { a: spec.oneCustomer ? a.filter((r) => r.id === FILTER_ID) : a, b: rows(bKeys) };
}

/** Keys the learner has typed over the generated ones, by row id. */
export type Edits = { a: Readonly<Record<number, number | null>>; b: Readonly<Record<number, number | null>> };
export const NO_EDITS: Edits = { a: {}, b: {} };

export function withEdits(t: Tables, edits: Edits): Tables {
  const apply = (rows: readonly Row[], e: Readonly<Record<number, number | null>>): Row[] => rows.map((r) => (r.id in e ? { ...r, key: e[r.id] } : r));
  return { a: apply(t.a, edits.a), b: apply(t.b, edits.b) };
}

const NULL_WORD = /^null$/i;

/** A key typed into a cell: a whole number, or NULL. Anything else is refused with the reason. */
export function parseKey(text: string): FieldParse<number | null> {
  if (NULL_WORD.test(text.trim())) return { ok: true, value: null };
  return parseBoundedInt(text, {
    ...KEY_RANGE,
    messages: {
      empty: 'Type a whole number, or NULL for no key.',
      invalid: (typed) => `"${typed}" is not a key: use a whole number, or NULL.`,
      tooSmall: () => `Keys start at ${KEY_RANGE.min}.`,
      tooBig: () => `Keys go up to ${KEY_RANGE.max}.`,
    },
  });
}

export const keyText = (key: number | null): string => (key === null ? 'NULL' : String(key));
