import { describe, expect, it } from 'vitest';
import {
  CODE, DONE, RANGE, STEPS, TESTS, changeCode, changedLines, changeTests, compile, coverage, outputs, reference, regressions, runTests, wheelPhase,
  type TestId, type VersionId,
} from './model';

/** Classic FizzBuzz, written independently of the lesson's versions. */
const classic = (n: number) => (n % 15 === 0 ? 'FizzBuzz' : n % 3 === 0 ? 'Fizz' : n % 5 === 0 ? 'Buzz' : `${n}`);
const failing = (v: VersionId, t: readonly TestId[]) => runTests(v, t).filter((r) => !r.passed).map((r) => r.id);

describe('the tests are right', () => {
  it('every test expects what the full requirement says', () => {
    for (const t of Object.values(TESTS)) expect(reference(t.n)).toBe(t.expected);
  });
  it('the reference is FizzBuzz plus Bazz (hand-worked)', () => {
    expect([1, 3, 5, 7, 15, 21, 35, 105].map(reference)).toEqual(['1', 'Fizz', 'Buzz', 'Bazz', 'FizzBuzz', 'FizzBazz', 'BuzzBazz', 'FizzBuzzBazz']);
  });
});

describe('the good path', () => {
  const path = STEPS.map((s, i) => ({ s, m: s.moves.find((x) => x.good)!, next: STEPS[i + 1] ?? DONE }));

  it('has exactly one good move per step, and each lands on the next step', () => {
    for (const { s, m, next } of path) {
      expect(s.moves.filter((x) => x.good)).toHaveLength(1);
      expect([m.code, m.tests]).toEqual([next.code, next.tests]);
    }
  });

  it('red: a new test that fails, for the right reason, while every older test passes', () => {
    for (const { s, m } of path.filter((p) => p.m.kind === 'test' || p.m.kind === 'next')) {
      const added = m.tests.filter((t) => !s.tests.includes(t));
      expect(added).toHaveLength(1);
      const expectFail = added[0] === 'twentyOne' ? [] : added; // 21 passes at once: the design already composes
      expect(failing(m.code, m.tests)).toEqual(expectFail);
    }
  });

  it('green: the code move makes every test pass', () => {
    for (const { s, m } of path.filter((p) => p.m.kind === 'code')) {
      expect(failing(s.code, s.tests).length).toBeGreaterThan(0);
      expect(failing(m.code, m.tests)).toEqual([]);
    }
  });

  it(`refactor: output identical to the version before, for n = 1..${RANGE}`, () => {
    const refactors = path.filter((p) => p.m.kind === 'refactor');
    expect(refactors.length).toBeGreaterThan(0);
    for (const { s, m } of refactors) {
      expect(outputs(m.code)).toEqual(outputs(s.code));
      expect(failing(m.code, m.tests)).toEqual([]);
    }
  });

  it('ends with code that meets the whole requirement, every behaviour pinned', () => {
    for (let n = 1; n <= RANGE; n++) expect(compile(DONE.code)(n)).toBe(reference(n));
    expect(coverage(DONE.code, DONE.tests).untested).toEqual([]);
    expect(outputs('parts')).toEqual(Array.from({ length: RANGE }, (_, i) => classic(i + 1)));
  });

  it('has an untested behaviour only once: the Bazz line composes before 21 is pinned, and the next step pins it', () => {
    const flagged = path.filter(({ m }) => coverage(m.code, m.tests).untested.length > 0);
    expect(flagged.map(({ m }) => [m.code, coverage(m.code, m.tests).untested])).toEqual([['bazz', ['Bazz combos']]]);
    const i = path.findIndex(({ m }) => m.code === 'bazz' && m.kind === 'code');
    expect(coverage(path[i + 1].m.code, path[i + 1].m.tests).untested).toEqual([]);
  });
});

