import type { Frame } from '../../core/types';
import { crashStartCaption, minimiseDoneCaption, minimiseStepCaption } from './captions';
import type { FuzzResult } from './fuzzer';
import type { Minimised } from './minimise';

export interface MinimiseFrame extends Frame {
  bytes: number[];
  /** The chunk being tried, [from, to), or null on the first and last frame. */
  chunk: [number, number] | null;
}

/** The minimiser as frames: the input, every chunk tried (kept or put back), the result. */
export function minimiseFrames(run: FuzzResult, input: readonly number[], min: Minimised, site: number): MinimiseFrame[] {
  const start: MinimiseFrame = { bytes: [...input], chunk: null, say: crashStartCaption(run, site, input.length) };
  const steps = min.steps.map<MinimiseFrame>((s) => ({
    bytes: s.before,
    chunk: [s.from, s.to],
    say: minimiseStepCaption(s.from, s.to, s.kept, s.before.length, site),
  }));
  const done: MinimiseFrame = { bytes: min.result, chunk: null, say: minimiseDoneCaption(input.length, min, site) };
  return [start, ...steps, done];
}
