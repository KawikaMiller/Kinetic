/**
 * The ten language cards: which ring each belongs in, a reference predicate that shares nothing with the
 * machines, and the machine (DFA, PDA or Turing machine) the Test field runs. Card text is the lesson's own.
 *
 * The rings are nested: regular inside context-free inside context-sensitive inside decidable inside
 * recursively enumerable. A card's ring is the smallest one that holds it.
 */
import { dfaRun, pdaRun, type Dfa } from '../../core/automata';
import { runTm, type Tm } from '../../core/tm';
import { build, presetById } from '../pushdown-automata/machines';
import { PRIME, ANBNCN, WW, TM_STEP_BUDGET } from './turing';

export type RingId = 'regular' | 'cf' | 'cs' | 'decidable' | 're';

export interface Ring {
  id: RingId;
  label: string;
  /** The Chomsky type, where there is one. */
  type: string;
}

/** Smallest first. */
export const RINGS: Ring[] = [
  { id: 'regular', label: 'Regular', type: 'Type 3' },
  { id: 'cf', label: 'Context-free', type: 'Type 2' },
  { id: 'cs', label: 'Context-sensitive', type: 'Type 1' },
  { id: 'decidable', label: 'Decidable', type: 'between Type 1 and Type 0' },
  { id: 're', label: 'Recursively enumerable', type: 'Type 0' },
];

export const ringIndex = (id: RingId) => RINGS.findIndex((r) => r.id === id);

export type CardId = 'an' | 'abstar' | 'evena' | 'anbn' | 'brackets' | 'wwr' | 'ww' | 'anbncn' | 'prime' | 'halts';

export type Verdict = 'accepted' | 'rejected' | 'budget';

export interface Card {
  id: CardId;
  /** Shown on the board. */
  label: string;
  ring: RingId;
  /** What decides a string, or null for the card the lesson only labels. */
  machine: 'DFA' | 'PDA' | 'Turing machine' | null;
  /** The symbols the Test field and the tests draw strings from. */
  alphabet: string[];
  /** The language in words, for the reveal. */
  definition: string;
  /** Independent of the machine. */
  member: ((s: string) => boolean) | null;
  /** Strings worth trying, one in and one out. */
  samples: string[];
}

const count = (s: string, ch: string) => [...s].filter((c) => c === ch).length;
const isPrime = (n: number) => {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
};
const onlyOf = (s: string, chars: string) => [...s].every((c) => chars.includes(c));
const isWw = (s: string) => onlyOf(s, 'ab') && s.length % 2 === 0 && s.slice(0, s.length / 2) === s.slice(s.length / 2);
const isAnBnCn = (s: string) => {
  const n = count(s, 'a');
  return s === 'a'.repeat(n) + 'b'.repeat(n) + 'c'.repeat(n);
};

export const CARDS: Card[] = [
  { id: 'an', label: 'aⁿ', ring: 'regular', machine: 'DFA', alphabet: ['a', 'b'], definition: 'any number of a\'s', member: (s) => onlyOf(s, 'a'), samples: ['aaaa', 'aab'] },
  { id: 'abstar', label: '(ab)*', ring: 'regular', machine: 'DFA', alphabet: ['a', 'b'], definition: 'ab repeated any number of times', member: (s) => s.length % 2 === 0 && s === 'ab'.repeat(s.length / 2), samples: ['ababab', 'abba'] },
  { id: 'evena', label: 'an even number of a\'s', ring: 'regular', machine: 'DFA', alphabet: ['a', 'b'], definition: 'any string of a\'s and b\'s with an even number of a\'s', member: (s) => onlyOf(s, 'ab') && count(s, 'a') % 2 === 0, samples: ['aab', 'ab'] },
  { id: 'anbn', label: 'aⁿbⁿ', ring: 'cf', machine: 'PDA', alphabet: ['a', 'b'], definition: 'n a\'s followed by n b\'s', member: (s) => s === 'a'.repeat(count(s, 'a')) + 'b'.repeat(count(s, 'a')), samples: ['aaabbb', 'aabbb'] },
  { id: 'brackets', label: 'balanced brackets', ring: 'cf', machine: 'PDA', alphabet: ['(', ')'], definition: 'round brackets that open and close in matching pairs', member: (s) => {
    let depth = 0;
    for (const c of s) {
      depth += c === '(' ? 1 : c === ')' ? -1 : -Infinity;
      if (depth < 0) return false;
    }
    return depth === 0;
  }, samples: ['(()())', '(()'] },
  { id: 'wwr', label: 'wwᴿ', ring: 'cf', machine: 'PDA', alphabet: ['a', 'b'], definition: 'a string followed by its reverse', member: (s) => onlyOf(s, 'ab') && s.length % 2 === 0 && s === [...s].reverse().join(''), samples: ['abba', 'abab'] },
  { id: 'ww', label: 'ww', ring: 'cs', machine: 'Turing machine', alphabet: ['a', 'b'], definition: 'a string followed by a copy of itself', member: isWw, samples: ['abab', 'abba'] },
  { id: 'anbncn', label: 'aⁿbⁿcⁿ', ring: 'cs', machine: 'Turing machine', alphabet: ['a', 'b', 'c'], definition: 'n a\'s, then n b\'s, then n c\'s', member: isAnBnCn, samples: ['aabbcc', 'aabbc'] },
  { id: 'prime', label: 'a\'s whose count is prime', ring: 'cs', machine: 'Turing machine', alphabet: ['a', 'b'], definition: 'a string of a\'s whose length is a prime number', member: (s) => onlyOf(s, 'a') && isPrime(s.length), samples: ['aaaaa', 'aaaa'] },
  { id: 'halts', label: 'programs that halt on empty input', ring: 're', machine: null, alphabet: [], definition: 'the programs that stop when started on nothing', member: null, samples: [] },
];

