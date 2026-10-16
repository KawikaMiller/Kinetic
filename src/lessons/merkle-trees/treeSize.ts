import type { MNode } from './merkle';

export const TREE_WIDTH = 640;
export const TREE_HEIGHT = 300;
/** The narrowest container at which the 9px hash labels still render at 8px or more. */
export const TREE_MIN_WIDTH = 580;

export function depthOf(n: MNode): number {
  return n.left ? 1 + Math.max(depthOf(n.left), depthOf(n.right!)) : 0;
}
