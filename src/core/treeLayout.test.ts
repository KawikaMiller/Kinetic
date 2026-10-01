import { describe, expect, it } from 'vitest';
import { layoutTree, treeX, type TreeShape } from './treeLayout';

/** A BST built from keys, as [left, right] children keyed by value. */
function bst(keys: number[]): TreeShape<number> {
  const kids = new Map<number, [number | null, number | null]>();
  let root: number | null = null;
  for (const k of keys) {
    kids.set(k, [null, null]);
    if (root == null) {
      root = k;
      continue;
    }
    let cur = root;
    for (;;) {
      const side = k < cur ? 0 : 1;
      const next = kids.get(cur)![side];
      if (next == null) {
        kids.get(cur)![side] = k;
        break;
      }
      cur = next;
    }
  }
  return { root, children: (id) => kids.get(id)! };
}

describe('layoutTree inorder', () => {
  it('orders a BST left to right by key', () => {
    const keys = [50, 30, 70, 20, 40, 60, 80, 35, 65];
    const { place, columns, depth } = layoutTree(bst(keys), 'inorder');
    const byCol = [...place.entries()].sort((a, b) => a[1].col - b[1].col).map(([k]) => k);
    expect(byCol).toEqual([...keys].sort((a, b) => a - b));
    expect(columns).toBe(keys.length);
    expect(depth).toBe(3);
  });

  it('keeps a missing left child on the correct side', () => {
    // 10 with only a right child: the parent must sit left of its child.
    const { place } = layoutTree(bst([10, 20]), 'inorder');
    expect(place.get(10)!.col).toBeLessThan(place.get(20)!.col);
  });

  it('degenerates into a diagonal for sorted inserts', () => {
    const { place, depth } = layoutTree(bst([1, 2, 3, 4]), 'inorder');
    expect([1, 2, 3, 4].map((k) => [place.get(k)!.col, place.get(k)!.depth])).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]]);
    expect(depth).toBe(3);
  });
});

describe('layoutTree tidy', () => {
  // A DOM-like n-ary tree: html > (head > title), (body > h1, p, ul > (li, li))
  const tree: Record<string, string[]> = {
    html: ['head', 'body'],
    head: ['title'],
    body: ['h1', 'p', 'ul'],
    ul: ['li1', 'li2'],
    title: [], h1: [], p: [], li1: [], li2: [],
  };
  const shape: TreeShape<string> = { root: 'html', children: (id) => tree[id] };

  it('gives leaves consecutive columns in depth-first order', () => {
    const { place, columns } = layoutTree(shape, 'tidy');
    expect(['title', 'h1', 'p', 'li1', 'li2'].map((id) => place.get(id)!.col)).toEqual([0, 1, 2, 3, 4]);
    expect(columns).toBe(5);
  });

  it('centres each parent between its first and last child', () => {
    const { place } = layoutTree(shape, 'tidy');
    expect(place.get('ul')!.col).toBe(3.5);
    expect(place.get('body')!.col).toBe((1 + 3.5) / 2);
    expect(place.get('head')!.col).toBe(0);
    expect(place.get('html')!.col).toBe((0 + 2.25) / 2);
  });

  it('matches the fib(n) call-tree layout (parent midway between its two calls)', () => {
    // fib(3): fib(2) -> [fib(1), fib(0)], fib(1)
    const kids: Record<string, string[]> = { f3: ['f2', 'f1b'], f2: ['f1a', 'f0'], f1a: [], f0: [], f1b: [] };
    const fib: TreeShape<string> = { root: 'f3', children: (id) => kids[id] };
    const { place } = layoutTree(fib, 'tidy');
    expect(place.get('f2')!.col).toBe(0.5);
    expect(place.get('f3')!.col).toBe((0.5 + 2) / 2);
  });

  it('skips null slots and handles an empty tree', () => {
    const gappy: TreeShape<string> = { root: 'a', children: (id) => (id === 'a' ? [null, 'b'] : []) };
    const { place } = layoutTree(gappy, 'tidy');
    expect(place.get('a')!.col).toBe(0);
    const empty: TreeShape<string> = { root: null, children: () => [] };
    expect(layoutTree(empty, 'tidy')).toEqual({ place: new Map(), columns: 0, depth: 0 });
  });
});

describe('layoutTree forest (roots)', () => {
  // Three union-find style trees: 0 <- 1, 2; 3 alone; 4 <- 5 <- 6.
  const kids: Record<number, number[]> = { 0: [1, 2], 1: [], 2: [], 3: [], 4: [5], 5: [6], 6: [] };
  const forest: TreeShape<number> = { root: null, roots: [0, 3, 4], children: (id) => kids[id] };

  for (const mode of ['tidy', 'inorder'] as const) {
    it(`${mode}: lays the trees side by side without overlapping`, () => {
      const { place } = layoutTree(forest, mode);
      const cols = (ids: number[]) => ids.map((id) => place.get(id)!.col);
      const [a, b, c] = [cols([0, 1, 2]), cols([3]), cols([4, 5, 6])];
      expect(Math.max(...a)).toBeLessThan(Math.min(...b));
      expect(Math.max(...b)).toBeLessThan(Math.min(...c));
      expect(place.size).toBe(7);
    });
  }

  it('puts a gap of `gap` columns between trees, none at the ends', () => {
    const { place, columns } = layoutTree(forest, 'tidy', { gap: 1 });
    expect(place.get(1)!.col).toBe(0);
    expect(place.get(3)!.col).toBe(2 + 1); // two leaves, then the gap
    expect(columns).toBe(3 + 2 + 1); // 3 leaves + 2 gaps
  });

  it('a single tree lays out exactly as before, with or without roots', () => {
    const one: TreeShape<number> = { root: 0, children: (id) => kids[id] };
    const asForest: TreeShape<number> = { root: null, roots: [0], children: (id) => kids[id] };
    for (const mode of ['tidy', 'inorder'] as const) expect(layoutTree(asForest, mode)).toEqual(layoutTree(one, mode));
  });

  it('depth is the deepest of any tree', () => {
    expect(layoutTree(forest, 'tidy').depth).toBe(2);
  });
});

describe('treeX', () => {
  it('spreads columns between the pads and centres a single node', () => {
    expect(treeX(0, 5, 900, 40)).toBe(40);
    expect(treeX(4, 5, 900, 40)).toBe(860);
    expect(treeX(2, 5, 900, 40)).toBe(450);
    expect(treeX(0, 1, 900, 40)).toBe(450);
  });
});
