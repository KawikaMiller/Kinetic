import type { PNode } from './model';

export const LEVEL_GAP = 58;
const COL_W = 52;

/** One drawable node: a non-terminal box or a terminal leaf. */
export interface TNode {
  sym: string;
  text?: string;
  nt: boolean;
  children: string[];
}


/** Flatten a parse tree into id → node, ids being paths ("0", "0.1", …). */
export function fromPNode(tree: PNode, isNt: (s: string) => boolean): { nodes: Record<string, TNode>; root: string } {
  const nodes: Record<string, TNode> = {};
  const walk = (n: PNode, path: string) => {
    nodes[path] = { sym: n.sym, text: n.text, nt: isNt(n.sym), children: n.children.map((_, i) => `${path}.${i}`) };
    n.children.forEach((c, i) => walk(c, `${path}.${i}`));
  };
  walk(tree, '0');
  return { nodes, root: '0' };
}

const leaves = (nodes: Record<string, TNode>, id: string): number => (nodes[id].children.length ? nodes[id].children.reduce((s, c) => s + leaves(nodes, c), 0) : 1);
const depth = (nodes: Record<string, TNode>, id: string): number => 1 + Math.max(0, ...nodes[id].children.map((c) => depth(nodes, c)));

/** The tree's natural drawing size, for WideRegion minimums. */
export function treeSize(nodes: Record<string, TNode>, root: string) {
  return { width: Math.max(300, leaves(nodes, root) * COL_W + 60), height: depth(nodes, root) * LEVEL_GAP + 40 };
}

