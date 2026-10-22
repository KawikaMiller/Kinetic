/**
 * The ways a run of n letters can be cut into groups by `(a+)+`: the root is "nothing read yet", and from a node
 * that has read k letters the next group can take 1 to n - k of the rest. Every path to n letters is one cut, so
 * the tree has 2^n nodes in all (and 2^(n-1) cuts); the drawing stops at a cap and says how many more there are.
 * This is the choice the matcher faces, computed by enumeration; it is not a replay of the matcher's own calls.
 */

/** Most nodes the drawing shows. */
export const TREE_CAP = 120;

export interface SplitNode {
  id: number;
  parent: number | null;
  /** Letters read when the node is reached. */
  read: number;
  /** Letters the group that led here took (0 for the root). */
  took: number;
}

export interface SplitTree {
  nodes: SplitNode[];
  /** Nodes in the whole tree. */
  total: number;
  /** Complete cuts of all n letters in the whole tree. */
  cuts: number;
}

/** The tree for n letters, breadth first, cut off after `cap` nodes. */
export function splitTree(n: number, cap = TREE_CAP): SplitTree {
  const nodes: SplitNode[] = [{ id: 0, parent: null, read: 0, took: 0 }];
  for (let i = 0; i < nodes.length && nodes.length < cap; i++) {
    const node = nodes[i];
    for (let took = 1; took <= n - node.read && nodes.length < cap; took++) {
      nodes.push({ id: nodes.length, parent: node.id, read: node.read + took, took });
    }
  }
  return { nodes, total: 2 ** n, cuts: n === 0 ? 1 : 2 ** (n - 1) };
}
