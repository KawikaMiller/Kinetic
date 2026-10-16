import { POINTERS, rangeOf, type DefenceId, type IntType } from './ub';

export type SceneId = 'overflow' | 'null' | 'classify' | 'defences';

const START_TYPE: IntType = { width: 32, signed: true };

/** The legality argument, one sentence per step. Steps 3 and 4 name the maximum of the current width. */
export const STEPS = 4;

export const OPENING = {
  scene: 'overflow' as SceneId,
  overflow: { type: START_TYPE, x: rangeOf(START_TYPE).max, step: 1, note: null as string | null },
  pointer: { address: POINTERS[1].address },
  defence: { id: 'none' as DefenceId, x: rangeOf(START_TYPE).max },
};
