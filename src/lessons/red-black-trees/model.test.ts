import { describe, expect, it } from 'vitest';
import { mulberry32, randInt, shuffle } from '../../core/random';
import { AvlRef } from './avlRef';
import { COMPARE_SEED, compareRuns } from './compare';
import {
  EMPTY_RB,
  blackHeights,
  buildRb,
  checkRb,
  checkRules,
  groupsOf,
  heightOf,
  inOrder,
  insertKey,
  recolor,
  removeKey,
  sizeOf,
  type FixCase,
  type RbTree,
} from './model';

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/** An independent check, written without the model's helpers: every root-to-nil path, counted by brute force. */
function brute(t: RbTree): { sorted: number[]; rootBlack: boolean; redRed: boolean; blackCounts: Set<number> } {
  const sorted: number[] = [];
  let redRed = false;
  const blackCounts = new Set<number>();
  const go = (k: number | null, blacks: number, parentRed: boolean) => {
    if (k === null) {
      blackCounts.add(blacks + 1);
      return;
    }
    const n = t.nodes[k];
    if (parentRed && n.color === 'R') redRed = true;
    go(n.left, blacks + (n.color === 'B' ? 1 : 0), n.color === 'R');
    sorted.push(k);
    go(n.right, blacks + (n.color === 'B' ? 1 : 0), n.color === 'R');
  };
  go(t.root, 0, false);
  return { sorted, rootBlack: t.root === null || t.nodes[t.root].color === 'B', redRed, blackCounts };
}

describe('invariants after every operation, against a plain Set', () => {
  it('200 seeds x 200 mixed inserts and deletes: rules 1 to 4, BST order, key set, height bound, rotation bounds', () => {
    let maxInsertRotations = 0;
    let maxDeleteRotations = 0;
    const insertCases = new Set<FixCase>();
    const deleteCases = new Set<FixCase>();
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = mulberry32(seed);
      let tree = EMPTY_RB;
      const ref = new Set<number>();
      for (let op = 0; op < 200; op++) {
        const key = randInt(1, 70, rnd);
        const del = ref.has(key) && rnd() < 0.5;
        if (ref.has(key) && !del) continue;
        const r = del ? removeKey(tree, key, { record: true }) : insertKey(tree, key, { record: true });
        tree = r.tree;
        if (del) {
          ref.delete(key);
          maxDeleteRotations = Math.max(maxDeleteRotations, r.rotations.length);
          for (const s of r.steps) if (s.kind === 'fix') deleteCases.add(s.case);
        } else {
          ref.add(key);
          maxInsertRotations = Math.max(maxInsertRotations, r.rotations.length);
          for (const s of r.steps) if (s.kind === 'violation') insertCases.add(s.case);
        }
        const b = brute(tree);
        expect(b.sorted, `seed ${seed} op ${op}`).toEqual([...ref].sort((x, y) => x - y));
        expect(b.rootBlack, `seed ${seed} op ${op}: rule 2`).toBe(true);
        expect(b.redRed, `seed ${seed} op ${op}: rule 3`).toBe(false);
        expect(b.blackCounts.size, `seed ${seed} op ${op}: rule 4`).toBeLessThanOrEqual(1);
        expect(checkRb(tree), `seed ${seed} op ${op}`).toEqual([]);
        expect(sizeOf(tree)).toBe(ref.size);
        expect(heightOf(tree)).toBeLessThanOrEqual(2 * Math.log2(ref.size + 1) + 1e-9);
      }
    }
    expect(maxInsertRotations).toBeLessThanOrEqual(2);
    expect(maxDeleteRotations).toBeLessThanOrEqual(3);
    expect(maxInsertRotations, 'the seeded runs reach the bound, so the bound is tested and not slack').toBe(2);
    expect(maxDeleteRotations).toBe(3);
    expect([...insertCases].sort()).toEqual(['line', 'triangle', 'uncle-red']);
    expect([...deleteCases].sort()).toEqual(['far-nephew-red', 'near-nephew-red', 'sibling-black-black', 'sibling-red']);
  });

  it('deleting everything in a shuffled order keeps every rule and ends on an empty tree', () => {
    for (let seed = 1; seed <= 30; seed++) {
      let tree = buildRb(range(63)).tree;
      for (const k of shuffle(range(63), mulberry32(seed))) {
        tree = removeKey(tree, k).tree;
        expect(checkRb(tree)).toEqual([]);
      }
      expect(sizeOf(tree)).toBe(0);
      expect(tree.root).toBeNull();
    }
  });
});

