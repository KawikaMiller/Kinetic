/**
 * Frames shown before the simulated stack overflow. A teaching limit so the crash fits on
 * screen: a real JS engine allows roughly 10,000 frames (it varies by engine and frame size).
 */
export const LIMIT = 11;

/** One call in a plain recursive fib(n) call tree. */
export interface FNode {
  id: number;
  n: number;
  parent: number | null;
  depth: number;
  /** Leaf order for layout (leaves get 0, 1, 2…; parents sit between their children). */
  x: number;
  /** fib(n) with n ≥ 2 that an earlier call already computed: wasted work. */
  repeat: boolean;
}

export type CallEvent = { t: 'call'; id: number } | { t: 'ret'; id: number; v: number };

/** Every call plain recursive fib(n0) makes, in the order it makes them, plus call/return events. */
export function fibCallTree(n0: number): { nodes: FNode[]; events: CallEvent[]; leaves: number } {
  const nodes: FNode[] = [];
  const events: CallEvent[] = [];
  let leaf = 0;
  const seen = new Set<number>();
  const walk = (n: number, parent: number | null, depth: number): { id: number; v: number } => {
    const id = nodes.length;
    // Base cases are trivially cheap; the waste is recomputing whole subtrees.
    const node: FNode = { id, n, parent, depth, x: 0, repeat: n >= 2 && seen.has(n) };
    nodes.push(node);
    events.push({ t: 'call', id });
    let v: number;
    if (n <= 1) {
      node.x = leaf++;
      v = n;
    } else {
      const a = walk(n - 1, id, depth + 1);
      const b = walk(n - 2, id, depth + 1);
      node.x = (nodes[a.id].x + nodes[b.id].x) / 2;
      v = a.v + b.v;
    }
    seen.add(n);
    events.push({ t: 'ret', id, v });
    return { id, v };
  };
  walk(n0, null, 0);
  return { nodes, events, leaves: leaf };
}
