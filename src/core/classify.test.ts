import { describe, expect, it } from 'vitest';
import { allSorted, classifyScore, emptyClassify, pickCategory, placementsByCategory, sortedCount } from './classify';

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

describe('explore mode: the no-key path (no answerKey, no score)', () => {
  const CATEGORIES = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];

  it('tracks placement with no key at all: sortedCount and allSorted only, and the board never counts as checked', () => {
    let s = emptyClassify(ITEMS);
    expect(allSorted(ITEMS, s.answers)).toBe(false);
    for (const [id, cat] of [['a', 'x'], ['b', 'x'], ['c', 'y']]) {
      s = pickCategory(s, id, cat);
      expect(s.checked).toBe(false);
    }
    expect(sortedCount(ITEMS, s.answers)).toBe(3);
    expect(allSorted(ITEMS, s.answers)).toBe(true);
  });

  it('allSorted is true for no items and false while any item is null', () => {
    expect(allSorted([], {})).toBe(true);
    expect(allSorted(ITEMS, { a: 'x', b: null, c: 'z' })).toBe(false);
  });

  it('groups placements by category in item order, listing empty categories and leaving unsorted items out', () => {
    expect(placementsByCategory(ITEMS, CATEGORIES, emptyClassify(ITEMS).answers)).toEqual({ x: [], y: [], z: [] });
    expect(placementsByCategory(ITEMS, CATEGORIES, { a: 'y', b: null, c: 'y' })).toEqual({ x: [], y: ['a', 'c'], z: [] });
  });

  it('placing the same item twice moves it rather than copying it', () => {
    const once = pickCategory(emptyClassify(ITEMS), 'a', 'x');
    const moved = pickCategory(once, 'a', 'z');
    expect(placementsByCategory(ITEMS, CATEGORIES, moved.answers)).toEqual({ x: [], y: [], z: ['a'] });
  });

  it('ignores a stored answer whose category no longer exists instead of inventing one', () => {
    expect(placementsByCategory(ITEMS, CATEGORIES, { a: 'gone', b: 'x', c: null })).toEqual({ x: ['b'], y: [], z: [] });
  });
});
