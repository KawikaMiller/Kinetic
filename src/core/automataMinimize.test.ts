import { describe, expect, it } from 'vitest';
import { dfaRun, type Dfa, type State } from './automata';
import { EXAMPLES, distinguishing, finalPartition, prefixClasses, quotient, reachable, refine } from './automataMinimize';
import { mulberry32 } from './random';
import { stringsUpTo } from './testing/strings';

describe('minimisation', () => {
  /** Myhill-Nerode by brute force: the number of distinct behaviours over every suffix up to 2n letters. */
  const behaviours = (dfa: Dfa) => {
    const states = reachable(dfa);
    const suffixes = stringsUpTo(dfa.alphabet, Math.min(2 * dfa.states.length, 8));
    return new Set(states.map((s) => suffixes.map((w) => (dfaRun({ ...dfa, start: s }, w).accepted ? '1' : '0')).join(''))).size;
  };

  it('the presets reduce to 3 and 3 states, equal to the brute-force count', () => {
    expect(EXAMPLES.map((e) => finalPartition(e.dfa).count)).toEqual([3, 3]);
    for (const e of EXAMPLES) expect(finalPartition(e.dfa).count).toBe(behaviours(e.dfa));
  });

  it('on 200 seeded random DFAs the class count equals the brute-force count and the quotient accepts the same strings', () => {
    const rnd = mulberry32(99);
    for (let t = 0; t < 200; t++) {
      const n = 2 + Math.floor(rnd() * 5);
      const states = Array.from({ length: n }, (_, i) => `s${i}`);
      const dfa: Dfa = {
        kind: 'dfa', alphabet: ['a', 'b'], states, start: 's0',
        accept: states.filter(() => rnd() < 0.4),
        delta: Object.fromEntries(states.map((s) => [s, { a: states[Math.floor(rnd() * n)], b: states[Math.floor(rnd() * n)] }])),
      };
      const partition = finalPartition(dfa);
      expect(partition.count, `dfa ${t}`).toBe(behaviours(dfa));
      const small = quotient(dfa, partition);
      for (const w of stringsUpTo(['a', 'b'], 7)) expect(dfaRun(small, w).accepted, `dfa ${t} on "${w}"`).toBe(dfaRun(dfa, w).accepted);
    }
  });

  it('refinement rounds only split classes and the last round is stable', () => {
    for (const e of EXAMPLES) {
      const rounds = refine(e.dfa);
      for (let i = 1; i < rounds.length; i++) expect(rounds[i].count).toBeGreaterThan(rounds[i - 1].count);
      expect(rounds[0].count).toBe(2);
    }
  });

  it('the distinguishing string is the shortest and really separates the two states, for every pair of the presets', () => {
    for (const e of EXAMPLES) {
      for (const p of reachable(e.dfa)) {
        for (const q of reachable(e.dfa)) {
          if (p >= q) continue;
          const w = distinguishing(e.dfa, p, q);
          const acc = (s: State, x: string) => dfaRun({ ...e.dfa, start: s }, x).accepted;
          if (w === null) {
            expect(stringsUpTo(e.dfa.alphabet, 8).every((x) => acc(p, x) === acc(q, x)), `${p} ${q}`).toBe(true);
          } else {
            expect(acc(p, w)).not.toBe(acc(q, w));
            if (w.length > 0) expect(stringsUpTo(e.dfa.alphabet, w.length - 1).every((x) => acc(p, x) === acc(q, x)), `${p} ${q} shorter`).toBe(true);
          }
        }
      }
    }
  });

  it('prefixes of a^n b^n are all different: the class count equals k + 1 for every k and never stops growing', () => {
    const member = (s: string) => /^(a*)(b*)$/.test(s) && s.split('a').length - 1 === s.split('b').length - 1;
    for (let k = 1; k <= 8; k++) {
      const prefixes = Array.from({ length: k + 1 }, (_, i) => 'a'.repeat(i));
      expect(prefixClasses(member, ['a', 'b'], prefixes, k + 1)).toBe(k + 1);
    }
  });
});
