import { describe, expect, it } from 'vitest';
import { pdaRun, pdaStart, pdaStep, type Pda, type PdaRule } from './automata';

/** Every string over `alphabet` up to `maxLen` characters (including the empty string). */
function allStrings(alphabet: readonly string[], maxLen: number): string[] {
  const out = [''];
  let layer = [''];
  for (let n = 1; n <= maxLen; n++) {
    layer = layer.flatMap((s) => alphabet.map((a) => s + a));
    out.push(...layer);
  }
  return out;
}

const rule = (from: string, read: string, pop: string, to: string, push: string): PdaRule => ({ from, read, pop, to, push });
const machine = (rules: PdaRule[], accept = ['qf']): Pda => ({ kind: 'pda', start: 'q0', bottom: 'Z', accept, rules });
const BUDGET = { maxConfigs: 5000 };

/** Balanced brackets: push A per "(", pop one per ")", accept when only Z is left. */
const BRACKETS = machine([
  rule('q0', '(', 'Z', 'q0', 'AZ'),
  rule('q0', '(', 'A', 'q0', 'AA'),
  rule('q0', ')', 'A', 'q0', ''),
  rule('q0', '', 'Z', 'qf', 'Z'),
]);

/** a^n b^n: push on a, pop on b; the ε-move to qf at Z works for n = 0 and after the last pop. */
const ANBN = machine([
  rule('q0', 'a', 'Z', 'q0', 'AZ'),
  rule('q0', 'a', 'A', 'q0', 'AA'),
  rule('q0', 'b', 'A', 'q1', ''),
  rule('q1', 'b', 'A', 'q1', ''),
  rule('q0', '', 'Z', 'qf', 'Z'),
  rule('q1', '', 'Z', 'qf', 'Z'),
]);

/** w w^R: push every symbol, guess the middle with an ε-move, then match by popping. */
const SYMS = ['a', 'b'];
const STACK = ['Z', 'a', 'b'];
const PALINDROME = machine([
  ...SYMS.flatMap((s) => STACK.map((top) => rule('q0', s, top, 'q0', s + top))),
  ...STACK.map((top) => rule('q0', '', top, 'q1', top)),
  ...SYMS.map((s) => rule('q1', s, s, 'q1', '')),
  rule('q1', '', 'Z', 'qf', 'Z'),
]);

const balanced = (s: string) => {
  let depth = 0;
  for (const ch of s) {
    depth += ch === '(' ? 1 : -1;
    if (depth < 0) return false;
  }
  return depth === 0;
};
const anbn = (s: string) => {
  const n = s.length / 2;
  return s === 'a'.repeat(n) + 'b'.repeat(n);
};
const evenPalindrome = (s: string) => s.length % 2 === 0 && s === [...s].reverse().join('');

const accepted = (pda: Pda, s: string, mode: 'final-state' | 'empty-stack' = 'final-state') => pdaRun(pda, s, { ...BUDGET, accept: mode }).status === 'accepted';

describe('pdaRun on hand-built machines', () => {
  it('balanced brackets match a depth counter on every string of ( and ) up to length 10', () => {
    for (const s of allStrings(['(', ')'], 10)) expect(accepted(BRACKETS, s), s).toBe(balanced(s));
  });

  it('a^n b^n matches the closed form on every string of a and b up to length 10', () => {
    for (const s of allStrings(['a', 'b'], 10)) expect(accepted(ANBN, s), s).toBe(anbn(s));
  });

  it('w w^R (which needs the guess) matches a reversal check on every string up to length 10', () => {
    for (const s of allStrings(['a', 'b'], 10)) expect(accepted(PALINDROME, s), s).toBe(evenPalindrome(s));
  });

  it('accepts by empty stack when the machine pops the bottom marker', () => {
    const emptying = machine([...ANBN.rules.slice(0, 4), rule('q0', '', 'Z', 'qe', ''), rule('q1', '', 'Z', 'qe', '')], []);
    for (const s of allStrings(['a', 'b'], 8)) expect(accepted(emptying, s, 'empty-stack'), s).toBe(anbn(s));
    expect(accepted(emptying, 'ab')).toBe(false);
  });
});

describe('pdaStep configuration sets', () => {
  it('starts from the start state, the input unread and just the bottom marker', () => {
    expect(pdaStart(PALINDROME)).toEqual({ state: 'q0', pos: 0, stack: 'Z' });
  });

  it('keeps every guess alive: the palindrome machine holds a push branch and a middle-guess branch', () => {
    const live = pdaStep(PALINDROME, 'abba', [pdaStart(PALINDROME)]);
    expect(live).toEqual([
      { state: 'q0', pos: 1, stack: 'aZ' },
      { state: 'q1', pos: 0, stack: 'Z' },
    ]);
  });

  it('drops a configuration with no applicable rule and de-duplicates equal ones', () => {
    const dead = { state: 'q0', pos: 0, stack: 'Z' };
    expect(pdaStep(BRACKETS, ')', [dead])).toEqual([{ state: 'qf', pos: 0, stack: 'Z' }]);
    expect(pdaStep(BRACKETS, ')', [dead, dead])).toHaveLength(1);
    expect(pdaStep(BRACKETS, ')', [{ state: 'qf', pos: 0, stack: 'Z' }])).toEqual([]);
  });

  it('does not mutate the machine or the input configurations', () => {
    const start = pdaStart(ANBN);
    const before = JSON.stringify([ANBN, start]);
    pdaStep(ANBN, 'aabb', [start]);
    expect(JSON.stringify([ANBN, start])).toBe(before);
  });
});

describe('pdaRun budget and trace', () => {
  it('stops a machine whose ε-move pushes forever at the budget, and never calls it a rejection', () => {
    const looping = machine([rule('q0', '', 'Z', 'q0', 'ZZ')]);
    const run = pdaRun(looping, 'a', { maxConfigs: 200 });
    expect(run.status).toBe('budget-exhausted');
    expect(run.explored).toBeGreaterThan(200);
  });

  it('a pure ε-cycle with no growth ends as a rejection once every configuration is seen', () => {
    const cycle = machine([rule('q0', '', 'Z', 'q1', 'Z'), rule('q1', '', 'Z', 'q0', 'Z')]);
    expect(pdaRun(cycle, '', { maxConfigs: 50 }).status).toBe('rejected');
  });

  it('records the live set after each move, ending at the accepting one', () => {
    const run = pdaRun(ANBN, 'ab', BUDGET);
    expect(run.status).toBe('accepted');
    expect(run.levels[0]).toEqual([pdaStart(ANBN)]);
    expect(run.levels.at(-1)).toContainEqual({ state: 'qf', pos: 2, stack: 'Z' });
  });
});
