import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { DEFAULT_CONFIG, genOf } from './config';
import { generate } from './generator';
import { forAll } from './runner';
import { ALL_PROPS, BUGS, PROPERTIES, bugOf, failedProperties, propOf, type PropId } from './sorts';

/** Every array of length 0..maxLen over lo..hi. */
function allArrays(maxLen: number, lo: number, hi: number): number[][] {
  let layer: number[][] = [[]];
  const out: number[][] = [[]];
  for (let n = 1; n <= maxLen; n++) {
    layer = layer.flatMap((a) => Array.from({ length: hi - lo + 1 }, (_, i) => [...a, lo + i]));
    out.push(...layer);
  }
  return out;
}

const numericSorted = (xs: readonly number[]) => [...xs].sort((a, b) => a - b);
const equal = (a: readonly number[], b: readonly number[]) => JSON.stringify(a) === JSON.stringify(b);

/** Run the CodePanel's source lines as real JavaScript and return the function they define. */
// The source is fixed lesson text, never learner input, so running it with new Function is safe (tests only).
const evalSort = (lines: readonly string[]): ((xs: number[]) => number[]) => new Function(`${lines.join('\n')}\nreturn sort;`)();

describe('what the CodePanel shows is what runs', () => {
  it('behaves exactly like the function the runner calls, on 500 seeded arrays per function', () => {
    const rnd = mulberry32(3);
    for (const bug of BUGS) {
      const shown = evalSort(bug.source);
      for (let k = 0; k < 500; k++) {
        const xs = Array.from({ length: Math.floor(rnd() * 13) }, () => Math.floor(rnd() * 2001) - 1000);
        expect(shown([...xs]), bug.id).toEqual(bug.fn([...xs]));
      }
    }
  });

  it('shows property source that behaves like the checkers, over every array up to length 3 over -2..2', () => {
    // The helpers the short source lines lean on, defined the way the lesson describes them.
    const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
    const counts = (xs: number[]) => {
      const m = new Map<number, number>();
      for (const v of xs) m.set(v, (m.get(v) ?? 0) + 1);
      return m;
    };
    for (const p of PROPERTIES) {
      const body = p.source.join('\n');
      const make = new Function('same', 'counts', 'sort', `${body}\nreturn ${p.id};`) as (...a: unknown[]) => (xs: number[], out: number[]) => boolean;
      const sort = bugOf('no-comparator').fn;
      const shown = make(same, counts, sort);
      for (const xs of allArrays(3, -2, 2)) {
        for (const out of [sort([...xs]), numericSorted(xs), xs.slice(1), [...xs, 0]]) {
          expect(shown(xs, out), `${p.id} ${JSON.stringify(xs)} ${JSON.stringify(out)}`).toBe(p.check(xs, out, sort));
        }
      }
    }
  });
});

describe('the property checkers against brute force', () => {
  const small = allArrays(5, -3, 3);

  it('non-decreasing equals "the array is its own numerically sorted copy" on all 19,608 arrays up to length 5 over -3..3', () => {
    expect(small).toHaveLength(19_608);
    for (const out of small) expect(propOf('nondecreasing').check([], out, bugOf('correct').fn)).toBe(equal(out, numericSorted(out)));
  });

  it('permutation, same length and reference equal their sorted-copy definitions on every pair of arrays up to length 3 over -3..3', () => {
    const arrays = allArrays(3, -3, 3);
    const fn = bugOf('correct').fn;
    for (const xs of arrays) {
      for (const out of arrays) {
        expect(propOf('sameLength').check(xs, out, fn)).toBe(xs.length === out.length);
        expect(propOf('permutation').check(xs, out, fn)).toBe(equal(numericSorted(xs), numericSorted(out)));
        expect(propOf('reference').check(xs, out, fn)).toBe(equal(out, numericSorted(xs)));
      }
    }
  });

  it('idempotent holds exactly when sorting the output again leaves it alone, for every function on all arrays up to length 5', () => {
    for (const bug of BUGS) {
      for (const xs of small) {
        const out = bug.fn([...xs]);
        expect(propOf('idempotent').check(xs, out, bug.fn)).toBe(JSON.stringify(bug.fn([...out])) === JSON.stringify(out));
      }
    }
  });

  it('is true of every property for the correct sort on all arrays up to length 5, and false of some property for every buggy one', () => {
    for (const xs of small) expect(failedProperties(ALL_PROPS, xs, bugOf('correct').fn)).toEqual([]);
    for (const bug of BUGS.filter((b) => b.id !== 'correct')) {
      expect(small.some((xs) => failedProperties(ALL_PROPS, xs, bug.fn).length > 0), bug.id).toBe(true);
    }
  });
});