describe('hand-worked vectors', () => {
  it('zig-zag: inserting 20 under red 10 in [30, 10] is the triangle case, then the line case: 20 on top, two reds under it', () => {
    const base = buildRb([30, 10]).tree;
    expect(base.nodes[30].color).toBe('B');
    expect(base.nodes[10].color).toBe('R');
    const r = insertKey(base, 20, { record: true });
    const violations = r.steps.filter((s) => s.kind === 'violation');
    expect(violations.map((s) => s.kind === 'violation' && s.case)).toEqual(['triangle', 'line']);
    expect(r.rotations.map((x) => x.kind)).toEqual(['left', 'right']);
    expect(r.recolors).toBe(2);
    expect(r.tree.root).toBe(20);
    expect(r.tree.nodes[20]).toMatchObject({ color: 'B', left: 10, right: 30 });
    expect(r.tree.nodes[10].color).toBe('R');
    expect(r.tree.nodes[30].color).toBe('R');
  });

  it('uncle red: inserting 1 into [10, 5, 15] recolours 5, 15 and 10 and makes no rotation; the root flips back to black', () => {
    const base = buildRb([10, 5, 15]).tree;
    const r = insertKey(base, 1, { record: true });
    expect(r.rotations).toHaveLength(0);
    const first = r.steps.find((s) => s.kind === 'violation');
    expect(first).toMatchObject({ case: 'uncle-red', uncleColor: 'R', parent: 5, grand: 10, uncle: 15 });
    expect(r.recolors).toBe(4);
    expect(r.tree.nodes[10].color).toBe('B');
    expect(r.tree.nodes[5].color).toBe('B');
    expect(r.tree.nodes[15].color).toBe('B');
    expect(r.tree.nodes[1].color).toBe('R');
  });

  it('a line insert: 1, 2, 3 rotates once and ends as 2 over two reds', () => {
    const r = buildRb([1, 2, 3]);
    expect(r.rotations).toBe(1);
    expect(r.tree.root).toBe(2);
    expect(r.tree.nodes[1].color).toBe('R');
    expect(r.tree.nodes[3].color).toBe('R');
  });

  it('delete: removing a red leaf changes no colours; removing a black leaf with a red sibling runs the sibling-red case first', () => {
    const t = buildRb([10, 5, 15]).tree;
    const red = removeKey(t, 5, { record: true });
    expect(red.recolors).toBe(0);
    expect(red.steps.some((s) => s.kind === 'fix')).toBe(false);
    // 10 black over black 5 and red 15, whose children 12 and 18 are black: every path has two black nodes.
    const sib: RbTree = {
      root: 10,
      nodes: {
        10: { key: 10, color: 'B', left: 5, right: 15 },
        5: { key: 5, color: 'B', left: null, right: null },
        15: { key: 15, color: 'R', left: 12, right: 18 },
        12: { key: 12, color: 'B', left: null, right: null },
        18: { key: 18, color: 'B', left: null, right: null },
      },
    };
    expect(checkRb(sib)).toEqual([]);
    const r = removeKey(sib, 5, { record: true });
    expect(r.steps.flatMap((s) => (s.kind === 'fix' ? [s.case] : []))).toEqual(['sibling-red', 'sibling-black-black']);
    expect(r.rotations).toEqual([{ kind: 'left', down: 10, up: 15 }]);
    expect(r.recolors).toBe(4);
    expect(r.tree.root).toBe(15);
    expect(r.tree.nodes[10]).toMatchObject({ color: 'B', left: null, right: 12 });
    expect(r.tree.nodes[12].color).toBe('R');
    expect(checkRb(r.tree)).toEqual([]);
  });
});

