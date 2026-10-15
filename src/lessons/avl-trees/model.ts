/**
 * AVL tree, computed live. One mutable working copy does every insert and delete, so the
 * stepper's frames, the final tree and the tests all come from the same code. Heights count
 * nodes (a lone node has height 1, nothing has height 0) and the balance factor is
 * `h(right) - h(left)`.
 */

export interface TNode {
  key: number;
  left: number | null;
  right: number | null;
  /** Stored height in nodes, as the algorithm last computed it. */
  h: number;
}

/** An immutable view of a tree: node ids are the keys. */
export interface Tree {
  root: number | null;
  nodes: Readonly<Record<number, TNode>>;
}

export const EMPTY_TREE: Tree = { root: null, nodes: {} };

/** The four ways a node can be too heavy: the first letter is its heavy child's side, the second that child's heavy side. */
export type Case = 'LL' | 'RR' | 'LR' | 'RL';

/** The four buttons of "you pick the rotation". */
export type Choice = 'right' | 'left' | 'left-right' | 'right-left';

export interface Rotation {
  kind: 'left' | 'right';
  /** The node that moved down. */
  down: number;
  /** The node that moved up into its place. */
  up: number;
}

export type AvlStep =
  | { kind: 'visit'; key: number; path: readonly number[]; tree: Tree }
  | { kind: 'place'; key: number; path: readonly number[]; tree: Tree }
  | { kind: 'remove'; key: number; successor: number | null; tree: Tree }
  | { kind: 'retrace'; at: number; h: number; bf: number; tree: Tree }
  | { kind: 'unbalanced'; at: number; bf: number; case: Case; child: number; tree: Tree }
  | { kind: 'rotate'; rotation: Rotation; tree: Tree };

export interface OpResult {
  tree: Tree;
  steps: AvlStep[];
  rotations: Rotation[];
  /** Imbalances fixed: a double rotation is one fix and two rotations. */
  fixes: number;
}

export interface OpOptions {
  /** The wrong rotation the lesson shows: treat left-right and right-left as a single rotation. */
  broken?: boolean;
  /** Keep a snapshot after every step (the stepper); off for the big seeded runs. */
  record?: boolean;
}

const heightOfNode = (nodes: Readonly<Record<number, TNode>>, k: number | null): number => (k === null ? 0 : nodes[k].h);

export const heightOf = (t: Tree): number => heightOfNode(t.nodes, t.root);
/** Levels of the tree as drawn, counted by walking the links: unlike `heightOf` it never trusts the stored heights, which lag behind a repair in progress. */
export function levelsOf(t: Tree): number {
  const go = (k: number | null): number => (k === null ? 0 : 1 + Math.max(go(t.nodes[k].left), go(t.nodes[k].right)));
  return go(t.root);
}
export const sizeOf = (t: Tree): number => Object.keys(t.nodes).length;
export const hasKey = (t: Tree, key: number): boolean => key in t.nodes;
export const balanceOf = (t: Tree, k: number): number => heightOfNode(t.nodes, t.nodes[k].right) - heightOfNode(t.nodes, t.nodes[k].left);

/** Keys in order, by walking the tree (not by sorting). */
export function inOrder(t: Tree): number[] {
  const out: number[] = [];
  const walk = (k: number | null) => {
    if (k === null) return;
    walk(t.nodes[k].left);
    out.push(k);
    walk(t.nodes[k].right);
  };
  walk(t.root);
  return out;
}

/** The balance case at an unbalanced node, from the node and its heavy child. */
export function caseAt(t: Tree, k: number): Case | null {
  const b = balanceOf(t, k);
  if (Math.abs(b) < 2) return null;
  if (b < 0) return balanceOf(t, t.nodes[k].left as number) <= 0 ? 'LL' : 'LR';
  return balanceOf(t, t.nodes[k].right as number) >= 0 ? 'RR' : 'RL';
}

/** The worker: a mutable copy of a tree with the algorithm's moves as methods. */
class Work {
  nodes: Record<number, TNode> = {};
  root: number | null;
  readonly steps: AvlStep[] = [];
  readonly rotations: Rotation[] = [];
  fixes = 0;

