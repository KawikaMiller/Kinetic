import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { SHRINK_STEP_LIMIT, type ShrinkResult, type ShrinkStep } from './runner';

export const show = (xs: readonly number[]) => `[${xs.join(', ')}]`;

/** The shrinker's move, in words, read off the candidate and the input it came from. */
export function describeStep(step: ShrinkStep): string {
  const { from, candidate } = step;
  if (candidate.length < from.length) {
    const isPrefix = candidate.every((v, i) => v === from[i]) && candidate.length === Math.ceil(from.length / 2) && from.length > 1;
    if (isPrefix) return `keep the first ${candidate.length} of ${from.length}`;
    const at = candidate.findIndex((v, i) => v !== from[i]);
    const dropped = at < 0 ? from.length - 1 : at;
    return `drop ${from[dropped]} (position ${dropped + 1})`;
  }
  const at = candidate.findIndex((v, i) => v !== from[i]);
  return `halve ${from[at]} to ${candidate[at]} (position ${at + 1})`;
}

export interface LogLine {
  text: string;
  accepted: boolean;
}

export interface ShrinkFrame extends Frame {
  /** The failing input the shrinker is holding. */
  current: number[];
  /** The candidate being tried this frame, or null before the first try and at the end. */
  candidate: number[] | null;
  verdict: 'start' | 'accepted' | 'rejected' | 'done';
  tried: number;
  accepted: number;
  /** The last few tries, newest last. */
  log: LogLine[];
}

const LOG_TAIL = 6;

/** One frame per candidate the shrinker evaluated, plus the start and the end. */
export function shrinkFrames(result: ShrinkResult, caseNumber: number): ShrinkFrame[] {
  const r = createRecorder<ShrinkFrame>({ current: result.original, candidate: null, verdict: 'start', tried: 0, accepted: 0, log: [] });
  r.snap(
    <>
      Case {caseNumber} failed with {plural(result.original.length, 'value')}: <b>{show(result.original)}</b>. The shrinker keeps this input failing while it tries to make it smaller.
    </>,
  );
  result.steps.forEach((step, i) => {
    const tried = i + 1;
    const accepted = result.steps.slice(0, tried).filter((s) => s.accepted).length;
    const log = [...r.get().log.slice(-(LOG_TAIL - 1)), { text: `${describeStep(step)}: ${show(step.candidate)}`, accepted: step.accepted }];
    r.snap(
      <>
        Try to <b>{describeStep(step)}</b>, giving {show(step.candidate)}. It {step.accepted ? <b>still fails</b> : <b>passes</b>}, so the shrinker {step.accepted ? 'accepts it' : 'rejects it'}.
      </>,
      undefined,
      { current: step.from, candidate: step.candidate, verdict: step.accepted ? 'accepted' : 'rejected', tried, accepted, log },
    );
    if (step.accepted) r.set({ current: step.candidate });
  });
  r.set({ candidate: null, verdict: 'done' });
  r.close(
    result.hitLimit ? (
      <>
        The {SHRINK_STEP_LIMIT}-step limit stopped the search at <b>{show(result.minimal)}</b>, so this is not shown to be a smallest failing input.
      </>
    ) : (
      <>
        No single shrink of <b>{show(result.minimal)}</b> still fails: the smallest failing input this shrinker can reach, after {plural(result.steps.length, 'try', 'tries')} (step limit {SHRINK_STEP_LIMIT}).
      </>
    ),
    2,
  );
  return r.frames;
}
