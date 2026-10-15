export type SortValue = string | number;

/**
 * The rows ordered by what `value` reads from each, ascending or descending. The sort is stable
 * in both directions (rows that tie keep their input order, also when reversed). Numbers compare
 * numerically, text with `localeCompare`; a column should return one kind throughout.
 */
export function sortRows<R>(rows: readonly R[], value: (row: R) => SortValue, ascending: boolean): R[] {
  const sign = ascending ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: value(row) }))
    .sort((a, b) => {
      const c = typeof a.v === 'string' ? a.v.localeCompare(String(b.v)) : a.v - Number(b.v);
      return sign * c || a.i - b.i;
    })
    .map((e) => e.row);
}

export type SortDirection = 'ascending' | 'descending';

/** Where a column heading stands: its `aria-sort` value, or undefined when the table isn't sorted by it. */
export const sortDirection = (sort: { key: string; ascending: boolean } | null, key: string): SortDirection | undefined =>
  sort?.key !== key ? undefined : sort.ascending ? 'ascending' : 'descending';

/** What pressing a heading does: a new column sorts ascending, the same column again reverses. */
export const nextSort = <K extends string>(sort: { key: K; ascending: boolean } | null, key: K): { key: K; ascending: boolean } => ({
  key,
  ascending: sort?.key === key ? !sort.ascending : true,
});
