import type { SortValue } from '../../core/sortRows';
import type { FormatId } from './formats';

export type SortKey = 'format' | 'size' | 'sortable' | 'leaks' | 'coordination' | 'locality';

export interface TradeoffRow {
  id: FormatId;
  format: string;
  /** Bits in the ID. */
  size: number;
  /** IDs sort in the order they were made. */
  sortable: boolean;
  /** Anyone holding the ID can read when (or how many before it) it was made. */
  leaks: boolean;
  /** What has to be agreed between machines. */
  coordination: string;
  /** Rank for sorting: 0 nothing, 1 machine ids, 2 a central counter. */
  coordinationRank: number;
  /** New keys land on the rightmost index page ('appends') or anywhere ('scatters'). */
  locality: 'appends' | 'scatters';
}

export const TRADEOFFS: readonly TradeoffRow[] = [
  { id: 'autoincrement', format: 'Auto-increment', size: 64, sortable: true, leaks: true, coordination: 'One counter hands them out', coordinationRank: 2, locality: 'appends' },
  { id: 'uuidv4', format: 'UUIDv4', size: 128, sortable: false, leaks: false, coordination: 'None', coordinationRank: 0, locality: 'scatters' },
  { id: 'uuidv7', format: 'UUIDv7', size: 128, sortable: true, leaks: true, coordination: 'None (a clock)', coordinationRank: 0, locality: 'appends' },
  { id: 'ulid', format: 'ULID', size: 128, sortable: true, leaks: true, coordination: 'None (a clock)', coordinationRank: 0, locality: 'appends' },
  { id: 'snowflake', format: 'Snowflake-style', size: 64, sortable: true, leaks: true, coordination: 'Unique machine ids', coordinationRank: 1, locality: 'appends' },
];

/** What each column of the table sorts by (text columns by their text, the others by a rank). */
export const TRADEOFF_COLUMNS: Record<SortKey, (r: TradeoffRow) => SortValue> = {
  format: (r) => r.format,
  size: (r) => r.size,
  sortable: (r) => (r.sortable ? 1 : 0),
  leaks: (r) => (r.leaks ? 1 : 0),
  coordination: (r) => r.coordinationRank,
  locality: (r) => (r.locality === 'appends' ? 0 : 1),
};
