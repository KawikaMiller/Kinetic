/**
 * Scene 3: what mutation testing costs, counted in mutant-by-test runs, and how far each
 * way of cutting it goes. All counts come from running the lesson's own mutants and suite.
 */
import { mulberry32, shuffle } from '../../core/random';
import { trace } from './coverage';
import { printProgram } from './print';
import { firstFailure, type Analysis, type Suite } from './suite';

/** The seed behind "sample X% of the mutants": fixed so the same percentage always picks the same mutants. */
export const SAMPLE_SEED = 17;
export const SAMPLE_STEPS = [10, 25, 50, 75, 100] as const;

export interface Counts {
  mutants: number;
  tests: number;
  /** Every mutant against every test. */
  naive: number;
  /** Stop at the first failing test. */
  stopAtKill: number;
  /** Also skip tests that never run the mutated code. */
  coveringOnly: number;
}

/** Tests (by index) that run the node a mutant changed: the others cannot tell it from the original. */
export function coveringTests(a: Analysis, suite: Suite, mutantIndex: number): number[] {
  const path = a.mutants[mutantIndex].path;
  return suite.cases.flatMap((c, i) => (trace(a.program, c).has(path) ? [i] : []));
}

/** Runs one mutant costs when tests stop at the first failure, over the tests allowed. */
function runsFor(a: Analysis, suite: Suite, mutantIndex: number, allowed: readonly number[]): number {
  const m = a.mutants[mutantIndex].program;
  let runs = 0;
  for (const i of allowed) {
    runs++;
    if (firstFailure(m, { ...suite, cases: [suite.cases[i]] }) !== null) return runs;
  }
  return runs;
}

export function countRuns(a: Analysis, suite: Suite, only: readonly number[] = a.mutants.map((_, i) => i)): Counts {
  const all = suite.cases.map((_, i) => i);
  let stopAtKill = 0;
  let coveringOnly = 0;
  for (const i of only) {
    stopAtKill += runsFor(a, suite, i, all);
    coveringOnly += runsFor(a, suite, i, coveringTests(a, suite, i));
  }
  return { mutants: only.length, tests: all.length, naive: only.length * all.length, stopAtKill, coveringOnly };
}

/** The mutants a sample of `percent` runs: the first ceil(percent% of all) of a seeded shuffle, so a bigger sample contains a smaller one. */
export function sampleOf(total: number, percent: number): number[] {
  const order = shuffle(Array.from({ length: total }, (_, i) => i), mulberry32(SAMPLE_SEED));
  return order.slice(0, Math.ceil((total * percent) / 100));
}

/** Mutants whose changed node sits on one of the lines (by index into the printed program), or contains one of them. */
export function mutantsOnLines(a: Analysis, lines: readonly number[]): number[] {
  const anchors = lines.flatMap((l) => {
    const anchor = printProgram(a.program)[l]?.anchor;
    return anchor ? [anchor] : [];
  });
  return a.mutants.flatMap((m, i) => (anchors.some((p) => m.path === p || m.path.startsWith(`${p}.`) || p.startsWith(`${m.path}.`)) ? [i] : []));
}

/** killed ÷ (non-equivalent mutants) among the given mutants, or null when none of them count. */
export function scoreOf(a: Analysis, suite: Suite, only: readonly number[]): number | null {
  const counted = only.filter((i) => !a.equivalent[i]);
  if (counted.length === 0 || firstFailure(a.program, suite) !== null) return null;
  return counted.filter((i) => firstFailure(a.mutants[i].program, suite) !== null).length / counted.length;
}
