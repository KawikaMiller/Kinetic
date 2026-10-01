// Binary trees and the four classic traversals, as pure data and event traces.

export interface BNode {
  label: string;
  left: number | null;
  right: number | null;
}

export interface BTree {
  root: number | null;
  nodes: Record<number, BNode>;
}

export type Order = 'pre' | 'in' | 'post' | 'level';

/** What the traversal is doing at one moment: DFS calls and returns, BFS queue moves, and emits. */
export type TraversalEvent =
  | { kind: 'call'; node: number }
  | { kind: 'return'; node: number }
  | { kind: 'emit'; node: number }
  | { kind: 'enqueue'; node: number }
  | { kind: 'dequeue'; node: number };

const kids = (t: BTree, id: number) => [t.nodes[id].left, t.nodes[id].right].filter((c): c is number => c !== null);

/** Reference implementations, written the textbook way. */
export function reference(t: BTree, order: Order): string[] {
  const out: string[] = [];
  const dfs = (id: number | null) => {
    if (id === null) return;
    const n = t.nodes[id];
    if (order === 'pre') out.push(n.label);
    dfs(n.left);
    if (order === 'in') out.push(n.label);
    dfs(n.right);
    if (order === 'post') out.push(n.label);
  };
  if (order !== 'level') dfs(t.root);
  else {
    const queue = t.root === null ? [] : [t.root];
    while (queue.length) {
      const id = queue.shift()!;
      out.push(t.nodes[id].label);
      queue.push(...kids(t, id));
    }
  }
  return out;
}

/**
 * The step-by-step trace the stage animates. Depth-first orders recurse (calls and
 * returns = the call stack); level order uses a queue. Empty children aren't called:
 * a real recursive version calls visit(null) and returns at once, which adds nothing to see.
 */
export function traversalEvents(t: BTree, order: Order): TraversalEvent[] {
  const ev: TraversalEvent[] = [];
  if (t.root === null) return ev;
  if (order === 'level') {
    const queue = [t.root];
    ev.push({ kind: 'enqueue', node: t.root });
    while (queue.length) {
      const id = queue.shift()!;
      ev.push({ kind: 'dequeue', node: id }, { kind: 'emit', node: id });
      for (const c of kids(t, id)) {
        queue.push(c);
        ev.push({ kind: 'enqueue', node: c });
      }
    }
    return ev;
  }
  const visit = (id: number) => {
    const n = t.nodes[id];
    ev.push({ kind: 'call', node: id });
    if (order === 'pre') ev.push({ kind: 'emit', node: id });
    if (n.left !== null) visit(n.left);
    if (order === 'in') ev.push({ kind: 'emit', node: id });
    if (n.right !== null) visit(n.right);
    if (order === 'post') ev.push({ kind: 'emit', node: id });
    ev.push({ kind: 'return', node: id });
  };
  visit(t.root);
  return ev;
}

export const emitted = (t: BTree, events: readonly TraversalEvent[]) =>
  events.filter((e) => e.kind === 'emit').map((e) => t.nodes[e.node].label);

const OPS: Record<string, (a: number, b: number) => number> = {
  '+': (a, b) => a + b,
  '−': (a, b) => a - b,
  '×': (a, b) => a * b,
  '÷': (a, b) => a / b,
};
export const isOperator = (token: string) => token in OPS;

/** Evaluate Reverse Polish Notation (post-order output) with a stack, recording each step. */
export function evaluateRpn(tokens: readonly string[]) {
  const stack: number[] = [];
  const steps: { token: string; stack: number[] }[] = [];
  for (const token of tokens) {
    if (isOperator(token)) {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) throw new Error(`Not enough operands for ${token}`);
      stack.push(OPS[token](a, b));
    } else stack.push(Number(token));
    steps.push({ token, stack: [...stack] });
  }
  if (stack.length !== 1) throw new Error('Malformed expression');
  return { value: stack[0], steps };
}

// Editing (pure): new trees, never mutations.

export function addChild(t: BTree, parent: number, label: string): { tree: BTree; id: number } | null {
  const p = t.nodes[parent];
  const side = p.left === null ? 'left' : p.right === null ? 'right' : null;
  if (!side) return null;
  const id = Math.max(-1, ...Object.keys(t.nodes).map(Number)) + 1;
  return {
    id,
    tree: { root: t.root, nodes: { ...t.nodes, [id]: { label, left: null, right: null }, [parent]: { ...p, [side]: id } } },
  };
}

export const isLeaf = (t: BTree, id: number) => t.nodes[id].left === null && t.nodes[id].right === null;

export function removeLeaf(t: BTree, id: number): BTree | null {
  if (id === t.root || !isLeaf(t, id)) return null;
  const nodes: Record<number, BNode> = {};
  for (const [key, n] of Object.entries(t.nodes)) {
    const k = Number(key);
    if (k === id) continue;
    nodes[k] = { ...n, left: n.left === id ? null : n.left, right: n.right === id ? null : n.right };
  }
  return { root: t.root, nodes };
}

/**
 * Whether labels are in strictly ascending order: numerically when every label is a
 * number, otherwise as text. In-order output is sorted exactly when the tree is a search tree.
 */
export function isSortedLabels(labels: readonly string[]): boolean {
  const numeric = labels.every((l) => l.trim() !== '' && Number.isFinite(Number(l)));
  const before = (a: string, b: string) => (numeric ? Number(a) < Number(b) : a < b);
  return labels.every((l, i) => i === 0 || before(labels[i - 1], l));
}

/** Build a BST by inserting keys in order (labels are the keys). */
export function bstFrom(keys: readonly number[]): BTree {
  const t: BTree = { root: null, nodes: {} };
  keys.forEach((key, id) => {
    t.nodes[id] = { label: String(key), left: null, right: null };
    if (t.root === null) return void (t.root = id);
    let at = t.root;
    for (;;) {
      const n = t.nodes[at];
      const side = key < Number(n.label) ? 'left' : 'right';
      const next = n[side];
      if (next === null) {
        n[side] = id;
        break;
      }
      at = next;
    }
  });
  return t;
}
