import { BUDGET } from './engines';
import type { FixesState } from './fixes';
import type { PatternId } from './patterns';

export type SceneId = 'counter' | 'shapes' | 'fixes';
export const OPENING_SCENE: SceneId = 'counter';

/** The pattern of the counter scene: the textbook nested repeat. */
export const COUNTER_PATTERN = '(a+)+';
export const COUNTER_MIN = 1;
export const COUNTER_MAX = 24;

/** The input-length cap the fixes scene opens on (characters, `!` included). */
const DEFAULT_CAP = 16;

export interface CounterState {
  /** Letters before the `!`. */
  letters: number;
}

export interface ShapesState {
  pattern: PatternId;
  /** The text typed into the "your text" row. */
  text: string;
}

/** Table rows of the shapes scene. */
export const SHAPES_FROM = 8;
export const SHAPES_TO = 20;

/** Every scene's opening state as a pure function, so a test can switch through them and see none leaks into another. */
export const initialCounter = (): CounterState => ({ letters: 12 });
export const initialShapes = (): ShapesState => ({ pattern: 'exponential', text: `${'a'.repeat(16)}!` });
export const initialFixes = (): FixesState => ({
  pattern: 'exponential',
  letters: 20,
  engine: 'backtracking',
  rewrite: false,
  capOn: false,
  cap: DEFAULT_CAP,
  budget: BUDGET,
});
