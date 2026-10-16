/**
 * The independent oracle here is the real RegExp, used on lesson-authored patterns only, in this test file.
 * No lesson source file touches RegExp on learner text (see the source test at the bottom).
 */
import { describe, expect, it } from 'vitest';
import { subsetConstruct } from '../../core/automata';
import { mulberry32, type Rnd } from '../../core/random';
import { matchAt, searchLeftmost } from './backtrack';
import { STEP_BUDGET, candidateMatches, dfaAccepts, growthTable, matchEndsFrom, runNfa, workSeries } from './engines';
import { countParts, parsePattern, type ParsedRegex } from './regexParse';
import { buildNfa, epsilonCount, patternAlphabet, predictedEpsilons, predictedStates, symbolOf } from './thompson';

const BANK = [
  'a', 'ab', 'a|b', 'a*', 'a+', 'a?', '(ab)*', '(ab)+', 'a(b|c)*d', 'a?b*', 'colou?r', '(a|b)*c', '[ab]*c', '[abc]+', 'a.b', '.*', '.+a',
  '(a*)*b', '(a|ab)(c|bcd)', 'a|ab', 'ab|a', '(a|b)*abb', '[ab]*a[ab][ab]', '(a+b+)+', 'a*b*c*', '(ab|a)(bc|c)?', '((a|b)c)*', '(a?)*',
  '(a|b|c)+', 'c*a*', '(abc)?', 'a(bc)*', '(a*|b)*c', '(a|bc)*', 'b+(a|c)?', '(.)(.)', '[ab][bc]', '(a|b)(b|c)(a|c)', 'a?a?a?', '(ab*)+c?',
];

const parse = (p: string): ParsedRegex => {
  const r = parsePattern(p);
  if (!r.ok) throw new Error(`${p}: ${r.error}`);
  return r.value;
};
const construct = (p: string) => {
  const r = buildNfa(parse(p));
  if (!r.ok) throw new Error(`${p}: ${r.error}`);
  return r.value;
};

/** Every string over a, b, c of length 0 to `max`. */
function strings(max: number): string[] {
  const out = [''];
  let layer = [''];
  for (let n = 1; n <= max; n++) {
    layer = layer.flatMap((s) => ['a', 'b', 'c'].map((ch) => s + ch));
    out.push(...layer);
  }
  return out;
}
const SUBJECTS = strings(8);
const full = (p: string) => new RegExp(`^(?:${p})$`);

describe('the bank', () => {
  it('has 40 patterns, all inside the dialect', () => {
    expect(BANK).toHaveLength(40);
    for (const p of BANK) expect(parsePattern(p).ok, p).toBe(true);
  });

  it('the NFA simulation agrees with real RegExp on every string over {a,b,c} of length 0-8', () => {
    for (const p of BANK) {
      const c = construct(p);
      const re = full(p);
      for (const s of SUBJECTS) expect(runNfa(c, [...s], 'full').accepted, `${p} on "${s}"`).toBe(re.test(s));
    }
  });

  it('the subset DFA equals the NFA on the same strings', () => {
    for (const p of BANK) {
      const c = construct(p);
      const { dfa } = subsetConstruct(c.nfa);
      for (const s of SUBJECTS) {
        const symbols = [...s].map((ch) => symbolOf(c.nfa.alphabet, ch));
        expect(dfaAccepts(dfa, symbols), `${p} on "${s}"`).toBe(runNfa(c, [...s], 'full').accepted);
      }
    }
  });

  it('search mode equals an unanchored RegExp test', () => {
    for (const p of BANK) {
      const c = construct(p);
      const re = new RegExp(p);
      for (const s of SUBJECTS.filter((x) => x.length <= 6)) expect(runNfa(c, [...s], 'search').accepted, `${p} in "${s}"`).toBe(re.test(s));
    }
  });

  it('the backtracking matcher agrees on full matches too', () => {
    for (const p of BANK) {
      const { root } = parse(p);
      const re = full(p);
      for (const s of SUBJECTS.filter((x) => x.length <= 6)) {
        expect(matchAt(root, [...s], 0, { budget: STEP_BUDGET, mustEnd: true }).status === 'match', `${p} on "${s}"`).toBe(re.test(s));
      }
    }
  });
});

