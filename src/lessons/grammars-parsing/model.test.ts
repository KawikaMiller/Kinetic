import { describe, expect, it } from 'vitest';
import { accepts } from '../../core/automata';
import {
  PRESET_GRAMMARS, bracketed, countingDfa, derive, evaluate, languageUpTo, leftmostRules, nested, parseGrammar, parseTrees, precedenceReading,
  recognises, tokenize, viable, type Grammar,
} from './model';

const grammar = (id: string): Grammar => {
  const r = parseGrammar(PRESET_GRAMMARS.find((p) => p.id === id)!.text);
  if (!r.ok) throw new Error(r.error);
  return r.grammar;
};
const toks = (s: string) => {
  const r = tokenize(s);
  if (!r.ok) throw new Error(r.error);
  return r.tokens;
};

/** Every string of terminals up to maxLen, as space-joined symbol lists. */
function allStrings(terminals: string[], maxLen: number): string[][] {
  const out: string[][] = [[]];
  let layer: string[][] = [[]];
  for (let n = 1; n <= maxLen; n++) {
    layer = layer.flatMap((s) => terminals.map((t) => [...s, t]));
    out.push(...layer);
  }
  return out;
}

describe('the recogniser agrees with brute-force derivation', () => {
  it.each([
    ['ambiguous', ['num', '+', '*', '(', ')']],
    ['layered', ['num', '+', '*', '(', ')']],
    ['brackets', ['(', ')']],
  ])('%s: every string up to length 7', (id, terminals) => {
    const g = grammar(id);
    const lang = languageUpTo(g, 7);
    for (const s of allStrings(terminals, 7)) expect(recognises(g, s)).toBe(lang.has(s.join(' ')));
  }, 30_000);
});

describe('ambiguity', () => {
  it('the ambiguous grammar has exactly 2 trees for 1+2*3, worth 7 and 9', () => {
    const trees = parseTrees(grammar('ambiguous'), toks('1+2*3'));
    expect(trees).toHaveLength(2);
    expect(trees.map(evaluate).sort()).toEqual([7, 9]);
    expect(trees.map(bracketed).sort()).toEqual(['((1 + 2) * 3)', '(1 + (2 * 3))']);
  });

  it('the layered grammar has exactly 1 tree for 1+2*3, worth 7, the precedence reading', () => {
    const trees = parseTrees(grammar('layered'), toks('1+2*3'));
    expect(trees).toHaveLength(1);
    expect(evaluate(trees[0])).toBe(7);
    expect(bracketed(trees[0])).toBe(precedenceReading(toks('1+2*3')));
  });

  it('the layered grammar is unambiguous and matches the precedence reading on every string up to length 7', () => {
    const g = grammar('layered');
    for (const s of allStrings(['num', '+', '*', '(', ')'], 7)) {
      const tokens = s.map((t) => ({ t, text: t === 'num' ? String(s.length) : t }));
      const trees = parseTrees(g, tokens);
      expect(trees.length).toBeLessThanOrEqual(1);
      if (trees.length) expect(bracketed(trees[0])).toBe(precedenceReading(tokens));
    }
  }, 30_000);

  it('counts trees the way the Catalan numbers say for a chain of + (capped)', () => {
    const g = grammar('ambiguous');
    expect(parseTrees(g, toks('1+2+3+4')).length).toBe(5);
    expect(parseTrees(g, toks('1+2+3+4+5')).length).toBe(14);
    expect(parseTrees(g, toks('1+1+1+1+1+1+1')).length).toBe(20);
  });
});

describe('derivations', () => {
  it('replaying the leftmost rules of a tree derives exactly the input', () => {
    for (const id of ['ambiguous', 'layered', 'brackets'] as const) {
      const g = grammar(id);
      const p = PRESET_GRAMMARS.find((x) => x.id === id)!;
      const tokens = toks(p.sample);
      for (const tree of parseTrees(g, tokens)) {
        const d = derive(g, tokens, leftmostRules(tree));
        expect(d.next).toBeNull();
        expect(d.form.map((n) => d.nodes[n].text)).toEqual(tokens.map((t) => t.text));
      }
    }
  });

  it('a wrong choice is caught as no longer viable', () => {
    const g = grammar('layered');
    const tokens = toks('1+2*3');
    expect(viable(g, tokens, derive(g, tokens, []))).toBe(true);
    // E -> T first can never produce the + at the top level.
    expect(viable(g, tokens, derive(g, tokens, [1]))).toBe(false);
    expect(viable(g, tokens, derive(g, tokens, [0]))).toBe(true);
  });
});

describe('why not regex', () => {
  it('a k-state counting DFA judges (ⁿ)ⁿ right for n < k and wrong at n = k and n = k + 1, for k = 2..6', () => {
    const g = grammar('brackets');
    for (let k = 2; k <= 6; k++) {
      const dfa = countingDfa(k);
      expect(dfa.states).toHaveLength(k);
      for (let n = 0; n <= 8; n++) {
        const s = nested(n);
        expect(recognises(g, [...s])).toBe(true);
        expect(accepts(dfa, s)).toBe(n < k);
      }
      expect(accepts(dfa, nested(k + 1))).toBe(false);
    }
  });
});

describe('the grammar editor and the input field', () => {
  it('reads the presets and refuses bad grammars with a reason', () => {
    for (const p of PRESET_GRAMMARS) expect(parseGrammar(p.text).ok).toBe(true);
    expect(parseGrammar('')).toMatchObject({ ok: false });
    expect(parseGrammar('E = E + E')).toMatchObject({ ok: false, error: 'Line 1: write it as A -> x y | z.' });
    expect(parseGrammar('E -> E')).toMatchObject({ ok: false });
    expect(parseGrammar('A -> B | x\nB -> A')).toMatchObject({ ok: false });
    expect(parseGrammar('E -> E E | ε')).toMatchObject({ ok: false });
    expect(parseGrammar('E -> plus')).toMatchObject({ ok: false });
    expect(parseGrammar('<b> -> x')).toMatchObject({ ok: false });
    expect(parseGrammar('E -> ' + 'x '.repeat(7))).toMatchObject({ ok: false });
    expect(parseGrammar('S -> ( S ) | 😀')).toMatchObject({ ok: true });
  });

  it('tokenises input and refuses what it cannot hold', () => {
    expect(tokenize('12+(3)')).toEqual({ ok: true, tokens: [{ t: 'num', text: '12' }, { t: '+', text: '+' }, { t: '(', text: '(' }, { t: 'num', text: '3' }, { t: ')', text: ')' }] });
    expect(tokenize('')).toEqual({ ok: true, tokens: [] });
    expect(tokenize('   ')).toEqual({ ok: true, tokens: [] });
    expect(tokenize('12345678901234567890123')).toMatchObject({ ok: false });
    expect(tokenize('1+'.repeat(9))).toMatchObject({ ok: false });
    expect(tokenize('1e400').ok && recognises(grammar('layered'), toks('1e400').map((t) => t.t))).toBe(false);
    expect(tokenize('-1').ok && recognises(grammar('layered'), toks('-1').map((t) => t.t))).toBe(false);
  });
});
