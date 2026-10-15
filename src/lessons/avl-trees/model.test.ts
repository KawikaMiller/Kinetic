import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import {
  CORRECT_CHOICE,
  EMPTY_TREE,
  applyChoice,
  balanceOf,
  buildAvl,
  buildBalanced,
  buildBst,
  caseAt,
  checkAvl,
  fibonacciSize,
  fibonacciTree,
  heightOf,
  inOrder,
  insertKey,
  removeKey,
  sizeOf,
  stopAtImbalance,
  type Choice,
  type Tree,
} from './model';

/** An independent check, written without the model's helpers: BST order, real heights, balance factors. */
function brute(t: Tree): { sorted: number[]; height: number; worstBalance: number; heightsStored: boolean } {
  const sorted: number[] = [];
  let worst = 0;
  let stored = true;
  const go = (k: number | null): number => {
    if (k === null) return 0;
    const l = go(t.nodes[k].left);
    sorted.push(k);
    const r = go(t.nodes[k].right);
    worst = Math.max(worst, Math.abs(r - l));
    if (t.nodes[k].h !== 1 + Math.max(l, r)) stored = false;
    return 1 + Math.max(l, r);
  };
  const height = go(t.root);
  return { sorted, height, worstBalance: worst, heightsStored: stored };
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('invariants after every operation, against a plain Set', () => {
  it('200 seeds x 200 mixed inserts and deletes: order, stored heights, |balance| <= 1 and the key set', () => {
    let rebalancingInserts = 0;
    let mostFixesOnADelete = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = mulberry32(seed);
      let tree = EMPTY_TREE;
      const ref = new Set<number>();
      for (let op = 0; op < 200; op++) {
        const key = randInt(1, 70, rnd);
        const del = ref.has(key) && rnd() < 0.5;
        if (ref.has(key) && !del) continue;
        if (del) {
          const r = removeKey(tree, key);
          tree = r.tree;
          ref.delete(key);
          mostFixesOnADelete = Math.max(mostFixesOnADelete, r.fixes);
        } else {
          const r = insertKey(tree, key);
          tree = r.tree;
          ref.add(key);
          expect(r.fixes, `seed ${seed} op ${op}: an insert fixes at most one imbalance`).toBeLessThanOrEqual(1);
          expect(r.rotations.length).toBeLessThanOrEqual(2);
          if (r.fixes) rebalancingInserts++;
        }
        const b = brute(tree);
        expect(b.sorted, `seed ${seed} op ${op}`).toEqual([...ref].sort((x, y) => x - y));
        expect(b.worstBalance, `seed ${seed} op ${op}`).toBeLessThanOrEqual(1);
        expect(b.heightsStored, `seed ${seed} op ${op}`).toBe(true);
        expect(checkAvl(tree)).toEqual([]);
        expect(sizeOf(tree)).toBe(ref.size);
        expect(inOrder(tree)).toEqual(b.sorted);
      }
    }
    expect(rebalancingInserts).toBeGreaterThan(1000);
    expect(mostFixesOnADelete, 'a delete can fix several ancestors: the seeded runs find one').toBeGreaterThanOrEqual(2);
  });

  it('a delete never fixes more ancestors than the tree is tall', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rnd = mulberry32(seed + 1000);
      let tree = buildAvl(range(31)).tree;
      while (sizeOf(tree) > 0) {
        const keys = inOrder(tree);
        const h = heightOf(tree);
        const r = removeKey(tree, keys[randInt(0, keys.length - 1, rnd)]);
        expect(r.fixes).toBeLessThanOrEqual(h);
        tree = r.tree;
        expect(checkAvl(tree)).toEqual([]);
      }
    }
  });
});

