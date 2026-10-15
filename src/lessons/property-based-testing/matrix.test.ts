import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { fireCaption, generatorCaption, matrixCaption } from './captions';
import { DEFAULT_CONFIG, genOf } from './config';
import { CUSTOM_MAX_ABS, CUSTOM_MAX_VALUES, parseCustomArray, runCustom } from './custom';
import { generate, OPENING_GENERATOR } from './generator';
import { MATRIX_CASES, MATRIX_CONFIG, buildMatrix, runCell, survivors } from './matrix';
import { forAll } from './runner';
import { ALL_PROPS, BUGS, bugOf, failedProperties, type BugId, type PropId } from './sorts';

const matrix = buildMatrix();
const caught = (bug: BugId, prop: PropId) => matrix.find((c) => c.bug === bug && c.prop === prop)!.firstAt !== null;

describe('the matrix really runs every cell', () => {
  it('has a row for every function and a column for every property, and the correct sort is never caught', () => {
    expect(matrix).toHaveLength(BUGS.length * ALL_PROPS.length);
    for (const p of ALL_PROPS) expect(caught('correct', p)).toBe(false);
  });

  it('reports a first case that really fails that one property on that input, and no earlier case does', () => {
    for (const c of matrix) {
      if (c.firstAt === null) continue;
      const fn = bugOf(c.bug).fn;
      expect(failedProperties([c.prop], generate(MATRIX_CONFIG, c.firstAt), fn)).toEqual([c.prop]);
      for (let k = 1; k < c.firstAt; k++) expect(failedProperties([c.prop], generate(MATRIX_CONFIG, k), fn)).toEqual([]);
    }
  });

  it('reports "not caught" only when none of the 500 cases fails, checked by running them again', () => {
    for (const c of matrix) {
      if (c.firstAt !== null) continue;
      const fn = bugOf(c.bug).fn;
      for (let k = 1; k <= MATRIX_CASES; k++) expect(failedProperties([c.prop], generate(MATRIX_CONFIG, k), fn)).toEqual([]);
    }
    expect(runCell('no-comparator', 'nondecreasing')).toEqual(matrix.find((c) => c.bug === 'no-comparator' && c.prop === 'nondecreasing'));
  });

  it('shows that same length alone misses most bugs, that idempotent catches none, and that sorted plus same values catches all three', () => {
    expect(survivors(matrix, ['sameLength'])).toEqual(['no-comparator', 'insertion']);
    expect(survivors(matrix, ['idempotent'])).toEqual(['no-comparator', 'dedupe', 'insertion']);
    expect(survivors(matrix, ['nondecreasing', 'permutation'])).toEqual([]);
    expect(survivors(matrix, [])).toEqual(['no-comparator', 'dedupe', 'insertion']);
    expect(survivors(matrix, ALL_PROPS)).toEqual([]);
  });

  it('try-this 3: from the opening suite (same length) two of three survive, and adding non-decreasing and same values leaves none', () => {
    expect(survivors(matrix, ['sameLength'])).toHaveLength(2);
    expect(survivors(matrix, ['sameLength', 'nondecreasing', 'permutation'])).toHaveLength(0);
    expect(expectCaption(matrixCaption(matrix, ['sameLength']))).toContain('1 of 3');
    expect(expectCaption(matrixCaption(matrix, ['sameLength', 'nondecreasing', 'permutation']))).toContain('catches all 3');
  });

  it('a suite catches a bug exactly when one of its properties does, for every subset of the five properties', () => {
    for (let mask = 0; mask < 32; mask++) {
      const suite = ALL_PROPS.filter((_, i) => mask & (1 << i));
      const alive = survivors(matrix, suite);
      for (const bug of BUGS.filter((b) => b.id !== 'correct')) {
        expect(alive.includes(bug.id)).toBe(!suite.some((p) => caught(bug.id, p)));
      }
    }
  });
});

