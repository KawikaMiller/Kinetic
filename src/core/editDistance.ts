/**
 * Levenshtein edit distance with weighted operations: the DP table with every cell's three
 * candidates (insert, delete, substitute or match) and the winner kept. Pure; the tracebacks and
 * edit scripts a lesson draws are built on top of `Table`.
 */

export interface Costs {
  ins: number;
  del: number;
  sub: number;
}
export const LEVENSHTEIN: Costs = { ins: 1, del: 1, sub: 1 };
/** Substitution priced as a delete plus an insert: the distance LCS-based diff minimises. */
export const INDEL: Costs = { ins: 1, del: 1, sub: 2 };

export type Source = 'diag' | 'up' | 'left';

export interface Candidates {
  /** D[i][j−1] + insert b[j−1]. */
  left: number;
  /** D[i−1][j] + delete a[i−1]. */
  up: number;
  /** D[i−1][j−1] + 0 for a match, or + substitute. */
  diag: number;
  match: boolean;
  /** The candidate kept; see pick() for ties. */
  win: Source;
}

export interface Table {
  a: string[];
  b: string[];
  d: number[][];
  /** cands[i][j] for i, j ≥ 1. */
  cands: (Candidates | null)[][];
}

/**
 * The cheapest candidate. Ties go to a match first; then, when a substitution costs at least a
 * delete plus an insert, to the delete or insert (so that distance's script is inserts and
 * deletes only); otherwise to the substitution; then delete before insert.
 */
export function pick(c: Omit<Candidates, 'win'>, preferIndel = false): Source {
  const best = Math.min(c.diag, c.up, c.left);
  if (c.diag === best && (c.match || !preferIndel)) return 'diag';
  if (c.up === best) return 'up';
  if (c.left === best) return 'left';
  return 'diag';
}

export function editTable(a: string, b: string, costs: Costs = LEVENSHTEIN): Table {
  const A = [...a];
  const B = [...b];
  const d = Array.from({ length: A.length + 1 }, () => new Array<number>(B.length + 1).fill(0));
  const cands: (Candidates | null)[][] = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(null));
  const preferIndel = costs.sub >= costs.ins + costs.del;
  for (let i = 1; i <= A.length; i++) d[i][0] = d[i - 1][0] + costs.del;
  for (let j = 1; j <= B.length; j++) d[0][j] = d[0][j - 1] + costs.ins;
  for (let i = 1; i <= A.length; i++) {
    for (let j = 1; j <= B.length; j++) {
      const match = A[i - 1] === B[j - 1];
      const c = { left: d[i][j - 1] + costs.ins, up: d[i - 1][j] + costs.del, diag: d[i - 1][j - 1] + (match ? 0 : costs.sub), match };
      const win = pick(c, preferIndel);
      cands[i][j] = { ...c, win };
      d[i][j] = c[win];
    }
  }
  return { a: A, b: B, d, cands };
}
