// Editing the expression tree from the palette: wrap the picked node in an operator, unwrap
// it, or swap a base relation. Pure; the tree never grows past MAX_NODES so it stays readable.
import { findNode, postOrder, replaceNode, type BinaryOp, type Cond, type Expr, type RelName } from './model';

export const MAX_NODES = 13;

export type Wrap =
  | { op: 'select'; cond: Cond }
  | { op: 'project'; cols: readonly string[] }
  | { op: 'rename'; from: string; to: string }
  | { op: BinaryOp; right: RelName };

/** `k` ids not used anywhere in the tree. */
export function freshIds(e: Expr, k: number): string[] {
  const used = new Set(postOrder(e).map((n) => n.id));
  const out: string[] = [];
  for (let i = 0; out.length < k; i++) if (!used.has(`e${i}`)) out.push(`e${i}`);
  return out;
}

export const nodeCount = (e: Expr) => postOrder(e).length;

/** Room for one more wrap? Unary adds one node, binary two (the operator and its new input). */
export function canWrap(e: Expr, binary: boolean): boolean {
  return nodeCount(e) + (binary ? 2 : 1) <= MAX_NODES;
}

/** Wraps node `id` in the operator; returns the new tree and the wrapper's id (selected next). */
export function wrapNode(tree: Expr, id: string, w: Wrap): { tree: Expr; selected: string } | null {
  const target = findNode(tree, id);
  if (!target) return null;
  const binary = w.op === 'join' || w.op === 'product' || w.op === 'union' || w.op === 'diff';
  if (!canWrap(tree, binary)) return null;
  const [nid, rid] = freshIds(tree, 2);
  let next: Expr;
  switch (w.op) {
    case 'select':
      next = { id: nid, op: 'select', cond: w.cond, input: target };
      break;
    case 'project':
      next = { id: nid, op: 'project', cols: w.cols, input: target };
      break;
    case 'rename':
      next = { id: nid, op: 'rename', from: w.from, to: w.to, input: target };
      break;
    default:
      next = { id: nid, op: w.op, left: target, right: { id: rid, op: 'rel', name: w.right } };
  }
  return { tree: replaceNode(tree, id, next), selected: nid };
}

/** Removes an operator, keeping its (left) input in its place. Base relations can't be removed. */
export function unwrapNode(tree: Expr, id: string): { tree: Expr; selected: string } | null {
  const target = findNode(tree, id);
  if (!target || target.op === 'rel') return null;
  const keep = target.op === 'select' || target.op === 'project' || target.op === 'rename' ? target.input : target.left;
  return { tree: replaceNode(tree, id, keep), selected: keep.id };
}

/** Swaps a base relation for another. */
export function swapRelation(tree: Expr, id: string, name: RelName): Expr {
  const target = findNode(tree, id);
  if (!target || target.op !== 'rel') return tree;
  return replaceNode(tree, id, { ...target, name });
}

/** A new name for ρ: the column with the lowest free number appended (sid → sid2). */
export function renameTarget(col: string, taken: readonly string[]): string {
  let k = 2;
  while (taken.includes(`${col}${k}`)) k++;
  return `${col}${k}`;
}
