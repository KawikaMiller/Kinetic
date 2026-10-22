import { describe, expect, it } from 'vitest';
import { nfaRun } from '../../core/automata';
import { matchAt } from '../../core/regex';
import { stringsUpTo } from '../../core/testing/strings';
import { BUDGET, MAX_LETTERS, MAX_TEXT_CHARS, backtrackVisits, growthSeries, lazyDfaVisits, letters, nfaVisits, parseText, type Point } from './engines';
import { BUDGETS, CAP_MAX, CAP_MIN, fixesOutcome, type FixesState, type RiskyId } from './fixes';
import { EXPONENTIAL_RATIO, classifyGrowth } from './growth';
import { PATTERNS, machineOf, parsedOf } from './patterns';
import { splitTree, TREE_CAP } from './splitTree';

/**
 * The oracle for the matcher: the browser's own RegExp, run ONLY on the short fixed strings enumerated here (never
 * on a long input, never timed). One literal per lesson pattern, written out by hand.
 */
const REAL: Record<string, RegExp> = {
  'a+': /^a+$/,
  'a*a*b': /^a*a*b$/,
  '(a|aa)+': /^(a|aa)+$/,
  '(a+)+': /^(a+)+$/,
  'a*b': /^a*b$/,
};

const GOLDEN = (1 + Math.sqrt(5)) / 2;
const within = (value: number, target: number, tolerance: number) => Math.abs(value - target) / target <= tolerance;
const visitsAt = (source: string, n: number) => backtrackVisits(source, letters(n)).visits;

describe('the matcher agrees with the real RegExp on short strings', () => {
  it('for the four patterns and the rewrites over every string of up to 10 characters on {a, !}', () => {
    const strings = stringsUpTo(['a', '!'], 10);
    expect(strings.length).toBe(2 ** 11 - 1);
    for (const source of Object.keys(REAL)) {
      const root = parsedOf(source).root;
      for (const s of strings) {
        const mine = matchAt(root, [...s], 0, { budget: BUDGET, mustEnd: true });
        expect(mine.status === 'match', `${source} on "${s}"`).toBe(REAL[source].test(s));
      }
    }
  });

  it('and over every string of up to 8 characters on {a, b, !}, which the quadratic pattern needs', () => {
    for (const source of Object.keys(REAL)) {
      const root = parsedOf(source).root;
      for (const s of stringsUpTo(['a', 'b', '!'], 8)) {
        expect(matchAt(root, [...s], 0, { budget: BUDGET, mustEnd: true }).status === 'match', `${source} on "${s}"`).toBe(REAL[source].test(s));
      }
    }
  });

  it('the NFA simulation agrees with the matcher on the same strings', () => {
    for (const source of Object.keys(REAL)) {
      for (const s of stringsUpTo(['a', 'b', '!'], 7)) {
        expect(nfaVisits(source, [...s]).matched, `${source} on "${s}"`).toBe(REAL[source].test(s));
      }
    }
  });

  it('every rewrite accepts the same strings as the pattern it replaces', () => {
    for (const p of PATTERNS) {
      for (const s of stringsUpTo(['a', 'b', '!'], 8)) expect(REAL[p.rewrite].test(s), `${p.source} vs ${p.rewrite} on "${s}"`).toBe(REAL[p.source].test(s));
    }
  });
});

