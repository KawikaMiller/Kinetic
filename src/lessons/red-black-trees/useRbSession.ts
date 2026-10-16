import type { OpSessionModel, OpStart } from '../../core/opSession';
import { useOpSession } from '../../core/useOpSession';
import { rbFrames, type RbFrame } from './frames';
import { hasKey, sizeOf, type RbTree } from './model';

export type RbStart = OpStart<RbTree>;

const RB_SESSION: OpSessionModel<RbTree, RbFrame> = {
  run: ({ base, op, key }) => rbFrames(base, op, key),
  sizeOf,
  hasKey,
};

/** The stepper session of the red-black scenes: the frames of the latest insert or delete and the tree they end with. */
export const useRbSession = (initial: () => RbStart) => useOpSession(RB_SESSION, initial);
