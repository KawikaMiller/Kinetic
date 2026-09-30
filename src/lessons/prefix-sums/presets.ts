import type { RangeUpdate } from './model';

export const RANGE_PRESET = [3, 1, 4, 1, 5, 9, 2, 6];
export const DIFF_BASE = [2, 2, 2, 2, 2, 2, 2, 2, 2];
export const DIFF_UPDATES: RangeUpdate[] = [
  { from: 2, to: 6, add: 5 },
  { from: 0, to: 7, add: 2 },
  { from: 3, to: 8, add: -3 },
];
/** Three short updates: shows that on tiny inputs the difference array doesn't win. */
export const DIFF_UPDATES_SHORT: RangeUpdate[] = [
  { from: 1, to: 2, add: 4 },
  { from: 5, to: 5, add: -2 },
  { from: 7, to: 8, add: 3 },
];

/** How many queries the cost comparison assumes. */
export const QUERIES = 1000;
export const RANDOM_LENGTH = 8;
export const MAX_VALUE = 9;
