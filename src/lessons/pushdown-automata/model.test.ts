/**
 * The lesson's own checks (the learner table runner, hostile tables). The preset machines and the DFA duel are
 * tested in core/pdaPresets.test.ts and core/automataDuel.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { pdaRun } from '../../core/automata';
import { CHECK_LENGTH, binaryStrings, checkTable, parseTable, runLearner } from './learner';
import { MAX_SUBJECT, checkSubject } from '../../core/pdaPresets';
import { CONFIG_BUDGET } from '../../core/pdaStepper';

const CORRECT = ['q0 a Z -> q0 AAZ', 'q0 a A -> q0 AAA', 'q0 b A -> q1 -', 'q1 b A -> q1 -', 'q0 - Z -> q2 -', 'q1 - Z -> q2 -'].join('\n');
const PUSHES_ONE = ['q0 a Z -> q0 AZ', 'q0 a A -> q0 AA', 'q0 b A -> q1 -', 'q1 b A -> q1 -', 'q0 - Z -> q2 -', 'q1 - Z -> q2 -'].join('\n');
const FORGETS_TO_POP = ['q0 a Z -> q0 AAZ', 'q0 a A -> q0 AAA', 'q0 b A -> q1 -', 'q1 b A -> q1 A', 'q0 - Z -> q2 -', 'q1 - Z -> q2 -'].join('\n');

const table = (text: string) => {
  const r = parseTable(text);
  if (!r.ok) throw new Error(r.error);
  return r.pda;
};

describe('the learner table runner', () => {
  it('the correct a^n b^2n table passes the whole length-9 sweep (1,023 strings)', () => {
    expect(binaryStrings(CHECK_LENGTH)).toHaveLength(1023);
    expect(checkTable(table(CORRECT))).toEqual({ checked: 1023, first: null });
  });

  it('the table that pushes one symbol fails first on "ab", accepted although it is not in the language', () => {
    const r = checkTable(table(PUSHES_ONE));
    expect(r.first).toMatchObject({ input: 'ab', inLanguage: false, verdict: 'accepted', reason: 'accepted a string that is not in the language' });
  });

  it('the table that forgets to pop fails first on "abb" with two symbols left on the stack', () => {
    const r = checkTable(table(FORGETS_TO_POP));
    expect(r.first).toMatchObject({ input: 'abb', inLanguage: true, verdict: 'rejected', reason: 'rejected: input finished with 2 symbols still on the stack' });
  });

  it('a string the machine rejects with input left over names the empty stack', () => {
    const early = table(['q0 a Z -> q0 -', 'q0 - Z -> q1 -'].join('\n'));
    expect(runLearner(early, 'ab').reason).toBe('rejected: stack empty but input remains');
  });

  it('an epsilon loop that pushes forever is stopped by the budget with the stated words, never "forever"', () => {
    const loop = table('q0 - Z -> q0 ZZ');
    const r = runLearner(loop, 'a');
    expect(r.verdict).toBe('budget');
    expect(r.reason).toBe('did not finish within 5,000 configurations');
    const run = pdaRun(loop, 'a', { maxConfigs: CONFIG_BUDGET, accept: 'empty-stack' });
    expect(run.status).toBe('budget-exhausted');
    expect(run.levels.every((l) => l.length <= CONFIG_BUDGET)).toBe(true);
    expect(r.reason).not.toMatch(/forever|infinite|never/i);
  });
});

describe('hostile tables and subjects are refused with a position', () => {
  const cases: [string, RegExp][] = [
    ['q0 a Z q0 AZ', /^Line 1, column \d+: expected `->`/],
    ['q0 a Z -> q0 AZ\nq0 a', /^Line 2.*expected: state input top/],
    ['q0 ab Z -> q0 AZ', /^Line 1, column 4: the input is one character/],
    ['q0 a ZZ -> q0 AZ', /^Line 1, column 6: the stack symbol is one character/],
    ['q0 a Z -> q0 AAAAA', /^Line 1.*pushes at most 4 symbols/],
    ['q0 a Z -> q0 A-', /cannot be mixed/],
    ['q0 a Z -> q0', /^Line 1.*next state and what to push/],
    ['q1 a Z -> q1 AZ', /No rule starts in q0/],
    ['', /Write at least one rule/],
    [Array.from({ length: 17 }, () => 'q0 a Z -> q0 AZ').join('\n'), /^Line 17: more than 16 rules/],
  ];
  it.each(cases)('%s', (text, message) => {
    const r = parseTable(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(message);
  });

  it('a state with no rules of its own is allowed and noted', () => {
    const r = parseTable(CORRECT);
    expect(r.ok && r.warnings).toEqual(['q2 has no rules of its own: a run that reaches it can only stop there.']);
  });

  it('several undeclared target states give one warning, not one line each', () => {
    const r = parseTable(['q0 a Z -> q3 AZ', 'q0 b Z -> q2 AZ'].join('\n'));
    expect(r.ok && r.warnings).toEqual(['q3, q2 have no rules of their own: a run that reaches one of them can only stop there.']);
  });

  it('an arrow glued to the stack symbol still reads as an arrow', () => {
    const spaced = parseTable('q0 a Z -> q0 AZ');
    const glued = parseTable('q0 a Z->q0 AZ');
    expect(glued.ok && spaced.ok && glued.pda.rules).toEqual(spaced.ok && spaced.pda.rules);
    const bad = parseTable('q0 a Z->q0');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/^Line 1.*next state and what to push/);
  });

  it('subjects over 14 characters or outside the alphabet are refused', () => {
    expect(checkSubject('a'.repeat(MAX_SUBJECT)).ok).toBe(true);
    expect(checkSubject('a'.repeat(MAX_SUBJECT + 1))).toEqual({ ok: false, error: 'That is 15 characters; the limit is 14.' });
    expect(checkSubject('abc')).toEqual({ ok: false, error: '"c" is not one of a b ( ) [ ].' });
  });
});

describe('no learner text reaches RegExp, eval or Function', () => {
  const sources = import.meta.glob<string>('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });
  it('the lesson sources contain no new RegExp, RegExp( call, eval( or new Function', () => {
    const files = Object.entries(sources).filter(([name]) => !name.endsWith('.test.ts'));
    expect(files.map(([name]) => name)).toContain('./learner.ts');
    for (const [name, text] of files) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, name).not.toMatch(/new\s+RegExp|RegExp\s*\(|\beval\s*\(|new\s+Function|\bFunction\s*\(/);
    }
  });
});
