import { describe, expect, it } from 'vitest';
import { mulberry32, randInt, shuffle, type Rnd } from '../../core/random';
import {
  K_CHOICES, kFor, MAX_VALUES, medianOfThree, parseValues, PRESETS, quickselect, quicksortComparisons, sameMultiset, sortedLastComparisons, winner,
  type PivotRule,
} from './model';

const RULES: PivotRule[] = ['last', 'random', 'median3'];
const numeric = (a: readonly number[]) => [...a].sort((x, y) => x - y);

function seededArray(rnd: Rnd): number[] {
  const n = randInt(1, MAX_VALUES, rnd);
  const hi = [2, 9, 99][randInt(0, 2, rnd)];
  return Array.from({ length: n }, () => randInt(0, hi, rnd));
}

describe('quickselect', () => {
  it('returns sorted[k] for every k on 500 seeded arrays, duplicates included, with every pivot rule', () => {
    const rnd = mulberry32(31);
    for (let t = 0; t < 500; t++) {
      const xs = seededArray(rnd);
      const sorted = numeric(xs);
      for (const rule of RULES) {
        for (let k = 0; k < xs.length; k++) expect(quickselect(xs, k, rule, t).value).toBe(sorted[k]);
      }
    }
  });

  it('leaves everything left of k no bigger and everything right no smaller (the top-k panel)', () => {
    const rnd = mulberry32(32);
    for (let t = 0; t < 300; t++) {
      const xs = seededArray(rnd);
      const k = randInt(0, xs.length - 1, rnd);
      const run = quickselect(xs, k, RULES[t % 3], t);
      expect(run.arr.slice(0, k).every((v) => v <= run.value)).toBe(true);
      expect(run.arr.slice(k + 1).every((v) => v >= run.value)).toBe(true);
      expect(sameMultiset(run.arr.slice(0, k), numeric(xs).slice(0, k))).toBe(true);
      expect(sameMultiset(run.arr, xs)).toBe(true);
    }
  });

  it('does not change its input', () => {
    const xs = [...PRESETS[0].values];
    quickselect(xs, 3, 'random');
    expect(xs).toEqual(PRESETS[0].values);
  });

  it('counts exactly the comparisons its steps show', () => {
    const rnd = mulberry32(33);
    for (let t = 0; t < 100; t++) {
      const xs = seededArray(rnd);
      const run = quickselect(xs, randInt(0, xs.length - 1, rnd), RULES[t % 3], t);
      const shown = run.steps.reduce((s, st) => s + (st.t === 'cmp' ? 1 : st.t === 'pivot' ? st.cmps : 0), 0);
      expect(run.comparisons).toBe(shown);
    }
  });

  it('refuses a k outside the array', () => {
    expect(() => quickselect([1, 2], 2, 'last')).toThrow(RangeError);
  });
});

describe('worst case: last-element pivot on sorted input', () => {
  it('makes (n − 1 + k)(n − k)/2 comparisons, which is n(n − 1)/2 for the smallest', () => {
    for (let n = 1; n <= 40; n++) {
      const xs = Array.from({ length: n }, (_, i) => i * 3);
      for (let k = 0; k < n; k++) expect(quickselect(xs, k, 'last').comparisons, `n=${n} k=${k}`).toBe(sortedLastComparisons(n, k));
      expect(sortedLastComparisons(n, 0)).toBe((n * (n - 1)) / 2);
    }
  });

  it('on the Sorted preset, searching for the median', () => {
    const xs = [...PRESETS[1].values];
    const k = kFor('median', xs.length);
    expect(k).toBe(5);
    // Ranges [0, 11] down to [0, 5], h comparisons for range [0, h]: 11 + 10 + … + 5.
    expect(quickselect(xs, k, 'last').comparisons).toBe(11 + 10 + 9 + 8 + 7 + 6 + 5);
    expect(quicksortComparisons(xs, 'last').comparisons).toBe((12 * 11) / 2);
  });
});

describe('random pivots', () => {
  it('average under 4n comparisons for the median over 200 seeded runs, even on sorted input', () => {
    for (const n of [101, 1001]) {
      const xs = Array.from({ length: n }, (_, i) => i);
      let total = 0;
      for (let seed = 1; seed <= 200; seed++) total += quickselect(xs, (n - 1) / 2, 'random', seed).comparisons;
      expect(total / 200).toBeLessThan(4 * n);
    }
  });

  it('replays identically for the same seed', () => {
    const xs = shuffle(Array.from({ length: 16 }, (_, i) => i), mulberry32(5));
    expect(quickselect(xs, 7, 'random', 9)).toEqual(quickselect(xs, 7, 'random', 9));
  });
});

describe('the race against a full quick sort', () => {
  it('quick sort with the same pivots really sorts, and deterministic rules never beat quickselect', () => {
    const rnd = mulberry32(34);
    for (let t = 0; t < 300; t++) {
      const xs = seededArray(rnd);
      for (const rule of RULES) {
        const sort = quicksortComparisons(xs, rule, t);
        expect(sort.sorted).toEqual(numeric(xs));
        if (rule === 'random') continue;
        // Quickselect runs a subset of quick sort's partitions (one root-to-leaf chain).
        for (let k = 0; k < xs.length; k++) expect(quickselect(xs, k, rule).comparisons).toBeLessThanOrEqual(sort.comparisons);
      }
    }
  });

  it('names the winner from the counts', () => {
    expect(winner(3, 5)).toBe('select');
    expect(winner(5, 3)).toBe('sort');
    expect(winner(4, 4)).toBe('tie');
  });
});

describe('medianOfThree', () => {
  it('picks the median of every triple of 0-3 values, in 2 or 3 comparisons', () => {
    for (let p = 0; p < 4; p++) for (let q = 0; q < 4; q++) for (let r = 0; r < 4; r++) {
      const a = [p, q, r];
      const m = medianOfThree(a, 0, 1, 2);
      expect(a[m.at]).toBe(numeric(a)[1]);
      expect([2, 3]).toContain(m.cmps);
    }
  });
});

describe('kFor', () => {
  it('maps each choice to an index, the lower median for even n', () => {
    expect(K_CHOICES.map((c) => kFor(c.value, 11))).toEqual([0, 2, 5, 7, 10]);
    expect(kFor('median', 12)).toBe(5);
    expect(K_CHOICES.map((c) => kFor(c.value, 1))).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('parseValues', () => {
  it('accepts whole numbers 0-99', () => {
    expect(parseValues('37, 12 85')).toEqual({ ok: true, values: [37, 12, 85] });
  });
  it.each([
    ['', 'at least one'], ['  ', 'at least one'], ['-1', 'No negatives'], ['100', 'between 0 and 99'],
    ['12345678901234567890123', 'between 0 and 99'], ['1e400', 'whole numbers'], ['🙂', 'whole numbers'], ['<b>', 'whole numbers'],
    ['1,,2', 'gap'], [Array.from({ length: 17 }, () => '1').join(' '), 'Up to 16'],
  ])('refuses %j', (s, msg) => {
    const r = parseValues(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });
});
