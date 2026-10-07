/**
 * T(n) = a·T(n/b) + f(n), T(1) = 1, for f(n) = n^p · (log₂ n)^q from a fixed menu.
 * The recursion tree is summed level by level at n = b^K (so every division is exact), and
 * the master theorem's case is decided by comparing p with log_b a, exactly.
 */

export type FId = 'one' | 'log' | 'sqrt' | 'n' | 'nlogn' | 'n2' | 'nOverLog';

export interface FSpec {
  label: string;
  /** 2p, an integer, so p = log_b a can be tested exactly as a² = b^(2p). */
  p2: number;
  q: number;
}

export const F: Record<FId, FSpec> = {
  one: { label: '1', p2: 0, q: 0 },
  log: { label: 'log n', p2: 0, q: 1 },
  sqrt: { label: '√n', p2: 1, q: 0 },
  n: { label: 'n', p2: 2, q: 0 },
  nlogn: { label: 'n log n', p2: 2, q: 1 },
  n2: { label: 'n²', p2: 4, q: 0 },
  nOverLog: { label: 'n / log n', p2: 2, q: -1 },
};
export const F_IDS: readonly FId[] = ['one', 'log', 'sqrt', 'n', 'nlogn', 'n2', 'nOverLog'];
export const A_VALUES = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export const B_VALUES = [2, 3, 4] as const;

const log2 = Math.log2;

/** f evaluated at a subproblem size s ≥ 2 (the tree never calls f on size 1). */
export function fAt(f: FId, s: number): number {
  const { p2, q } = F[f];
  return s ** (p2 / 2) * log2(s) ** q;
}

/** log_b a, the exponent of the leaves' total work n^(log_b a). */
export const critical = (a: number, b: number) => Math.log(a) / Math.log(b);

/** Θ(n^p · (log n)^q), or n^p · log log n for the gap preset. */
export interface Theta {
  p: number;
  q: number;
  loglog?: boolean;
}

export type Case =
  | { kind: 1; theta: Theta }
  | { kind: 2; theta: Theta; k: number }
  | { kind: 3; theta: Theta; regularity: { c: number; exact: boolean } }
  /** Equal exponents but f has a 1/log factor: between cases 1 and 2, outside the basic theorem. */
  | { kind: 'gap'; theta: Theta };

export function classify(a: number, b: number, f: FId): Case {
  const { p2, q } = F[f];
  const p = p2 / 2;
  const c = critical(a, b);
  const equal = a * a === b ** p2;
  if (equal) {
    if (q >= 0) return { kind: 2, theta: { p: c, q: q + 1 }, k: q };
    return { kind: 'gap', theta: { p: c, q: 0, loglog: true } };
  }
  if (p < c) return { kind: 1, theta: { p: c, q: 0 } };
  // Case 3: a·f(n/b) = (a / b^p) · n^p · log(n/b)^q. With q ≥ 0, log(n/b) < log n, so c = a / b^p
  // works for every n; with q < 0 the log ratio tends to 1, so any c above a / b^p works for large n.
  return { kind: 3, theta: { p, q }, regularity: { c: a / b ** p, exact: q >= 0 } };
}

export const thetaAt = (t: Theta, n: number) => n ** t.p * (t.loglog ? log2(log2(n)) : log2(n) ** t.q);

export interface Level {
  k: number;
  nodes: number;
  size: number;
  /** nodes × f(size), or nodes × T(1) on the leaf level. */
  total: number;
  leaf: boolean;
}

/** Every level of the recursion tree for n = b^K: levels 0 … K − 1 do f, level K is a^K leaves of T(1) = 1. */
export function treeLevels(a: number, b: number, f: FId, K: number): Level[] {
  const levels: Level[] = [];
  for (let k = 0; k < K; k++) {
    const nodes = a ** k;
    const size = b ** (K - k);
    levels.push({ k, nodes, size, total: nodes * fAt(f, size), leaf: false });
  }
  levels.push({ k: K, nodes: a ** K, size: 1, total: a ** K, leaf: true });
  return levels;
}

export const treeSum = (a: number, b: number, f: FId, K: number) => treeLevels(a, b, f, K).reduce((s, l) => s + l.total, 0);

/** The K that makes n = b^K close to 4096, so each b gets a comparable tree. */
export const DISPLAY_K: Record<number, number> = { 2: 12, 3: 8, 4: 6 };

export interface Preset {
  id: string;
  label: string;
  a: number;
  b: number;
  f: FId;
  /** What the recurrence describes. */
  what: string;
}

export const PRESETS: readonly Preset[] = [
  { id: 'binary', label: 'Binary search', a: 1, b: 2, f: 'one', what: 'one half searched, constant work to pick it' },
  { id: 'merge', label: 'Merge sort', a: 2, b: 2, f: 'n', what: 'two halves sorted, a linear merge' },
  { id: 'karatsuba', label: 'Karatsuba', a: 3, b: 2, f: 'n', what: 'three half-size multiplications, linear additions' },
  { id: 'strassen', label: 'Strassen', a: 7, b: 2, f: 'n2', what: 'seven half-size matrix products, n² additions' },
  { id: 'degenerate', label: 'Halve and scan', a: 1, b: 2, f: 'n', what: 'one half recursed on after a linear scan' },
  { id: 'gap', label: "Doesn't fit", a: 2, b: 2, f: 'nOverLog', what: 'two halves, n / log n work to combine' },
];