  private readonly opts: OpOptions;

  constructor(tree: Tree, opts: OpOptions) {
    this.opts = opts;
    for (const [k, n] of Object.entries(tree.nodes)) this.nodes[Number(k)] = { ...n };
    this.root = tree.root;
  }

  snapshot(): Tree {
    const nodes: Record<number, TNode> = {};
    for (const [k, n] of Object.entries(this.nodes)) nodes[Number(k)] = { ...n };
    return { root: this.root, nodes };
  }

  record(make: (tree: Tree) => AvlStep) {
    if (this.opts.record) this.steps.push(make(this.snapshot()));
  }

  /** The node whose child link points at `k`, or null for the root. */
  parentOf(k: number): number | null {
    for (const n of Object.values(this.nodes)) if (n.left === k || n.right === k) return n.key;
    return null;
  }

  private h(k: number | null) {
    return heightOfNode(this.nodes, k);
  }

  private refresh(k: number) {
    const n = this.nodes[k];
    n.h = 1 + Math.max(this.h(n.left), this.h(n.right));
  }

  private bf(k: number) {
    return this.h(this.nodes[k].right) - this.h(this.nodes[k].left);
  }

  /** Point `parent`'s link to `oldChild` at `newChild` (or the root, when there is no parent). */
  private link(parent: number | null, oldChild: number, newChild: number | null) {
    if (parent === null) this.root = newChild;
    else if (this.nodes[parent].left === oldChild) this.nodes[parent].left = newChild;
    else this.nodes[parent].right = newChild;
  }

  rotate(kind: 'left' | 'right', k: number, parent: number | null): number {
    const n = this.nodes[k];
    let up: number;
    if (kind === 'right') {
      up = n.left as number;
      n.left = this.nodes[up].right;
      this.nodes[up].right = k;
    } else {
      up = n.right as number;
      n.right = this.nodes[up].left;
      this.nodes[up].left = k;
    }
    this.link(parent, k, up);
    this.refresh(k);
    this.refresh(up);
    const rotation: Rotation = { kind, down: k, up };
    this.rotations.push(rotation);
    this.record((tree) => ({ kind: 'rotate', rotation, tree }));
    return up;
  }

  /** Fix the node if it is out of balance; returns the root of that subtree afterwards. */
  private rebalance(k: number, parent: number | null): number {
    const b = this.bf(k);
    if (Math.abs(b) < 2) return k;
    const leftHeavy = b < 0;
    const child = (leftHeavy ? this.nodes[k].left : this.nodes[k].right) as number;
    const cb = this.bf(child);
    const double = leftHeavy ? cb > 0 : cb < 0;
    const kind: Case = leftHeavy ? (double ? 'LR' : 'LL') : double ? 'RL' : 'RR';
    this.fixes += 1;
    this.record((tree) => ({ kind: 'unbalanced', at: k, bf: b, case: kind, child, tree }));
    const outer = leftHeavy ? 'right' : 'left';
    const inner = leftHeavy ? 'left' : 'right';
    if (double && !this.opts.broken) {
      this.rotate(inner, child, k);
    }
    return this.rotate(outer, k, parent);
  }

  /** Walk bottom-up through `ancestors` (each the parent of the one before): refresh, report, fix. */
  private retrace(ancestors: readonly number[]) {
    ancestors.forEach((a, i) => {
      this.refresh(a);
      this.record((tree) => ({ kind: 'retrace', at: a, h: tree.nodes[a].h, bf: balanceOf(tree, a), tree }));
      this.rebalance(a, i + 1 < ancestors.length ? ancestors[i + 1] : null);
    });
  }

  insert(key: number) {
    if (key in this.nodes) throw new Error(`${key} is already in the tree`);
    const path: number[] = [];
    if (this.root !== null) {
      let cur = this.root;
      for (;;) {
        path.push(cur);
        const visited = [...path];
        this.record((tree) => ({ kind: 'visit', key, path: visited, tree }));
        const next: number | null = key < cur ? this.nodes[cur].left : this.nodes[cur].right;
        if (next === null) break;
        cur = next;
      }
      if (key < path[path.length - 1]) this.nodes[path[path.length - 1]].left = key;
      else this.nodes[path[path.length - 1]].right = key;
    } else {
      this.root = key;
    }
    this.nodes[key] = { key, left: null, right: null, h: 1 };
    this.record((tree) => ({ kind: 'place', key, path: [...path], tree }));
    this.retrace([...path].reverse());
  }