describe('sorted inserts', () => {
  it.each([
    [7, 3, 4],
    [15, 4, 11],
    [31, 5, 26],
  ])('sorted 1..%i gives a perfect tree of height %i with %i rotations', (n, h, rotations) => {
    const { tree, rotations: count } = buildAvl(range(n));
    expect(heightOf(tree)).toBe(h);
    expect(sizeOf(tree)).toBe(2 ** h - 1);
    expect(count).toBe(rotations);
    expect(count).toBe(n - Math.log2(n + 1));
    expect(checkAvl(tree)).toEqual([]);
  });

  it('the plain tree on the same sorted keys is a chain of height n', () => {
    for (const n of [7, 15, 31]) expect(heightOf(buildBst(range(n)))).toBe(n);
  });

  it('the plain tree has the same in-order keys as the AVL tree for the same insertion order', () => {
    const rnd = mulberry32(5);
    const keys = Array.from({ length: 25 }, (_, i) => i + 1).sort(() => rnd() - 0.5);
    expect(inOrder(buildBst(keys))).toEqual(inOrder(buildAvl(keys).tree));
  });
});

describe('Fibonacci trees are the thinnest AVL trees', () => {
  it('N(h) follows the recurrence and starts 1, 2, 4, 7, 12, 20, 33', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(fibonacciSize)).toEqual([1, 2, 4, 7, 12, 20, 33]);
    for (let h = 3; h <= 12; h++) expect(fibonacciSize(h)).toBe(fibonacciSize(h - 1) + fibonacciSize(h - 2) + 1);
  });

  it('the built tree has N(h) nodes, height h, keys 1..N and is a valid AVL tree for h = 1..8', () => {
    for (let h = 1; h <= 8; h++) {
      const t = fibonacciTree(h);
      expect(sizeOf(t)).toBe(fibonacciSize(h));
      expect(heightOf(t)).toBe(h);
      expect(inOrder(t)).toEqual(range(fibonacciSize(h)));
      expect(checkAvl(t)).toEqual([]);
    }
  });

  it('brute force over every binary tree shape up to 11 nodes: the tallest valid AVL tree with n nodes is the largest h with N(h) <= n', () => {
    // A shape is (leftSubtreeShapes x rightSubtreeShapes): enumerate heights of AVL-valid shapes only.
    const validHeights: Set<number>[] = [new Set([0])];
    for (let n = 1; n <= 11; n++) {
      const hs = new Set<number>();
      for (let left = 0; left < n; left++) {
        for (const hl of validHeights[left]) {
          for (const hr of validHeights[n - 1 - left]) if (Math.abs(hl - hr) <= 1) hs.add(1 + Math.max(hl, hr));
        }
      }
      validHeights.push(hs);
      const tallest = Math.max(...hs);
      let expected = 0;
      while (fibonacciSize(expected + 1) <= n) expected++;
      expect(tallest, `n = ${n}`).toBe(expected);
    }
  });

  it('the shortest tree for n keys has height ceil(log2(n + 1))', () => {
    for (let n = 1; n <= 40; n++) expect(heightOf(buildBalanced(range(n)))).toBe(Math.ceil(Math.log2(n + 1)));
  });
});

describe('height against the bound 1.44 log2(n + 2) on seeded runs of up to 1,023 keys', () => {
  it('sorted and random insertion orders both stay under the bound at every size', () => {
    for (const seed of [1, 2, 3]) {
      const rnd = mulberry32(seed);
      const order = range(1023).sort(() => rnd() - 0.5);
      for (const keys of [range(1023), order]) {
        let tree = EMPTY_TREE;
        keys.forEach((k, i) => {
          tree = insertKey(tree, k).tree;
          const n = i + 1;
          if (n % 64 === 0 || n === 1023) expect(heightOf(tree)).toBeLessThanOrEqual(1.4405 * Math.log2(n + 2));
        });
        expect(checkAvl(tree)).toEqual([]);
      }
    }
  });
});

