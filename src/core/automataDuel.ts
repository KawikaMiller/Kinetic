/**
 * The DFA duel: a finite automaton for {aⁿbⁿ : n <= k}. It counts a's up to k in the states a0..ak, counts the
 * b's back down in b(k-1)..b0, and every other move falls into the dead state: 2k + 2 states in all.
 */
import { dfaRun, type Dfa, type State } from './automata';
import type { Pt } from './geometry';
import { build, presetById } from './pdaPresets';
import { stepRun } from './pdaStepper';

export const MIN_K = 1;
export const MAX_K = 8;
export const DEAD: State = 'dead';
/** The duel's n runs 0 to this (past the biggest k, plus room to show the DFA failing). */
export const MAX_N = 12;

const nameA = (i: number) => `a${i}`;
const nameB = (j: number) => `b${j}`;

export function boundedCounter(k: number): Dfa {
  const states = [...Array.from({ length: k + 1 }, (_, i) => nameA(i)), ...Array.from({ length: k }, (_, j) => nameB(j)), DEAD];
  const delta: Record<State, Record<string, State>> = {};
  for (let i = 0; i <= k; i++) delta[nameA(i)] = { a: i < k ? nameA(i + 1) : DEAD, b: i >= 1 ? nameB(i - 1) : DEAD };
  for (let j = 0; j < k; j++) delta[nameB(j)] = { a: DEAD, b: j >= 1 ? nameB(j - 1) : DEAD };
  delta[DEAD] = { a: DEAD, b: DEAD };
  return { kind: 'dfa', states, alphabet: ['a', 'b'], start: nameA(0), accept: [nameA(0), nameB(0)], delta };
}

/** The drawing's places: the a-counters along the top, each b-counter under the a-counter that leads to it, the dead state at the end. */
export function placeCounter(k: number, gap: number, top: number, bottom: number): Record<State, Pt> {
  const at: Record<State, Pt> = {};
  for (let i = 0; i <= k; i++) at[nameA(i)] = { x: gap * (i + 1), y: top };
  for (let j = 0; j < k; j++) at[nameB(j)] = { x: gap * (j + 2), y: bottom };
  at[DEAD] = { x: gap * (k + 2), y: bottom };
  return at;
}

export const wordAnBn = (n: number) => 'a'.repeat(n) + 'b'.repeat(n);

export interface DuelResult {
  dfaAccepts: boolean;
  pdaAccepts: boolean;
  /** The DFA state after reading the whole word (null cannot happen: dead is a state), and the path. */
  path: (State | null)[];
}

const PDA = build(presetById('anbn'), 'final-state');

/** Does the a^n b^n pushdown automaton accept this word? */
export const pdaAccepts = (word: string) => stepRun(PDA.pda, word, PDA.accept).status === 'accepted';

export function duel(k: number, n: number): DuelResult {
  const run = dfaRun(boundedCounter(k), wordAnBn(n));
  return { dfaAccepts: run.accepted, pdaAccepts: pdaAccepts(wordAnBn(n)), path: run.path };
}

/** The first n where the DFA and the PDA disagree, or null within 0..MAX_N. */
export function firstDisagreement(k: number): number | null {
  for (let n = 0; n <= MAX_N; n++) {
    const r = duel(k, n);
    if (r.dfaAccepts !== r.pdaAccepts) return n;
  }
  return null;
}

/**
 * The pigeonhole step: reading a repeated `states` times visits `states + 1` states (counting the start), in a
 * machine of `states`, so two visits i < j share a state. Returns the first such pair.
 */
export function pigeonhole(dfa: Dfa): { i: number; j: number; state: State } {
  const { path } = dfaRun(dfa, 'a'.repeat(dfa.states.length));
  const seen = new Map<State, number>();
  for (let j = 0; j < path.length; j++) {
    const s = path[j] as State;
    const i = seen.get(s);
    if (i !== undefined) return { i, j, state: s };
    seen.set(s, j);
  }
  throw new Error('a path of states + 1 visits must repeat a state');
}
