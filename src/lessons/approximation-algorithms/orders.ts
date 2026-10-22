import { primMst, tourLength, type DistMatrix, type Edge } from '../../core/tsp';

/**
 * MST doubling visits the tree's children in INDEX order, one of several valid visiting orders. The 2x guarantee is a
 * bound over every valid order, so the lesson also computes the best order to show that the pinned one is not the method.
 */

/** Past this many visiting orders the best order is not computed (a drag stays instant). */
export const MAX_ORDERS = 40320;

export interface OrderSummary {
  /** How many valid visiting orders the tree has: the product over vertices of (children)!. */
  count: number;
  /** The shortest closed tour over all valid visiting orders, or null when there are more than MAX_ORDERS. */
  best: { tour: number[]; length: number } | null;
}

const factorial = (k: number): number => (k <= 1 ? 1 : k * factorial(k - 1));

function childrenOf(n: number, edges: readonly Edge[]): number[][] {
  const kids: number[][] = Array.from({ length: n }, () => []);
  for (const [parent, child] of edges) kids[parent].push(child);
  return kids;
}

/** Every permutation of `items`. */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest]));
}

/** Every preorder walk of the subtree at `v` over all child orders. */
function walks(kids: readonly number[][], v: number): number[][] {
  const out: number[][] = [];
  for (const order of permutations(kids[v])) {
    let partial: number[][] = [[v]];
    for (const c of order) {
      const sub = walks(kids, c);
      partial = partial.flatMap((p) => sub.map((s) => [...p, ...s]));
    }
    out.push(...partial);
  }
  return out;
}

export function visitingOrders(dist: DistMatrix): OrderSummary {
  const n = dist.length;
  if (n === 0) return { count: 1, best: null };
  const kids = childrenOf(n, primMst(dist).edges);
  const count = kids.reduce((product, k) => product * factorial(k.length), 1);
  if (count > MAX_ORDERS) return { count, best: null };
  let best: { tour: number[]; length: number } | null = null;
  for (const tour of walks(kids, 0)) {
    const length = tourLength(dist, tour);
    if (best === null || length < best.length) best = { tour, length };
  }
  return { count, best };
}
