import { describe, expect, it } from 'vitest';
import {
  BROKEN_CASES, DEFAULT_PATTERNS, MAX_LETTERS, MAX_PATTERNS, OUTPUT_LINK_WITNESS, ROOT, TEXT_MAX, addPattern, brokenReport, buildMachine, buildTrie,
  failureLinks, judgeLink, matchKeys, naiveScan, outputLinks, parseText, runMachine, seededCase,
} from './model';

const machine = buildMachine(DEFAULT_PATTERNS);
const stringsOf = (m: ReturnType<typeof buildMachine>) => m.trie.states.map((s) => s.string);

/** Oracle: the failure link by definition, the longest proper suffix of the state's string that is a prefix of some pattern. */
const failByDefinition = (patterns: readonly string[], s: string): string => {
  const prefixes = new Set(patterns.flatMap((p) => Array.from({ length: p.length + 1 }, (_, k) => p.slice(0, k))));
  for (let k = 1; k <= s.length; k += 1) {
    const suffix = s.slice(k);
    if (prefixes.has(suffix)) return suffix;
  }
  return '';
};

/** Oracle: every pattern that is a suffix of the state's string. */
const outputsByDefinition = (patterns: readonly string[], s: string) => patterns.filter((p) => s.endsWith(p)).sort();

describe('hand-worked vectors for he, she, his, hers', () => {
  it('states in insertion order and their failure links', () => {
    expect(stringsOf(machine)).toEqual(['', 'h', 'he', 's', 'sh', 'she', 'hi', 'his', 'her', 'hers']);
    // 4 (sh) to 1 (h); 5 (she) to 2 (he); 7 (his) to 3 (s); 9 (hers) to 3 (s); the rest to the root.
    expect(machine.fail).toEqual([0, 0, 0, 0, 1, 2, 0, 3, 0, 3]);
  });

  it('only state 5 has an output link, to state 2', () => {
    expect(machine.out).toEqual([-1, -1, -1, -1, -1, 2, -1, -1, -1, -1]);
  });

  it('ushers: she at 1 to 3, he at 2 to 3 and hers at 2 to 5, with 6 reads and 1 failure follow; the naive scan compares 23 characters', () => {
    const run = runMachine(machine, 'ushers');
    expect(run.matches).toEqual([
      { pattern: 'she', start: 1, end: 3 },
      { pattern: 'he', start: 2, end: 3 },
      { pattern: 'hers', start: 2, end: 5 },
    ]);
    expect([run.reads, run.follows]).toEqual([6, 1]);
    const states = run.steps.filter((s) => s.kind === 'move' || s.kind === 'stay').map((s) => s.to);
    expect(states).toEqual([0, 3, 4, 5, 8, 9]);
    expect(naiveScan(DEFAULT_PATTERNS, 'ushers').compared).toBe(6 + 6 + 5 + 6);
  });

  it('hishers: his at 0, she at 2, he at 3, hers at 3', () => {
    const keys = matchKeys(runMachine(machine, 'hishers').matches);
    expect(keys).toEqual(['he@3', 'hers@3', 'his@0', 'she@2']);
  });

  it('the set a, ab, bab, bc, bca, c, caa on abccab gives seven matches', () => {
    const m = buildMachine(['a', 'ab', 'bab', 'bc', 'bca', 'c', 'caa']);
    expect(matchKeys(runMachine(m, 'abccab').matches)).toEqual(['a@0', 'a@4', 'ab@0', 'ab@4', 'bc@1', 'c@2', 'c@3']);
  });
});

