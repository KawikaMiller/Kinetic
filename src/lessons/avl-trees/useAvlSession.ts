import { hasKey, sizeOf, type Tree } from '../../core/avl';
import type { OpSessionModel, OpStart } from '../../core/opSession';
import { useOpSession } from '../../core/useOpSession';
import { opFrames, type AvlFrame } from './frames';

export type AvlStart = OpStart<Tree>;

const AVL_SESSION: OpSessionModel<Tree, AvlFrame> = {
  run: ({ base, op, key }) => opFrames(base, op, key),
  sizeOf,
  hasKey,
};

/** The stepper session of the AVL scenes: the frames of the latest insert or delete and the tree they end with. */
export const useAvlSession = (initial: () => AvlStart) => useOpSession(AVL_SESSION, initial);