describe('your own array', () => {
  it('refuses empty text, non-integers, too many values and huge values, and keeps nothing', () => {
    expect(parseCustomArray('').ok).toBe(false);
    expect(parseCustomArray('   ').ok).toBe(false);
    expect(parseCustomArray('1, two').ok).toBe(false);
    expect(parseCustomArray('1.5').ok).toBe(false);
    expect(parseCustomArray('1e3').ok).toBe(false);
    expect(parseCustomArray('<b>3</b>').ok).toBe(false);
    expect(parseCustomArray(`${CUSTOM_MAX_ABS + 1}`).ok).toBe(false);
    expect(parseCustomArray(`-${CUSTOM_MAX_ABS + 1}`).ok).toBe(false);
    expect(parseCustomArray('99999999999999999999999').ok).toBe(false);
    expect(parseCustomArray(Array.from({ length: CUSTOM_MAX_VALUES + 1 }, (_, i) => i).join(' ')).ok).toBe(false);
    expect(parseCustomArray(Array.from({ length: 10_000 }, (_, i) => i).join(',')).ok).toBe(false);
  });

  it('accepts exactly 1 to 20 whole numbers within the bound, separated by commas or spaces', () => {
    expect(parseCustomArray('10, 2 -3')).toEqual({ ok: true, value: [10, 2, -3] });
    expect(parseCustomArray(`${CUSTOM_MAX_ABS}, -${CUSTOM_MAX_ABS}`).ok).toBe(true);
    expect(parseCustomArray(Array.from({ length: CUSTOM_MAX_VALUES }, (_, i) => i).join(' ')).ok).toBe(true);
  });

  it('try-this 5: 10, 2, -3 breaks the no-comparator and insertion versions, and 5, 5 breaks the dedupe one', () => {
    const failing = (xs: number[]) => runCustom(xs).filter((r) => r.failed.length > 0).map((r) => r.bug);
    expect(failing([10, 2, -3])).toEqual(['no-comparator', 'insertion']);
    expect(failing([5, 5])).toEqual(['dedupe']);
    expect(failing([])).toEqual([]);
  });

  it('reports the same failed properties as running each function directly', () => {
    for (const row of runCustom([4, 4, 1, -2])) {
      expect(row.output).toEqual(bugOf(row.bug).fn([4, 4, 1, -2]));
      expect(row.failed).toEqual(failedProperties(ALL_PROPS, [4, 4, 1, -2], bugOf(row.bug).fn));
    }
  });
});

describe('captions state what the run shows', () => {
  it('names the failing case, input and output of the run, and says 100 passes prove little', () => {
    const run = forAll(bugOf(DEFAULT_CONFIG.fn).fn, DEFAULT_CONFIG.props, genOf(DEFAULT_CONFIG));
    const text = expectCaption(fireCaption(DEFAULT_CONFIG, run));
    expect(text).toContain('Case 3 failed');
    expect(text).toContain(`[${run.failure!.input.join(', ')}]`);
    expect(text).toContain(`[${run.failure!.output.join(', ')}]`);
    const passing = forAll(bugOf('correct').fn, DEFAULT_CONFIG.props, genOf({ ...DEFAULT_CONFIG, fn: 'correct' }));
    const ok = expectCaption(fireCaption({ ...DEFAULT_CONFIG, fn: 'correct' }, passing));
    expect(ok).toContain('All 100 cases passed');
    expect(ok).toContain('does not show that');
    expect(expectCaption(fireCaption(DEFAULT_CONFIG, null))).toContain(`seed ${DEFAULT_CONFIG.seed}`);
    expect(expectCaption(fireCaption({ ...DEFAULT_CONFIG, props: [] }, null))).toContain('Tick at least one property');
  });

  it('states the generator chance and the seeded outcome together, at the opening and at a narrow range', () => {
    expect(expectCaption(generatorCaption(OPENING_GENERATOR, null))).toContain('2.8 × 10⁻⁵');
    expect(expectCaption(generatorCaption(OPENING_GENERATOR, null))).toContain('no failure in 100 cases');
    const narrow = { ...OPENING_GENERATOR, range: 'tiny' as const };
    expect(expectCaption(generatorCaption(narrow, 1))).toContain('failed at case 1');
    expect(expectCaption(generatorCaption(narrow, 1))).toContain('96.9%');
  });
});