  remove(key: number) {
    if (!(key in this.nodes)) throw new Error(`${key} is not in the tree`);
    const path: number[] = [];
    for (let cur = this.root as number; cur !== key; cur = key < cur ? (this.nodes[cur].left as number) : (this.nodes[cur].right as number)) {
      path.push(cur);
      const visited = [...path];
      this.record((tree) => ({ kind: 'visit', key, path: visited, tree }));
    }
    const d = this.nodes[key];
    const parent = path.length ? path[path.length - 1] : null;
    const up = [...path].reverse();
    let retraceFrom: number[];
    let successor: number | null = null;
    if (d.left === null || d.right === null) {
      this.link(parent, key, d.left ?? d.right);
      retraceFrom = up;
    } else {
      const walk = [d.right];
      while (this.nodes[walk[walk.length - 1]].left !== null) walk.push(this.nodes[walk[walk.length - 1]].left as number);
      const s = walk[walk.length - 1];
      successor = s;
      if (walk.length === 1) {
        this.nodes[s].left = d.left;
        retraceFrom = [s, ...up];
      } else {
        this.nodes[walk[walk.length - 2]].left = this.nodes[s].right;
        this.nodes[s].left = d.left;
        this.nodes[s].right = d.right;
        retraceFrom = [...walk.slice(0, -1).reverse(), s, ...up];
      }
      this.link(parent, key, s);
    }
    delete this.nodes[key];
    this.record((tree) => ({ kind: 'remove', key, successor, tree }));
    this.retrace(retraceFrom);
  }

  result(): OpResult {
    return { tree: this.snapshot(), steps: this.steps, rotations: this.rotations, fixes: this.fixes };
  }
}

export function insertKey(tree: Tree, key: number, opts: OpOptions = {}): OpResult {
  const w = new Work(tree, opts);
  w.insert(key);
  return w.result();
}

export function removeKey(tree: Tree, key: number, opts: OpOptions = {}): OpResult {
  const w = new Work(tree, opts);
  w.remove(key);
  return w.result();
}

/** Insert the keys in order; the totals are over the whole run. */
export function buildAvl(keys: readonly number[], opts: OpOptions = {}): { tree: Tree; rotations: number; fixes: number } {
  let tree = EMPTY_TREE;
  let rotations = 0;
  let fixes = 0;
  for (const k of keys) {
    const r = insertKey(tree, k, { ...opts, record: false });
    tree = r.tree;
    rotations += r.rotations.length;
    fixes += r.fixes;
  }
  return { tree, rotations, fixes };
}

/** Recompute every height from the shape alone. */
function withHeights(root: number | null, shape: Record<number, { key: number; left: number | null; right: number | null }>): Tree {
  const nodes: Record<number, TNode> = {};
  const go = (k: number | null): number => {
    if (k === null) return 0;
    const n = shape[k];
    const h = 1 + Math.max(go(n.left), go(n.right));
    nodes[k] = { key: k, left: n.left, right: n.right, h };
    return h;
  };
  go(root);
  return { root, nodes };
}

/** A plain, unbalanced binary search tree: the same keys inserted with no rotations at all. */
export function buildBst(keys: readonly number[]): Tree {
  const shape: Record<number, { key: number; left: number | null; right: number | null }> = {};
  let root: number | null = null;
  for (const key of keys) {
    shape[key] = { key, left: null, right: null };
    if (root === null) {
      root = key;
      continue;
    }
    let cur = root;
    for (;;) {
      const side: 'left' | 'right' = key < cur ? 'left' : 'right';
      const next = shape[cur][side];
      if (next === null) {
        shape[cur][side] = key;
        break;
      }
      cur = next;
    }
  }
  return withHeights(root, shape);
}

