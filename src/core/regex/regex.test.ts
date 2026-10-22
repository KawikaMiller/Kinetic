/**
 * The independent oracle here is the real RegExp, used on lesson-authored patterns only, in this test file.
 * No source file in core/regex touches RegExp on learner text (see the source test below).
 */
import { describe, expect, it } from 'vitest';
import { subsetConstruct } from '../automata';
import { mulberry32, type Rnd } from '../random';
import {
  DFA_STATE_CAP, buildNfa, candidateMatches, countParts, dfaAccepts, epsilonCount, matchAt, matchEndsFrom, parsePattern, parseSubject,
  patternAlphabet, predictedEpsilons, predictedStates, runNfa, searchLeftmost, subsetSizes, symbolOf,
} from './index';
import { BANK, SUBJECTS, construct, full, parse } from './regexBank';

/** A step budget the bank patterns never reach. */
const BUDGET = 100_000;

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
        expect(matchAt(root, [...s], 0, { budget: BUDGET, mustEnd: true }).status === 'match', `${p} on "${s}"`).toBe(re.test(s));
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
      const mine = searchLeftmost(parsed.value.root, subject, { budget: BUDGET });
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
    expect(searchLeftmost(p.root, ['a', 'b'], { budget: BUDGET })).toMatchObject({ start: 0, end: 1 });
    expect(/a|ab/.exec('ab')?.[0]).toBe('a');
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

describe('the dot treats every unnamed character as ELSE', () => {
  it('a.b accepts a, then any single character, then b, including one the pattern never names', () => {
    const c = construct('a.b');
    expect(runNfa(c, [...'azb'], 'full').accepted).toBe(true);
    expect(runNfa(c, [...'ab'], 'full').accepted).toBe(false);
  });
});

