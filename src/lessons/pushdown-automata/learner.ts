/**
 * The build-your-own scene: a learner-written transition table, read by a hand-written parser through
 * core/parseKit (positioned refusals), run by core/automata's PDA against a reference language over every
 * string of {a, b} up to a length, accepting by empty stack.
 *
 * A rule is `state input top -> state push`: `-` as the input is ε, `-` as the push pops without pushing, the
 * push string is written top first, and the stack starts as the single symbol Z.
 */
import { pdaRun, type Pda, type PdaRule } from '../../core/automata';
import { parseKitRows, type TokenRule } from '../../core/parseKit';
import { BOTTOM } from './machines';
import { CONFIG_BUDGET, describeRejection } from './stepper';

export const MAX_RULES = 16;
export const MAX_LINE_CHARS = 40;
export const MAX_STATE_CHARS = 6;
export const MAX_PUSH = 4;
export const START_STATE = 'q0';
/** The check runs every string of {a, b} up to this length: 2^10 - 1 strings. */
export const CHECK_LENGTH = 9;

const TOKENS: TokenRule[] = [
  { kind: 'arrow', pattern: /->/ },
  { kind: 'word', pattern: /[^\s]+/u },
];

export type TableParse = { ok: true; pda: Pda; warnings: string[] } | { ok: false; error: string };

export function parseTable(text: string): TableParse {
  const read = parseKitRows<PdaRule>(text, {
    tokens: TOKENS,
    maxRows: MAX_RULES,
    maxLineChars: MAX_LINE_CHARS,
    noun: { one: 'rule', many: 'rules' },
    empty: 'Write at least one rule, like: q0 a Z -> q0 AZ',
    row: (c) => {
      const from = c.accept('word');
      const input = c.accept('word');
      const top = c.accept('word');
      if (!from || !input || !top) return c.fail('expected: state input top -> state push');
      if (!c.accept('arrow')) return c.fail('expected `->` after the stack symbol.');
      const to = c.accept('word');
      const push = c.accept('word');
      if (!to || !push) return c.fail('after `->` write the next state and what to push (- for nothing).');
      if (from.text.length > MAX_STATE_CHARS) return c.failAt(from, `a state name has at most ${MAX_STATE_CHARS} characters.`);
      if (to.text.length > MAX_STATE_CHARS) return c.failAt(to, `a state name has at most ${MAX_STATE_CHARS} characters.`);
      if ([...input.text].length !== 1) return c.failAt(input, 'the input is one character, or - for none.');
      if ([...top.text].length !== 1) return c.failAt(top, 'the stack symbol is one character.');
      if (top.text === '-') return c.failAt(top, 'the stack symbol cannot be -.');
      if (push.text !== '-' && [...push.text].length > MAX_PUSH) return c.failAt(push, `a move pushes at most ${MAX_PUSH} symbols.`);
      if (push.text.includes('-') && push.text !== '-') return c.failAt(push, '- means push nothing and cannot be mixed with other symbols.');
      return { ok: true, value: { from: from.text, read: input.text === '-' ? '' : input.text, pop: top.text, to: to.text, push: push.text === '-' ? '' : push.text } };
    },
  });
  if (!read.ok) return { ok: false, error: read.error };
  const rules = read.rows.map((r) => r.value);
  if (!rules.some((r) => r.from === START_STATE)) return { ok: false, error: `No rule starts in ${START_STATE}, where the machine begins.` };
  const declared = new Set(rules.map((r) => r.from));
  const warnings = [...new Set(rules.map((r) => r.to))].filter((s) => !declared.has(s)).map((s) => `${s} has no rules of its own: a run that reaches it can only stop there.`);
  return { ok: true, pda: { kind: 'pda', start: START_STATE, bottom: BOTTOM, accept: [], rules }, warnings };
}

export const targetLanguage = (s: string) => {
  const a = [...s].filter((c) => c === 'a').length;
  return s === 'a'.repeat(a) + 'b'.repeat(2 * a);
};

/** Every string over {a, b} of length 0 to `max`, shortest first. */
export function binaryStrings(max: number): string[] {
  const out = [''];
  let layer = [''];
  for (let n = 1; n <= max; n++) {
    layer = layer.flatMap((s) => [`${s}a`, `${s}b`]);
    out.push(...layer);
  }
  return out;
}

export type Verdict = 'accepted' | 'rejected' | 'budget';

export interface Disagreement {
  input: string;
  inLanguage: boolean;
  verdict: Verdict;
  /** Why, in a sentence. */
  reason: string;
}

/** Run the learner's machine on one string. */
export function runLearner(pda: Pda, input: string): { verdict: Verdict; reason: string } {
  const run = pdaRun(pda, input, { maxConfigs: CONFIG_BUDGET, accept: 'empty-stack' });
  if (run.status === 'accepted') return { verdict: 'accepted', reason: 'accepted' };
  if (run.status === 'budget-exhausted') return { verdict: 'budget', reason: `did not finish within ${CONFIG_BUDGET.toLocaleString('en-US')} configurations` };
  return { verdict: 'rejected', reason: describeRejection(input, run.levels, 'empty-stack').text };
}

export interface CheckResult {
  checked: number;
  first: Disagreement | null;
}

/** Compare the learner's machine with the target language on every string up to `CHECK_LENGTH`, shortest first. */
export function checkTable(pda: Pda): CheckResult {
  const strings = binaryStrings(CHECK_LENGTH);
  for (let i = 0; i < strings.length; i++) {
    const input = strings[i];
    const inLanguage = targetLanguage(input);
    const { verdict, reason } = runLearner(pda, input);
    if (verdict === 'budget') return { checked: i + 1, first: { input, inLanguage, verdict, reason } };
    if ((verdict === 'accepted') !== inLanguage) {
      return { checked: i + 1, first: { input, inLanguage, verdict, reason: verdict === 'accepted' ? 'accepted a string that is not in the language' : reason } };
    }
  }
  return { checked: strings.length, first: null };
}

