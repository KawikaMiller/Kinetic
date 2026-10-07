import { EPSILON, accepts, dfaStep, epsilonClosure, nfaStep, type Dfa, type Nfa, type State } from '../../core/automata';
import type { Pt } from '../../core/graphLayout';

/** A machine the lesson can draw: the automaton plus where each state sits and a name for each symbol. */
export interface Drawn<M extends Dfa | Nfa> {
  id: string;
  label: string;
  /** What the machine accepts, in words. */
  language: string;
  machine: M;
  at: Record<State, Pt>;
  /** Readable names for symbols (the door controller's events). */
  symbolNames?: Record<string, string>;
  /** Example inputs offered as chips. */
  samples: string[];
}

/** The longest input the tape takes. */
export const MAX_INPUT = 20;

// ── DFA presets ──────────────────────────────────────────────────────

/** Binary numbers divisible by 3: the state is the remainder so far; reading bit b takes r to (2r + b) mod 3. */
export const DIV3: Drawn<Dfa> = {
  id: 'div3',
  label: 'Divisible by 3',
  language: 'binary numbers divisible by 3',
  machine: {
    kind: 'dfa',
    states: ['r0', 'r1', 'r2'],
    alphabet: ['0', '1'],
    start: 'r0',
    accept: ['r0'],
    delta: {
      r0: { '0': 'r0', '1': 'r1' },
      r1: { '0': 'r2', '1': 'r0' },
      r2: { '0': 'r1', '1': 'r2' },
    },
  },
  at: { r0: { x: 110, y: 120 }, r1: { x: 280, y: 120 }, r2: { x: 450, y: 120 } },
  samples: ['110', '1001', '111', '10010'],
};

export const CONTAINS_AB: Drawn<Dfa> = {
  id: 'ab',
  label: 'Contains ab',
  language: 'strings containing ab',
  machine: {
    kind: 'dfa',
    states: ['q0', 'q1', 'q2'],
    alphabet: ['a', 'b'],
    start: 'q0',
    accept: ['q2'],
    delta: {
      q0: { a: 'q1', b: 'q0' },
      q1: { a: 'q1', b: 'q2' },
      q2: { a: 'q2', b: 'q2' },
    },
  },
  at: { q0: { x: 110, y: 130 }, q1: { x: 280, y: 130 }, q2: { x: 450, y: 130 } },
  samples: ['bbab', 'aaa', 'ba', 'abba'],
};

/** A UI state machine: a door. A missing transition is an event the door refuses. */
export const DOOR: Drawn<Dfa> = {
  id: 'door',
  label: 'Door controller',
  language: 'event sequences that leave the door shut (closed or locked)',
  machine: {
    kind: 'dfa',
    states: ['closed', 'open', 'locked'],
    alphabet: ['o', 'c', 'l', 'u'],
    start: 'closed',
    accept: ['closed', 'locked'],
    delta: {
      closed: { o: 'open', l: 'locked' },
      open: { c: 'closed' },
      locked: { u: 'closed' },
    },
  },
  at: { closed: { x: 280, y: 150 }, open: { x: 110, y: 150 }, locked: { x: 450, y: 150 } },
  symbolNames: { o: 'open', c: 'close', l: 'lock', u: 'unlock' },
  samples: ['ocl', 'oc', 'lo', 'lucoc'],
};

// ── NFA presets ──────────────────────────────────────────────────────

/** Ends in 01: guess where the final 01 starts. */
export const ENDS_01: Drawn<Nfa> = {
  id: 'ends01',
  label: 'Ends in 01',
  language: 'strings ending in 01',
  machine: {
    kind: 'nfa',
    states: ['A', 'B', 'C'],
    alphabet: ['0', '1'],
    start: 'A',
    accept: ['C'],
    delta: { A: { '0': ['A', 'B'], '1': ['A'] }, B: { '1': ['C'] } },
  },
  at: { A: { x: 110, y: 130 }, B: { x: 280, y: 130 }, C: { x: 450, y: 130 } },
  samples: ['1101', '0110', '01', '0001'],
};

/** "The n-th symbol from the end is 1": n + 1 NFA states, and its DFA needs 2ⁿ. States are named 0..n. */
export function nthFromEnd(n: number): Drawn<Nfa> {
  const names = Array.from({ length: n + 1 }, (_, i) => String(i));
  const delta: Record<State, Record<string, State[]>> = { '0': { '0': ['0'], '1': ['0', '1'] } };
  for (let i = 1; i < n; i++) delta[String(i)] = { '0': [String(i + 1)], '1': [String(i + 1)] };
  const gap = Math.min(170, 440 / Math.max(1, n));
  const at = Object.fromEntries(names.map((s, i) => [s, { x: 60 + i * gap, y: 130 }]));
  return {
    id: `nth${n}`,
    label: n === 3 ? '3rd from end is 1' : `${ordinal(n)} from end is 1`,
    language: `strings whose ${ordinal(n)} symbol from the end is 1`,
    machine: { kind: 'nfa', states: names, alphabet: ['0', '1'], start: '0', accept: [String(n)], delta },
    at,
    samples: ['0100', '1011', '0011', '100'],
  };
}

