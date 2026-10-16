/** Modulo bias: drawing 0 to n-1 from a random byte with `byte % n`, counted over all 256 byte values. */

export const BYTE_VALUES = 256;
export const RANGE = { min: 2, max: 20 } as const;
export const DEFAULT_RANGE = 6;

/** How many of the 256 byte values give each outcome of `byte % n`. */
export function moduloCounts(n: number): number[] {
  const counts = new Array<number>(n).fill(0);
  for (let b = 0; b < BYTE_VALUES; b++) counts[b % n] += 1;
  return counts;
}

/** The first byte value that is discarded: bytes at or above it would favour the low outcomes. */
export const rejectionLimit = (n: number): number => BYTE_VALUES - (BYTE_VALUES % n);

/** How many byte values give each outcome once bytes at or above the limit are discarded and drawn again. */
export function rejectionCounts(n: number): number[] {
  const counts = new Array<number>(n).fill(0);
  const limit = rejectionLimit(n);
  for (let b = 0; b < limit; b++) counts[b % n] += 1;
  return counts;
}

/** The outcomes that come up more often than the rest. */
export function favoured(counts: readonly number[]): number[] {
  const top = Math.max(...counts);
  const bottom = Math.min(...counts);
  return top === bottom ? [] : counts.flatMap((c, i) => (c === top ? [i] : []));
}

/** The biased draw has no bias exactly when n divides 256. */
export const isUnbiased = (n: number): boolean => BYTE_VALUES % n === 0;
