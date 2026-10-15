import type { Op } from './model';

/** The array every scene draws from: the first n cells of it. */
export const BASE_VALUES = [5, 3, 8, 1, 9, 2, 7, 4, 6, 0, -3, 5, 2, 8, 1, 4];
export const SIZES = [8, 13, 16] as const;
export const DEFAULT_SIZE = 8;
export const valuesFor = (n: number): number[] => BASE_VALUES.slice(0, n);

/** Scene 2 opens on the range the spec works through: [1, 6] on 8 cells. */
export const QUERY_DEFAULT = { l: 1, r: 6 };
/** Scene 3 opens on adding 5 to [2, 5]. */
export const ADD_DEFAULT = { l: 2, r: 5, v: 5 };
export const DEFAULT_OP: Op = 'sum';

/** Scene 1's sizes (counts only past 8) and the opening update share. */
export const COST_SIZES = [8, 64, 1024] as const;
export const DEFAULT_COST_SIZE = 8;
export const DEFAULT_UPDATE_PCT = 50;
export const WORKLOAD_SEED = 6;
/** Scene 1's opening update: cell 2 becomes 6. */
export const COST_EDIT_DEFAULT = { index: 2, value: 6 };

/** Scene 4's array has 16 cells, numbered from 1. */
export const FENWICK_N = 16;
export const FENWICK_DEFAULT = { query: 13, updateAt: 5, rangeL: 3, rangeR: 11 };

/** The size the chooser reports numbers stored for. */
export const CHOOSER_N = 1024;

/** Scene 4's cells (non-negative, so sum and xor both make sense). */
export const FENWICK_VALUES = [5, 3, 8, 1, 9, 2, 7, 4, 6, 0, 3, 5, 2, 8, 1, 4];

/** Scene 1's workload starts from the base array repeated to n cells. */
export const costStartValues = (n: number): number[] => Array.from({ length: n }, (_, i) => BASE_VALUES[i % BASE_VALUES.length]);
