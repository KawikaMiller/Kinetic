import { describe, expect, it } from 'vitest';
import { mulberry32, shuffle } from '../../core/random';
import { deleteFrames, inorderFrames, insertFrames, searchFrames } from './frames';
import {
  build, deleteKey, emptyTree, findPath, height, inorderIds, insertKey, isLopsided, minHeight, size, successorPath,
  type Tree,
} from './model';

const keysOf = (t: Tree) => inorderIds(t).map((id) => t.nodes[id].key);

/** The real BST rule: every key in a node's left subtree is smaller, every key in its right subtree bigger. */
function isBst(t: Tree, id = t.root, lo = -Infinity, hi = Infinity): boolean {
  if (id == null) return true;
  const n = t.nodes[id];
  return n.key > lo && n.key < hi && isBst(t, n.left, lo, n.key) && isBst(t, n.right, n.key, hi);
}

const START = [50, 30, 70, 20, 40, 60, 80, 35, 65];
const SORTED = [5, 12, 20, 28, 35, 43, 51, 60, 72, 88];

describe('operations against a reference sorted set', () => {
  it('2,000 seeded inserts, searches and deletes agree with a Set, and the BST rule always holds', () => {
    const rand = mulberry32(11);
    let t = emptyTree();
    const ref = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const k = 1 + Math.floor(rand() * 60);
      const op = rand();
      if (op < 0.45) {
        t = insertKey(t, k);
        ref.add(k);
      } else if (op < 0.75) {
        t = deleteKey(t, k);
        ref.delete(k);
      } else {
        expect(findPath(t, k).found !== null).toBe(ref.has(k));
      }
      expect(isBst(t)).toBe(true);
      expect(keysOf(t)).toEqual([...ref].sort((a, b) => a - b));
      expect(size(t)).toBe(ref.size);
    }
  });

  it('inserting a key that is already there leaves the tree as it was', () => {
    const t = build(START);
    expect(insertKey(t, 40)).toBe(t);
  });

  it('a search makes one comparison per level it visits, never more than the height', () => {
    const t = build(START);
    for (const k of [...START, 1, 36, 99]) {
      const { path } = findPath(t, k);
      expect(path.length).toBeLessThanOrEqual(height(t));
      path.forEach((id, i) => i && expect([t.nodes[path[i - 1]].left, t.nodes[path[i - 1]].right]).toContain(id));
    }
    expect(findPath(t, 35).path.map((id) => t.nodes[id].key)).toEqual([50, 30, 40, 35]);
  });
});

describe('delete', () => {
  it('a leaf is cut off and a one-child node is replaced by its child', () => {
    const t = build(START);
    expect(keysOf(deleteKey(t, 20))).toEqual([30, 35, 40, 50, 60, 65, 70, 80]);
    const oneChild = deleteKey(t, 60); // 60 has only 65
    const p = oneChild.nodes[findPath(oneChild, 70).found!];
    expect(oneChild.nodes[p.left!].key).toBe(65);
  });

  it('two children: the successor is the smallest key in the right subtree, and it takes the node\'s place', () => {
    const t = build(START);
    const id30 = findPath(t, 30).found!;
    const succ = successorPath(t, id30).map((id) => t.nodes[id].key);
    expect(succ).toEqual([40, 35]); // right once, then left as far as possible
    const order = keysOf(t);
    expect(succ.at(-1)).toBe(order[order.indexOf(30) + 1]); // the next key in sorted order
    const after = deleteKey(t, 30);
    expect(after.nodes[after.nodes[after.root!].left!].key).toBe(35);
    expect(isBst(after)).toBe(true);
  });

  it('deleting the root works for every shape', () => {
    for (const keys of [[50], [50, 30], [50, 70], START]) {
      const after = deleteKey(build(keys), 50);
      expect(keysOf(after)).toEqual([...keys].filter((k) => k !== 50).sort((a, b) => a - b));
    }
  });
});

describe('height claims', () => {
  it('the fewest possible levels for n nodes is ⌈log2(n + 1)⌉', () => {
    for (let n = 1; n <= 64; n++) expect(minHeight(n)).toBe(Math.floor(Math.log2(n)) + 1);
    expect(minHeight(0)).toBe(0);
  });

  it('the starting tree is as short as 9 keys allow', () => {
    const t = build(START);
    expect(height(t)).toBe(minHeight(9));
    expect(isLopsided(t)).toBe(false);
  });

  it('"Sorted order": ten keys build a chain, and searching 88 takes ten comparisons', () => {
    const t = build(SORTED);
    expect(height(t)).toBe(10);
    expect(findPath(t, 88).path).toHaveLength(10);
    expect(isLopsided(t)).toBe(true);
  });

  it('inserting 1…1000 in order: searching for 1000 takes 1,000 comparisons', () => {
    const t = build(Array.from({ length: 1000 }, (_, i) => i + 1));
    expect(findPath(t, 1000).path).toHaveLength(1000);
  });

  it('"Random order" usually lands at 5 or 6 levels: near the best 4, far from the 10 of a chain', () => {
    const rand = mulberry32(3);
    const RUNS = 2000;
    const heights = Array.from({ length: RUNS }, () => height(build(shuffle(SORTED, rand))));
    expect(heights.filter((h) => h === 5 || h === 6).length / RUNS).toBeGreaterThan(0.7);
    expect(heights.filter((h) => h >= 9).length / RUNS).toBeLessThan(0.01);
    expect(Math.min(...heights)).toBe(minHeight(SORTED.length));
  });

  it('a lopsided tree\'s worst search costs exactly its height', () => {
    const t = build(SORTED);
    expect(Math.max(...SORTED.map((k) => findPath(t, k).path.length))).toBe(height(t));
  });
});

describe('the frames tell the truth', () => {
  it('insert, search and delete frames end on the same tree as the model, counting the path as comparisons', () => {
    const t = build(START);
    const ins = insertFrames(t, 36);
    expect(keysOf(ins.tree)).toEqual(keysOf(insertKey(t, 36)));
    expect(ins.frames.at(-1)!.comparisons).toBe(findPath(t, 36).path.length);
    const del = deleteFrames(t, 30);
    expect(keysOf(del.tree)).toEqual(keysOf(deleteKey(t, 30)));
    expect(del.frames.some((f) => f.succ.length === 2)).toBe(true);
    expect(searchFrames(t, 65).frames.at(-1)!.comparisons).toBe(4);
    expect(searchFrames(t, 36).frames.at(-1)!.ghost).not.toBeNull();
  });

  it('the in-order walk outputs the keys sorted', () => {
    const t = build(shuffle(SORTED, mulberry32(5)));
    expect(inorderFrames(t).frames.at(-1)!.output).toEqual(SORTED);
  });
});

describe('the quiz\'s misconception', () => {
  it('parent/child checks pass but the tree is not a BST, and search misses a key that is there', () => {
    const t: Tree = {
      root: 1,
      nextId: 4,
      nodes: {
        1: { id: 1, key: 50, left: 2, right: null },
        2: { id: 2, key: 30, left: null, right: 3 },
        3: { id: 3, key: 60, left: null, right: null },
      },
    };
    expect(isBst(t)).toBe(false);
    expect(findPath(t, 60).found).toBeNull();
  });

  it('the smallest key is the leftmost node', () => {
    const t = build(shuffle(SORTED, mulberry32(9)));
    let id = t.root!;
    while (t.nodes[id].left != null) id = t.nodes[id].left!;
    expect(t.nodes[id].key).toBe(Math.min(...SORTED));
  });
});
