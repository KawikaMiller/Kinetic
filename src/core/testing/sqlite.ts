/**
 * Typed access to Node's built-in SQLite (`node:sqlite`) for tests that use it as an independent
 * oracle (query-planning, join-algorithms, normalization, relational-algebra, sql-aggregation-windows,
 * orm-n-plus-one). The app's tsconfig has no Node types, so the module is loaded at run time and given
 * just the shape the tests use. Test-only: never import this from app code.
 *
 * `Row` is the shape a test reads rows as (its own cell type); SQLite hands back plain objects.
 */

export interface SqliteStatement<Row> {
  all(...params: unknown[]): Row[];
  run(...params: unknown[]): unknown;
  /** Return each row as an array of values instead of an object. */
  setReturnArrays(on: boolean): void;
}

export interface SqliteDb<Row = Record<string, unknown>> {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement<Row>;
}

// A variable specifier keeps both TypeScript and Vite from resolving it at build time.
const SQLITE = 'node:sqlite';
const { DatabaseSync } = (await import(/* @vite-ignore */ SQLITE)) as { DatabaseSync: new (path: string) => SqliteDb<unknown> };

/** A fresh, empty in-memory database. */
export const openSqlite = <Row = Record<string, unknown>>(): SqliteDb<Row> => new DatabaseSync(':memory:') as SqliteDb<Row>;
