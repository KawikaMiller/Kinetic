/**
 * The pumping game. The lesson picks a language and a pumping length p; the learner picks a string s in the
 * language, at least p long. The lesson lists EVERY legal split and, for each, the smallest i in 0..3 for which
 * the pumped string leaves the language (decided by the language's own predicate). The learner wins exactly
 * when every split has such an i.
 *
 *   regular version:       s = x y z,        |xy| <= p, |y| >= 1,   pumped: x y^i z
 *   context-free version:  s = u v w x y,    |vwx| <= p, |vx| >= 1, pumped: u v^i w x^i y
 *
 * One p and one s are one case of an argument; the lemma quantifies over every p, and a proof must cover them all.
 */
import { dfaRun, type Dfa, type State } from '../../core/automata';

export type PumpMode = 'regular' | 'cf';
export type PumpLanguageId = 'anbn' | 'abstar' | 'equal' | 'anbncn';

export const MIN_P = 2;
export const MAX_P = 6;
export const MAX_COUNT = 12;
/** The pumped strings tried: i = 0, 1, 2, 3. */
export const PUMP_COUNTS = [0, 1, 2, 3] as const;

export interface Shape {
  id: string;
  label: string;
  build: (n: number) => string;
}

export interface PumpLanguage {
  id: PumpLanguageId;
  label: string;
  member: (s: string) => boolean;
  shapes: Shape[];
  /** The language is regular, so no string can win the regular game. */
  regular: boolean;
  /** The language is context-free, so no string can win the context-free game. */
  contextFree: boolean;
  /** For a regular language, a minimal DFA to draw the loop in. */
  dfa?: Dfa;
}

const count = (s: string, ch: string) => [...s].filter((c) => c === ch).length;
const rep = (s: string, n: number) => s.repeat(n);

const AB_STAR: Dfa = {
  kind: 'dfa', states: ['s0', 's1', 'dead'], alphabet: ['a', 'b'], start: 's0', accept: ['s0'],
  delta: { s0: { a: 's1', b: 'dead' }, s1: { a: 'dead', b: 's0' }, dead: { a: 'dead', b: 'dead' } },
};

export const PUMP_LANGUAGES: PumpLanguage[] = [
  {
    id: 'anbn', label: 'aⁿbⁿ', regular: false, contextFree: true,
    member: (s) => s === rep('a', count(s, 'a')) + rep('b', count(s, 'a')),
    shapes: [{ id: 'anbn', label: 'aⁿbⁿ', build: (n) => rep('a', n) + rep('b', n) }, { id: 'abn', label: '(ab)ⁿ', build: (n) => rep('ab', n) }],
  },
  {
    id: 'abstar', label: '(ab)*', regular: true, contextFree: true, dfa: AB_STAR,
    member: (s) => s.length % 2 === 0 && s === rep('ab', s.length / 2),
    shapes: [{ id: 'abn', label: '(ab)ⁿ', build: (n) => rep('ab', n) }],
  },
  {
    id: 'equal', label: 'equal numbers of a and b', regular: false, contextFree: true,
    member: (s) => [...s].every((c) => c === 'a' || c === 'b') && count(s, 'a') === count(s, 'b'),
    shapes: [{ id: 'abn', label: '(ab)ⁿ', build: (n) => rep('ab', n) }, { id: 'anbn', label: 'aⁿbⁿ', build: (n) => rep('a', n) + rep('b', n) }],
  },
  {
    id: 'anbncn', label: 'aⁿbⁿcⁿ', regular: false, contextFree: false,
    member: (s) => s === rep('a', count(s, 'a')) + rep('b', count(s, 'a')) + rep('c', count(s, 'a')),
    shapes: [{ id: 'anbncn', label: 'aⁿbⁿcⁿ', build: (n) => rep('a', n) + rep('b', n) + rep('c', n) }],
  },
];

export const pumpLanguage = (id: PumpLanguageId) => PUMP_LANGUAGES.find((l) => l.id === id)!;

/** One legal decomposition: the pieces (`x y z` has 3, `u v w x y` has 5) and which piece is pumped. */
export interface Decomposition {
  pieces: string[];
  /** Indices into `pieces` of the repeated parts (y; or v and x). */
  pumped: number[];
}

