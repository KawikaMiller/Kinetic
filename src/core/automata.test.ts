import { describe, expect, it } from 'vitest';
import { accepts, dfaRun, dfaStep, epsilonClosure, longestMatch, nfaRun, nfaStep, subsetConstruct, subsetName, EPSILON, type Dfa, type Nfa } from './automata';

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

/** Binary numbers divisible by 3: the state is the remainder so far. */
const DIV3: Dfa = {
  kind: 'dfa',
  states: ['r0', 'r1', 'r2'],
  alphabet: ['0', '1'],
  start: 'r0',
  accept: ['r0'],
  delta: { r0: { '0': 'r0', '1': 'r1' }, r1: { '0': 'r2', '1': 'r0' }, r2: { '0': 'r1', '1': 'r2' } },
};

/** The textbook NFA for (a|b)*abb. */
const ABB: Nfa = {
  kind: 'nfa',
  states: ['0', '1', '2', '3'],
  alphabet: ['a', 'b'],
  start: '0',
  accept: ['3'],
  delta: { '0': { a: ['0', '1'], b: ['0'] }, '1': { b: ['2'] }, '2': { b: ['3'] }, '3': {} },
};

/** a*b* with an ε-move between the two loops. */
const ASTAR_BSTAR: Nfa = {
  kind: 'nfa',
  states: ['A', 'B'],
  alphabet: ['a', 'b'],
  start: 'A',
  accept: ['B'],
  delta: { A: { a: ['A'], [EPSILON]: ['B'] }, B: { b: ['B'] } },
};

/** (ab|a)c with ε branches, to exercise closure across several states. */
const AB_OR_A_THEN_C: Nfa = {
  kind: 'nfa',
  states: ['s', 'p', 'q', 'r', 't', 'f'],
  alphabet: ['a', 'b', 'c'],
  start: 's',
  accept: ['f'],
  delta: {
    s: { [EPSILON]: ['p', 'q'] },
    p: { a: ['r'] },
    r: { b: ['t'] },
    q: { a: ['t'] },
    t: { c: ['f'] },
    f: {},
  },
};

describe('DFA', () => {
  it('steps and dies on a missing transition', () => {
    expect(dfaStep(DIV3, 'r1', '0')).toBe('r2');
    expect(dfaStep(DIV3, null, '0')).toBeNull();
    expect(dfaStep(DIV3, 'r0', 'x')).toBeNull();
  });

  it('accepts exactly the binary multiples of 3', () => {
    for (const s of allStrings(['0', '1'], 10)) {
      if (!s) continue;
      expect(accepts(DIV3, s), s).toBe(parseInt(s, 2) % 3 === 0);
    }
  });

  it('records the path, including death', () => {
    expect(dfaRun(DIV3, '110').path).toEqual(['r0', 'r1', 'r0', 'r0']);
    expect(dfaRun(DIV3, '1x1')).toEqual({ path: ['r0', 'r1', null, null], accepted: false });
  });
});