const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** Union with ε: from S jump (for free) into two small machines, one tracking 0s, one tracking 1s. */
export const EVEN_UNION: Drawn<Nfa> = {
  id: 'union',
  label: 'Even 0s or even 1s (ε)',
  language: 'strings with an even number of 0s or an even number of 1s',
  machine: {
    kind: 'nfa',
    states: ['S', 'E0', 'E1', 'F0', 'F1'],
    alphabet: ['0', '1'],
    start: 'S',
    accept: ['E0', 'F0'],
    delta: {
      S: { [EPSILON]: ['E0', 'F0'] },
      E0: { '0': ['E1'], '1': ['E0'] },
      E1: { '0': ['E0'], '1': ['E1'] },
      F0: { '0': ['F0'], '1': ['F1'] },
      F1: { '0': ['F1'], '1': ['F0'] },
    },
  },
  at: { S: { x: 70, y: 135 }, E0: { x: 240, y: 60 }, E1: { x: 440, y: 60 }, F0: { x: 240, y: 210 }, F1: { x: 440, y: 210 } },
  samples: ['01', '0011', '010', '1'],
};

export const DFA_PRESETS = [DIV3, CONTAINS_AB, DOOR] as const;
export const NFA_PRESETS = [ENDS_01, nthFromEnd(3), EVEN_UNION] as const;

// ── Input checking ───────────────────────────────────────────────────

export type InputCheck = { ok: true; symbols: string[] } | { ok: false; error: string };

export const alphabetText = (m: Dfa | Nfa) => `{${m.alphabet.join(',')}}`;

const show = (ch: string) => (ch === ' ' ? 'a space' : /\s/.test(ch) ? 'a whitespace character' : `"${ch}"`);

/** The learner's tape, or the sentence to show instead. Empty is fine: it's the empty string. */
export function checkInput(m: Dfa | Nfa, text: string): InputCheck {
  const symbols = Array.from(text);
  const bad = symbols.find((ch) => !m.alphabet.includes(ch));
  if (bad !== undefined) return { ok: false, error: `${show(bad)} is not in this machine's alphabet ${alphabetText(m)}.` };
  if (symbols.length > MAX_INPUT) return { ok: false, error: `Keep it to ${MAX_INPUT} symbols or fewer.` };
  return { ok: true, symbols };
}

// ── Drawing helpers ──────────────────────────────────────────────────

export interface DrawnEdge {
  from: State;
  to: State;
  symbols: string[];
}

/** One arrow per (from, to) pair, labelled with every symbol that takes it. */
export function edgesOf(m: Dfa | Nfa): DrawnEdge[] {
  const byPair = new Map<string, DrawnEdge>();
  for (const from of m.states) {
    const row = m.delta[from] ?? {};
    const symbols = m.kind === 'nfa' ? [EPSILON, ...m.alphabet] : m.alphabet;
    for (const sym of symbols) {
      const raw = (row as Record<string, State | readonly State[] | undefined>)[sym];
      const targets = raw === undefined ? [] : typeof raw === 'string' ? [raw] : raw;
      for (const to of targets) {
        const key = `${from}\u0000${to}`;
        const e = byPair.get(key) ?? { from, to, symbols: [] };
        e.symbols.push(sym);
        byPair.set(key, e);
      }
    }
  }
  return [...byPair.values()];
}

/** States the start can reach at all (the rest are drawn dim). */
export function reachable(m: Dfa | Nfa): Set<State> {
  const seen = new Set<State>([m.start]);
  const stack = [m.start];
  while (stack.length) {
    const s = stack.pop()!;
    for (const e of edgesOf(m)) if (e.from === s && !seen.has(e.to)) {
      seen.add(e.to);
      stack.push(e.to);
    }
  }
  return seen;
}

// ── Runs (frames are built from these) ───────────────────────────────

export interface RunStep {
  /** Index of the symbol just read (−1 for the start). */
  at: number;
  /** Lit states after this step (empty: the machine died). */
  states: State[];
  /** Which drawn edges carried a token this step: "from→to" keys with the symbol used. */
  taken: { from: State; to: State; symbol: string }[];
}

export function runSteps(m: Dfa | Nfa, symbols: readonly string[]): RunStep[] {
  if (m.kind === 'dfa') {
    const steps: RunStep[] = [{ at: -1, states: [m.start], taken: [] }];
    let s: State | null = m.start;
    symbols.forEach((ch, i) => {
      const next = dfaStep(m, s, ch);
      steps.push({ at: i, states: next === null ? [] : [next], taken: s !== null && next !== null ? [{ from: s, to: next, symbol: ch }] : [] });
      s = next;
    });
    return steps;
  }
  const start = epsilonClosure(m, [m.start]);
  const steps: RunStep[] = [{ at: -1, states: start, taken: epsilonEdges(m, start) }];
  symbols.forEach((ch, i) => {
    const prev = steps[steps.length - 1].states;
    const states = nfaStep(m, prev, ch);
    const taken = prev.flatMap((from) => (m.delta[from]?.[ch] ?? []).map((to) => ({ from, to, symbol: ch })));
    steps.push({ at: i, states, taken: [...taken, ...epsilonEdges(m, states)] });
  });
  return steps;
}

