/**
 * What the two kinds of engine do with one pattern and one subject: the NFA simulation (a set of states
 * per character), the subset DFA it could become, and the backtracking matcher's step count beside them.
 */
import { dfaStep, epsilonClosure, nfaStep, subsetName, type Dfa, type State } from '../../core/automata';
import { matchAt, searchLeftmost, type BacktrackResult } from './backtrack';
import { parsePattern, type ParsedRegex } from './regexParse';
import { buildNfa, symbolOf, type Construction } from './thompson';

/** The cap on the backtracking matcher's work, after which the stage says it did not finish. */
export const STEP_BUDGET = 100_000;

export type RunMode = 'full' | 'search';

export interface NfaRun {
  /** The set of states after 0, 1, 2, ... characters (sets[0] is the start closure). */
  sets: State[][];
  /** Whether the accepting state is in each set. */
  accepting: boolean[];
  /** States processed to read the characters: the sum of the set sizes before each character. */
  work: number;
  accepted: boolean;
}

/**
 * Run the NFA as a set of states. `full` asks whether the whole subject matches; `search` restarts at every
 * position (the start state joins the set after every character), so an accepting state means a match ends there.
 */
export function runNfa(c: Construction, subject: readonly string[], mode: RunMode): NfaRun {
  const { nfa } = c;
  const startSet = epsilonClosure(nfa, [nfa.start]);
  const sets: State[][] = [startSet];
  let work = 0;
  for (const ch of subject) {
    const current = sets[sets.length - 1];
    work += current.length;
    const moved = nfaStep(nfa, current, symbolOf(nfa.alphabet, ch));
    sets.push(mode === 'search' ? epsilonClosure(nfa, [...moved, ...startSet]) : moved);
  }
  const accepting = sets.map((s) => s.some((q) => nfa.accept.includes(q)));
  const accepted = mode === 'full' ? accepting[accepting.length - 1] : accepting.some(Boolean);
  return { sets, accepting, work, accepted };
}

/** Every position where a match starting at `start` can end, according to the NFA (all of them, not one preferred). */
export function matchEndsFrom(c: Construction, subject: readonly string[], start: number): number[] {
  const run = runNfa(c, subject.slice(start), 'full');
  return run.accepting.flatMap((ok, i) => (ok ? [start + i] : []));
}

/** The leftmost start with any match, and every end the NFA allows from it. Null when nothing matches anywhere. */
export function candidateMatches(c: Construction, subject: readonly string[]): { start: number; ends: number[] } | null {
  for (let start = 0; start <= subject.length; start++) {
    const ends = matchEndsFrom(c, subject, start);
    if (ends.length) return { start, ends };
  }
  return null;
}

/** Does the DFA accept the subject read as symbols? (A character outside the alphabet kills it.) */
export function dfaAccepts(dfa: Dfa, symbols: readonly string[]): boolean {
  let state: State | null = dfa.start;
  for (const s of symbols) state = dfaStep(dfa, state, s);
  return state !== null && dfa.accept.includes(state);
}

/** The most DFA states the Run scene builds: a typed pattern can need millions (`.*a` and 21 dots), so the construction stops here and says so. */
export const DFA_STATE_CAP = 256;

export interface SubsetSizes {
  nfaStates: number;
  /** The DFA's states, the dead (empty-set) state included; when `capped`, the count where the construction stopped. */
  dfaStates: number;
  /** True when the subset construction passed DFA_STATE_CAP and was abandoned. */
  capped: boolean;
}

/** The subset DFA's size next to the NFA's. Counts the reachable subsets the way `subsetConstruct` does, but gives up past the cap. */
export function subsetSizes(c: Construction, cap = DFA_STATE_CAP): SubsetSizes {
  const { nfa } = c;
  const start = subsetName(epsilonClosure(nfa, [nfa.start]));
  const seen = new Set([start]);
  const queue: State[][] = [epsilonClosure(nfa, [nfa.start])];
  for (let i = 0; i < queue.length; i++) {
    for (const symbol of nfa.alphabet) {
      const to = nfaStep(nfa, queue[i], symbol);
      const name = subsetName(to);
      if (seen.has(name)) continue;
      seen.add(name);
      if (seen.size > cap) return { nfaStates: nfa.states.length, dfaStates: seen.size, capped: true };
      queue.push(to);
    }
  }
  return { nfaStates: nfa.states.length, dfaStates: seen.size, capped: false };
}

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