/** The deepest path of a tree: the keys from the root down the taller child each time. */
export function deepestPath(t: Tree): number[] {
  const out: number[] = [];
  for (let k = t.root; k !== null; ) {
    out.push(k);
    const n = t.nodes[k];
    k = heightOfNode(t.nodes, n.left) >= heightOfNode(t.nodes, n.right) ? n.left : n.right;
  }
  return out;
}

/** The shortest tree for these keys: sorted, then the middle key at each level. Height is ceil(log2(n + 1)). */
export function buildBalanced(keys: readonly number[]): Tree {
  const sorted = [...keys].sort((a, b) => a - b);
  const shape: Record<number, { key: number; left: number | null; right: number | null }> = {};
  const go = (lo: number, hi: number): number | null => {
    if (lo > hi) return null;
    const mid = (lo + hi) >> 1;
    shape[sorted[mid]] = { key: sorted[mid], left: go(lo, mid - 1), right: go(mid + 1, hi) };
    return sorted[mid];
  };
  return withHeights(go(0, sorted.length - 1), shape);
}

/** Fewest nodes of an AVL tree of height h: N(0) = 0, N(1) = 1, N(h) = N(h - 1) + N(h - 2) + 1. */
export function fibonacciSize(h: number): number {
  let a = 0;
  let b = 1;
  if (h === 0) return 0;
  for (let i = 2; i <= h; i++) [a, b] = [b, b + a + 1];
  return b;
}

/** The Fibonacci tree of height h: the AVL tree with the fewest nodes, keys 1..N(h). */
export function fibonacciTree(h: number): Tree {
  const shape: Record<number, { key: number; left: number | null; right: number | null }> = {};
  const go = (height: number, offset: number): number | null => {
    if (height <= 0) return null;
    const leftSize = fibonacciSize(height - 1);
    const key = offset + leftSize + 1;
    shape[key] = { key, left: go(height - 1, offset), right: go(height - 2, offset + leftSize + 1) };
    return key;
  };
  return withHeights(go(h, 0), shape);
}

/**
 * Every AVL rule, recomputed from the shape and not from the stored heights: reachability, BST
 * order, stored height equals real height, and |balance factor| <= 1. Empty when the tree is valid.
 */
export function checkAvl(t: Tree): string[] {
  const problems: string[] = [];
  const seen = new Set<number>();
  const real = (k: number | null, lo: number, hi: number): number => {
    if (k === null) return 0;
    if (seen.has(k)) {
      problems.push(`${k} is reachable twice`);
      return 0;
    }
    seen.add(k);
    const n = t.nodes[k];
    if (!(k > lo && k < hi)) problems.push(`${k} breaks the BST order`);
    const l = real(n.left, lo, Math.min(hi, k));
    const r = real(n.right, Math.max(lo, k), hi);
    const h = 1 + Math.max(l, r);
    if (n.h !== h) problems.push(`${k} stores height ${n.h} but its real height is ${h}`);
    if (Math.abs(r - l) > 1) problems.push(`${k} has balance factor ${r - l}`);
    return h;
  };
  real(t.root, -Infinity, Infinity);
  if (seen.size !== sizeOf(t)) problems.push('a stored node is not reachable from the root');
  return problems;
}

/** What "you pick the rotation" can do, from a node that is out of balance. */
export interface PickState {
  tree: Tree;
  /** The first unbalanced node on the way up. */
  at: number;
  case: Case;
  /** The tree as it stood before the insert (the Undo target). */
  base: Tree;
  key: number;
}

/**
 * Insert `key` and stop at the first unbalanced ancestor, before fixing it: heights are updated up
 * to and including that node. Null when the insert would not unbalance anything.
 */
export function stopAtImbalance(base: Tree, key: number): PickState | null {
  const r = insertKey(base, key, { record: true });
  const step = r.steps.find((s) => s.kind === 'unbalanced');
  if (!step || step.kind !== 'unbalanced') return null;
  return { tree: step.tree, at: step.at, case: step.case, base, key };
}