describe('oracles', () => {
  it('failure links equal the definition and outputs equal "every pattern that is a suffix", on the seeded cases', () => {
    for (let seed = 0; seed < 500; seed += 1) {
      const { patterns } = seededCase(seed);
      const m = buildMachine(patterns);
      m.trie.states.forEach((state, id) => {
        expect(m.trie.states[m.fail[id]].string, `${patterns} / ${state.string}`).toBe(id === ROOT ? '' : failByDefinition(patterns, state.string));
        const reported = [state.ends >= 0 ? patterns[state.ends] : null];
        for (let o = m.out[id]; o >= 0; o = m.out[o]) reported.push(patterns[m.trie.states[o].ends]);
        expect(reported.filter((x): x is string => x !== null).sort(), `${patterns} / ${state.string}`).toEqual(outputsByDefinition(patterns, state.string));
      });
    }
  });

  it('500 seeded (pattern set, text) pairs match the naive multi-pattern scan, and failure follows never exceed the characters read', () => {
    for (let seed = 0; seed < 500; seed += 1) {
      const { patterns, text } = seededCase(seed);
      const run = runMachine(buildMachine(patterns), text);
      expect(matchKeys(run.matches), `seed ${seed}`).toEqual(matchKeys(naiveScan(patterns, text).matches));
      expect(run.follows).toBeLessThanOrEqual(run.reads);
    }
  });

  it('is exhaustive over all 510 texts of length 1 to 8 over {a, b} for three fixed pattern sets', () => {
    const texts: string[] = [];
    for (let len = 1; len <= 8; len += 1) for (let bits = 0; bits < 2 ** len; bits += 1) texts.push(Array.from({ length: len }, (_, i) => ((bits >> i) & 1 ? 'b' : 'a')).join(''));
    expect(texts).toHaveLength(510);
    for (const patterns of [['a', 'ab', 'ba', 'bab'], ['aa', 'aab', 'ab', 'b'], ['abab', 'ba', 'b', 'aa']]) {
      const m = buildMachine(patterns);
      for (const t of texts) {
        const run = runMachine(m, t);
        expect(matchKeys(run.matches), `${patterns} / ${t}`).toEqual(matchKeys(naiveScan(patterns, t).matches));
        expect(run.follows).toBeLessThanOrEqual(t.length);
      }
    }
  });

  it('builds its own trie: the lesson imports nothing from core/automata', async () => {
    const sources = import.meta.glob('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const own = Object.entries(sources).filter(([path]) => !path.endsWith('.test.ts'));
    expect(own.length).toBeGreaterThan(0);
    for (const [path, source] of own) expect(source, path).not.toMatch(/core\/automata/);
  });

  it('the trie and links are rebuilt from the pattern list in order', () => {
    const trie = buildTrie(['he', 'she']);
    expect(trie.states.map((s) => s.string)).toEqual(['', 'h', 'he', 's', 'sh', 'she']);
    expect(failureLinks(trie)).toEqual([0, 0, 0, 0, 1, 2]);
    expect(outputLinks(trie, failureLinks(trie))).toEqual([-1, -1, -1, -1, -1, 2]);
  });
});

describe('manipulation: wrong failure links are refused with the computed reason', () => {
  it("manipulation 1: sh to she is refused as not shorter, naming 'h' (state 1)", () => {
    expect(judgeLink(machine, 4, 5)).toEqual({
      ok: false,
      error: "A failure link must point to a shorter string. For 'sh' the longest proper suffix that is also a pattern prefix is 'h' (state 1), not 'she'.",
    });
    expect(judgeLink(machine, 4, 4).ok).toBe(false);
  });

  it("manipulation 2: sh to the root is refused as not the longest, naming 'h' (state 1) and the pattern he", () => {
    expect(judgeLink(machine, 4, ROOT)).toEqual({
      ok: false,
      error: "Not the longest: 'h' (state 1) is also a suffix of 'sh' and a prefix of 'he', so the link goes there, not to the root (the empty string).",
    });
  });

  it('manipulation 3: a shorter string that is not a suffix is refused, and the right answers are accepted', () => {
    const verdict = judgeLink(machine, 4, 3);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.error).toContain("'s' is not a suffix of 'sh'");
    expect(judgeLink(machine, 4, 1).ok).toBe(true);
    expect(judgeLink(machine, 5, 2).ok).toBe(true);
    for (const id of [1, 2, 3, 6, 8]) expect(judgeLink(machine, id, ROOT).ok).toBe(true);
  });

  it('every wrong target for every state is refused, and exactly one target per state is accepted', () => {
    for (const patterns of [DEFAULT_PATTERNS, ['aab', 'ab', 'bab']]) {
      const m = buildMachine(patterns);
      for (let state = 1; state < m.trie.states.length; state += 1) {
        const accepted = m.trie.states.filter((_, target) => judgeLink(m, state, target).ok);
        expect(accepted.map((s) => s.id)).toEqual([m.fail[state]]);
      }
    }
  });
});