describe('the rule checker names what is wrong', () => {
  it('recolouring the root of a valid tree red breaks rules 2 and 3 and names them', () => {
    const t = recolor(buildRb([10, 5, 15]).tree, 10);
    const rules = checkRules(t);
    expect(rules.map((r) => r.ok)).toEqual([true, false, false, true]);
    expect(rules[1].detail).toBe('the root 10 is red');
    expect(rules[2].detail).toBe('10 is red and its child 5 is red');
  });

  it('recolouring a red leaf black breaks rule 4 at the node above and counts both sides', () => {
    const t = recolor(buildRb([10, 5, 15]).tree, 5);
    const rules = checkRules(t);
    expect(rules.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(rules[3].detail).toBe('below 10 the paths differ: 2 black on the left side, 1 on the right');
    expect(blackHeights(t).get(10)).toBeNull();
  });

  it('a valid tree has equal black-heights below every node, and black-height drops by one per black step down', () => {
    const t = buildRb(range(15)).tree;
    const bh = blackHeights(t);
    for (const n of Object.values(t.nodes)) {
      const h = bh.get(n.key) as number;
      const below = Math.max(...[n.left, n.right].map((c) => (c === null ? 1 : (bh.get(c) as number))));
      expect(h).toBe(below + (n.color === 'B' ? 1 : 0));
    }
  });
});

describe('the 2-3-4 view', () => {
  it('every group holds 1 to 3 keys, the keys partition the tree, and all leaf groups sit at one depth (200 seeded trees)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = mulberry32(seed);
      let tree = EMPTY_RB;
      const n = randInt(1, 40, rnd);
      for (let i = 0; i < n; i++) {
        const k = randInt(1, 80, rnd);
        if (!(k in tree.nodes)) tree = insertKey(tree, k).tree;
      }
      const groups = groupsOf(tree);
      const keys = groups.flatMap((g) => g.keys).sort((a, b) => a - b);
      expect(keys, `seed ${seed}`).toEqual(inOrder(tree));
      for (const g of groups) {
        expect(g.keys.length).toBeGreaterThanOrEqual(1);
        expect(g.keys.length).toBeLessThanOrEqual(3);
        expect(g.children.length).toBeLessThanOrEqual(g.keys.length + 1);
      }
      const leafDepths = new Set(groups.filter((g) => g.children.length === 0).map((g) => g.depth));
      expect(leafDepths.size, `seed ${seed}`).toBe(1);
      // independent: black nodes on the leftmost path of the tree, minus the nil leaf
      let blacks = 0;
      for (let k: number | null = tree.root; k !== null; k = tree.nodes[k].left) if (tree.nodes[k].color === 'B') blacks++;
      expect([...leafDepths][0] + 1).toBe(blacks);
    }
  });

  it('a 3-node looks the same whichever side its red child is on', () => {
    const redLeft = buildRb([20, 10]).tree;
    const redRight = buildRb([10, 20]).tree;
    expect(redLeft.nodes[10].color).toBe('R');
    expect(redRight.nodes[20].color).toBe('R');
    expect(groupsOf(redLeft)[0].keys).toEqual([10, 20]);
    expect(groupsOf(redRight)[0].keys).toEqual([10, 20]);
    expect(groupsOf(redLeft)).toHaveLength(1);
  });

  it('uncle red is splitting a 4-node and pushing a key up: the 4-node [5, 10, 15] becomes a 2-node 10 above two 2-nodes', () => {
    const before = groupsOf(buildRb([10, 5, 15]).tree);
    expect(before).toHaveLength(1);
    expect(before[0].keys).toEqual([5, 10, 15]);
    const after = groupsOf(insertKey(buildRb([10, 5, 15]).tree, 1).tree);
    expect(after.map((g) => g.keys.length).sort()).toEqual([1, 1, 2]);
    expect(after.find((g) => g.depth === 0)?.keys).toEqual([10]);
  });
});

