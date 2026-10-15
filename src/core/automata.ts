/**
 * Finite automata: DFAs, NFAs with ε-moves, the subset construction and maximal munch.
 * Pure data and functions, so lessons (dfa-nfa, lexing-tokens; later regex-engines) build
 * their frames from what these return.
 *
 * A missing DFA transition means the machine dies (rejects): that's the usual "dead state"
 * drawn implicitly. A DFA row may also carry an `OTHER` arrow for every symbol outside the
 * alphabet (a lexer's "any other character"). Minimisation is deliberately not here (T3 chomsky-hierarchy).
 */

export type State = string;

/** The key an NFA uses for ε (empty-string) moves. */
export const EPSILON = 'ε';

/**
 * DFA transition key for "any symbol outside the alphabet". Symbols in the alphabet never take
 * it (no arrow on one of those still means "dies"), so a row can say "anything but newline" as
 * explicit arrows for the alphabet minus '
' plus an OTHER arrow. Never a single character,
 * so it can't collide with an input symbol.
 */
export const OTHER = 'other';

export interface Dfa {
  kind: 'dfa';
  states: readonly State[];
  alphabet: readonly string[];
  start: State;
  accept: readonly State[];
  /** delta[state][symbol] = next state; a missing entry means "dies". `OTHER` covers symbols outside the alphabet. */
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

/**
 * One DFA move. Null when the state is already dead or has no transition on `symbol`. A symbol
 * outside the alphabet with no arrow of its own takes the row's `OTHER` arrow, if it has one.
 */
export function dfaStep(dfa: Dfa, state: State | null, symbol: string): State | null {
  if (state === null) return null;
  const row = dfa.delta[state];
  if (!row) return null;
  const own = Object.hasOwn(row, symbol) ? row[symbol] : undefined;
  if (own !== undefined) return own;
  return dfa.alphabet.includes(symbol) ? null : (row[OTHER] ?? null);
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

/** One drawn arrow: every symbol that takes `from` to `to`. */
export interface Edge {
  from: State;
  to: State;
  symbols: string[];
}

/**
 * One arrow per (from, to) pair, labelled with every symbol that takes it, in the order
 * ε (NFA), the alphabet, then `OTHER` (DFA): draw a Dfa or an Nfa without casts.
 */
export function edgesOf(m: Dfa | Nfa): Edge[] {
  const byPair = new Map<string, Edge>();
  const symbols = m.kind === 'nfa' ? [EPSILON, ...m.alphabet] : [...m.alphabet, OTHER];
  for (const from of m.states) {
    const row: Readonly<Record<string, State | readonly State[]>> = m.delta[from] ?? {};
    for (const sym of symbols) {
      const raw = Object.hasOwn(row, sym) ? row[sym] : undefined;
      if (raw === undefined) continue;
      for (const to of typeof raw === 'string' ? [raw] : raw) {
        const key = `${from}\u0000${to}`;
        const e = byPair.get(key) ?? { from, to, symbols: [] };
        e.symbols.push(sym);
        byPair.set(key, e);
      }
    }
  }
  return [...byPair.values()];
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

/**
 * One PDA move: in state `from`, reading `read` ('' = ε) with `pop` on top, go to `to` and push
 * `push` (top first; '' pushes nothing). Every move pops one stack symbol, so a machine that never pops needs a bottom marker.
 */
export interface PdaRule {
  from: State;
  /** One input symbol, or '' for an ε-move. */
  read: string;
  /** The one stack symbol this move pops. */
  pop: string;
  to: State;
  /** Symbols pushed in place of the popped one, the first becoming the new top. */
  push: string;
}

export interface Pda {
  kind: 'pda';
  start: State;
  /** The stack holds just this symbol at the start. */
  bottom: string;
  /** Accepting states, used by `accept: 'final-state'`. */
  accept: readonly State[];
  rules: readonly PdaRule[];
}

/** Where a PDA is: its state, how much input it has read, and its stack (top first, as a string). */
export interface PdaConfig {
  state: State;
  pos: number;
  stack: string;
}

export const pdaStart = (pda: Pda): PdaConfig => ({ state: pda.start, pos: 0, stack: pda.bottom });

const configKey = (c: PdaConfig) => `${c.state}\u0000${c.pos}\u0000${c.stack}`;

/** Every configuration one move away from `c` (one per applicable rule: this is where non-determinism lives). */
export function pdaMoves(pda: Pda, input: string, c: PdaConfig): PdaConfig[] {
  const top = c.stack[0];
  if (top === undefined) return [];
  const next = input[c.pos];
  const out: PdaConfig[] = [];
  for (const r of pda.rules) {
    if (r.from !== c.state || r.pop !== top) continue;
    if (r.read === '') out.push({ state: r.to, pos: c.pos, stack: r.push + c.stack.slice(1) });
    else if (r.read === next) out.push({ state: r.to, pos: c.pos + 1, stack: r.push + c.stack.slice(1) });
  }
  return out;
}

/** One move of a whole set of configurations at once: the live set after it, de-duplicated and sorted for a stable display. */
export function pdaStep(pda: Pda, input: string, configs: readonly PdaConfig[]): PdaConfig[] {
  const seen = new Map<string, PdaConfig>();
  for (const c of configs) for (const n of pdaMoves(pda, input, c)) seen.set(configKey(n), n);
  return [...seen.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, c]) => c);
}

/** How a PDA accepts: in an accepting state with the input used up, or with the stack empty and the input used up. */
export type PdaAcceptMode = 'final-state' | 'empty-stack';

export function pdaAccepting(pda: Pda, input: string, c: PdaConfig, mode: PdaAcceptMode): boolean {
  if (c.pos !== input.length) return false;
  return mode === 'final-state' ? pda.accept.includes(c.state) : c.stack === '';
}

export type PdaOutcome = 'accepted' | 'rejected' | 'budget-exhausted';

export interface PdaRun {
  status: PdaOutcome;
  /** The live set after each move (levels[0] is the start). Stops at acceptance, when the set empties or at the budget. */
  levels: PdaConfig[][];
  /** Distinct configurations generated, the budget's unit. */
  explored: number;
}

/**
 * Breadth-first over configuration sets. Accepts as soon as any live configuration accepts;
 * 'rejected' means every path died; 'budget-exhausted' means `maxConfigs` distinct configurations
 * were generated first, which says nothing about the answer (an ε-move that keeps pushing never ends).
 */
export function pdaRun(pda: Pda, input: string, o: { maxConfigs: number; accept?: PdaAcceptMode }): PdaRun {
  const mode = o.accept ?? 'final-state';
  const seen = new Set<string>();
  let live = [pdaStart(pda)];
  seen.add(configKey(live[0]));
  const levels = [live];
  while (live.length) {
    if (live.some((c) => pdaAccepting(pda, input, c, mode))) return { status: 'accepted', levels, explored: seen.size };
    const fresh = pdaStep(pda, input, live).filter((c) => !seen.has(configKey(c)));
    for (const c of fresh) seen.add(configKey(c));
    if (seen.size > o.maxConfigs) return { status: 'budget-exhausted', levels, explored: seen.size };
    live = fresh;
    if (live.length) levels.push(live);
  }
  return { status: 'rejected', levels, explored: seen.size };
}
