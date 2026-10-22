import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  PATTERN_MAX, PREFIX_RULE_WITNESS, TEXT_MAX, WITNESS_MAX_LENGTH, binaryStrings, brokenReport, buildSuffixArray, checkOrder,
  costSweep, distinctSubstrings, lcpKasai, longestRepeated, moveItem, parsePattern, parseText, randomText, search, suffixArray,
} from './model';

/** Oracle: sort the real suffix strings with the language's own string order (shorter prefix first). */
const naiveSa = (s: string) =>
  Array.from({ length: s.length }, (_, i) => i).sort((a, b) => (s.slice(a) < s.slice(b) ? -1 : s.slice(a) > s.slice(b) ? 1 : 0));

/** Oracle: the definition of LCP, by direct comparison of neighbouring suffixes (no Kasai). */
const naiveLcp = (s: string, sa: number[]) =>
  sa.map((start, k) => {
    if (k === 0) return 0;
    const a = s.slice(sa[k - 1]);
    const b = s.slice(start);
    let h = 0;
    while (h < a.length && h < b.length && a[h] === b[h]) h += 1;
    return h;
  });

/** Oracle: every start of p in s, overlapping allowed, by repeated indexOf. */
const naiveOccurrences = (s: string, p: string) => {
  const found: number[] = [];
  for (let at = s.indexOf(p); at !== -1; at = s.indexOf(p, at + 1)) found.push(at);
  return found;
};

/** Oracle: the size of the set of all substrings. */
const distinctByEnumeration = (s: string) => {
  const all = new Set<string>();
  for (let i = 0; i < s.length; i += 1) for (let j = i + 1; j <= s.length; j += 1) all.add(s.slice(i, j));
  return all.size;
};

/** Oracle for the broken rule: the same naive sort with the prefix rule turned over. */
const naiveInvertedSa = (s: string) =>
  Array.from({ length: s.length }, (_, i) => i).sort((a, b) => {
    const x = s.slice(a);
    const y = s.slice(b);
    if (x.startsWith(y)) return -1;
    if (y.startsWith(x)) return 1;
    return x < y ? -1 : 1;
  });

describe('hand-worked vectors', () => {
  it('banana: SA, LCP, longest repeat and the 15 distinct substrings (6 x 7 / 2 - 6)', () => {
    const sa = suffixArray('banana');
    expect(sa).toEqual([5, 3, 1, 0, 4, 2]);
    const lcp = lcpKasai('banana', sa);
    expect(lcp).toEqual([0, 1, 3, 0, 0, 2]);
    expect(lcp.reduce((a, b) => a + b, 0)).toBe(6);
    expect(longestRepeated('banana', sa, lcp)).toMatchObject({ length: 3, text: 'ana' });
    expect(distinctSubstrings(6, lcp)).toBe(15);
  });

  it('mississippi and aa', () => {
    const sa = suffixArray('mississippi');
    expect(sa).toEqual([10, 7, 4, 1, 0, 9, 8, 6, 3, 5, 2]);
    const lcp = lcpKasai('mississippi', sa);
    expect(lcp).toEqual([0, 1, 1, 4, 0, 0, 1, 0, 2, 1, 3]);
    expect(longestRepeated('mississippi', sa, lcp).text).toBe('issi');
    expect(distinctSubstrings(11, lcp)).toBe(53);
    expect(suffixArray('aa')).toEqual([1, 0]);
    expect(lcpKasai('aa', [1, 0])).toEqual([0, 1]);
    expect(distinctSubstrings(2, [0, 1])).toBe(2);
  });

  it('banana searches: ranges, counts, positions and the probe positions of both bounds', () => {
    const sa = suffixArray('banana');
    const ana = search('banana', sa, 'ana');
    expect([ana.lo, ana.hi, ana.count, ana.positions]).toEqual([1, 3, 2, [3, 1]]);
    expect(ana.lower.probes.map((p) => p.pos)).toEqual([3, 1, 0]);
    expect(ana.upper.probes.map((p) => p.pos)).toEqual([3, 1, 2]);
    expect(search('banana', sa, 'a')).toMatchObject({ lo: 0, hi: 3, count: 3, positions: [5, 3, 1] });
    expect(search('banana', sa, 'na')).toMatchObject({ lo: 4, hi: 6, count: 2, positions: [4, 2] });
    expect(search('banana', sa, 'banana')).toMatchObject({ lo: 3, hi: 4, count: 1 });
    expect(search('banana', sa, 'nab').count).toBe(0);
    expect(search('banana', sa, 'x').count).toBe(0);
    const maxProbes = Math.ceil(Math.log2(7));
    for (const p of ['ana', 'a', 'na', 'banana', 'nab', 'x']) {
      const r = search('banana', sa, p);
      expect(r.lower.probes.length).toBeLessThanOrEqual(maxProbes);
      expect(r.upper.probes.length).toBeLessThanOrEqual(maxProbes);
    }
  });
});

