import type { ReactNode } from 'react';
import type { SortHeaderProps } from './useSortedRows';

/**
 * A sortable column heading for a `.data-table`: a `<button>` inside `<th scope="col" aria-sort>`,
 * so Enter and Space sort it and a screen reader hears the direction. The ▲ / ▼ shows on the
 * sorted column only. Spread `headerProps(key)` from `useSortedRows`.
 */
export function SortTh({ sort, onSort, children, className = '' }: SortHeaderProps & { children: ReactNode; className?: string }) {
  return (
    <th scope="col" aria-sort={sort} className={className}>
      <button type="button" className="sort-btn" onClick={onSort}>
        {children}
        {sort && <span aria-hidden="true">{sort === 'ascending' ? '▲' : '▼'}</span>}
      </button>
    </th>
  );
}
