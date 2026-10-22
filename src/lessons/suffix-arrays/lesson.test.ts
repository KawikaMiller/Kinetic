import { describe, expect, it } from 'vitest';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { FACTS } from './facts';
import lesson from './index';
import {
  COST_N_DEFAULT, COST_N_MAX, COST_N_MIN, DEFAULT_TEXT, PREFIX_RULE_WITNESS, brokenReport, checkOrder, distinctSubstrings, lcpKasai, longestRepeated,
  moveItem, parsePattern, search, suffixArray,
} from './model';

describe('scenes', () => {
  it('every scene component carries its own key', () => {
    const els = sceneElements('suffix-arrays');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('suffix-arrays')).toEqual([]);
  });

  it('the cost scene opens on n = 200 inside the slider, and the witness constant is the smallest failing string', () => {
    expect(COST_N_DEFAULT).toBe(200);
    expect(COST_N_DEFAULT).toBeGreaterThanOrEqual(COST_N_MIN);
    expect(COST_N_DEFAULT).toBeLessThanOrEqual(COST_N_MAX);
    expect(brokenReport().witness).toBe(PREFIX_RULE_WITNESS);
  });
});

describe('try-this entries, each from the default state (banana, scene 1, suffixes in text order)', () => {
  const start = Array.from({ length: DEFAULT_TEXT.length }, (_, i) => i);

  it('try-this 1: Check order names anana before banana at position 0', () => {
    expect(checkOrder(DEFAULT_TEXT, start)?.reason).toBe("anana sorts before banana: at position 0, 'a' comes before 'b'.");
    expect(lesson.tryThis[0]).toContain("anana sorts before banana: at position 0, 'a' comes before 'b'");
  });

  it('try-this 2: Sort for me gives 5, 3, 1, 0, 4, 2', () => {
    expect(suffixArray(DEFAULT_TEXT).join(', ')).toBe('5, 3, 1, 0, 4, 2');
    expect(FACTS.sa).toBe('5, 3, 1, 0, 4, 2');
    expect(lesson.tryThis[1]).toContain('5, 3, 1, 0, 4, 2');
  });

  it('try-this 3: LCP 0, 1, 3, 0, 0, 2, longest repeat ana, 15 distinct', () => {
    const sa = suffixArray(DEFAULT_TEXT);
    const lcp = lcpKasai(DEFAULT_TEXT, sa);
    expect(lcp.join(', ')).toBe('0, 1, 3, 0, 0, 2');
    expect(longestRepeated(DEFAULT_TEXT, sa, lcp).text).toBe('ana');
    expect(distinctSubstrings(6, lcp)).toBe(15);
    expect(lesson.tryThis[2]).toContain('15 distinct');
  });

  it('try-this 4: ana gives [1, 3), two occurrences at positions 3 and 1', () => {
    const r = search(DEFAULT_TEXT, suffixArray(DEFAULT_TEXT), 'ana');
    expect([r.lo, r.hi, r.count, r.positions]).toEqual([1, 3, 2, [3, 1]]);
    expect(lesson.tryThis[3]).toContain('[1, 3)');
    expect(lesson.tryThis[3]).toContain('3 and 1');
  });

  it('try-this 5: nab gives an empty range and no positions', () => {
    const r = search(DEFAULT_TEXT, suffixArray(DEFAULT_TEXT), 'nab');
    expect([r.count, r.positions]).toEqual([0, []]);
    expect(parsePattern('nab').ok).toBe(true);
  });
});

describe('the lesson text agrees with the model', () => {
  it('the quiz answers name the numbers the model produces', () => {
    expect(lesson.quiz[2].why).toContain('3 - 1 = 2');
    expect(lesson.quiz[4].why).toContain('21 - 6 = 15');
    expect(lesson.keyIdeas[3]).toContain('[0, 1] instead of [1, 0]');
  });

  it('every wrong move used in the manipulations can be undone by moves alone', () => {
    let order = [0, 1, 2, 3, 4, 5];
    for (let guard = 0; guard < 100 && checkOrder(DEFAULT_TEXT, order) !== null; guard += 1) {
      const verdict = checkOrder(DEFAULT_TEXT, order);
      if (verdict) order = moveItem(order, verdict.k + 1, -1);
    }
    expect(order).toEqual([5, 3, 1, 0, 4, 2]);
  });
});
