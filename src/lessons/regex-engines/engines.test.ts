/**
 * The lesson's own numbers: the growth table, the step-budget series and the which-match answers. The engines
 * and their oracle tests are in core/regex/regex.test.ts; the real RegExp is used here on lesson-authored patterns only.
 */
import { describe, expect, it } from 'vitest';
import { buildNfa, runNfa } from '../../core/regex';
import { BANK, SUBJECTS, construct, parse } from '../../core/regex/regexBank';
import { STEP_BUDGET, growthTable, whichAnswer, workSeries } from './engines';

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

describe('the which-match scene does not call a given-up run "no match"', () => {
  const a24 = Array.from({ length: 24 }, () => 'a');
  it('(a*)*b|a on 24 a characters: the backtracker gives up, the NFA still finds a match', () => {
    const answer = whichAnswer(construct('(a*)*b|a'), parse('(a*)*b|a'), a24);
    expect(answer.firstExhausted).toBe(true);
    expect(answer.first).toBeNull();
    expect(answer.longest).toEqual({ start: 0, end: 1 });
    expect(new RegExp('(a*)*b|a').exec('a'.repeat(24))?.[0]).toBe('a');
  });

  it('a pattern that really has no match is not marked as given up', () => {
    const answer = whichAnswer(construct('b'), parse('b'), ['a', 'a']);
    expect(answer.firstExhausted).toBe(false);
    expect(answer.first).toBeNull();
  });
});

describe('no lesson source reaches RegExp, eval or Function', () => {
  const sources = import.meta.glob<string>('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });
  const lessonSources = Object.entries(sources).filter(([name]) => !name.endsWith('.test.ts'));
  it('contain no new RegExp, RegExp( call, eval( or new Function', () => {
    expect(lessonSources.map(([name]) => name)).toContain('./engines.ts');
    for (const [name, text] of lessonSources) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, name).not.toMatch(/new\s+RegExp|RegExp\s*\(|\beval\s*\(|new\s+Function|\bFunction\s*\(/);
    }
  });
});
