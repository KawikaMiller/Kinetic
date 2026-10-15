/**
 * The diagonal table. Rows are programs P_0..P_{n-1}, columns are inputs, and each cell is what a
 * hypothetical decider CLAIMS about "does program i halt on input j": H (halts) or L (loops).
 * D's row does the opposite of the diagonal claim, so D differs from every row at that row's own
 * diagonal cell. This is the argument made finite and checkable for small tables; the general
 * theorem is the same argument over every program, which this page argues but does not run.
 */
import { mulberry32 } from '../../core/random';

export type Cell = 'H' | 'L';
export type Claims = Cell[][];

export const GRID_SIZE = 6;
export const flip = (c: Cell): Cell => (c === 'H' ? 'L' : 'H');

/** A seeded table of claims, `n` rows by `n` columns. */
export function randomClaims(n: number, seed: number): Claims {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => Array.from({ length: n }, (): Cell => (rnd() < 0.5 ? 'H' : 'L')));
}

/** D(j) for each input j in the table: the opposite of the diagonal claim about program j on input j. */
export const dRow = (claims: Claims, n: number = claims.length): Cell[] => Array.from({ length: n }, (_, j) => flip(claims[j][j]));

/** The first input where a row differs from D, or null when they agree on the first n inputs. */
export function firstDifference(row: readonly Cell[], d: readonly Cell[]): number | null {
  const at = d.findIndex((c, j) => row[j] !== c);
  return at === -1 ? null : at;
}

/** Rows that equal D on the first n inputs. */
export const rowsEqualToD = (claims: Claims, n: number = claims.length) => {
  const d = dRow(claims, n);
  return claims.slice(0, n).map((row, i) => (firstDifference(row.slice(0, n), d) === null ? i : -1)).filter((i) => i >= 0);
};

/**
 * D run on its own description: D asks about itself and does the opposite of the claim.
 * Whichever cell the decider fills in for (D, D), D's real behaviour on D is the other one.
 */
export const dOnItself = (claim: Cell): { dDoes: Cell; claimIsRight: boolean } => ({ dDoes: flip(claim), claimIsRight: flip(claim) === claim });

/** Every table of `n` x `n` claims, as bit patterns (for exhaustive tests of small n). */
export function* allClaims(n: number): Generator<Claims> {
  const bits = n * n;
  for (let mask = 0; mask < 2 ** bits; mask++) {
    yield Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j): Cell => ((mask >> (i * n + j)) & 1 ? 'H' : 'L')));
  }
}

export type Stage = 'table' | 'built' | 'self';
