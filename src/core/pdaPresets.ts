/**
 * The lesson's pushdown automata and the reference predicates they are tested against. A move pops one stack
 * symbol and pushes a string (top first); the stack starts as the bottom marker Z.
 *
 * Each machine is written once as its working rules plus the states that may finish. `build` then adds the
 * finishing move for either way of accepting: an ε-move to the accepting state qf that keeps Z (accept by
 * final state), or an ε-move that pops Z and leaves the stack empty (accept by empty stack).
 */
import type { Pda, PdaAcceptMode, PdaRule } from './automata';

export const BOTTOM = 'Z';
export const FINAL_STATE = 'qf';
export const EMPTY_STACK_STATE = 'qe';
/** Subjects are at most this long, over the characters below. */
export const MAX_SUBJECT = 14;
export const SUBJECT_ALPHABET = ['a', 'b', '(', ')', '[', ']'];

export type PresetId = 'anbn' | 'brackets' | 'brackets2' | 'wwr';

export interface Preset {
  id: PresetId;
  label: string;
  /** The language in words, for the caption. */
  language: string;
  /** Working rules without the finishing move. */
  rules: PdaRule[];
  /** States that may take the finishing move when only the bottom marker is left. */
  finishFrom: string[];
  samples: string[];
  /** Does the subject belong to the language? Independent of the machine. */
  member: (s: string) => boolean;
}

const rule = (from: string, read: string, pop: string, to: string, push: string): PdaRule => ({ from, read, pop, to, push });

/** aⁿbⁿ: push an A per a, pop one per b. */
const ANBN: PdaRule[] = [
  rule('q0', 'a', 'Z', 'q0', 'AZ'),
  rule('q0', 'a', 'A', 'q0', 'AA'),
  rule('q0', 'b', 'A', 'q1', ''),
  rule('q1', 'b', 'A', 'q1', ''),
];

/** Balanced brackets of one kind. */
const BRACKETS: PdaRule[] = [
  rule('q0', '(', 'Z', 'q0', 'XZ'),
  rule('q0', '(', 'X', 'q0', 'XX'),
  rule('q0', ')', 'X', 'q0', ''),
];

/** Balanced brackets of two kinds: P stands for an open round bracket, S for an open square one. */
const BRACKETS2: PdaRule[] = ['Z', 'P', 'S'].flatMap((top) => [
  rule('q0', '(', top, 'q0', top === 'Z' ? 'PZ' : `P${top}`),
  rule('q0', '[', top, 'q0', top === 'Z' ? 'SZ' : `S${top}`),
]).concat([rule('q0', ')', 'P', 'q0', ''), rule('q0', ']', 'S', 'q0', '')]);

/** Even-length palindromes over {a, b}: push the first half, GUESS the middle (the ε-move), then pop while matching. */
const WWR: PdaRule[] = [
  ...['Z', 'A', 'B'].flatMap((top) => [
    rule('q0', 'a', top, 'q0', top === 'Z' ? 'AZ' : `A${top}`),
    rule('q0', 'b', top, 'q0', top === 'Z' ? 'BZ' : `B${top}`),
    rule('q0', '', top, 'q1', top),
  ]),
  rule('q1', 'a', 'A', 'q1', ''),
  rule('q1', 'b', 'B', 'q1', ''),
];

const count = (s: string, ch: string) => [...s].filter((c) => c === ch).length;
const isAnBn = (s: string) => {
  const n = count(s, 'a');
  return s === 'a'.repeat(n) + 'b'.repeat(n);
};
/** Balanced by a running counter, for one kind of bracket. */
const balanced = (s: string, open: string, close: string) => {
  let depth = 0;
  for (const c of s) {
    if (c === open) depth++;
    else if (c === close) depth--;
    else return false;
    if (depth < 0) return false;
  }
  return depth === 0;
};
/** Balanced for two kinds by repeatedly deleting adjacent pairs (a stack-free scan). */
const balanced2 = (s: string) => {
  let t = s;
  for (let prev = ''; prev !== t; ) {
    prev = t;
    t = t.replace('()', '').replace('[]', '');
  }
  return t === '' && [...s].every((c) => '()[]'.includes(c));
};
const isWwr = (s: string) => [...s].every((c) => c === 'a' || c === 'b') && s.length % 2 === 0 && s === [...s].reverse().join('');

export const PRESETS: Preset[] = [
  { id: 'anbn', label: 'aⁿbⁿ', language: 'n a\'s followed by n b\'s', rules: ANBN, finishFrom: ['q0', 'q1'], samples: ['aaabbb', 'aabbb', 'abab'], member: isAnBn },
  { id: 'brackets', label: 'Brackets ()', language: 'balanced round brackets', rules: BRACKETS, finishFrom: ['q0'], samples: ['(()())', '(()', '())('], member: (s) => balanced(s, '(', ')') },
  { id: 'brackets2', label: 'Brackets ()[]', language: 'balanced round and square brackets', rules: BRACKETS2, finishFrom: ['q0'], samples: ['([])[]', '([)]', '(['], member: balanced2 },
  { id: 'wwr', label: 'wwᴿ', language: 'even-length palindromes over a and b', rules: WWR, finishFrom: ['q1'], samples: ['abba', 'abab', 'aabbaa'], member: isWwr },
];

export const presetById = (id: PresetId): Preset => PRESETS.find((p) => p.id === id)!;

export interface BuiltPda {
  pda: Pda;
  accept: PdaAcceptMode;
}

/** The machine with the finishing move for the chosen way of accepting. */
export function build(preset: Preset, accept: PdaAcceptMode): BuiltPda {
  const finishing = preset.finishFrom.map((from) => (accept === 'final-state' ? rule(from, '', BOTTOM, FINAL_STATE, BOTTOM) : rule(from, '', BOTTOM, EMPTY_STACK_STATE, '')));
  return { pda: { kind: 'pda', start: 'q0', bottom: BOTTOM, accept: accept === 'final-state' ? [FINAL_STATE] : [], rules: [...preset.rules, ...finishing] }, accept };
}

export const ruleText = (r: PdaRule) => `${r.from}  ${r.read === '' ? 'ε' : r.read}  ${r.pop}  →  ${r.to}  ${r.push === '' ? 'ε' : r.push}`;

/** Why a subject cannot be used: too long, or a character outside the machines' alphabet. */
export function checkSubject(text: string): { ok: true; value: string } | { ok: false; error: string } {
  const chars = [...text];
  if (chars.length > MAX_SUBJECT) return { ok: false, error: `That is ${chars.length} characters; the limit is ${MAX_SUBJECT}.` };
  const bad = chars.find((c) => !SUBJECT_ALPHABET.includes(c));
  if (bad !== undefined) return { ok: false, error: `"${bad}" is not one of ${SUBJECT_ALPHABET.join(' ')}.` };
  return { ok: true, value: text };
}
