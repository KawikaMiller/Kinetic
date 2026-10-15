import { useState } from 'react';
import { nextSort, sortDirection, sortRows, type SortDirection, type SortValue } from '../core/sortRows';

/** What `<SortTh>` needs for one column: its `aria-sort` and what pressing it does. */
export interface SortHeaderProps {
  sort: SortDirection | undefined;
  onSort: () => void;
}

/** The column the table is sorted by and which way (`ascending: false` is descending). */
export interface SortState<K extends string> {
  key: K;
  ascending: boolean;
}

interface SortedRows<R, K extends string, S extends SortState<K> | null> {
  sorted: readonly R[];
  sort: S;
  /** Spread onto the `<SortTh>` of column `key`. */
  headerProps: (key: K) => SortHeaderProps;
}

/**
 * Table rows sorted by a column the learner picks (see `SortTh`). `columns` reads each column's
 * value from a row: a number sorts numerically, text with `localeCompare`; ties keep their
 * table order, in both directions. Pressing a column sorts it ascending, pressing it again
 * reverses it. With no `initial` the rows start in table order and `sort` is null until a
 * heading is pressed; with one, `sort` is never null.
 */
export function useSortedRows<R, K extends string>(
  rows: readonly R[],
  columns: Record<K, (row: R) => SortValue>,
  initial: { key: K; ascending?: boolean },
): SortedRows<R, K, SortState<K>>;
export function useSortedRows<R, K extends string>(rows: readonly R[], columns: Record<K, (row: R) => SortValue>): SortedRows<R, K, SortState<K> | null>;
export function useSortedRows<R, K extends string>(
  rows: readonly R[],
  columns: Record<K, (row: R) => SortValue>,
  initial?: { key: K; ascending?: boolean },
): SortedRows<R, K, SortState<K> | null> {
  const [sort, setSort] = useState<SortState<K> | null>(initial ? { key: initial.key, ascending: initial.ascending ?? true } : null);
  return {
    sorted: sort ? sortRows(rows, columns[sort.key], sort.ascending) : rows,
    sort,
    headerProps: (key) => ({ sort: sortDirection(sort, key), onSort: () => setSort(nextSort(sort, key)) }),
  };
}