export function decompositions(s: string, p: number, mode: PumpMode): Decomposition[] {
  const out: Decomposition[] = [];
  if (mode === 'regular') {
    for (let xy = 1; xy <= Math.min(p, s.length); xy++) {
      for (let y = 1; y <= xy; y++) out.push({ pieces: [s.slice(0, xy - y), s.slice(xy - y, xy), s.slice(xy)], pumped: [1] });
    }
    return out;
  }
  for (let l = 1; l <= Math.min(p, s.length); l++) {
    for (let i = 0; i + l <= s.length; i++) {
      for (let a = 0; a <= l; a++) {
        for (let c = 0; a + c <= l; c++) {
          if (a + c === 0) continue;
          out.push({ pieces: [s.slice(0, i), s.slice(i, i + a), s.slice(i + a, i + l - c), s.slice(i + l - c, i + l), s.slice(i + l)], pumped: [1, 3] });
        }
      }
    }
  }
  return out;
}

/** The decomposition with its pumped parts repeated `i` times. */
export function pump(d: Decomposition, i: number): string {
  return d.pieces.map((piece, k) => (d.pumped.includes(k) ? piece.repeat(i) : piece)).join('');
}

export interface Row {
  decomposition: Decomposition;
  /** Per i in PUMP_COUNTS: the pumped string leaves the language. */
  leaves: boolean[];
  /** The smallest i that leaves, or null when none of 0..3 does (the learner has not beaten this split). */
  firstLeaving: number | null;
}

export type Setup = { ok: true; s: string } | { ok: false; error: string };

/** Build s from the shape and n, refusing a string outside the language or shorter than p. */
export function chooseString(lang: PumpLanguage, shapeId: string, n: number, p: number): Setup {
  const shape = lang.shapes.find((sh) => sh.id === shapeId);
  if (!shape) return { ok: false, error: 'Pick one of the string shapes.' };
  if (!Number.isInteger(n) || n < 0 || n > MAX_COUNT) return { ok: false, error: `n is a whole number from 0 to ${MAX_COUNT}.` };
  const s = shape.build(n);
  if (s.length < p) return { ok: false, error: `${s || 'ε'} has length ${s.length}, shorter than p = ${p}. Choose a larger n.` };
  if (!lang.member(s)) return { ok: false, error: `${s} is not in the language ${lang.label}, so it is not a legal choice.` };
  return { ok: true, s };
}

export interface Game {
  s: string;
  rows: Row[];
  won: boolean;
  /** Decompositions with no leaving i. */
  surviving: Row[];
}

export function playGame(lang: Pick<PumpLanguage, 'member'>, s: string, p: number, mode: PumpMode): Game {
  const rows = decompositions(s, p, mode).map((decomposition): Row => {
    const leaves = PUMP_COUNTS.map((i) => !lang.member(pump(decomposition, i)));
    const first = leaves.indexOf(true);
    return { decomposition, leaves, firstLeaving: first < 0 ? null : PUMP_COUNTS[first] };
  });
  const surviving = rows.filter((r) => r.firstLeaving === null);
  return { s, rows, won: surviving.length === 0, surviving };
}

/** Closed form for how many context-free decompositions a string of length n has for pumping length p (windows of length l, split into v w x with |vx| >= 1). */
export const cfCount = (n: number, p: number) => {
  let total = 0;
  for (let l = 1; l <= Math.min(p, n); l++) total += (n - l + 1) * (((l + 1) * (l + 2)) / 2 - 1);
  return total;
};

/** Closed form for the regular count: sum of |xy| for |xy| = 1..p. */
export const regularCount = (n: number, p: number) => {
  let total = 0;
  for (let m = 1; m <= Math.min(p, n); m++) total += m;
  return total;
};

/** The states a loop y takes in a DFA from the state after x, and whether it comes back to that state. */
export function loopIn(dfa: Dfa, x: string, y: string): { states: State[]; closes: boolean } {
  const start = dfaRun(dfa, x).path.at(-1) as State;
  const path = dfaRun({ ...dfa, start }, y).path as State[];
  return { states: path, closes: path[path.length - 1] === start };
}

/** Whether the lemma itself guarantees a surviving split for this language in this mode (the learner cannot win). */
export const cannotWin = (lang: PumpLanguage, mode: PumpMode) => (mode === 'regular' ? lang.regular : lang.contextFree);
