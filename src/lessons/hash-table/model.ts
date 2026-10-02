/** The hash table's pure model: the toy hash, bucket placement and the resize rule. */

export type Table = string[][];
export type OpKind = 'insert' | 'lookup' | 'delete';

// Keep hashes to 16 bits so the numbers stay readable on screen.
export const MOD = 65536;
export const MULTIPLIER = 31;
export const MAX_BUCKETS = 16;
export const MAX_KEYS = 16;
/** Grow (double the buckets) once keys / buckets goes above this. */
export const THRESHOLD = 0.75;

/** Running hash after each character (good) or just the length (bad). */
export function hashSteps(key: string, bad: boolean): number[] {
  if (bad) return [key.length];
  let h = 0;
  return [...key].map((c) => (h = (h * MULTIPLIER + c.charCodeAt(0)) % MOD));
}

export const hashOf = (key: string, bad: boolean) => hashSteps(key, bad).at(-1)!;

/** Which bucket a key belongs in, for a table of `n` buckets. */
export const bucketOf = (key: string, n: number, bad: boolean) => hashOf(key, bad) % n;

/** Put every key in its bucket for a table of `n` buckets. */
export function build(keys: string[], n: number, bad: boolean): Table {
  const t: Table = Array.from({ length: n }, () => []);
  for (const k of keys) t[bucketOf(k, n, bad)].push(k);
  return t;
}

/** Keys ÷ buckets. */
export const loadFactor = (table: Table) => table.flat().length / table.length;

/** Does a table holding `keys` keys in `buckets` buckets need to double? */
export const needsGrow = (keys: number, buckets: number) => keys / buckets > THRESHOLD;