describe('exhaustive oracles over every binary string up to length 10', () => {
  const strings = binaryStrings(WITNESS_MAX_LENGTH);
  const patterns = binaryStrings(4);

  it('covers 2,046 strings and 30 patterns', () => {
    expect(strings).toHaveLength(2046);
    expect(patterns).toHaveLength(30);
  });

  it('SA, LCP, distinct substrings and every pattern search match the naive versions', () => {
    for (const s of strings) {
      const sa = suffixArray(s);
      expect(sa, s).toEqual(naiveSa(s));
      const lcp = lcpKasai(s, sa);
      expect(lcp, s).toEqual(naiveLcp(s, sa));
      expect(distinctSubstrings(s.length, lcp), s).toBe(distinctByEnumeration(s));
      for (const p of patterns) {
        const r = search(s, sa, p);
        expect([...r.positions].sort((a, b) => a - b), `${s} / ${p}`).toEqual(naiveOccurrences(s, p));
        expect(r.count).toBe(r.hi - r.lo);
      }
    }
  });
});

describe('seeded random strings', () => {
  it('500 strings of up to 40 letters over four letters match the oracles', () => {
    const rnd = mulberry32(2024);
    for (let t = 0; t < 500; t += 1) {
      const n = 1 + Math.floor(rnd() * 40);
      const s = Array.from({ length: n }, () => 'abcd'[Math.floor(rnd() * 4)]).join('');
      const sa = suffixArray(s);
      expect(sa, s).toEqual(naiveSa(s));
      const lcp = lcpKasai(s, sa);
      expect(lcp, s).toEqual(naiveLcp(s, sa));
      expect(distinctSubstrings(n, lcp), s).toBe(distinctByEnumeration(s));
      const p = s.slice(Math.floor(rnd() * n), Math.floor(rnd() * n) + 3) || 'a';
      expect([...search(s, sa, p).positions].sort((a, b) => a - b), `${s} / ${p}`).toEqual(naiveOccurrences(s, p));
    }
  });
});

describe('manipulation: the wrong moves are refused with the computed reason', () => {
  it('manipulation 1: a pair out of order names the first pair and the differing position', () => {
    const verdict = checkOrder('banana', [0, 1, 2, 3, 4, 5]);
    expect(verdict).toEqual({ k: 0, reason: "anana sorts before banana: at position 0, 'a' comes before 'b'." });
  });

  it('manipulation 2: the prefix rule is named when a longer suffix is placed before its own prefix', () => {
    // ana (3) must come before anana (1): put anana first.
    const verdict = checkOrder('banana', [5, 1, 3, 0, 4, 2]);
    expect(verdict?.k).toBe(1);
    expect(verdict?.reason).toBe('ana sorts before anana: ana is a prefix of anana, and a suffix that ends first sorts first (think of an end marker that sorts before every letter).');
  });

  it('manipulation 3: an empty pattern is refused with the reason, a pattern past the cap too', () => {
    expect(parsePattern('')).toEqual({ ok: false, error: 'An empty pattern matches at every position: type at least one character.' });
    expect(parsePattern('a'.repeat(PATTERN_MAX)).ok).toBe(true);
    expect(parsePattern('a'.repeat(PATTERN_MAX + 1)).ok).toBe(false);
  });

  it('a sorted list is accepted, and moving an item swaps neighbours and stops at the ends', () => {
    expect(checkOrder('banana', [5, 3, 1, 0, 4, 2])).toBeNull();
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
  });

  it('every ordering of banana is accepted only when it is the suffix array', () => {
    const perms = (xs: number[]): number[][] => (xs.length < 2 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest])));
    const accepted = perms([0, 1, 2, 3, 4, 5]).filter((order) => checkOrder('banana', order) === null);
    expect(accepted).toEqual([[5, 3, 1, 0, 4, 2]]);
  });
});