/** The ε-arrows followed inside a closure: both ends lit. */
function epsilonEdges(m: Nfa, states: readonly State[]) {
  return states.flatMap((from) => (m.delta[from]?.[EPSILON] ?? []).filter((to) => states.includes(to)).map((to) => ({ from, to, symbol: EPSILON })));
}

/** The verdict on a finished run, from the lit states alone. */
export const isAccepting = (m: Dfa | Nfa, states: readonly State[]) => states.some((s) => m.accept.includes(s));

// ── Edit mode: build a machine for a stated language ─────────────────

export interface Target {
  id: string;
  label: string;
  test: (s: string) => boolean;
  /** A machine that does it, for "Show a solution". */
  solution: { accept: State[]; delta: Record<State, Record<string, State>> };
}

export const EDIT_STATES = ['q0', 'q1', 'q2', 'q3'] as const;
export const CHECK_LENGTH = 6;

export const TARGETS: Target[] = [
  {
    id: 'even1',
    label: 'An even number of 1s',
    test: (s) => [...s].filter((c) => c === '1').length % 2 === 0,
    solution: { accept: ['q0'], delta: { q0: { '0': 'q0', '1': 'q1' }, q1: { '0': 'q1', '1': 'q0' }, q2: { '0': 'q2', '1': 'q2' }, q3: { '0': 'q3', '1': 'q3' } } },
  },
  {
    id: 'ends0',
    label: 'Ends in 0',
    test: (s) => s.endsWith('0'),
    solution: { accept: ['q1'], delta: { q0: { '0': 'q1', '1': 'q0' }, q1: { '0': 'q1', '1': 'q0' }, q2: { '0': 'q2', '1': 'q2' }, q3: { '0': 'q3', '1': 'q3' } } },
  },
  {
    id: 'has11',
    label: 'Contains 11',
    test: (s) => s.includes('11'),
    solution: { accept: ['q2'], delta: { q0: { '0': 'q0', '1': 'q1' }, q1: { '0': 'q0', '1': 'q2' }, q2: { '0': 'q2', '1': 'q2' }, q3: { '0': 'q3', '1': 'q3' } } },
  },
  {
    id: 'len3',
    label: 'Length a multiple of 3',
    test: (s) => s.length % 3 === 0,
    solution: { accept: ['q0'], delta: { q0: { '0': 'q1', '1': 'q1' }, q1: { '0': 'q2', '1': 'q2' }, q2: { '0': 'q0', '1': 'q0' }, q3: { '0': 'q3', '1': 'q3' } } },
  },
];

/** A zigzag, so no arrow arrives from straight above, where self-loops are drawn. */
export const EDIT_AT: Record<State, Pt> = { q0: { x: 70, y: 210 }, q1: { x: 210, y: 105 }, q2: { x: 350, y: 210 }, q3: { x: 490, y: 105 } };

/** The blank machine edit mode starts from: everything goes back to q0, nothing accepts. */
export function blankMachine(): Dfa {
  return {
    kind: 'dfa',
    states: EDIT_STATES,
    alphabet: ['0', '1'],
    start: 'q0',
    accept: [],
    delta: Object.fromEntries(EDIT_STATES.map((s) => [s, { '0': 'q0', '1': 'q0' }])),
  };
}

export const withSolution = (t: Target): Dfa => ({ ...blankMachine(), accept: t.solution.accept, delta: t.solution.delta });

/** Every string over {0,1} up to `maxLen`, shortest first, then in dictionary order. */
export function allStrings(alphabet: readonly string[], maxLen: number): string[] {
  const out = [''];
  let layer = [''];
  for (let len = 1; len <= maxLen; len++) {
    layer = layer.flatMap((s) => alphabet.map((a) => s + a));
    out.push(...layer);
  }
  return out;
}

export type CheckResult =
  | { ok: true; tested: number }
  | { ok: false; tested: number; counterexample: string; shouldAccept: boolean };

/** Run the machine on every string up to CHECK_LENGTH; the first disagreement is the shortest. */
export function checkMachine(m: Dfa, target: Target, maxLen = CHECK_LENGTH): CheckResult {
  const all = allStrings(m.alphabet, maxLen);
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    const want = target.test(s);
    if (accepts(m, s) !== want) return { ok: false, tested: i + 1, counterexample: s, shouldAccept: want };
  }
  return { ok: true, tested: all.length };
}
