import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { expectCaption } from '../../core/testing/captions';
import { coverageCaption, mutantCaption } from './captions';
import { coverageOf } from './coverage';
import { PRESETS, presetOf, OPENING } from './presets';
import { BUGGY, COST, DOMAIN, WEIGHT_MAX, intendedCost, runProgram } from './program';
import {
  MAX_CASES, addCase, analysisOf, approveCurrent, assertionFails, disagreeingWithIntent, firstFailure, killingTest, parseExpected, parseWeight, programOf, removeCase,
  report, type CodeVariant, type Suite, type TestCase,
} from './suite';

const suiteOf = (id: Parameters<typeof presetOf>[0]) => presetOf(id).suite;
const reportFor = (variant: CodeVariant, suite: Suite) => report(analysisOf(variant), suite);
const c = (weight: number, express: boolean, expected = intendedCost(weight, express)): TestCase => ({ weight, express, expected });

describe('the mutation score', () => {
  it('is 0% for the no-assertion suite while its coverage is 100% and 100%', () => {
    const suite = suiteOf('smoke');
    const cov = coverageOf(COST, suite.cases);
    const r = reportFor('cost', suite);
    expect(cov.linesCovered / cov.lineCount).toBe(1);
    expect(cov.branchesCovered / cov.branchCount).toBe(1);
    expect(r.killed).toBe(0);
    expect(r.survived).toBe(21);
    expect(r.equivalent).toBe(2);
    expect(r.score).toBe(0);
  });

  it('is also 0% for the "returns a number" suite: no mutant here returns a non-number', () => {
    const r = reportFor('cost', suiteOf('weak'));
    expect(r.killed).toBe(0);
    expect(r.score).toBe(0);
  });

  it('is 100% for the small precise suite once the equivalent mutants are left out, and the suite passes on the code', () => {
    const suite = suiteOf('precise');
    const r = reportFor('cost', suite);
    expect(r.baselinePasses).toBe(true);
    expect(r.killed).toBe(21);
    expect(r.survived).toBe(0);
    expect(r.score).toBe(1);
  });

  it('rejects a variant that counts the equivalent mutants as survivors: it would score under 100% on the same suite', () => {
    const r = reportFor('cost', suiteOf('precise'));
    const broken = r.killed / r.total;
    expect(broken).toBeLessThan(1);
    expect(r.killed / (r.total - r.equivalent)).toBe(1);
  });

  it('kills a mutant exactly when some case fails on it, checked against real JavaScript run on the rendered mutants', () => {
    const suite = suiteOf('precise');
    const a = analysisOf('cost');
    const r = report(a, suite);
    r.verdicts.forEach((v, i) => {
      const fails = suite.cases.some((tc) => runProgram(a.mutants[i].program, tc) !== tc.expected);
      expect(v.status === 'killed', v.mutant.id).toBe(fails && !a.equivalent[i]);
    });
  });

  it('stops each mutant at the first failing case and reports which one', () => {
    const suite = suiteOf('precise');
    const r = reportFor('cost', suite);
    for (const v of r.verdicts) {
      if (v.killedBy === null) continue;
      const m = v.mutant.program;
      expect(assertionFails(suite.mode, suite.cases[v.killedBy], runProgram(m, suite.cases[v.killedBy]))).toBe(true);
      for (let i = 0; i < v.killedBy; i++) expect(assertionFails(suite.mode, suite.cases[i], runProgram(m, suite.cases[i]))).toBe(false);
    }
  });

  it('says not run, and gives no score, when the suite already fails on the unmutated code', () => {
    const suite: Suite = { mode: 'exact', cases: [c(11, false, 999)] };
    expect(firstFailure(COST, suite)).toBe(0);
    const r = reportFor('cost', suite);
    expect(r.baselinePasses).toBe(false);
    expect(r.score).toBeNull();
    expect(r.verdicts.filter((v) => v.status === 'not-run')).toHaveLength(21);
    expect(r.verdicts.filter((v) => v.status === 'equivalent')).toHaveLength(2);
    expect(expectCaption(coverageCaption(suite, coverageOf(COST, suite.cases), r))).toContain('already fails on the unmutated code');
  });

  it('gives no score for an empty suite, and the caption says so rather than calling it 0%', () => {
    const r = reportFor('cost', suiteOf('empty'));
    expect(r.killed).toBe(0);
    expect(expectCaption(coverageCaption(suiteOf('empty'), coverageOf(COST, []), r))).toContain('empty suite runs nothing');
  });
});