describe('the broken variant: left-right treated as a single right rotation', () => {
  it('zig-zag 30, 10, 20 comes out unbalanced and the checker says which node', () => {
    const good = buildAvl([30, 10, 20]);
    expect(checkAvl(good.tree)).toEqual([]);
    const bad = buildAvl([30, 10, 20], { broken: true });
    const problems = checkAvl(bad.tree);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toContain('balance factor');
    expect(balanceOf(bad.tree, 10)).toBe(2);
  });

  it('the checker catches it on seeded runs too', () => {
    let caught = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const rnd = mulberry32(seed);
      const keys = range(20).sort(() => rnd() - 0.5);
      expect(checkAvl(buildAvl(keys).tree)).toEqual([]);
      if (checkAvl(buildAvl(keys, { broken: true }).tree).length) caught++;
    }
    expect(caught, 'the wrong rotation breaks a rule on a good share of the seeds, and the right one on none').toBeGreaterThanOrEqual(10);
  });

  it('the checker also rejects a stale stored height and a swapped child', () => {
    const t = buildAvl(range(7)).tree;
    expect(checkAvl({ root: t.root, nodes: { ...t.nodes, 4: { ...t.nodes[4], h: 9 } } }).join(' ')).toContain('stores height');
    expect(checkAvl({ root: t.root, nodes: { ...t.nodes, 2: { ...t.nodes[2], left: 3, right: 1 } } }).join(' ')).toContain('BST order');
  });
});

describe('you pick the rotation: four cases x four buttons', () => {
  const CASES: { name: 'LL' | 'RR' | 'LR' | 'RL'; base: number[]; key: number; at: number }[] = [
    { name: 'LL', base: [30, 20, 40, 10], key: 5, at: 20 },
    { name: 'RR', base: [20, 10, 30, 40], key: 50, at: 30 },
    { name: 'LR', base: [50, 25, 75, 10, 30], key: 27, at: 50 },
    { name: 'RL', base: [50, 75, 25, 90, 60], key: 65, at: 50 },
  ];
  const CHOICES: Choice[] = ['right', 'left', 'left-right', 'right-left'];

  it('each preset stops at the stated node with the stated case', () => {
    for (const c of CASES) {
      const base = buildAvl(c.base).tree;
      expect(checkAvl(base)).toEqual([]);
      const s = stopAtImbalance(base, c.key);
      expect(s, c.name).not.toBeNull();
      expect(s!.at).toBe(c.at);
      expect(s!.case).toBe(c.name);
      expect(caseAt(s!.tree, s!.at)).toBe(c.name);
    }
  });

  it('only the matching rotation gives a valid tree; every other button is refused or leaves a node out of balance', () => {
    for (const c of CASES) {
      const s = stopAtImbalance(buildAvl(c.base).tree, c.key)!;
      for (const choice of CHOICES) {
        const out = applyChoice(s, choice);
        const right = CORRECT_CHOICE[c.name] === choice;
        expect(out.valid, `${c.name} + ${choice}`).toBe(right);
        expect(out.correct, `${c.name} + ${choice}`).toBe(right);
        if (!right) expect(!out.applied || out.unbalanced.length > 0, `${c.name} + ${choice}`).toBe(true);
        if (out.applied) expect(inOrder(out.tree), 'a rotation never changes the in-order sequence').toEqual(inOrder(s.tree));
      }
    }
  });

  it('a single right rotation on a left-right case swaps which side is heavy', () => {
    const s = stopAtImbalance(buildAvl([50, 25, 75, 10, 30]).tree, 27)!;
    const out = applyChoice(s, 'right');
    expect(balanceOf(s.tree, 50)).toBe(-2);
    expect(out.tree.root).toBe(25);
    expect(out.unbalanced).toEqual([25]);
    expect(balanceOf(out.tree, 25)).toBe(2);
  });

  it('a rotation never changes the in-order keys, whatever the tree (200 seeded trees, all four buttons)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = mulberry32(seed);
      const base = buildAvl(range(12).map(() => randInt(1, 90, rnd)).filter((k, i, a) => a.indexOf(k) === i)).tree;
      const key = randInt(91, 99, rnd);
      const s = stopAtImbalance(base, key);
      if (!s) continue;
      for (const choice of CHOICES) {
        const out = applyChoice(s, choice);
        if (out.applied) expect(inOrder(out.tree)).toEqual(inOrder(s.tree));
      }
    }
  });
});
