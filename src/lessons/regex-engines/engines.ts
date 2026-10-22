/**
 * What the two kinds of engine do on this lesson's patterns: the growth table, the work series that sets the
 * backtracker's step count beside the NFA's, and the leftmost-first versus longest answer. The engines
 * themselves live in `core/regex`.
 */
import {
  buildNfa, matchAt, parsePattern, runNfa, searchLeftmost, subsetSizes, candidateMatches,
  type BacktrackResult, type Construction, type ParsedRegex,
} from '../../core/regex';

/** The cap on the backtracking matcher's work, after which the stage says it did not finish. */
export const STEP_BUDGET = 100_000;

export const GROWTH_MAX_K = 4;

/** Patterns of the form `[ab]*a` followed by k copies of `[ab]` ("a is k+1 from the end"): their NFA grows by one step each, their DFA doubles. Built by the subset construction, not typed. */
export function growthTable(): { k: number; pattern: string; nfaStates: number; dfaStates: number }[] {
  return Array.from({ length: GROWTH_MAX_K + 1 }, (_, k) => {
    const pattern = `[ab]*a${'[ab]'.repeat(k)}`;
    const parsed = parsePattern(pattern);
    if (!parsed.ok) throw new Error(`growth pattern ${pattern} must parse`);
    const built = buildNfa(parsed.value);
    if (!built.ok) throw new Error(`growth pattern ${pattern} must build`);
    return { k, pattern, ...subsetSizes(built.value) };
  });
}

export interface WorkPoint {
  /** Subject length. */
  n: number;
  /** NFA states processed (null for a pattern with a back-reference, which has no NFA). */
  nfa: number | null;
  /** Backtracking steps, or the budget when it ran out. */
  backtracking: number;
  exhausted: boolean;
}

/** Full-match work for every prefix of the subject, for both engines. */
export function workSeries(parsed: ParsedRegex, built: Construction | null, subject: readonly string[]): WorkPoint[] {
  return Array.from({ length: subject.length + 1 }, (_, n) => {
    const prefix = subject.slice(0, n);
    const bt = matchAt(parsed.root, prefix, 0, { budget: STEP_BUDGET, mustEnd: true });
    return { n, nfa: built ? runNfa(built, prefix, 'full').work : null, backtracking: bt.steps, exhausted: bt.status === 'budget' };
  });
}

/** The leftmost-first match the backtracking engine returns, as a span. */
export function leftmostFirst(parsed: ParsedRegex, subject: readonly string[]): BacktrackResult {
  return searchLeftmost(parsed.root, subject, { budget: STEP_BUDGET });
}

export interface WhichAnswer {
  /** The span each rule picks, or null for no match. */
  first: { start: number; end: number } | null;
  /** True when the backtracking matcher hit STEP_BUDGET: `first` is then null because it never finished, not because nothing matches. */
  firstExhausted: boolean;
  longest: { start: number; end: number } | null;
  /** Every end the NFA allows from the leftmost start. */
  ends: number[];
}

/** Both rules on one subject: the backtracker's first success, and the longest end any accepting run reaches from the leftmost start. */
export function whichAnswer(c: Construction, parsed: ParsedRegex, subject: readonly string[]): WhichAnswer {
  const cand = candidateMatches(c, subject);
  const bt = leftmostFirst(parsed, subject);
  return {
    firstExhausted: bt.status === 'budget',
    first: bt.status === 'match' ? { start: bt.start, end: bt.end } : null,
    longest: cand ? { start: cand.start, end: Math.max(...cand.ends) } : null,
    ends: cand?.ends ?? [],
  };
}