describe('hidden controls do not feed the numbers', () => {
  it('ignores every expected value when the assertion is weak or none, across 100 seeded suites', () => {
    const rnd = mulberry32(4);
    for (const mode of ['weak', 'none'] as const) {
      for (let k = 0; k < 100; k++) {
        const inputs = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => ({ weight: Math.floor(rnd() * (WEIGHT_MAX + 1)), express: rnd() < 0.5 }));
        const a: Suite = { mode, cases: inputs.map((i) => ({ ...i, expected: 0 })) };
        const b: Suite = { mode, cases: inputs.map((i) => ({ ...i, expected: Math.floor(rnd() * 1000) - 500 })) };
        const ra = reportFor('cost', a);
        const rb = reportFor('cost', b);
        expect(rb.killed).toBe(ra.killed);
        expect(rb.score).toBe(ra.score);
        expect(rb.baselinePasses).toBe(true);
      }
    }
  });
});

describe('the snapshot trap', () => {
  it('try-this 5: approving the off-by-one output passes, scores 100%, and three expected values differ from the intended cost', () => {
    const p = presetOf('snapshot');
    expect(p.variant).toBe('buggy');
    expect(firstFailure(BUGGY, p.suite)).toBeNull();
    const r = reportFor('buggy', p.suite);
    expect(r.score).toBe(1);
    expect(disagreeingWithIntent(p.suite)).toHaveLength(3);
    expect(firstFailure(COST, p.suite)).not.toBeNull();
  });

  it('approves whatever the code returns, so the same inputs approved on the correct code agree with the intended cost', () => {
    const inputs = presetOf('snapshot').suite.cases;
    const onCorrect = approveCurrent(COST, { mode: 'weak', cases: inputs });
    expect(onCorrect.mode).toBe('exact');
    expect(disagreeingWithIntent(onCorrect)).toEqual([]);
    for (const tc of onCorrect.cases) expect(tc.expected).toBe(runProgram(COST, tc));
  });

  it('only counts disagreement for an exact suite', () => {
    expect(disagreeingWithIntent({ mode: 'weak', cases: [c(11, false, 0)] })).toEqual([]);
  });
});

