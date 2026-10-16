/** columnar-storage: function calls to sum a column, one per row or one per batch. Counts only: no timings anywhere. */

export const BATCH_VALUES = 1024;
export const N_MIN = 1;
export const N_MAX = 1_000_000_000;
export const DEFAULT_N = 1_000_000;

export const callsPerRow = (n: number): number => n;
export const callsPerBatch = (n: number): number => Math.ceil(n / BATCH_VALUES);

/** The sizes of the batches a column of n values is cut into: full batches, then the remainder. */
export function batchSizes(n: number): number[] {
  const full = Math.floor(n / BATCH_VALUES);
  const rest = n - full * BATCH_VALUES;
  return [...Array<number>(full).fill(BATCH_VALUES), ...(rest > 0 ? [rest] : [])];
}
