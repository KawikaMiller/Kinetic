/**
 * Twenty questions, pure: a yes/no question tree over a fixed distribution of 8 items. A node is a
 * set of items still possible; a question splits it into the items answering yes and the rest. The
 * expected number of questions is the probability-weighted depth of the leaves. The optimal tree
 * is Huffman's merge, and its cost is never below the entropy.
 */
import { buildHuffman } from '../../core/huffman';
import type { Result } from '../../core/result';
import { entropy } from '../../core/entropy';

export const ITEMS: readonly { label: string; p: number }[] = [
  { label: 'A', p: 0.35 },
  { label: 'B', p: 0.2 },
  { label: 'C', p: 0.15 },
  { label: 'D', p: 0.1 },
  { label: 'E', p: 0.08 },
  { label: 'F', p: 0.06 },
  { label: 'G', p: 0.04 },
  { label: 'H', p: 0.02 },
];
export const ITEM_PROBS: readonly number[] = ITEMS.map((i) => i.p);

export interface QNode {
  /** Indices into the item list that are still possible here. */
  items: number[];
  yes?: QNode;
  no?: QNode;
}

/** A path from the root: 0 goes to the yes child, 1 to the no child. */
export type QPath = readonly (0 | 1)[];
export const pathKey = (path: QPath): string => path.join('');

export const rootNode = (n: number): QNode => ({ items: Array.from({ length: n }, (_, i) => i) });

export const mass = (items: readonly number[], probs: readonly number[] = ITEM_PROBS): number => items.reduce((s, i) => s + probs[i], 0);

const nodeAt = (tree: QNode, path: QPath): QNode | null => path.reduce<QNode | null>((n, step) => (n ? (step === 0 ? n.yes : n.no) ?? null : null), tree);

/** A copy of the tree with the node at `path` replaced by `fn(node)`. */
function replaceAt(tree: QNode, path: QPath, fn: (n: QNode) => QNode): QNode {
  if (path.length === 0) return fn(tree);
  const [step, ...rest] = path;
  return step === 0 ? { ...tree, yes: replaceAt(tree.yes!, rest, fn) } : { ...tree, no: replaceAt(tree.no!, rest, fn) };
}

/** Asks "is it one of these?" at the node on `path`: the chosen items go to yes, the others to no. */
export function split(tree: QNode, path: QPath, yesItems: readonly number[]): Result<QNode> {
  const node = nodeAt(tree, path);
  if (!node) return { ok: false, error: 'There is no such set to split.' };
  if (node.yes) return { ok: false, error: 'That set is already split.' };
  const yes = node.items.filter((i) => yesItems.includes(i));
  if (yes.length === 0) return { ok: false, error: 'Pick at least one item for the yes side.' };
  if (yes.length === node.items.length) return { ok: false, error: 'Leave at least one item for the no side: a question everyone answers yes to learns nothing.' };
  const no = node.items.filter((i) => !yes.includes(i));
  return { ok: true, value: replaceAt(tree, path, (n) => ({ ...n, yes: { items: yes }, no: { items: no } })) };
}

export interface Leaf {
  item: number;
  depth: number;
}

/** The single-item leaves with their depth (questions asked to reach them). Unsplit multi-item sets are not leaves. */
export function leaves(tree: QNode, depth = 0): Leaf[] {
  if (tree.yes && tree.no) return [...leaves(tree.yes, depth + 1), ...leaves(tree.no, depth + 1)];
  return tree.items.length === 1 ? [{ item: tree.items[0], depth }] : [];
}

/** The unsplit sets that still hold more than one item, with their paths, in yes-first order. */
export function openSets(tree: QNode, path: QPath = []): { path: QPath; items: number[] }[] {
  if (tree.yes && tree.no) return [...openSets(tree.yes, [...path, 0]), ...openSets(tree.no, [...path, 1])];
  return tree.items.length > 1 ? [{ path, items: tree.items }] : [];
}

/** Expected questions: the sum of p x depth over the leaves, or null while any set still has two or more items. */
export function expectedQuestions(tree: QNode, probs: readonly number[] = ITEM_PROBS): number | null {
  if (openSets(tree).length > 0) return null;
  return leaves(tree).reduce((s, l) => s + probs[l.item] * l.depth, 0);
}

/** Split every set in half by item count, in the order the items are listed (yes gets the larger half). */
export function evenByCount(items: readonly number[]): QNode {
  if (items.length <= 1) return { items: [...items] };
  const half = Math.ceil(items.length / 2);
  return { items: [...items], yes: evenByCount(items.slice(0, half)), no: evenByCount(items.slice(half)) };
}

/** The Huffman tree as a question tree: the lighter merged child answers yes. */
export function optimalTree(probs: readonly number[] = ITEM_PROBS): QNode {
  const h = buildHuffman(probs.map((weight, i) => ({ sym: String(i), weight })), 'old');
  const build = (id: number): QNode => {
    const n = h.nodes[id];
    if (n.sym !== undefined) return { items: [Number(n.sym)] };
    const yes = build(n.left!);
    const no = build(n.right!);
    return { items: [...yes.items, ...no.items].sort((a, b) => a - b), yes, no };
  };
  return build(h.root);
}

/** The yes-set whose probability mass is closest to half of the node's mass (ties: the smaller bit pattern). */
export function balancedYesSet(items: readonly number[], probs: readonly number[] = ITEM_PROBS): number[] {
  const total = mass(items, probs);
  let best: number[] = [items[0]];
  let bestGap = Infinity;
  for (let m = 1; m < 2 ** items.length - 1; m++) {
    const subset = items.filter((_, b) => (m >> b) & 1);
    const gap = Math.abs(mass(subset, probs) - total / 2);
    if (gap < bestGap - 1e-12) [best, bestGap] = [subset, gap];
  }
  return best;
}

/** The hint: split the first open set by probability mass, or refuse when the tree is finished. */
export function hintSplit(tree: QNode, probs: readonly number[] = ITEM_PROBS): Result<QNode> {
  const open = openSets(tree)[0];
  if (!open) return { ok: false, error: 'Every set is down to one item: nothing left to split.' };
  return split(tree, open.path, balancedYesSet(open.items, probs));
}

export const ITEM_ENTROPY = entropy(ITEM_PROBS);

/** The optimal expected number of questions (the Huffman average), the figure a learner tree is measured against. */
export const OPTIMAL_QUESTIONS = expectedQuestions(optimalTree())!;
