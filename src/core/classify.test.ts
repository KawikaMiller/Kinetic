import { describe, expect, it } from 'vitest';
import { classifyScore, emptyClassify, pickCategory, sortedCount } from './classify';

const ITEMS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const KEY = { a: 'x', b: 'y', c: 'z' };

describe('classify state', () => {
  it('starts empty and unchecked: nothing sorted, nothing right', () => {
    const s = emptyClassify(ITEMS);
    expect(s).toEqual({ answers: { a: null, b: null, c: null }, checked: false });
    expect(sortedCount(ITEMS, s.answers)).toBe(0);
    expect(classifyScore(ITEMS, KEY, s.answers)).toBe(0);
  });

  it('scores exactly the items sitting in their key category; unsorted counts as wrong', () => {
    expect(classifyScore(ITEMS, KEY, { a: 'x', b: 'y', c: 'z' })).toBe(3);
    expect(classifyScore(ITEMS, KEY, { a: 'x', b: 'z', c: null })).toBe(1);
    expect(sortedCount(ITEMS, { a: 'x', b: 'z', c: null })).toBe(2);
  });

  it('picking a category sets that item only and un-checks the board', () => {
    const checked = { ...emptyClassify(ITEMS), checked: true };
    const next = pickCategory(checked, 'b', 'q');
    expect(next).toEqual({ answers: { a: null, b: 'q', c: null }, checked: false });
    expect(checked.answers.b).toBeNull();
  });

  it('re-picking replaces the earlier answer', () => {
    const once = pickCategory(emptyClassify(ITEMS), 'a', 'x');
    expect(pickCategory(once, 'a', 'y').answers.a).toBe('y');
  });
});
