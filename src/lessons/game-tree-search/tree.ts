import { mulberry32 } from '../../core/random';

// Complete game trees with heap numbering: node 0 is the root, the children of node i are b*i + 1 .. b*i + b, and the last
// b^d nodes are the leaves. Even depths are max nodes (the maximiser moves), odd depths are min nodes.

export interface Spec {
  b: number;
  d: number;
}

export const nodeCount = ({ b, d }: Spec): number => (b ** (d + 1) - 1) / (b - 1);
export const leafCount = ({ b, d }: Spec): number => b ** d;
export const firstLeaf = ({ b, d }: Spec): number => (b ** d - 1) / (b - 1);
export const childrenOf = (i: number, b: number): number[] => Array.from({ length: b }, (_, k) => b * i + 1 + k);
export const depthOf = (i: number, b: number): number => {
  let depth = 0;
  for (let first = 0, width = 1; i >= first + width; depth++) {
    first += width;
    width *= b;
  }
  return depth;
};
export const isMax = (i: number, b: number): boolean => depthOf(i, b) % 2 === 0;
export const isLeaf = (i: number, spec: Spec): boolean => i >= firstLeaf(spec);

/** Which test prunes: `ge` (alpha >= beta, the standard one), `gt` (alpha > beta: still correct, prunes less on ties) or `swapped-bounds` (each node tightens the other side's bound, so a min node updates alpha: a bug). */
export type Variant = 'ge' | 'gt' | 'swapped-bounds';

export type Event =
  | { type: 'enter'; node: number; alpha: number; beta: number }
  | { type: 'leaf'; node: number; value: number }
  | { type: 'return'; node: number; value: number }
  | { type: 'cut'; node: number; skipped: number[]; alpha: number; beta: number };

export interface SearchOptions {
  prune: boolean;
  variant?: Variant;
  /** The order a node's children are visited in (default: left to right). */
  order?: (node: number) => number[];
}

export interface SearchResult {
  value: number;
  /** Nodes entered, leaves included. */
  nodes: number;
  /** Leaves evaluated. */
  leaves: number;
  events: Event[];
  /** The child of the root that gave the root's value (the first to reach it, in visiting order). */
  bestChild: number;
  /** For each internal node visited, the child that gave its value (the first to reach it, in visiting order). */
  chosen: Map<number, number>;
  /** The (alpha, beta) window each visited node was entered with. */
  windows: Map<number, [number, number]>;
  /** The value each node returned (visited nodes only). */
  values: Map<number, number>;
  /** Roots of the subtrees that were skipped. */
  cutRoots: number[];
}

/** Minimax (prune: false) or alpha-beta over a complete tree, from the root, recording every event. */
export function search(spec: Spec, leaves: readonly number[], o: SearchOptions): SearchResult {
  const { b } = spec;
  const first = firstLeaf(spec);
  const variant = o.variant ?? 'ge';
  const events: Event[] = [];
  const windows = new Map<number, [number, number]>();
  const values = new Map<number, number>();
  const cutRoots: number[] = [];
  const chosen = new Map<number, number>();
  let nodes = 0;
  let leafHits = 0;

  const visit = (node: number, alphaIn: number, betaIn: number): number => {
    nodes++;
    windows.set(node, [alphaIn, betaIn]);
    events.push({ type: 'enter', node, alpha: alphaIn, beta: betaIn });
    if (isLeaf(node, spec)) {
      const value = leaves[node - first];
      leafHits++;
      values.set(node, value);
      events.push({ type: 'leaf', node, value });
      return value;
    }
    const max = isMax(node, b);
    let alpha = alphaIn;
    let beta = betaIn;
    let best = max ? -Infinity : Infinity;
    let pick = -1;
    const order = o.order ? o.order(node) : childrenOf(node, b);
    for (let k = 0; k < order.length; k++) {
      const v = visit(order[k], alpha, beta);
      if (max ? v > best : v < best) {
        best = v;
        pick = order[k];
      }
      if (variant === 'swapped-bounds') {
        if (max) beta = Math.min(beta, best);
        else alpha = Math.max(alpha, best);
      } else if (max) alpha = Math.max(alpha, best);
      else beta = Math.min(beta, best);
      const cut = o.prune && (variant === 'gt' ? alpha > beta : alpha >= beta);
      if (cut && k < order.length - 1) {
        const skipped = order.slice(k + 1);
        cutRoots.push(...skipped);
        events.push({ type: 'cut', node, skipped, alpha, beta });
        break;
      }
    }
    values.set(node, best);
    chosen.set(node, pick);
    events.push({ type: 'return', node, value: best });
    return best;
  };

  const value = visit(0, -Infinity, Infinity);
  return { value, nodes, leaves: leafHits, events, bestChild: chosen.get(0) ?? -1, chosen, windows, values, cutRoots };
}

/** The minimax value of every node, by one full pass: the truth that move orderings are built from. */
export function nodeValues(spec: Spec, leaves: readonly number[]): number[] {
  const out = new Array<number>(nodeCount(spec));
  const first = firstLeaf(spec);
  for (let i = nodeCount(spec) - 1; i >= 0; i--) {
    if (isLeaf(i, spec)) out[i] = leaves[i - first];
    else {
      const vs = childrenOf(i, spec.b).map((c) => out[c]);
      out[i] = isMax(i, spec.b) ? Math.max(...vs) : Math.min(...vs);
    }
  }
  return out;
}

export type Ordering = 'given' | 'best' | 'worst' | 'random';

/** A child order per node: left to right, best move first, worst move first (for the mover), or a seeded shuffle. */
export function orderingFor(spec: Spec, leaves: readonly number[], kind: Ordering, seed = 0): (node: number) => number[] {
  const values = nodeValues(spec, leaves);
  const { b } = spec;
  return (node) => {
    const kids = childrenOf(node, b);
    if (kind === 'given') return kids;
    if (kind === 'random') {
      const rnd = mulberry32(seed * 100_003 + node);
      const a = kids.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    const goodFirst = isMax(node, b) ? (x: number, y: number) => values[y] - values[x] : (x: number, y: number) => values[x] - values[y];
    const sorted = kids.slice().sort((x, y) => goodFirst(x, y) || x - y);
    return kind === 'best' ? sorted : sorted.reverse();
  };
}

/** Knuth and Moore's minimum number of leaves alpha-beta must look at in a perfectly ordered tree: b^ceil(d/2) + b^floor(d/2) - 1. */
export const knuthMooreMinimum = ({ b, d }: Spec): number => b ** Math.ceil(d / 2) + b ** Math.floor(d / 2) - 1;

/** Every node in the subtree under `root`, the root included. */
export function subtreeOf(root: number, spec: Spec): number[] {
  const out = [root];
  for (let k = 0; k < out.length; k++) if (!isLeaf(out[k], spec)) out.push(...childrenOf(out[k], spec.b));
  return out;
}

/**
 * Score a prediction of which nodes will be skipped: a marked node is a hit when it lies inside a skipped subtree, wrong
 * when it does not, and a skipped subtree is missed when no marked node lies inside it.
 */
export function scorePrediction(predicted: readonly number[], cutRoots: readonly number[], spec: Spec): { hits: number; wrong: number; missed: number } {
  const inside = cutRoots.map((r) => new Set(subtreeOf(r, spec)));
  const hits = predicted.filter((n) => inside.some((s) => s.has(n))).length;
  const missed = inside.filter((s) => !predicted.some((n) => s.has(n))).length;
  return { hits, wrong: predicted.length - hits, missed };
}