describe('the bad moves (hand-worked results)', () => {
  const bad = STEPS.flatMap((s) => s.moves.filter((m) => !m.good).map((m) => ({ s, m })));

  it('each one is visibly worse: untested behaviour, or a test gone red', () => {
    for (const { m } of bad) {
      const cov = coverage(m.code, m.tests);
      if (m.kind === 'refactor-red') expect(failing(m.code, m.tests).length).toBeGreaterThan(0);
      else expect(cov.untested.length, m.label).toBeGreaterThan(0);
    }
  });

  it('tidying while red breaks a test that was green', () => {
    expect(runTests('helperWhileRed', ['one', 'three']).map((r) => [r.id, r.passed, r.actual])).toEqual([['one', false, '1'], ['three', true, "'Fizz'"]]);
    expect(failing('ternaryWhileRed', ['one', 'three', 'five'])).toEqual(['one']);
    expect(failing('elseIfWhileRed', ['one', 'three', 'five', 'fifteen'])).toEqual(['fifteen']);
  });

  it('writing it all at once leaves Fizz, Buzz and FizzBuzz unpinned', () => {
    expect(coverage('allAtOnce', ['one']).untested).toEqual(['Fizz', 'Buzz', 'FizzBuzz']);
    expect(coverage('allAtOnce', []).untested).toEqual(['number', 'Fizz', 'Buzz', 'FizzBuzz']);
    expect(coverage('partsPlusBazz', ['one', 'three', 'five', 'fifteen']).untested).toEqual(['Bazz', 'Bazz combos']);
  });

  it('the hand-written combinations work but stay unpinned', () => {
    for (let n = 1; n <= RANGE; n++) expect(compile('bazzEveryCombo')(n)).toBe(reference(n));
    expect(coverage('bazzEveryCombo', ['one', 'three', 'five', 'fifteen', 'seven']).untested).toEqual(['Bazz combos']);
  });
});

describe('the wheel', () => {
  it('is red with no tests or any red test, refactor after a refactor, green otherwise', () => {
    expect(wheelPhase([], null)).toBe('red');
    expect(wheelPhase(runTests('empty', ['one']), 'test')).toBe('red');
    expect(wheelPhase(runTests('number', ['one']), 'code')).toBe('green');
    expect(wheelPhase(runTests('parts', ['one', 'fifteen']), 'refactor')).toBe('refactor');
    expect(wheelPhase(runTests('elseIfWhileRed', ['fifteen']), 'refactor')).toBe('red');
  });
});

describe('change request: 7 → Bazz', () => {
  it('the same careless slip is caught by the TDD suite and slips past the test-after one', () => {
    expect(failing(changeCode('tdd', 'careless'), changeTests('tdd', 'careless'))).toEqual(['fifteen']);
    expect(failing(changeCode('after', 'careless'), changeTests('after', 'careless'))).toEqual([]);
    expect(regressions(changeCode('tdd', 'careless'))).toContain(15);
    expect(regressions(changeCode('after', 'careless'))).toEqual([15, 30, 45, 60, 75, 90]);
  });
  it('the careful change passes both suites with no regressions', () => {
    for (const side of ['tdd', 'after'] as const) {
      expect(failing(changeCode(side, 'careful'), changeTests(side, 'careful'))).toEqual([]);
      expect(regressions(changeCode(side, 'careful'))).toEqual([]);
    }
  });
  it('before the change both codebases are correct FizzBuzz and both suites pass', () => {
    for (const side of ['tdd', 'after'] as const) {
      expect(outputs(changeCode(side, 'none'))).toEqual(Array.from({ length: RANGE }, (_, i) => classic(i + 1)));
      expect(failing(changeCode(side, 'none'), changeTests(side, 'none'))).toEqual([]);
    }
  });
  it('the only difference between the suites is the 15 test', () => {
    expect(changeTests('tdd', 'careless').filter((t) => !changeTests('after', 'careless').includes(t))).toEqual(['fifteen']);
  });
});

describe('every version is real JavaScript', () => {
  it('compiles and returns a string for 1..105', () => {
    for (const v of Object.keys(CODE) as VersionId[]) {
      if (v === 'empty') continue;
      const out = outputs(v);
      expect(out.every((o) => typeof o === 'string' || typeof o === 'number'), v).toBe(true);
    }
  });
});

describe('the line diff', () => {
  it('marks added lines and a moved line, like diff does', () => {
    expect([...changedLines(CODE.testAfter, CODE.testAfterCareless)].sort()).toEqual([3, 4]);
    expect([...changedLines(CODE.parts, CODE.tddCareless)].sort()).toEqual([3, 4]);
    expect([...changedLines(CODE.fizzbuzz, CODE.fizzbuzz)]).toEqual([]);
    expect([...changedLines([], ['a', 'b'])]).toEqual([0, 1]);
  });
});