describe('NFA', () => {
  it('takes the ε-closure, including the states themselves', () => {
    expect(epsilonClosure(AB_OR_A_THEN_C, ['s'])).toEqual(['p', 'q', 's']);
    expect(epsilonClosure(ASTAR_BSTAR, ['A'])).toEqual(['A', 'B']);
  });

  it('moves on a symbol and closes over ε', () => {
    expect(nfaStep(AB_OR_A_THEN_C, ['p', 'q', 's'], 'a')).toEqual(['r', 't']);
    expect(nfaRun(ABB, 'aabb').steps).toEqual([['0'], ['0', '1'], ['0', '1'], ['0', '2'], ['0', '3']]);
  });

  const regexCases: [Nfa, RegExp, number][] = [
    [ABB, /^(a|b)*abb$/, 10],
    [ASTAR_BSTAR, /^a*b*$/, 10],
    [AB_OR_A_THEN_C, /^(ab|a)c$/, 6],
  ];

  it('agrees with a regular expression on every short string', () => {
    for (const [nfa, re] of regexCases) {
      for (const s of allStrings(nfa.alphabet, 8)) expect(accepts(nfa, s), `${re} on "${s}"`).toBe(re.test(s));
    }
  });

  it('subset construction gives a DFA that agrees with the NFA up to length 10', () => {
    for (const [nfa, re, maxLen] of regexCases) {
      const { dfa } = subsetConstruct(nfa);
      for (const s of allStrings(nfa.alphabet, maxLen)) {
        expect(accepts(dfa, s), `${re} on "${s}"`).toBe(accepts(nfa, s));
      }
    }
  });

  it('builds the textbook subset table for (a|b)*abb', () => {
    const { dfa, rows, members } = subsetConstruct(ABB);
    expect(dfa.states).toEqual(['{0}', '{0,1}', '{0,2}', '{0,3}']);
    expect(dfa.accept).toEqual(['{0,3}']);
    expect(rows).toHaveLength(dfa.states.length * ABB.alphabet.length);
    expect(rows.filter((r) => r.isNew).map((r) => subsetName(r.to))).toEqual(['{0,1}', '{0,2}', '{0,3}']);
    expect(members['{0,2}']).toEqual(['0', '2']);
    // complete: every state has a move on every symbol
    for (const s of dfa.states) for (const a of dfa.alphabet) expect(dfa.delta[s][a]).toBeDefined();
  });

  it('includes the empty set only when it is reachable', () => {
    expect(subsetConstruct(ABB).dfa.states).not.toContain('∅');
    expect(subsetConstruct(AB_OR_A_THEN_C).dfa.states).toContain('∅');
  });
});

describe('longestMatch (maximal munch)', () => {
  // identifiers: letter (letter|digit)*; and the keyword "if" as its own accepting path
  const IDENT: Dfa = {
    kind: 'dfa',
    states: ['start', 'i', 'if', 'id'],
    alphabet: [...'ifxy0123'],
    start: 'start',
    accept: ['i', 'if', 'id'],
    delta: {
      start: { i: 'i', f: 'id', x: 'id', y: 'id' },
      i: { f: 'if', i: 'id', x: 'id', y: 'id', '0': 'id', '1': 'id', '2': 'id', '3': 'id' },
      if: { i: 'id', f: 'id', x: 'id', y: 'id', '0': 'id', '1': 'id', '2': 'id', '3': 'id' },
      id: { i: 'id', f: 'id', x: 'id', y: 'id', '0': 'id', '1': 'id', '2': 'id', '3': 'id' },
    },
  };

  it('prefers the longest accepted prefix', () => {
    // steps includes the space that kills the DFA: the lexer has to read it to know the token ended
    expect(longestMatch(IDENT, 'ifx2 y', 0)).toEqual({ end: 4, state: 'id', steps: 5 });
    expect(longestMatch(IDENT, 'if y', 0)).toEqual({ end: 2, state: 'if', steps: 3 });
    expect(longestMatch(IDENT, 'if y', 3)).toEqual({ end: 4, state: 'id', steps: 1 });
  });

  it('returns null when nothing non-empty matches, and counts characters read past the match', () => {
    expect(longestMatch(IDENT, ' if', 0)).toBeNull();
    expect(longestMatch(IDENT, '', 0)).toBeNull();
    // DIV3 on "11x": accepts "11" (3), then reads "x" and dies
    expect(longestMatch(DIV3, '11x', 0)).toEqual({ end: 2, state: 'r0', steps: 3 });
  });

  it('matches a brute-force longest accepted prefix on random inputs', () => {
    for (const s of allStrings(['0', '1'], 8)) {
      let expected = -1;
      for (let end = 1; end <= s.length; end++) if (accepts(DIV3, s.slice(0, end))) expected = end;
      expect(longestMatch(DIV3, s, 0)?.end ?? -1, s).toBe(expected);
    }
  });
});
