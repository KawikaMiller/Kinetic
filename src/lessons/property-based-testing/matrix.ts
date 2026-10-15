/**
 * Scene 3: which properties catch which bugs. Every cell really runs MATRIX_CASES seeded cases
 * of one property against one function; nothing here is typed in.
 */
import { type GenConfig } from './generator';
import { forAll } from './runner';
import { ALL_PROPS, BUGS, type BugId, type PropId } from './sorts';

export const MATRIX_CASES = 500;
/** The generator every cell uses: shown on screen, never a control. */
export const MATRIX_CONFIG: GenConfig = { range: 'hundred', maxLength: 10, seed: 1 };

export interface Cell {
  bug: BugId;
  prop: PropId;
  /** The case number that first broke the property, or null when none of the 500 did. */
  firstAt: number | null;
}

/** Run one function against one property for MATRIX_CASES cases. */
export function runCell(bug: BugId, prop: PropId, config: GenConfig = MATRIX_CONFIG): Cell {
  const fn = BUGS.find((b) => b.id === bug)!.fn;
  const run = forAll(fn, [prop], config, MATRIX_CASES);
  return { bug, prop, firstAt: run.failure ? run.failure.k : null };
}

export function buildMatrix(config: GenConfig = MATRIX_CONFIG): Cell[] {
  return BUGS.flatMap((b) => ALL_PROPS.map((p) => runCell(b.id, p, config)));
}

/** Which of the buggy functions survive every property in the suite (no ticked property caught them)? */
export function survivors(matrix: readonly Cell[], suite: readonly PropId[]): BugId[] {
  return BUGS.filter((b) => b.id !== 'correct')
    .filter((b) => !matrix.some((c) => c.bug === b.id && suite.includes(c.prop) && c.firstAt !== null))
    .map((b) => b.id);
}
