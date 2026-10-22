import type { PdaAcceptMode } from '../../core/automata';
import type { PresetId } from './machines';

export type SceneId = 'stepper' | 'duel' | 'build';

/** The build scene opens on the aⁿbⁿ machine (one symbol pushed per a), which does not yet solve the challenge. */
export const ANBN_TABLE = ['q0 a Z -> q0 AZ', 'q0 a A -> q0 AA', 'q0 b A -> q1 -', 'q1 b A -> q1 -', 'q0 - Z -> q2 -', 'q1 - Z -> q2 -'].join('\n');
/** One of many solutions to a^n b^2n: push two symbols per a. */
export const SOLUTION_TABLE = ['q0 a Z -> q0 AAZ', 'q0 a A -> q0 AAA', 'q0 b A -> q1 -', 'q1 b A -> q1 -', 'q0 - Z -> q2 -', 'q1 - Z -> q2 -'].join('\n');
/** The bug: the second b pushes the A straight back, so the stack never empties. */
export const BUG_TABLE = ['q0 a Z -> q0 AAZ', 'q0 a A -> q0 AAA', 'q0 b A -> q1 -', 'q1 b A -> q1 A', 'q0 - Z -> q2 -', 'q1 - Z -> q2 -'].join('\n');

/** What each scene opens on. */
export const OPENING = {
  scene: 'stepper' as SceneId,
  stepper: { preset: 'anbn' as PresetId, subject: 'aaabbb', accept: 'final-state' as PdaAcceptMode },
  duel: { k: 3, n: 4 },
  build: { text: ANBN_TABLE },
};
