/**
 * A Fenwick (binary indexed) tree over cells 1..n. Cell i holds the combined value of the range
 * (i - lowbit(i), i], where lowbit(i) = i & -i. A prefix query hops down by clearing the lowest set
 * bit; an update hops up by adding it. Range queries subtract two prefixes, which only works for an
 * operation with an inverse: sum and xor do, min and max do not.
 */

export type FenOp = 'sum' | 'xor';

export const lowbit = (i: number): number => i & -i;

/** The first cell of the range cell i is responsible for. */
export const rangeStart = (i: number): number => i - lowbit(i) + 1;

const combine = (op: FenOp, a: number, b: number): number => (op === 'sum' ? a + b : a ^ b);
const inverse = (op: FenOp, a: number, b: number): number => (op === 'sum' ? a - b : a ^ b);

/** Cells a prefix query reads: i, then i minus its lowest set bit, down to 0. */
export function prefixHops(i: number): number[] {
  const out: number[] = [];
  for (let k = i; k > 0; k -= lowbit(k)) out.push(k);
  return out;
}

/** Cells an update at i writes: i, then i plus its lowest set bit, up to n. */
export function updateHops(i: number, n: number): number[] {
  const out: number[] = [];
  for (let k = i; k <= n; k += lowbit(k)) out.push(k);
  return out;
}

/** The tree for `values` (cell 1 is values[0]); index 0 is unused. */
export function fenBuild(values: readonly number[], op: FenOp): number[] {
  let tree = Array<number>(values.length + 1).fill(0);
  values.forEach((v, i) => {
    tree = fenAdd(tree, i + 1, v, op).tree;
  });
  return tree;
}

/** Combine `delta` into cell i (add for sum, xor for xor): returns the new tree and the cells written. */
export function fenAdd(tree: readonly number[], i: number, delta: number, op: FenOp): { tree: number[]; hops: number[] } {
  const next = [...tree];
  const hops = updateHops(i, tree.length - 1);
  for (const k of hops) next[k] = combine(op, next[k], delta);
  return { tree: next, hops };
}

export function fenPrefix(tree: readonly number[], i: number, op: FenOp): { value: number; hops: number[] } {
  const hops = prefixHops(i);
  return { value: hops.reduce((acc, k) => combine(op, acc, tree[k]), 0), hops };
}

/** The value of cells l..r (1-based, inclusive): prefix(r) minus prefix(l - 1), through the operation's inverse. */
export function fenRange(tree: readonly number[], l: number, r: number, op: FenOp): { value: number; hopsR: number[]; hopsL: number[] } {
  const hi = fenPrefix(tree, r, op);
  const lo = fenPrefix(tree, l - 1, op);
  return { value: inverse(op, hi.value, lo.value), hopsR: hi.hops, hopsL: lo.hops };
}

/** A tree of minimums over the same ranges: a correct prefix-minimum structure, and the start of a wrong range-minimum one. */
export function minBuild(values: readonly number[]): number[] {
  const n = values.length;
  const tree = Array<number>(n + 1).fill(Infinity);
  values.forEach((v, i) => {
    for (const k of updateHops(i + 1, n)) tree[k] = Math.min(tree[k], v);
  });
  return tree;
}

export function minPrefix(tree: readonly number[], i: number): { value: number; hops: number[] } {
  const hops = prefixHops(i);
  return { value: hops.reduce((acc, k) => Math.min(acc, tree[k]), Infinity), hops };
}

/**
 * What the sum recipe turns into for min: it asks for prefix(r) and cannot take prefix(l - 1) away,
 * so it answers with the minimum of everything up to r. Right only when that minimum happens to lie in [l, r].
 */
export const rangeMinWrong = (tree: readonly number[], r: number): number => minPrefix(tree, r).value;
