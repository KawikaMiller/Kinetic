/**
 * The "you pick the rotation" game of avl-trees: stop an insert at the first unbalanced node, let the
 * learner choose one of four rotations, and judge the result against the correct repair. The AVL tree
 * itself (insert, delete, steps, checks) is `core/avl`.
 */
import { AvlWork, balanceOf, checkAvl, insertKey, type Case, type TNode, type Tree } from '../../core/avl';

/** The four buttons of "you pick the rotation". */
export type Choice = 'right' | 'left' | 'left-right' | 'right-left';

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
function refusalFor(w: AvlWork, at: number, choice: Choice): string | null {
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
  const w = new AvlWork(state.tree, {});
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