export const cardById = (id: CardId): Card => CARDS.find((c) => c.id === id)!;

/** The correct ring of every card, for the ClassifyBoard's key. */
export const KEY: Record<string, RingId> = Object.fromEntries(CARDS.map((c) => [c.id, c.ring]));

// ── Deciders ────────────────────────────────────────────────────────

const dfa = (states: string[], alphabet: string[], accept: string[], delta: Record<string, Record<string, string>>): Dfa => ({ kind: 'dfa', states, alphabet, start: states[0], accept, delta });

const DFAS: Partial<Record<CardId, Dfa>> = {
  an: dfa(['s', 'dead'], ['a', 'b', 'c'], ['s'], { s: { a: 's', b: 'dead', c: 'dead' }, dead: { a: 'dead', b: 'dead', c: 'dead' } }),
  abstar: dfa(['s0', 's1', 'dead'], ['a', 'b', 'c'], ['s0'], {
    s0: { a: 's1', b: 'dead', c: 'dead' }, s1: { a: 'dead', b: 's0', c: 'dead' }, dead: { a: 'dead', b: 'dead', c: 'dead' },
  }),
  evena: dfa(['even', 'odd', 'dead'], ['a', 'b', 'c'], ['even'], {
    even: { a: 'odd', b: 'even', c: 'dead' }, odd: { a: 'even', b: 'odd', c: 'dead' }, dead: { a: 'dead', b: 'dead', c: 'dead' },
  }),
};

export const PDA_BUDGET = 5000;
const PDAS = {
  anbn: build(presetById('anbn'), 'final-state'),
  brackets: build(presetById('brackets'), 'final-state'),
  wwr: build(presetById('wwr'), 'final-state'),
};
const TMS: Partial<Record<CardId, Tm>> = { ww: WW, anbncn: ANBNCN, prime: PRIME };

export interface Decision {
  verdict: Verdict;
  /** What ran: "DFA", "PDA", "Turing machine", with its cost when it has one. */
  detail: string;
}

/** Run the card's own machine on `input`. A machine that does not stop within its budget says so and nothing more. */
export function decide(card: Card, input: string): Decision | null {
  const d = DFAS[card.id];
  if (d) return { verdict: dfaRun(d, input).accepted ? 'accepted' : 'rejected', detail: `DFA with ${d.states.length} states` };
  if (card.id === 'anbn' || card.id === 'brackets' || card.id === 'wwr') {
    const { pda, accept } = PDAS[card.id];
    const run = pdaRun(pda, input, { maxConfigs: PDA_BUDGET, accept });
    const verdict = run.status === 'budget-exhausted' ? 'budget' : run.status;
    return { verdict, detail: `PDA, ${run.explored} configurations` };
  }
  const tm = TMS[card.id];
  if (tm) {
    const run = runTm(tm, input, { maxSteps: TM_STEP_BUDGET });
    const accepted = run.status === 'halted' && run.config.state === 'accept';
    return { verdict: run.status === 'budget-exhausted' ? 'budget' : accepted ? 'accepted' : 'rejected', detail: `Turing machine, ${run.steps} steps` };
  }
  return null;
}
