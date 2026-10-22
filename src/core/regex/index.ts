/**
 * The regex dialect and its engines: parse a pattern, build its Thompson NFA, run the NFA or the subset DFA,
 * or run the backtracking matcher with a step counter and a trace. See docs/shared-api.md (core/regex).
 */
export * from './parse';
export * from './backtrack';
export * from './thompson';
export * from './automaton';
