import { applyAll, newDb, txOf, type Db, type Op } from './engine';

/** Updates to the one row of the "why UPDATE copies" scene. */
export const CHAIN_UPDATES = { min: 0, max: 4, initial: 2 } as const;
const FIRST_VALUE = 40;
const VALUE_STEP = 10;

/**
 * One row, `updates` autocommit UPDATEs of it, and (when `readerAfter` is set) a reader that begins right after that many
 * updates and keeps its snapshot. Run through the real engine, so the chain is whatever the visibility rules make it.
 */
export function chainDb(updates: number, readerAfter: number | null): Db {
  const update = (i: number): Op => ({ kind: 'update', who: 'auto', key: 'A', value: FIRST_VALUE + VALUE_STEP * i });
  const ops: Op[] = [];
  for (let i = 0; i <= updates; i++) {
    if (readerAfter === i) ops.push({ kind: 'begin' }, { kind: 'select', who: 1 });
    if (i < updates) ops.push(update(i));
  }
  return applyAll(newDb('transaction'), ops).db;
}

/** The versions of row A, oldest first: the chain. */
export const chainOf = (db: Db) => db.versions.filter((v) => v.key === 'A');

/** True when the reader of `chainDb(_, k)` holds a snapshot. */
export const hasReader = (db: Db): boolean => txOf(db, 1) !== undefined;
