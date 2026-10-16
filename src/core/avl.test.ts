import { describe, expect, it } from 'vitest';
import { EMPTY_TREE, balanceOf, buildAvl, checkAvl, heightOf, inOrder, insertKey, removeKey, sizeOf } from './avl';

describe('AVL model (shared by avl-trees and red-black-trees)', () => {
  it('sorted 1..7 ends as the perfect tree of height 3 after 4 rotations', () => {
    const built = buildAvl([1, 2, 3, 4, 5, 6, 7]);
    expect(built.tree.root).toBe(4);
    expect(heightOf(built.tree)).toBe(3);
    expect(built.rotations).toBe(4);
    expect(checkAvl(built.tree)).toEqual([]);
  });

  it('a left-right case is one fix and two rotations', () => {
    const r = insertKey(buildAvl([30, 10]).tree, 20);
    expect(r.fixes).toBe(1);
    expect(r.rotations.map((x) => x.kind)).toEqual(['left', 'right']);
    expect(r.tree.root).toBe(20);
  });

  it('deleting a two-child node promotes its in-order successor and stays balanced', () => {
    const tree = buildAvl([4, 2, 6, 1, 3, 5, 7]).tree;
    const r = removeKey(tree, 4);
    expect(r.tree.root).toBe(5);
    expect(inOrder(r.tree)).toEqual([1, 2, 3, 5, 6, 7]);
    expect(checkAvl(r.tree)).toEqual([]);
    expect(sizeOf(r.tree)).toBe(6);
    expect(balanceOf(r.tree, 5)).toBe(0);
  });

  it('refuses a duplicate insert and a missing delete', () => {
    expect(() => insertKey(buildAvl([1]).tree, 1)).toThrow();
    expect(() => removeKey(EMPTY_TREE, 1)).toThrow();
  });

  it('records a snapshot per step only when asked', () => {
    const base = buildAvl([1, 2]).tree;
    expect(insertKey(base, 3).steps).toHaveLength(0);
    expect(insertKey(base, 3, { record: true }).steps.length).toBeGreaterThan(0);
  });
});
