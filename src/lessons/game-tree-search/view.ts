import { isLeaf, isMax, subtreeOf, type Spec, type SearchResult } from './tree';

/** What a search looks like after its first k events: the node being worked on, what is known, and what has been skipped. */
export interface NodeView {
  visited: Set<number>;
  values: Map<number, number>;
  windows: Map<number, [number, number]>;
  current: number | null;
  struck: Set<number>;
  /** For each node that has returned, the child that gave its value. */
  chosen: Map<number, number>;
}

export function viewAt(spec: Spec, result: SearchResult, k: number): NodeView {
  const view: NodeView = { visited: new Set(), values: new Map(), windows: new Map(), current: null, struck: new Set(), chosen: new Map() };
  for (const e of result.events.slice(0, k)) {
    view.current = e.node;
    if (e.type === 'enter') {
      view.visited.add(e.node);
      view.windows.set(e.node, [e.alpha, e.beta]);
    } else if (e.type === 'leaf') {
      view.values.set(e.node, e.value);
    } else if (e.type === 'return') {
      view.values.set(e.node, e.value);
      view.chosen.set(e.node, result.chosen.get(e.node)!);
    } else {
      for (const s of e.skipped) for (const n of subtreeOf(s, spec)) view.struck.add(n);
    }
  }
  return view;
}

/** A node's name from the path to it: the root, then A, B, C for the first move and a digit for each move after. */
export function pathName(i: number, b: number): string {
  if (i === 0) return 'root';
  const digits: number[] = [];
  for (let n = i; n > 0; n = Math.floor((n - 1) / b)) digits.unshift(((n - 1) % b) + 1);
  return String.fromCharCode(64 + digits[0]) + digits.slice(1).join('');
}

export const roleOf = (i: number, spec: Spec): 'max' | 'min' | 'leaf' => (isLeaf(i, spec) ? 'leaf' : isMax(i, spec.b) ? 'max' : 'min');

/** The infinity-aware text of a bound. */
export const boundText = (x: number): string => (x === Infinity ? '+inf' : x === -Infinity ? '-inf' : String(x));