describe('growth, counted and never timed', () => {
  it('(a+)+ doubles with each letter, within 5% of 2 for n = 10 to 18', () => {
    for (let n = 10; n <= 18; n++) expect(within(visitsAt('(a+)+', n + 1) / visitsAt('(a+)+', n), 2, 0.05), `n = ${n}`).toBe(true);
  });

  it('(a|aa)+ grows by the golden ratio, within 3% of 1.618 for n = 14 to 20', () => {
    for (let n = 14; n <= 20; n++) expect(within(visitsAt('(a|aa)+', n + 1) / visitsAt('(a|aa)+', n), GOLDEN, 0.03), `n = ${n}`).toBe(true);
  });

  it('the quadratic pattern quadruples when n doubles (within 10% at n = 30) and the linear one doubles (within 10% at n = 20)', () => {
    expect(within(visitsAt('a*a*b', 60) / visitsAt('a*a*b', 30), 4, 0.1)).toBe(true);
    expect(within(visitsAt('a+', 40) / visitsAt('a+', 20), 2, 0.1)).toBe(true);
  });

  it('the budget stops a run at exactly 2,000,000 visits and says so, apart from a verdict', () => {
    const r = backtrackVisits('(a+)+', letters(19));
    expect(r).toEqual({ visits: 2_000_000, gaveUp: true, matched: false });
    const direct = matchAt(parsedOf('(a+)+').root, letters(19), 0, { budget: BUDGET, mustEnd: true });
    expect([direct.status, direct.steps]).toEqual(['budget', 2_000_000]);
    expect(backtrackVisits('(a+)+', letters(18)).gaveUp).toBe(false);
  });

  it('a smaller budget gives exactly what running with that budget gives', () => {
    for (const budget of BUDGETS) {
      for (const n of [5, 12, 16, 22]) {
        const derived = backtrackVisits('(a+)+', letters(n), budget);
        const direct = matchAt(parsedOf('(a+)+').root, letters(n), 0, { budget, mustEnd: true });
        expect([derived.visits, derived.gaveUp]).toEqual([direct.steps, direct.status === 'budget']);
      }
    }
  });

  it('the matcher makes at least as many visits as there are ways to cut the letters, counted by brute force', () => {
    const cuts = (n: number): number => (n === 0 ? 1 : Array.from({ length: n }, (_, i) => cuts(n - 1 - i)).reduce((a, b) => a + b, 0));
    for (let n = 1; n <= 12; n++) {
      expect(splitTree(n, 10 ** 6).cuts).toBe(cuts(n));
      expect(visitsAt('(a+)+', n)).toBeGreaterThanOrEqual(cuts(n));
    }
  });

  it('the split tree has 2^n nodes when it is not cut off, and stops at the cap otherwise', () => {
    for (let n = 1; n <= 8; n++) expect(splitTree(n, 10 ** 6).nodes).toHaveLength(2 ** n);
    expect(splitTree(24).nodes).toHaveLength(TREE_CAP);
    expect(splitTree(24).total).toBe(2 ** 24);
  });
});

describe('the growth classifier', () => {
  const series = (f: (n: number) => number, from = 8, to = 20): Point[] => Array.from({ length: to - from + 1 }, (_, i) => ({ n: from + i, visits: f(from + i), gaveUp: false }));

  it('reads linear, polynomial and exponential series from the numbers alone', () => {
    expect(classifyGrowth(series((n) => n + 2)).kind).toBe('linear');
    expect(classifyGrowth(series((n) => 7 * n)).kind).toBe('linear');
    expect(classifyGrowth(series((n) => n * n)).kind).toBe('polynomial');
    expect(classifyGrowth(series((n) => n ** 3)).kind).toBe('polynomial');
    expect(classifyGrowth(series((n) => 2 ** n)).kind).toBe('exponential');
    expect(classifyGrowth(series((n) => 1.5 ** n)).kind).toBe('exponential');
  });

  it('a cubic is not mistaken for an exponential (its ratio stays below the threshold) and a slow exponential is not mistaken for a polynomial', () => {
    expect(EXPONENTIAL_RATIO).toBeGreaterThan(21 / 20 ** 1);
    expect(classifyGrowth(series((n) => n ** 3, 8, 20)).kind).not.toBe('exponential');
    expect(classifyGrowth(series((n) => 1.35 ** n, 8, 20)).kind).toBe('exponential');
  });

  it('stops reading at the first run that gave up, and says it cannot tell with too few finished runs', () => {
    const cut = series((n) => 2 ** n).map((p) => (p.n >= 12 ? { ...p, visits: 2_000_000, gaveUp: true } : p));
    expect(classifyGrowth(cut).kind).toBe('exponential');
    expect(classifyGrowth(cut.map((p) => (p.n >= 10 ? { ...p, gaveUp: true } : p))).kind).toBe('unknown');
  });

  it('labels the four lesson patterns linear, polynomial, exponential and exponential from the measured visits', () => {
    const kinds = PATTERNS.map((p) => classifyGrowth(growthSeries(p.source, 8, 20)).kind);
    expect(kinds).toEqual(['linear', 'polynomial', 'exponential', 'exponential']);
  });
});

