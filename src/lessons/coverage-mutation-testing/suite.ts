/**
 * A test suite for the toy function, and what running it against mutants says. Pure functions:
 * the cases are data, "running" a test is the lesson's evaluator, and a mutant is killed when a
 * test's assertion fails on it.
 */
import { parseBoundedInt, type FieldParse } from '../../core/parse';
import { killingInput, generateMutants, isEquivalent, type Mutant } from './mutants';
import { BUGGY, COST, DOMAIN, WEIGHT_MAX, WEIGHT_MIN, intendedCost, runProgram, type Input, type Program } from './program';

export type Mode = 'exact' | 'weak' | 'none';

/** What each mode asserts about a result. */
export const MODE_LABEL: Record<Mode, string> = {
  exact: 'exact value',
  weak: 'weak: returns a number',
  none: 'none: just call it',
};

export interface TestCase extends Input {
  expected: number;
}

export interface Suite {
  mode: Mode;
  cases: TestCase[];
}

export const MAX_CASES = 12;
export const EXPECTED_LIMIT = 1_000_000;

export type CodeVariant = 'cost' | 'buggy';
export const programOf = (v: CodeVariant): Program => (v === 'cost' ? COST : BUGGY);

const sameInput = (a: Input, b: Input) => a.weight === b.weight && a.express === b.express;

/** Parse the weight field: a whole number the toy function is checked on. */
export function parseWeight(text: string): FieldParse<number> {
  return parseBoundedInt(text, {
    min: WEIGHT_MIN,
    max: WEIGHT_MAX,
    messages: {
      empty: 'Type a weight from 0 to 40.',
      invalid: (t) => `"${t}" is not a whole number; this toy function is checked on 0 to 40.`,
      tooSmall: () => 'this toy function is checked on 0 to 40',
      tooBig: () => 'this toy function is checked on 0 to 40',
    },
  });
}

/** Parse an expected value: a whole number within ±1,000,000. */
export function parseExpected(text: string): FieldParse<number> {
  return parseBoundedInt(text, {
    min: -EXPECTED_LIMIT,
    max: EXPECTED_LIMIT,
    typographicMinus: true,
    messages: {
      empty: 'Type the value you expect.',
      invalid: (t) => `"${t}" is not a whole number.`,
      tooSmall: () => `Keep the expected value between −${EXPECTED_LIMIT.toLocaleString('en-US')} and ${EXPECTED_LIMIT.toLocaleString('en-US')}.`,
      tooBig: () => `Keep the expected value between −${EXPECTED_LIMIT.toLocaleString('en-US')} and ${EXPECTED_LIMIT.toLocaleString('en-US')}.`,
    },
  });
}

/**
 * The case a learner adds. Outside the exact mode the expected-value field is hidden, so the stored value is the
 * intended cost rather than a stale number that switching back to exact would suddenly make binding.
 */
export const newCase = (mode: Mode, weight: number, express: boolean, typedExpected: number): TestCase => ({
  weight,
  express,
  expected: mode === 'exact' ? typedExpected : intendedCost(weight, express),
});

export type AddResult = { ok: true; suite: Suite } | { ok: false; error: string };

/** Add a case. The same weight and `express` collapse to one case (the newest expected value wins, in place); a thirteenth case is refused. */
export function addCase(suite: Suite, c: TestCase): AddResult {
  const at = suite.cases.findIndex((x) => sameInput(x, c));
  if (at >= 0) return { ok: true, suite: { ...suite, cases: suite.cases.map((x, i) => (i === at ? c : x)) } };
  if (suite.cases.length >= MAX_CASES) return { ok: false, error: `A suite holds at most ${MAX_CASES} cases.` };
  return { ok: true, suite: { ...suite, cases: [...suite.cases, c] } };
}

export const removeCase = (suite: Suite, index: number): Suite => ({ ...suite, cases: suite.cases.filter((_, i) => i !== index) });

/** Does this assertion fail on this result? */
export function assertionFails(mode: Mode, c: TestCase, result: unknown): boolean {
  if (mode === 'exact') return result !== c.expected;
  if (mode === 'weak') return typeof result !== 'number';
  return false;
}

/** The first case that fails on a program, or null when the whole suite passes. */
export function firstFailure(program: Program, suite: Suite): number | null {
  const i = suite.cases.findIndex((c) => assertionFails(suite.mode, c, runProgram(program, c)));
  return i < 0 ? null : i;
}

/** "Approve the current output as expected": every case's expected value becomes what the code returns now. */
export const approveCurrent = (program: Program, suite: Suite): Suite => ({
  ...suite,
  mode: 'exact',
  cases: suite.cases.map((c) => ({ ...c, expected: runProgram(program, c) as number })),
});

/** Cases whose expected value is not what `cost` is meant to return. Only meaningful for an exact suite. */
export const disagreeingWithIntent = (suite: Suite): TestCase[] =>
  suite.mode === 'exact' ? suite.cases.filter((c) => c.expected !== intendedCost(c.weight, c.express)) : [];

// ── Mutants against a suite ──────────────────────────────────────────────

export type Status = 'killed' | 'survived' | 'equivalent' | 'not-run';

export interface Verdict {
  mutant: Mutant;
  status: Status;
  /** Index of the first case that killed it. */
  killedBy: number | null;
}

/** Everything a program's mutants say about themselves before any suite runs: whether each is equivalent, and an input that kills it. */
export interface Analysis {
  program: Program;
  mutants: Mutant[];
  equivalent: boolean[];
  killing: (Input | null)[];
}

export function analyse(program: Program): Analysis {
  const mutants = generateMutants(program);
  return {
    program,
    mutants,
    equivalent: mutants.map((m) => isEquivalent(program, m.program, DOMAIN)),
    killing: mutants.map((m) => killingInput(program, m.program, DOMAIN)),
  };
}

const ANALYSES: Record<CodeVariant, Analysis> = { cost: analyse(COST), buggy: analyse(BUGGY) };
export const analysisOf = (v: CodeVariant): Analysis => ANALYSES[v];

export interface Report {
  /** False when the suite already fails on the unmutated code: mutation testing needs a passing suite. */
  baselinePasses: boolean;
  verdicts: Verdict[];
  killed: number;
  survived: number;
  equivalent: number;
  total: number;
  /** killed ÷ (total − equivalent), or null when there is nothing to score or the suite does not pass. */
  score: number | null;
}

/** Run every mutant against every case, killing at the first failing assertion. */
export function report(a: Analysis, suite: Suite): Report {
  const baselinePasses = firstFailure(a.program, suite) === null;
  const verdicts: Verdict[] = a.mutants.map((mutant, i) => {
    if (a.equivalent[i]) return { mutant, status: 'equivalent', killedBy: null };
    if (!baselinePasses) return { mutant, status: 'not-run', killedBy: null };
    const killedBy = firstFailure(mutant.program, suite);
    return { mutant, status: killedBy === null ? 'survived' : 'killed', killedBy };
  });
  const count = (s: Status) => verdicts.filter((v) => v.status === s).length;
  const equivalent = count('equivalent');
  const scored = a.mutants.length - equivalent;
  return {
    baselinePasses,
    verdicts,
    killed: count('killed'),
    survived: count('survived'),
    equivalent,
    total: a.mutants.length,
    score: baselinePasses && scored > 0 ? count('killed') / scored : null,
  };
}

/** A test that would kill the survivor: an input where it disagrees with the code, expecting what the code returns now. Null when none exists in the domain. */
export function killingTest(a: Analysis, index: number): TestCase | null {
  const input = a.killing[index];
  return input ? { ...input, expected: runProgram(a.program, input) as number } : null;
}