describe('the DFA panel cannot be made to hang', () => {
  it('a pattern whose DFA has millions of states is capped, quickly', () => {
    const hostile = '.*a' + '.'.repeat(21);
    expect(hostile).toHaveLength(24);
    const t0 = Date.now();
    const sizes = subsetSizes(construct(hostile));
    expect(sizes.capped).toBe(true);
    expect(sizes.dfaStates).toBe(DFA_STATE_CAP + 1);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('under the cap the count equals the shared subset construction on every bank pattern', () => {
    for (const p of BANK) {
      const c = construct(p);
      const sizes = subsetSizes(c);
      expect(sizes.capped, p).toBe(false);
      expect(sizes.dfaStates, p).toBe(subsetConstruct(c.nfa).dfa.states.length);
    }
  });

  it('a small cap is honoured exactly', () => {
    const c = construct('[ab]*a[ab][ab][ab]');
    expect(subsetSizes(c, 5).capped).toBe(true);
    expect(subsetSizes(c, 1000)).toEqual({ nfaStates: c.nfa.states.length, dfaStates: subsetConstruct(c.nfa).dfa.states.length, capped: false });
  });
});

describe('open attempts are not blamed for the budget', () => {
  it('when the budget runs out, the first step is still open (ok null), not a failure', () => {
    const r = matchAt(parse('(a*)*b').root, Array.from({ length: 24 }, () => 'a'), 0, { budget: 1000, mustEnd: true, traceLimit: 50 });
    expect(r.status).toBe('budget');
    expect(r.trace[0].ok).toBeNull();
    expect(r.trace.every((e) => e.ok === null || typeof e.ok === 'boolean')).toBe(true);
  });
});

describe('subjects and patterns the dialect refuses', () => {
  it('line breaks in a subject are refused with a position, so the two engines never disagree about a dot', () => {
    for (const ch of ['\n', '\r', String.fromCharCode(0x2028), String.fromCharCode(0x2029)]) {
      const r = parseSubject('ab' + ch + 'c');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/^Position 3:/);
    }
  });

  it('an unclosed group names the group, not an empty alternative', () => {
    for (const p of ['(', '()', '(a|']) {
      const r = parsePattern(p);
      expect(r.ok, p).toBe(false);
      if (!r.ok && p !== '()') expect(r.error, p).toMatch(/never closed/);
    }
  });
});

describe('no learner text reaches RegExp, eval or Function', () => {
  const sources = import.meta.glob<string>('./*.ts', { query: '?raw', import: 'default', eager: true });
  const moduleSources = Object.entries(sources).filter(([name]) => !name.endsWith('.test.ts') && !name.endsWith('regexBank.ts'));
  it('the core/regex sources contain no new RegExp, RegExp( call, eval( or new Function', () => {
    expect(moduleSources.map(([name]) => name)).toContain('./backtrack.ts');
    for (const [name, text] of moduleSources) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, name).not.toMatch(/new\s+RegExp|RegExp\s*\(|\beval\s*\(|new\s+Function|\bFunction\s*\(/);
    }
  });
});

describe('what a ReDoS lesson reads from a run', () => {
  const a = (n: number) => Array.from({ length: n }, () => 'a');
  const root = parse('(a*)*b').root;

  it('perStart splits the budget by start position and sums to the steps', () => {
    const r = searchLeftmost(root, a(6), { budget: BUDGET });
    expect(r.status).toBe('fail');
    expect(r.perStart.map((p) => p.start)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(r.perStart.reduce((sum, p) => sum + p.steps, 0)).toBe(r.steps);
    for (let i = 1; i < r.perStart.length; i++) expect(r.perStart[i].steps).toBeLessThan(r.perStart[i - 1].steps);
  });

  it('on a budget run the last perStart entry is the start that ran out, and the sum is the budget', () => {
    const r = searchLeftmost(root, a(24), { budget: 5000 });
    expect(r.status).toBe('budget');
    expect(r.perStart).toHaveLength(1);
    expect(r.perStart[0]).toEqual({ start: 0, steps: 5000 });
  });

  it('traceTail keeps the last attempts, in order, and says it dropped the rest', () => {
    const r = matchAt(root, a(8), 0, { budget: BUDGET, mustEnd: true, traceTail: 10 });
    expect(r.trace).toHaveLength(10);
    expect(r.trace[9].step).toBe(r.steps);
    expect(r.trace.map((e) => e.step)).toEqual(Array.from({ length: 10 }, (_, i) => r.steps - 9 + i));
    expect(r.traceTruncated).toBe(true);
  });

  it('traceLimit still keeps the first attempts and wins over traceTail', () => {
    const r = matchAt(root, a(8), 0, { budget: BUDGET, mustEnd: true, traceLimit: 5, traceTail: 3 });
    expect(r.trace.map((e) => e.step)).toEqual([1, 2, 3, 4, 5]);
  });

  it('no trace option means no trace and no truncation flag', () => {
    const r = matchAt(root, a(8), 0, { budget: BUDGET, mustEnd: true });
    expect(r.trace).toEqual([]);
    expect(r.traceTruncated).toBe(false);
  });

  it('captures give the whole span and each group, null for a group that did not take part', () => {
    const r = searchLeftmost(parse('(a)|(b)').root, ['x', 'b'], { budget: BUDGET });
    expect(r.status).toBe('match');
    expect(r.captures).toEqual([[1, 2], null, [1, 2]]);
    const m = /(a)|(b)/.exec('xb')!;
    expect([m.index, m.index + m[0].length]).toEqual(r.captures[0]);
    expect(m[1]).toBeUndefined();
    expect(searchLeftmost(parse('(a+)(b+)').root, [...'xaabbb'], { budget: BUDGET }).captures).toEqual([[1, 6], [1, 3], [3, 6]]);
  });

  it('a failed or given-up run has no captures', () => {
    expect(searchLeftmost(parse('(a)').root, ['b'], { budget: BUDGET }).captures).toEqual([]);
    expect(searchLeftmost(root, a(24), { budget: 100 }).captures).toEqual([]);
  });
});