describe('broken mode: the inverted prefix rule', () => {
  it('fails the witness aa, and the shortest failing string over {a, b} is that witness', () => {
    expect(suffixArray('aa')).toEqual([1, 0]);
    expect(suffixArray('aa', 'inverted')).toEqual([0, 1]);
    const report = brokenReport();
    expect(report.witness).toBe(PREFIX_RULE_WITNESS);
    expect(report.correct).toEqual([1, 0]);
    expect(report.broken).toEqual([0, 1]);
  });

  it('the inverted sort matches a second implementation of the inverted rule, and is wrong on most binary strings', () => {
    const strings = binaryStrings(WITNESS_MAX_LENGTH);
    let wrong = 0;
    for (const s of strings) {
      expect(suffixArray(s, 'inverted'), s).toEqual(naiveInvertedSa(s));
      if (suffixArray(s, 'inverted').join() !== naiveSa(s).join()) wrong += 1;
    }
    const report = brokenReport();
    expect(wrong).toBe(2026);
    expect(report.checked).toBe(2046);
    expect(report.wrong).toBe(wrong);
    // Re-derived here by the naive oracles, not copied from the spec: this is over the 90% cap, so the page shows the witness.
    expect(wrong / strings.length).toBeGreaterThan(0.9);
  });

  it('the checker under the inverted rule refuses the correct order and says which rule it applied', () => {
    const sa = suffixArray('banana');
    const verdict = checkOrder('banana', sa, 'inverted');
    // The first adjacent pair of the true array is (a, ana): the inverted rule wants ana first.
    expect(verdict).toEqual({ k: 0, reason: 'ana sorts before a: a is a prefix of ana, and under the inverted rule a suffix that ends first sorts last.' });
  });
});

describe('controls at their extremes and one beyond', () => {
  it('text: 1 and 16 characters are accepted; empty and 17 are refused; control characters are dropped', () => {
    expect(parseText('a').ok).toBe(true);
    expect(parseText('a'.repeat(TEXT_MAX)).ok).toBe(true);
    expect(parseText('a'.repeat(TEXT_MAX + 1)).ok).toBe(false);
    expect(parseText('').ok).toBe(false);
    expect(parseText('a\tb')).toMatchObject({ ok: true, value: 'ab' });
    expect(parseText('x😀')).toMatchObject({ ok: true, surrogates: true });
  });

  it('a one-letter text has a one-entry array, no repeats, and one substring', () => {
    const sa = suffixArray('a');
    const lcp = lcpKasai('a', sa);
    expect([sa, lcp, distinctSubstrings(1, lcp), longestRepeated('a', sa, lcp).text]).toEqual([[0], [0], 1, '']);
  });

  it('cost: counts come from real sorts, are deterministic, and the worst case grows faster than a random string', () => {
    const a = costSweep(7, 4);
    const b = costSweep(7, 4);
    expect(a).toEqual(b);
    const first = a[0];
    const last = a[a.length - 1];
    expect(first.n).toBe(16);
    expect(last.n).toBe(1000);
    expect(buildSuffixArray('a'.repeat(1000)).cost).toEqual(last.worst);
    expect(last.worst.charsCompared).toBeGreaterThan(20 * last.random.charsCompared);
    expect(randomText(7, 4, 1000)).toHaveLength(1000);
    // A merge sort needs at most n log2 n comparisons.
    expect(last.worst.comparisons).toBeLessThanOrEqual(1000 * Math.ceil(Math.log2(1000)));
    expect(costSweep(8, 4)[6].random).not.toEqual(last.random);
  });

  it('a random string uses only the first k letters of the alphabet', () => {
    expect(new Set(randomText(3, 2, 200))).toEqual(new Set(['a', 'b']));
    expect([...new Set(randomText(3, 26, 1000))].every((c) => c >= 'a' && c <= 'z')).toBe(true);
  });
});
