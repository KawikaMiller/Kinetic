/** The step-player frames for the comparison scene: one per byte the chosen function visits. */
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { byteStepCaption, compareSummary, lengthMismatchCaption } from './captions';
import { COMPARE_FNS, SECRET_BYTES, type CompareFn } from './compare';

export interface CompareFrame extends Frame {
  /** How many of the visited bytes are lit. */
  shown: number;
}

export function compareFrames(fn: CompareFn, guess: readonly number[], secret: readonly number[] = SECRET_BYTES): CompareFrame[] {
  const result = COMPARE_FNS[fn](secret, guess);
  const r = createRecorder<CompareFrame>({ shown: 0 });
  if (result.lengthMismatch) {
    r.snap(lengthMismatchCaption(guess.length, secret.length));
    return r.frames;
  }
  r.snap('The length check passes. The function now looks at the bytes one at a time.');
  result.visited.forEach((_, k) => r.snap(byteStepCaption(fn, k, secret, guess, result), 1, { shown: k + 1 }));
  r.close(compareSummary(secret, guess, COMPARE_FNS.early(secret, guess), COMPARE_FNS.constant(secret, guess)), 2);
  return r.frames;
}
