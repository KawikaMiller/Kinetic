import type { Bug } from './search';

/** The search scene's sorted array (distinct values) and targets that aren't in it. */
export const SEARCH_ARRAY: readonly number[] = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];
export const ABSENT_TARGETS: readonly number[] = [1, 40, 99];

export const BUG_LABELS: Record<Bug, string> = {
  none: 'No bug',
  'lo-mid': 'lo = mid',
  lt: 'while (lo < hi)',
  'hi-n': 'hi = a.length',
};