export interface PickOutcome {
  tree: Tree;
  /** Balance factors (and heights) of the nodes the rotation touched, as they are now. */
  touched: { key: number; bf: number }[];
  /** Whole tree is a valid AVL tree again. */
  valid: boolean;
  /** The chosen rotation was legal (the needed child exists). */
  applied: boolean;
  /** Why it was not, when it was not. */
  refusal: string | null;
  /** The outcome is exactly what the correct repair gives. */
  correct: boolean;
  /** Nodes still out of balance after the move. */
  unbalanced: number[];
}

const finishHeights = (nodes: Record<number, TNode>, root: number | null) => {
  const go = (k: number | null): number => {
    if (k === null) return 0;
    const n = nodes[k];
    n.h = 1 + Math.max(go(n.left), go(n.right));
    return n.h;
  };
  go(root);
};

/** The right choice for a case. */
export const CORRECT_CHOICE: Record<Case, Choice> = { LL: 'right', RR: 'left', LR: 'left-right', RL: 'right-left' };

/** Why this button cannot be pressed at the node (the child it lifts has to exist), or null when it can. */
function refusalFor(w: Work, at: number, choice: Choice): string | null {
  const n = w.nodes[at];
  const lifts = (k: number | null, side: 'left' | 'right') => k !== null && w.nodes[k][side] !== null;
  if (choice === 'right') return lifts(at, 'left') ? null : `${at} has no left child to lift`;
  if (choice === 'left') return lifts(at, 'right') ? null : `${at} has no right child to lift`;
  if (choice === 'left-right') {
    if (n.left === null) return `${at} has no left child`;
    return lifts(n.left, 'right') ? null : `${n.left} has no right child to lift`;
  }
  if (n.right === null) return `${at} has no right child`;
  return lifts(n.right, 'left') ? null : `${n.right} has no left child to lift`;
}

/** Apply one of the four buttons honestly at the unbalanced node, then recompute every height. */
export function applyChoice(state: PickState, choice: Choice): PickOutcome {
  const w = new Work(state.tree, {});
  const at = state.at;
  const refusal = refusalFor(w, at, choice);
  if (refusal) {
    return { tree: state.tree, touched: [], valid: false, applied: false, refusal, correct: false, unbalanced: unbalancedNodes(state.tree) };
  }
  const parent = w.parentOf(at);
  if (choice === 'left-right') w.rotate('left', w.nodes[at].left as number, at);
  if (choice === 'right-left') w.rotate('right', w.nodes[at].right as number, at);
  w.rotate(choice === 'right' || choice === 'left-right' ? 'right' : 'left', at, parent);
  finishHeights(w.nodes, w.root);
  const tree = w.snapshot();
  const touched = [...new Set(w.rotations.flatMap((r) => [r.down, r.up]))];
  return {
    tree,
    touched: touched.map((key) => ({ key, bf: balanceOf(tree, key) })),
    valid: checkAvl(tree).length === 0,
    applied: true,
    refusal: null,
    correct: sameShape(tree, insertKey(state.base, state.key).tree),
    unbalanced: unbalancedNodes(tree),
  };
}

const sameShape = (a: Tree, b: Tree): boolean => {
  if (a.root !== b.root) return false;
  const ka = Object.keys(a.nodes);
  if (ka.length !== Object.keys(b.nodes).length) return false;
  return ka.every((k) => {
    const x = a.nodes[Number(k)];
    const y = b.nodes[Number(k)];
    return y !== undefined && x.left === y.left && x.right === y.right;
  });
};

/** Keys whose balance factor is outside -1..1, by their real heights. */
export function unbalancedNodes(t: Tree): number[] {
  const real = realHeights(t);
  return Object.values(t.nodes)
    .filter((n) => Math.abs((n.right === null ? 0 : real[n.right]) - (n.left === null ? 0 : real[n.left])) > 1)
    .map((n) => n.key)
    .sort((a, b) => a - b);
}

function realHeights(t: Tree): Record<number, number> {
  const out: Record<number, number> = {};
  const go = (k: number | null): number => {
    if (k === null) return 0;
    out[k] = 1 + Math.max(go(t.nodes[k].left), go(t.nodes[k].right));
    return out[k];
  };
  go(t.root);
  return out;
}
