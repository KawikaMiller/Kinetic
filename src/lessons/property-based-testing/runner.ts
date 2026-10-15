/**
 * The teaching runner: a seeded `forAll` loop and a shrinker, written to be read. It is a toy,
 * not fast-check: real libraries shrink more cleverly. Pure functions, no React.
 */
import { DEFAULT_CASES, generate, type GenConfig } from './generator';
import { failedProperties, type PropId, type Sorter } from './sorts';

export interface CaseResult {
  /** 1-based case number. */
  k: number;
  input: number[];
  output: number[];
  failed: PropId[];
}

export interface RunResult {
  /** Every case run, up to and including the first failure. */
  cases: CaseResult[];
  /** The first failing case, or null when all of them passed. */
  failure: CaseResult | null;
}

/** Run up to `count` cases and stop at the first one that breaks a ticked property. */
export function forAll(sort: Sorter, props: readonly PropId[], config: GenConfig, count: number = DEFAULT_CASES): RunResult {
  const cases: CaseResult[] = [];
  for (let k = 1; k <= count; k++) {
    const input = generate(config, k);
    const failed = failedProperties(props, input, sort);
    const result = { k, input, output: sort([...input]), failed };
    cases.push(result);
    if (failed.length > 0) return { cases, failure: result };
  }
  return { cases, failure: null };
}

/** Candidate evaluations the shrinker may spend before it gives up. */
export const SHRINK_STEP_LIMIT = 500;

/** The one-step simplifications of a failing input, in the order the shrinker tries them. */
export function shrinkCandidates(xs: readonly number[]): number[][] {
  const out: number[][] = [];
  if (xs.length > 1) out.push(xs.slice(0, Math.ceil(xs.length / 2)));
  for (let i = 0; i < xs.length; i++) out.push([...xs.slice(0, i), ...xs.slice(i + 1)]);
  for (let i = 0; i < xs.length; i++) {
    const half = Math.trunc(xs[i] / 2) + 0; // + 0 turns a -0 into 0
    if (half !== xs[i]) out.push(xs.map((v, j) => (j === i ? half : v)));
  }
  // The shorter prefix can equal dropping the last element: try each distinct candidate once.
  const seen = new Set<string>();
  return out.filter((c) => {
    const key = c.join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface ShrinkStep {
  /** The failing input the candidate was derived from. */
  from: number[];
  candidate: number[];
  /** True when the candidate still fails, so the shrinker moves to it. */
  accepted: boolean;
}

export interface ShrinkResult {
  original: number[];
  minimal: number[];
  steps: ShrinkStep[];
  /** True when the step limit ended the search before a local minimum was reached. */
  hitLimit: boolean;
}

/** How a shrinker finds a smaller failing input: swappable so a test can plant a broken one. */
export type Shrinker = (failing: readonly number[], stillFails: (xs: readonly number[]) => boolean) => ShrinkResult;

/**
 * Greedy shrinking: try the candidates in order, move to the first that still fails, start
 * over from there, and stop when no candidate fails (a local minimum) or the step limit hits.
 */
export const shrink: Shrinker = (failing, stillFails) => {
  let current = [...failing];
  const steps: ShrinkStep[] = [];
  for (;;) {
    let moved = false;
    for (const candidate of shrinkCandidates(current)) {
      if (steps.length >= SHRINK_STEP_LIMIT) return { original: [...failing], minimal: current, steps, hitLimit: true };
      const accepted = stillFails(candidate);
      steps.push({ from: current, candidate, accepted });
      if (accepted) {
        current = candidate;
        moved = true;
        break;
      }
    }
    if (!moved) return { original: [...failing], minimal: current, steps, hitLimit: false };
  }
};

/** Does this input break at least one of the ticked properties? */
export const failsAny = (sort: Sorter, props: readonly PropId[]) => (xs: readonly number[]) => failedProperties(props, xs, sort).length > 0;

/** Find the first failure for a configuration and shrink it, or null when no case fails. */
export function findAndShrink(sort: Sorter, props: readonly PropId[], config: GenConfig, shrinker: Shrinker = shrink): { run: RunResult; shrunk: ShrinkResult } | null {
  const run = forAll(sort, props, config);
  if (!run.failure) return null;
  return { run, shrunk: shrinker(run.failure.input, failsAny(sort, props)) };
}