describe('the presets and the try-this prompts', () => {
  it('opens on the no-assertion suite', () => {
    expect(OPENING.id).toBe('smoke');
    expect(OPENING.suite.mode).toBe('none');
  });

  it('try-this 1: the opening suite is two calls with no assertion, 100% / 100% / 0%', () => {
    expect(OPENING.suite.cases).toHaveLength(2);
    const cov = coverageOf(programOf(OPENING.variant), OPENING.suite.cases);
    expect([cov.linesCovered, cov.lineCount, cov.branchesCovered, cov.branchCount]).toEqual([6, 6, 4, 4]);
    expect(reportFor(OPENING.variant, OPENING.suite).score).toBe(0);
  });

  it('try-this 2: the small precise suite covers the same lines and scores 100% with four cases that pass on cost', () => {
    const p = presetOf('precise');
    expect(p.suite.cases).toHaveLength(4);
    const cov = coverageOf(COST, p.suite.cases);
    expect(cov.linesCovered).toBe(cov.lineCount);
    expect(firstFailure(COST, p.suite)).toBeNull();
    expect(reportFor('cost', p.suite).score).toBe(1);
  });

  it('try-this 3: M9 and M13 are the equivalent mutants, shown equivalent whatever the suite', () => {
    const a = analysisOf('cost');
    expect(a.mutants[8].before + ' -> ' + a.mutants[8].after).toBe('weight > 10 -> weight >= 10');
    expect(a.equivalent[8]).toBe(true);
    expect(a.equivalent[12]).toBe(true);
    for (const p of PRESETS) {
      const r = report(analysisOf(p.variant), p.suite);
      if (p.variant === 'cost') expect(r.verdicts[8].status).toBe('equivalent');
    }
    const v = reportFor('cost', OPENING.suite).verdicts[8];
    expect(expectCaption(mutantCaption(a, 8, v, OPENING.suite))).toContain('equivalent over this domain');
  });

  it('try-this 4: M12 survives the opening suite, and adding its killing test at weight 11 kills it', () => {
    const a = analysisOf('cost');
    expect(reportFor('cost', OPENING.suite).verdicts[11].status).toBe('survived');
    const test = killingTest(a, 11)!;
    expect(test).toMatchObject({ weight: 11, express: false, expected: 7 });
    const next = addCase({ ...OPENING.suite, mode: 'exact' }, test);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(firstFailure(COST, next.suite)).toBeNull();
    expect(reportFor('cost', next.suite).verdicts[11].status).toBe('killed');
  });

  it('keeps every preset a valid suite: bounded, within the domain, and passing on its own code', () => {
    for (const p of PRESETS) {
      expect(p.suite.cases.length).toBeLessThanOrEqual(MAX_CASES);
      for (const tc of p.suite.cases) expect(DOMAIN.some((d) => d.weight === tc.weight && d.express === tc.express)).toBe(true);
      expect(firstFailure(programOf(p.variant), p.suite), p.id).toBeNull();
    }
  });
});

describe('editing the suite', () => {
  it('adds a case, collapses a duplicate to one with the newest expected value, and refuses a thirteenth', () => {
    let suite: Suite = { mode: 'exact', cases: [] };
    for (let i = 0; i < MAX_CASES; i++) {
      const r = addCase(suite, c(i, false));
      expect(r.ok).toBe(true);
      if (r.ok) suite = r.suite;
    }
    expect(suite.cases).toHaveLength(MAX_CASES);
    const dup = addCase(suite, c(3, false, 1234));
    expect(dup.ok && dup.suite.cases).toHaveLength(MAX_CASES);
    expect(dup.ok && dup.suite.cases[3].expected).toBe(1234);
    const over = addCase(suite, c(20, true));
    expect(over.ok).toBe(false);
    expect(removeCase(suite, 0).cases).toHaveLength(MAX_CASES - 1);
  });

  it('treats the same weight with the other express value as a different case', () => {
    const r = addCase({ mode: 'exact', cases: [c(11, false)] }, c(11, true));
    expect(r.ok && r.suite.cases).toHaveLength(2);
  });
});

describe('hostile input', () => {
  it('refuses weights outside 0 to 40 with the toy-function message, and markup, decimals and exponents', () => {
    for (const text of ['-1', '41', '1000', '1e1', '2.5', '<b>5</b>', 'ten', '', '   ', '99999999999999999999']) {
      const r = parseWeight(text);
      expect(r.ok, text).toBe(false);
    }
    expect(parseWeight('41')).toEqual({ ok: false, error: 'this toy function is checked on 0 to 40' });
    expect(parseWeight(' 40 ')).toEqual({ ok: true, value: 40 });
    expect(parseWeight('0')).toEqual({ ok: true, value: 0 });
  });

  it('refuses expected values beyond ±1,000,000 and anything that is not a whole number', () => {
    for (const text of ['1000001', '-1000001', '1.5', '1e3', 'NaN', '<i>1</i>', '']) expect(parseExpected(text).ok, text).toBe(false);
    expect(parseExpected('-1000000')).toEqual({ ok: true, value: -1_000_000 });
    expect(parseExpected('−7')).toEqual({ ok: true, value: -7 });
  });
});