describe('the other engines', () => {
  it('NFA visits equal the sizes of the state sets before each character, counted by the core automaton', () => {
    for (const source of Object.keys(REAL)) {
      for (const n of [3, 9, 17]) {
        const independent = nfaRun(machineOf(source).nfa, 'a'.repeat(n) + '!').steps.slice(0, -1).reduce((sum, s) => sum + s.length, 0);
        expect(nfaVisits(source, letters(n)).visits, `${source} n=${n}`).toBe(independent);
      }
    }
  });

  it('lazy DFA visits are the characters read plus each distinct state set built once', () => {
    for (const source of Object.keys(REAL)) {
      const subject = letters(14);
      const steps = nfaRun(machineOf(source).nfa, subject.join('')).steps;
      const distinct = new Map(steps.map((s) => [s.join(','), s.length]));
      const expected = subject.length + [...distinct.values()].reduce((a, b) => a + b, 0);
      expect(lazyDfaVisits(source, subject).visits, source).toBe(expected);
    }
  });

  it('the linear engines stay within length x states on every lesson pattern', () => {
    for (const source of Object.keys(REAL)) {
      const states = machineOf(source).nfa.states.length;
      for (let n = 1; n <= MAX_LETTERS; n++) expect(nfaVisits(source, letters(n)).visits).toBeLessThanOrEqual((n + 1) * states);
    }
  });
});

describe('the fixes scene as a function of its controls', () => {
  const engines = ['backtracking', 'nfa', 'lazy-dfa'] as const;
  const risky: RiskyId[] = ['quadratic', 'fibonacci', 'exponential'];

  it('walks the control cross product: verdicts follow the rules, and controls that do not apply change nothing', () => {
    for (const pattern of risky) {
      for (const engine of engines) {
        for (const rewrite of [false, true]) {
          for (const capOn of [false, true]) {
            for (const cap of [CAP_MIN, 16, CAP_MAX]) {
              for (const n of [1, 12, 20, MAX_LETTERS]) {
                const base: FixesState = { pattern, letters: n, engine, rewrite, capOn, cap, budget: BUDGET };
                const o = fixesOutcome(base);
                const over = capOn && n + 1 > cap;
                expect(o.verdict === 'refused', JSON.stringify(base)).toBe(over);
                if (over) expect(o.visits).toBe(0);
                if (o.verdict === 'cut-off') {
                  expect(engine).toBe('backtracking');
                  expect(o.visits).toBe(BUDGET);
                }
                for (const budget of BUDGETS) {
                  const b = fixesOutcome({ ...base, budget });
                  expect(b.visits).toBeLessThanOrEqual(budget);
                  if (engine !== 'backtracking' || over) expect(b).toEqual(o);
                  if (!rewrite && !over && engine === 'backtracking') expect(b.verdict === 'cut-off').toBe(visitsFull(pattern, n) > budget);
                }
                if (!capOn) expect(fixesOutcome({ ...base, cap: CAP_MIN })).toEqual(o);
              }
            }
          }
        }
      }
    }
  });

  it('a rewritten pattern is answered at every length the sliders offer', () => {
    for (const pattern of risky) {
      for (let n = 1; n <= MAX_LETTERS; n++) expect(fixesOutcome({ pattern, letters: n, engine: 'backtracking', rewrite: true, capOn: false, cap: 16, budget: BUDGET }).verdict).toBe('answered');
    }
  });
});

const visitsFull = (pattern: RiskyId, n: number): number => {
  const p = PATTERNS.find((x) => x.id === pattern)!;
  const full = matchAt(parsedOf(p.source).root, letters(n), 0, { budget: BUDGET + 1, mustEnd: true });
  return full.steps;
};

describe('typed text', () => {
  it('accepts up to the cap and refuses past it or at a line break, naming the position', () => {
    expect(parseText('')).toEqual({ ok: true, value: [] });
    expect(parseText('a'.repeat(MAX_TEXT_CHARS))).toMatchObject({ ok: true });
    expect(parseText('a'.repeat(MAX_TEXT_CHARS + 1))).toEqual({ ok: false, error: 'Position 41: the text is limited to 40 characters.' });
    expect(parseText('ab\ncd')).toEqual({ ok: false, error: 'Position 3: line breaks are not allowed here.' });
  });

  it('a hostile 40-character text on every pattern finishes within the budget', () => {
    const text = parseText('a'.repeat(39) + '!');
    if (!text.ok) throw new Error('must parse');
    for (const p of PATTERNS) expect(backtrackVisits(p.source, text.value).visits).toBeLessThanOrEqual(BUDGET);
  });
});
