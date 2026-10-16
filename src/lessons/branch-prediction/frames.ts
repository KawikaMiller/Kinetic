/** The step-player frames: one per branch for the lab, one per cycle for the speculation strip. */
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { labIntro, labTotals, speculationCaption, stepCaption } from './captions';
import type { PredictorKind, Step } from './predictor';
import { speculation } from './scenarios';

export interface LabFrame extends Frame {
  /** Index of the branch shown, or -1 before the first one. */
  i: number;
}

export function labFrames(kind: PredictorKind, steps: readonly Step[], penalty: number, every: number): LabFrame[] {
  const r = createRecorder<LabFrame>({ i: -1 });
  r.snap(labIntro(kind, steps.length));
  steps.forEach((step, i) => {
    r.snap(stepCaption(step, penalty, labTotals(steps.slice(0, i + 1), penalty, every)), step.hit ? 0.6 : 1, { i });
  });
  return r.frames;
}

export interface StripFrameState extends Frame {
  /** 1..depth are fetch cycles; depth + 1 is the resolution; depth + 2 is the summary. */
  cycle: number;
}

export function speculationFrames(depth: number, guessRight: boolean): StripFrameState[] {
  const r = createRecorder<StripFrameState>({ cycle: 1 });
  for (let cycle = 1; cycle <= depth; cycle++) {
    r.snap(
      cycle === 1
        ? 'The branch is fetched. The CPU does not know its outcome yet, so it guesses and keeps fetching down the guessed path.'
        : cycle < depth
          ? `Cycle ${cycle}: another instruction is fetched on the guess (speculative, not yet known to be right).`
          : `Cycle ${cycle}: the branch reaches the stage that resolves it.`,
      undefined,
      { cycle },
    );
  }
  const s = speculation(depth, guessRight);
  r.snap(speculationCaption(s), 2, { cycle: depth + 1 });
  return r.frames;
}