describe('construction counts', () => {
  it('states equal 2 x (atoms + alternation nodes + quantifiers), and stay within 2 x (atoms + operators), for the bank', () => {
    for (const p of BANK) {
      const { root } = parse(p);
      const c = construct(p);
      const parts = countParts(root);
      expect(c.nfa.states.length, p).toBe(2 * (parts.atoms + parts.alternationNodes + parts.quantifiers));
      expect(c.nfa.states.length, p).toBe(predictedStates(root));
      expect(c.nfa.states.length, p).toBeLessThanOrEqual(2 * (parts.atoms + parts.operators));
    }
  });

  it('epsilon arrows counted from the transition table equal the edge list and the rule-based prediction', () => {
    for (const p of BANK) {
      const { root } = parse(p);
      const c = construct(p);
      const listed = c.edges.filter((e) => e.symbols[0] === 'ε').length;
      expect(epsilonCount(c.nfa), p).toBe(listed);
      expect(epsilonCount(c.nfa), p).toBe(predictedEpsilons(root));
    }
  });

  it('a(b|c)*d has 12 states by hand: 4 atoms x 2 + the alternation 2 + the star 2, and 10 epsilon arrows: 2 joins, 4 for the alternation, 4 for the star', () => {
    const c = construct('a(b|c)*d');
    expect(c.nfa.states).toHaveLength(12);
    expect(epsilonCount(c.nfa)).toBe(2 + 4 + 4);
  });

  it('a broken construction (star without the skip arrow) fails the bank on a* with the empty string', () => {
    const broken = buildNfa(parse('a*'), { skipStarShortcut: true });
    if (!broken.ok) throw new Error('builds');
    expect(runNfa(broken.value, [], 'full').accepted).toBe(false);
    expect(full('a*').test('')).toBe(true);
    const failures = BANK.filter((p) => {
      const b = buildNfa(parse(p), { skipStarShortcut: true });
      if (!b.ok) return false;
      return SUBJECTS.some((s) => runNfa(b.value, [...s], 'full').accepted !== full(p).test(s));
    });
    expect(failures).toContain('a*');
  });

  it('the alphabet names every literal and set character, and ELSE only for a dot', () => {
    expect(patternAlphabet(parse('a(b|c)*d').root)).toEqual(['a', 'b', 'c', 'd']);
    expect(patternAlphabet(parse('a.b').root)).toEqual(['a', 'b', 'else']);
  });
});

describe('growth table', () => {
  it('the NFA grows by 2 states per added [ab] while the DFA states beyond the start set double', () => {
    const rows = growthTable();
    expect(rows.map((r) => r.k)).toEqual([0, 1, 2, 3, 4]);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].nfaStates - rows[i - 1].nfaStates).toBe(2);
      expect(rows[i].dfaStates - 1).toBe((rows[i - 1].dfaStates - 1) * 2);
    }
  });

  it('the DFA sizes match a hand count: 2^(k+1) loop states plus the start set, which the loop never re-enters', () => {
    expect(growthTable().map((r) => r.dfaStates)).toEqual([3, 5, 9, 17, 33]);
  });
});

/** A random pattern in the dialect, as text. */
function randomPattern(rnd: Rnd): string {
  let groups = 0;
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const atom = (depth: number): string => {
    const r = rnd();
    if (r < 0.5 || depth === 0) return pick(['a', 'b', 'c', 'a', 'b', '.', '[ab]', '[bc]']);
    const index = ++groups;
    const inner = alt(depth - 1);
    return `(${inner})${rnd() < 0.2 ? `\\${index}` : ''}`;
  };
  const rep = (depth: number): string => {
    const a = atom(depth);
    const wrapped = a.endsWith(')') || a.length === 1 || a.startsWith('[') ? a : `(${a})`;
    return rnd() < 0.45 ? wrapped + pick(['*', '+', '?']) : a;
  };
  const cat = (depth: number): string => Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => rep(depth)).join('');
  const alt = (depth: number): string => (rnd() < 0.3 ? `${cat(depth)}|${cat(depth)}` : cat(depth));
  return alt(2);
}

describe('leftmost-first backtracking equals RegExp.exec', () => {
  it('on 2,000 seeded (pattern, string) pairs, including back-references', () => {
    const rnd = mulberry32(2024);
    let compared = 0;
    let withBackref = 0;
    let matched = 0;
    while (compared < 2000) {
      const p = randomPattern(rnd);
      const parsed = parsePattern(p);
      if (!parsed.ok) continue;
      const subject = Array.from({ length: Math.floor(rnd() * 9) }, () => 'abc'[Math.floor(rnd() * 3)]);
      const mine = searchLeftmost(parsed.value.root, subject, { budget: STEP_BUDGET });
      if (mine.status === 'budget') continue;
      const real = new RegExp(p).exec(subject.join(''));
      compared++;
      if (parsed.value.usesBackref) withBackref++;
      if (real) matched++;
      expect(mine.status === 'match', `${p} on "${subject.join('')}"`).toBe(real !== null);
      if (real) expect([mine.start, mine.end], `${p} on "${subject.join('')}"`).toEqual([real.index, real.index + real[0].length]);
    }
    expect(withBackref).toBeGreaterThan(50);
    expect(matched).toBeGreaterThan(500);
  });
});

