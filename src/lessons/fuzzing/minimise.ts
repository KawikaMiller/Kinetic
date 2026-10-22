/**
 * Delta debugging on a crashing input: drop chunks while it still fails, with smaller chunks when nothing
 * more can go. The result is 1-minimal (removing any single byte stops the failure). "Still fails" here
 * means crashing at the same site, so a minimised input stays in its bucket.
 */
import { runTarget, type BranchId, type TargetOptions } from './target';

/** Safety cap on test runs: the longest input is MAX_INPUT_BYTES, so this is never reached; it stops a bug in a caller from looping. */
export const MINIMISE_TEST_CAP = 5_000;

export interface MinimiseStep {
  /** The input before this step's removal. */
  before: number[];
  /** The chunk tried: bytes [from, to) of `before`. */
  from: number;
  to: number;
  /** Chunks per pass at this point (the granularity). */
  chunks: number;
  /** The input without the chunk still failed, so the chunk was dropped. */
  kept: boolean;
}

export interface Minimised {
  result: number[];
  steps: MinimiseStep[];
}

/** True when the input crashes at `site` under `target`. */
export const crashesAt = (bytes: readonly number[], site: BranchId, target: TargetOptions): boolean => {
  const out = runTarget(bytes, target).outcome;
  return out.kind === 'crash' && out.site === site;
};

export function minimise(input: readonly number[], fails: (bytes: readonly number[]) => boolean): Minimised {
  const steps: MinimiseStep[] = [];
  let current = [...input];
  let chunks = 2;
  while (current.length >= 2 && steps.length < MINIMISE_TEST_CAP) {
    const size = Math.ceil(current.length / chunks);
    let reduced = false;
    for (let from = 0; from < current.length; from += size) {
      const to = Math.min(current.length, from + size);
      const without = [...current.slice(0, from), ...current.slice(to)];
      const kept = without.length > 0 && fails(without);
      steps.push({ before: current, from, to, chunks, kept });
      if (kept) {
        current = without;
        chunks = Math.max(chunks - 1, 2);
        reduced = true;
        break;
      }
    }
    if (!reduced) {
      if (chunks >= current.length) break;
      chunks = Math.min(current.length, chunks * 2);
    }
  }
  return { result: current, steps };
}