describe('broken variants', () => {
  it('skipping the uncle-red recolour breaks a named rule on some seed; the correct insert never does', () => {
    const failing = new Set<number>();
    for (let seed = 1; seed <= 100; seed++) {
      const keys = shuffle(range(30), mulberry32(seed));
      expect(checkRb(buildRb(keys).tree)).toEqual([]);
      const broken = checkRules(buildRb(keys, { broken: 'skip-uncle-recolor' }).tree);
      for (const r of broken) if (!r.ok) failing.add(r.rule);
    }
    expect(failing.size).toBeGreaterThan(0);
    expect([...failing].every((rule) => rule === 3 || rule === 4 || rule === 2)).toBe(true);
  });

  it('forgetting to blacken the root breaks rule 2 on the very first insert', () => {
    const t = buildRb([5], { broken: 'keep-root-red' }).tree;
    const rules = checkRules(t);
    expect(rules[1].ok).toBe(false);
    expect(rules[1].detail).toBe('the root 5 is red');
    expect(checkRb(buildRb([5]).tree)).toEqual([]);
  });
});

describe('the compact AVL reference used by the comparison', () => {
  it('matches a Set and keeps every height real and every balance factor within one (200 seeds x 200 ops)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = mulberry32(seed);
      const avl = new AvlRef();
      const ref = new Set<number>();
      for (let op = 0; op < 200; op++) {
        const key = randInt(1, 70, rnd);
        if (ref.has(key) && rnd() < 0.5) {
          avl.remove(key);
          ref.delete(key);
        } else if (!ref.has(key)) {
          avl.insert(key);
          ref.add(key);
        }
        const a = avl.audit();
        expect(a.keys, `seed ${seed} op ${op}`).toEqual([...ref].sort((x, y) => x - y));
        expect(a.valid, `seed ${seed} op ${op}`).toBe(true);
      }
    }
  });

  it('sorted 1..15 takes 11 rotations, as the avl-trees lesson says (n minus log2(n + 1))', () => {
    const avl = new AvlRef();
    for (const k of range(15)) avl.insert(k);
    expect(avl.rotations).toBe(11);
    expect(avl.height).toBe(4);
  });
});

describe('the comparison runs', () => {
  it.each(['random', 'sorted'] as const)('%s order: both trees stay under their bounds at every sample, and the rotation maxima respect the red-black bounds', (order) => {
    const c = compareRuns(order, COMPARE_SEED);
    c.n.forEach((n, i) => {
      expect(c.rbHeight[i], `rb at ${n}`).toBeLessThanOrEqual(2 * Math.log2(n + 1) + 1e-9);
      expect(c.avlHeight[i], `avl at ${n}`).toBeLessThanOrEqual(1.44 * Math.log2(n + 2));
      expect(c.avlHeight[i]).toBeGreaterThanOrEqual(Math.ceil(Math.log2(n + 1)));
      expect(c.rbHeight[i]).toBeGreaterThanOrEqual(c.avlHeight[i] - 1);
    });
    expect(c.rb.insert.maxRotations).toBeLessThanOrEqual(2);
    expect(c.rb.remove.maxRotations).toBeLessThanOrEqual(3);
    expect(c.avl.insert.maxRotations).toBeLessThanOrEqual(2);
    expect(c.n[c.n.length - 1]).toBe(1023);
  });

  it('is deterministic and the sorted run makes the red-black tree taller than the AVL tree', () => {
    expect(JSON.stringify(compareRuns('random', 3))).toBe(JSON.stringify(compareRuns('random', 3)));
    const s = compareRuns('sorted', COMPARE_SEED);
    expect(s.rbHeight[s.rbHeight.length - 1]).toBeGreaterThan(s.avlHeight[s.avlHeight.length - 1]);
    expect(s.avlHeight[s.avlHeight.length - 1]).toBe(10);
  });
});