describe('the functions under test', () => {
  it('passes all five properties for the correct sort on 10,000 seeded arrays, across every range', () => {
    for (const range of ['tiny', 'hundred', 'million', 'edge'] as const) {
      for (let k = 1; k <= 2500; k++) {
        const xs = generate({ range, maxLength: 20, seed: 11 }, k);
        expect(failedProperties(ALL_PROPS, xs, bugOf('correct').fn), `${range} case ${k}`).toEqual([]);
      }
    }
  });

  it('shows the no-comparator behaviour of real Array.prototype.sort: [10, 2] stays [10, 2]', () => {
    expect([10, 2].sort()).toEqual([10, 2]);
    expect(bugOf('no-comparator').fn([10, 2])).toEqual([10, 2]);
    expect(bugOf('correct').fn([10, 2])).toEqual([2, 10]);
    const rnd = mulberry32(8);
    for (let k = 0; k < 300; k++) {
      const xs = Array.from({ length: 1 + Math.floor(rnd() * 10) }, () => Math.floor(rnd() * 3001) - 1500);
      expect(bugOf('no-comparator').fn([...xs])).toEqual([...xs].sort());
    }
  });

  it('fails each buggy function within 100 cases on a pinned seed', () => {
    const pinned: { id: 'no-comparator' | 'dedupe' | 'insertion'; seed: number; range: 'million' | 'tiny' }[] = [
      { id: 'no-comparator', seed: 7, range: 'million' },
      { id: 'insertion', seed: 7, range: 'million' },
      { id: 'dedupe', seed: 1, range: 'tiny' },
    ];
    for (const { id, seed, range } of pinned) {
      const run = forAll(bugOf(id).fn, ALL_PROPS, { range, maxLength: 12, seed });
      expect(run.failure, id).not.toBeNull();
      expect(run.failure!.k, id).toBeLessThanOrEqual(100);
    }
  });

  it('does not find the dedupe bug with the wide range on seed 1, but does with the narrow one on the same seed', () => {
    const wide = { range: 'million' as const, maxLength: 8, fixedLength: 8, seed: 1 };
    expect(forAll(bugOf('dedupe').fn, ['sameLength'], wide).failure).toBeNull();
    expect(forAll(bugOf('dedupe').fn, ['sameLength'], { ...wide, range: 'tiny' }).failure).not.toBeNull();
  });

  it('catches the dedupe bug only through repeated values: whenever it fails, the input repeats', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const run = forAll(bugOf('dedupe').fn, ['sameLength'], { range: 'tiny', maxLength: 12, seed });
      if (run.failure) expect(new Set(run.failure.input).size).toBeLessThan(run.failure.input.length);
    }
  });
});

describe('the opening setup', () => {
  it('try-this 1: the defaults fail on case 3 with a seven-value array, and the wrong line is the one with sort()', () => {
    const run = forAll(bugOf(DEFAULT_CONFIG.fn).fn, DEFAULT_CONFIG.props, genOf(DEFAULT_CONFIG));
    expect(run.failure!.k).toBe(3);
    expect(run.failure!.input).toHaveLength(7);
    expect(run.cases.map((c) => c.k)).toEqual([1, 2, 3]);
    const bug = bugOf(DEFAULT_CONFIG.fn);
    expect(bug.source[bug.badLine!]).toContain('.sort()');
  });

  it('ticks only properties that exist, and opens on a bug the ticked properties catch', () => {
    for (const p of DEFAULT_CONFIG.props) expect(ALL_PROPS as readonly PropId[]).toContain(p);
  });
});
