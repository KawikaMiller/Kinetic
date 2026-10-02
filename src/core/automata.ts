/**
 * Finite automata: DFAs, NFAs with ε-moves, the subset construction and maximal munch.
 * Pure data and functions, so lessons (dfa-nfa, lexing-tokens; later regex-engines) build
 * their frames from what these return.
 *
 * A missing DFA transition means the machine dies (rejects): that's the usual "dead state"
 * drawn implicitly. Minimisation is deliberately not here (T3 chomsky-hierarchy).
 */

export type State = string;

/** The key an NFA uses for ε (empty-string) moves. */
export const EPSILON = 'ε';

export interface Dfa {
  kind: 'dfa';
  states: readonly State[];
  alphabet: readonly string[];
  start: State;
  accept: readonly State[];
  /** delta[state][symbol] = next state; a missing entry means "dies". */
  delta: Readonly<Record<State, Readonly<Record<string, State>>>>;
}

export interface Nfa {
  kind: 'nfa';
  states: readonly State[];
  alphabet: readonly string[];
  start: State;
  accept: readonly State[];
  /** delta[state][symbol] = possible next states; `EPSILON` for ε-moves. */
  delta: Readonly<Record<State, Readonly<Record<string, readonly State[]>>>>;
}

/** One DFA move. Null when the state is already dead or has no transition on `symbol`. */
export function dfaStep(dfa: Dfa, state: State | null, symbol: string): State | null {
  if (state === null) return null;
  return dfa.delta[state]?.[symbol] ?? null;
}

/** Every state visited reading `input` (path[0] is the start), and whether it ends accepting. */
export function dfaRun(dfa: Dfa, input: string): { path: (State | null)[]; accepted: boolean } {
  const path: (State | null)[] = [dfa.start];
  let state: State | null = dfa.start;
  for (const ch of input) {
    state = dfaStep(dfa, state, ch);
    path.push(state);
  }
  return { path, accepted: state !== null && dfa.accept.includes(state) };
}

/** Sorted, de-duplicated state list: the canonical form for sets of NFA states. */
const canonical = (states: Iterable<State>) => [...new Set(states)].sort();

/** Every state reachable from `states` by ε-moves alone (including the states themselves). */
export function epsilonClosure(nfa: Nfa, states: Iterable<State>): State[] {
  const seen = new Set<State>();
  const stack = [...states];
  while (stack.length) {
    const s = stack.pop()!;
    if (seen.has(s)) continue;
    seen.add(s);
    for (const next of nfa.delta[s]?.[EPSILON] ?? []) if (!seen.has(next)) stack.push(next);
  }
  return canonical(seen);
}

/** One NFA move on `symbol` from a set of states, followed by the ε-closure. */
export function nfaStep(nfa: Nfa, states: readonly State[], symbol: string): State[] {
  const moved: State[] = [];
  for (const s of states) moved.push(...(nfa.delta[s]?.[symbol] ?? []));
  return epsilonClosure(nfa, moved);
}

/** The set of current states after each symbol (steps[0] is the start closure). */
export function nfaRun(nfa: Nfa, input: string): { steps: State[][]; accepted: boolean } {
  const steps: State[][] = [epsilonClosure(nfa, [nfa.start])];
  for (const ch of input) steps.push(nfaStep(nfa, steps[steps.length - 1], ch));
  const last = steps[steps.length - 1];
  return { steps, accepted: last.some((s) => nfa.accept.includes(s)) };
}

/** Does the machine accept the whole of `input`? */
export function accepts(machine: Dfa | Nfa, input: string): boolean {
  return machine.kind === 'dfa' ? dfaRun(machine, input).accepted : nfaRun(machine, input).accepted;
}

/** The name the subset construction gives a set of NFA states: "{A,B}", or "∅" for none. */
export const subsetName = (states: readonly State[]) => (states.length ? `{${states.join(',')}}` : '∅');

/** One filled-in cell of the subset table, in the order the construction discovered it. */
export interface SubsetRow {
  from: State[];
  symbol: string;
  to: State[];
  /** `to` hadn't been seen before this row, so it became a new DFA state. */
  isNew: boolean;
}

/**
 * The subset (powerset) construction: an equivalent DFA whose states are sets of NFA states.
 * Returns the DFA, the table rows in discovery order (for the animation), and which NFA
 * states each DFA state stands for. The empty set "∅" appears only if it's reachable.
 */
export function subsetConstruct(nfa: Nfa): { dfa: Dfa; rows: SubsetRow[]; members: Record<State, State[]> } {
  const start = epsilonClosure(nfa, [nfa.start]);
  const members: Record<State, State[]> = { [subsetName(start)]: start };
  const order = [subsetName(start)];
  const delta: Record<State, Record<string, State>> = {};
  const rows: SubsetRow[] = [];
  for (let i = 0; i < order.length; i++) {
    const name = order[i];
    const from = members[name];
    delta[name] = {};
    for (const symbol of nfa.alphabet) {
      const to = nfaStep(nfa, from, symbol);
      const toName = subsetName(to);
      const isNew = !(toName in members);
      if (isNew) {
        members[toName] = to;
        order.push(toName);
      }
      delta[name][symbol] = toName;
      rows.push({ from, symbol, to, isNew });
    }
  }
  const accept = order.filter((n) => members[n].some((s) => nfa.accept.includes(s)));
  return {
    dfa: { kind: 'dfa', states: order, alphabet: nfa.alphabet, start: order[0], accept, delta },
    rows,
    members,
  };
}

/**
 * Maximal munch: the longest non-empty prefix of `input` starting at `from` that the DFA
 * accepts, as the end index (exclusive) and the accepting state it stopped in. Null when no
 * non-empty prefix is accepted. `steps` counts the characters read, including the ones
 * read past the last accepting point (what a lexer actually scans).
 */
export function longestMatch(
  dfa: Dfa,
  input: string,
  from = 0,
): { end: number; state: State; steps: number } | null {
  let state: State | null = dfa.start;
  let best: { end: number; state: State } | null = null;
  let i = from;
  for (; i < input.length && state !== null; i++) {
    state = dfaStep(dfa, state, input[i]);
    if (state !== null && dfa.accept.includes(state)) best = { end: i + 1, state };
  }
  return best ? { ...best, steps: i - from } : null;
}