describe('the longest match', () => {
  it('equals a brute-force scan of every (start, end) with the real full-match test', () => {
    for (const p of BANK.filter((x) => !x.includes('\\'))) {
      const c = construct(p);
      for (const s of SUBJECTS.filter((x) => x.length <= 5)) {
        let expected: { start: number; end: number } | null = null;
        for (let start = 0; start <= s.length && !expected; start++) {
          for (let end = s.length; end >= start; end--) {
            if (full(p).test(s.slice(start, end))) {
              expected = { start, end };
              break;
            }
          }
        }
        const got = candidateMatches(c, [...s]);
        const longest = got ? { start: got.start, end: Math.max(...got.ends) } : null;
        expect(longest, `${p} in "${s}"`).toEqual(expected);
      }
    }
  });

  it('a|ab on ab: the NFA allows ends 1 and 2, the backtracker returns a, the longest is ab, and real JS agrees with the first', () => {
    const p = parse('a|ab');
    const c = construct('a|ab');
    expect(matchEndsFrom(c, ['a', 'b'], 0)).toEqual([1, 2]);
    expect(searchLeftmost(p.root, ['a', 'b'], { budget: STEP_BUDGET })).toMatchObject({ start: 0, end: 1 });
    expect(/a|ab/.exec('ab')?.[0]).toBe('a');
  });
});

describe('the step budget', () => {
  it('(a*)*b on n a\'s: steps never fall as n grows, grow faster than the input, and the budget message state appears at the cap', () => {
    const p = parse('(a*)*b');
    const series = workSeries(p, construct('(a*)*b'), Array.from({ length: 24 }, () => 'a'));
    for (let i = 1; i < series.length; i++) expect(series[i].backtracking).toBeGreaterThanOrEqual(series[i - 1].backtracking);
    expect(series[series.length - 1].backtracking).toBeGreaterThan(24 * 24);
    expect(series.some((pt) => pt.exhausted)).toBe(true);
    expect(series.find((pt) => pt.exhausted)?.backtracking).toBe(STEP_BUDGET);
    const nfa = series.map((pt) => pt.nfa as number);
    for (let i = 1; i < nfa.length; i++) expect(nfa[i]).toBeGreaterThanOrEqual(nfa[i - 1]);
  });

  it('NFA work is bounded by length x states', () => {
    for (const p of BANK) {
      const c = construct(p);
      for (const s of SUBJECTS.filter((x) => x.length === 8).slice(0, 40)) {
        expect(runNfa(c, [...s], 'full').work, p).toBeLessThanOrEqual(8 * c.nfa.states.length);
      }
    }
  });

  it('a back-reference has no NFA: the build refuses with the memory sentence', () => {
    const r = buildNfa(parse('(a)\\1'));
    expect(r).toEqual({ ok: false, error: 'this needs memory an automaton does not have.' });
  });
});

describe('hostile patterns are refused with a position', () => {
  const cases: [string, RegExp][] = [
    ['a(b', /^Position 2: .*never closed/],
    ['*a', /^Position 1: nothing to repeat/],
    ['a**', /^Position 3: nothing to repeat/],
    ['a*?', /^Position 3: lazy quantifiers/],
    ['a||b', /^Position 3: empty alternative/],
    ['a|', /^Position 3: empty alternative/],
    ['()', /^Position 2: empty alternative/],
    ['a)', /^Position 2: this \) closes nothing/],
    ['\\q', /^Position 1: unknown escape/],
    ['\\2(a)', /^Position 1: \\2 needs group 2/],
    ['[]', /^Position 2: an empty set/],
    ['[a-c]', /^Position 3: ranges/],
    ['a{2}', /^Position 2: "\{" is not part of/],
    ['^a', /^Position 1: "\^" is not part of/],
    ['a b', /^Position 2: spaces/],
    ['a'.repeat(25), /25 characters; the limit is 24/],
    ['', /^Type a pattern/],
  ];
  it.each(cases)('%s', (pattern, message) => {
    const r = parsePattern(pattern);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(message);
  });

  it('a pattern that matches the empty string is allowed', () => {
    const c = construct('a*');
    expect(runNfa(c, [], 'full').accepted).toBe(true);
  });
});

describe('no learner text reaches RegExp, eval or Function', () => {
  const sources = import.meta.glob<string>('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });
  const lessonSources = Object.entries(sources).filter(([name]) => !name.endsWith('.test.ts'));
  it('the lesson sources contain no new RegExp, RegExp( call, eval( or new Function', () => {
    expect(lessonSources.map(([name]) => name)).toContain('./backtrack.ts');
    for (const [name, text] of lessonSources) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, name).not.toMatch(/new\s+RegExp|RegExp\s*\(|\beval\s*\(|new\s+Function|\bFunction\s*\(/);
    }
  });
});

describe('the dot treats every unnamed character as ELSE', () => {
  it('a.b accepts a, then any single character, then b, including one the pattern never names', () => {
    const c = construct('a.b');
    expect(runNfa(c, [...'azb'], 'full').accepted).toBe(true);
    expect(runNfa(c, [...'ab'], 'full').accepted).toBe(false);
  });
});
