import { logCheckpoints } from '../../core/stats';
import { mulberry32, shuffle } from '../../core/random';
import { mean } from '../../core/sim';
import { AvlRef } from './avlRef';
import { EMPTY_RB, heightOf, insertKey, removeKey, type RbTree } from './model';

/** Keys inserted, then deleted again: 1,023 is a perfect tree of height 10. */
export const COMPARE_N = 1023;
export const COMPARE_SEED = 5;
export type Order = 'random' | 'sorted';

export interface OpStats {
  /** Rotations per operation: the largest and the mean over the operations of the phase. */
  maxRotations: number;
  meanRotations: number;
}

export interface Comparison {
  /** Sizes sampled while inserting, and the height of each tree at them. */
  n: number[];
  rbHeight: number[];
  avlHeight: number[];
  rb: { insert: OpStats; remove: OpStats; insertRecolors: number; removeRecolors: number };
  avl: { insert: OpStats; remove: OpStats };
}

const stats = (xs: number[]): OpStats => ({ maxRotations: Math.max(...xs), meanRotations: mean(xs) });

/**
 * The same keys into a red-black tree and an AVL tree, then out again in a shuffled order: height while
 * growing, and rotations per operation in each phase. A rotation is one left or right rotation (an AVL
 * double rotation counts as two); a recolour is one colour flip and only the red-black tree has them.
 */
export function compareRuns(order: Order, seed: number, size = COMPARE_N): Comparison {
  const keys = Array.from({ length: size }, (_, i) => i + 1);
  const insertOrder = order === 'sorted' ? keys : shuffle(keys, mulberry32(seed));
  const deleteOrder = shuffle(keys, mulberry32(seed + 1));
  const at = new Set(logCheckpoints(size, 12));
  let rb: RbTree = EMPTY_RB;
  const avl = new AvlRef();
  const n: number[] = [];
  const rbHeight: number[] = [];
  const avlHeight: number[] = [];
  const rbIns: number[] = [];
  const avlIns: number[] = [];
  let rbInsRecolors = 0;
  insertOrder.forEach((key, i) => {
    const r = insertKey(rb, key);
    rb = r.tree;
    rbIns.push(r.rotations.length);
    rbInsRecolors += r.recolors;
    avlIns.push(avl.insert(key));
    if (at.has(i + 1)) {
      n.push(i + 1);
      rbHeight.push(heightOf(rb));
      avlHeight.push(avl.height);
    }
  });
  const rbDel: number[] = [];
  const avlDel: number[] = [];
  let rbDelRecolors = 0;
  for (const key of deleteOrder) {
    const r = removeKey(rb, key);
    rb = r.tree;
    rbDel.push(r.rotations.length);
    rbDelRecolors += r.recolors;
    avlDel.push(avl.remove(key));
  }
  return {
    n,
    rbHeight,
    avlHeight,
    rb: { insert: stats(rbIns), remove: stats(rbDel), insertRecolors: rbInsRecolors / size, removeRecolors: rbDelRecolors / size },
    avl: { insert: stats(avlIns), remove: stats(avlDel) },
  };
}