describe('the pattern editor and text field at their limits', () => {
  it('refuses empty, duplicate, uppercase, too long, too many and too many letters, each with its reason', () => {
    expect(addPattern([], '')).toEqual({ ok: false, error: 'A pattern needs at least one letter.' });
    expect(addPattern(['he'], 'he')).toEqual({ ok: false, error: 'he is already a pattern.' });
    expect(addPattern([], 'He')).toEqual({ ok: false, error: 'Lowercase letters only in this lesson.' });
    expect(addPattern([], 'abcdefg').ok).toBe(false);
    expect(addPattern([], 'abcdef').ok).toBe(true);
    const six = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(six).toHaveLength(MAX_PATTERNS);
    expect(addPattern(six, 'g').ok).toBe(false);
    expect(addPattern(['abcdef', 'abcdee', 'abcdeg', 'abcdeh'], 'x').ok, 'a fifth pattern at 24 letters in all is refused').toBe(false);
    expect(['abcdef', 'abcdee', 'abcdeg', 'abcdeh'].join('').length).toBe(MAX_LETTERS);
    expect(addPattern(['abcdef', 'abcdee', 'abcdeg'], 'abcdez').ok).toBe(true);
  });

  it('the text field takes 1 to 24 lowercase letters', () => {
    expect(parseText('a').ok).toBe(true);
    expect(parseText('a'.repeat(TEXT_MAX)).ok).toBe(true);
    expect(parseText('a'.repeat(TEXT_MAX + 1)).ok).toBe(false);
    expect(parseText('').ok).toBe(false);
    expect(parseText('Ab').ok).toBe(false);
  });
});

describe('broken mode: no output links', () => {
  it('misses he at 2 to 3 in ushers, the seed-free witness', () => {
    const report = brokenReport();
    expect(report.witness.text).toBe(OUTPUT_LINK_WITNESS);
    expect(report.witness.reported.map((m) => `${m.pattern}@${m.start}`).sort()).toEqual(['hers@2', 'she@1']);
    expect(report.witness.missed).toEqual([{ pattern: 'he', start: 2, end: 3 }]);
  });

  it('fails on a minority of the 500 seeded cases (at most 90%), always by missing a nested match, and the fixed scan matches the naive one on all 500', () => {
    const report = brokenReport();
    expect(report.cases).toBe(BROKEN_CASES);
    expect(report.failing).toBeGreaterThan(0);
    expect(report.failing / report.cases).toBeLessThanOrEqual(0.9);
    let wrongForOtherReason = 0;
    for (let seed = 0; seed < BROKEN_CASES; seed += 1) {
      const { patterns, text } = seededCase(seed);
      const m = buildMachine(patterns);
      const truth = new Set(matchKeys(naiveScan(patterns, text).matches));
      const broken = matchKeys(runMachine(m, text, false).matches);
      if (broken.some((key) => !truth.has(key))) wrongForOtherReason += 1;
      expect(matchKeys(runMachine(m, text).matches)).toEqual([...truth].sort());
    }
    expect(wrongForOtherReason, 'the broken scan never invents a match: it only loses nested ones').toBe(0);
    expect(report.lowestFailingSeed).toBeGreaterThanOrEqual(0);
  });
});
