import { describe, expect, it } from 'vitest';
import { accepts, type Dfa } from './automata';
import { MAX_K, MIN_K, boundedCounter, duel, firstDisagreement, pigeonhole, wordAnBn } from './automataDuel';
import { build, presetById } from './pdaPresets';
import { stepRun } from './pdaStepper';
import { stringsUpTo } from './testing/strings';

describe('the DFA duel', () => {
  /** Table-filling (Hopcroft and Ullman): mark every pair of states a suffix can tell apart, then count what is left unmarked as one class. */
  const classes = (dfa: Dfa) => {
    const accepting = new Set(dfa.accept);
    const marked = new Set<string>();
    const key = (p: string, q: string) => (p < q ? `${p}|${q}` : `${q}|${p}`);
    for (const p of dfa.states) for (const q of dfa.states) if (accepting.has(p) !== accepting.has(q)) marked.add(key(p, q));
    for (let changed = true; changed; ) {
      changed = false;
      for (const p of dfa.states) {
        for (const q of dfa.states) {
          if (marked.has(key(p, q))) continue;
          if (dfa.alphabet.some((c) => marked.has(key(dfa.delta[p][c], dfa.delta[q][c])))) {
            marked.add(key(p, q));
            changed = true;
          }
        }
      }
    }
    const rep = dfa.states.filter((p, i) => dfa.states.slice(0, i).every((q) => marked.has(key(p, q))));
    return rep.length;
  };

  for (let k = MIN_K; k <= MAX_K; k++) {
    it(`k = ${k}: accepts exactly {a^n b^n : n <= ${k}}, has ${2 * k + 2} states, none of them mergeable, and fails at n = ${k + 1} where the PDA accepts`, () => {
      const dfa = boundedCounter(k);
      expect(dfa.states).toHaveLength(2 * k + 2);
      for (const s of stringsUpTo(['a', 'b'], 12)) {
        const a = [...s].filter((c) => c === 'a').length;
        expect(accepts(dfa, s), s).toBe(s === wordAnBn(a) && a <= k);
      }
      expect(classes(dfa)).toBe(2 * k + 2);
      const edge = duel(k, k + 1);
      expect([edge.dfaAccepts, edge.pdaAccepts]).toEqual([false, true]);
      expect(firstDisagreement(k)).toBe(k + 1);
      for (let n = 0; n <= k; n++) expect(duel(k, n).dfaAccepts).toBe(true);
    });
  }

  it('the pigeonhole step, from the numbers: two visits share a state, so a^i b^i and a^j b^i look the same to the DFA but not to the PDA', () => {
    for (let k = MIN_K; k <= MAX_K; k++) {
      const dfa = boundedCounter(k);
      const { i, j } = pigeonhole(dfa);
      expect(i).toBeLessThan(j);
      const w1 = 'a'.repeat(i) + 'b'.repeat(i);
      const w2 = 'a'.repeat(j) + 'b'.repeat(i);
      expect(accepts(dfa, w1)).toBe(accepts(dfa, w2));
      const pda = build(presetById('anbn'), 'final-state');
      expect(stepRun(pda.pda, w1, pda.accept).status).toBe('accepted');
      expect(stepRun(pda.pda, w2, pda.accept).status).toBe('rejected');
    }
  });
});
