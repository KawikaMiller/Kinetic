import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import {
  addChild, emitted, evaluateRpn, isLeaf, reference, removeLeaf, traversalEvents, type BTree, type Order,
} from './model';
import { PRESETS } from './presets';

const ORDERS: Order[] = ['pre', 'in', 'post', 'level'];
const tree = (id: string) => PRESETS.find((p) => p.id === id)!.tree;

/** A random binary tree with up to 14 nodes, grown by attaching to random free slots. */
function randomTree(rnd: () => number): BTree {
  let t: BTree = { root: 0, nodes: { 0: { label: 'n0', left: null, right: null } } };
  const size = randInt(1, 14, rnd);
  for (let i = 1; i < size; i++) {
    const open = Object.keys(t.nodes).map(Number).filter((id) => t.nodes[id].left === null || t.nodes[id].right === null);
    const next = addChild(t, open[randInt(0, open.length - 1, rnd)], `n${i}`);
    if (next) t = next.tree;
  }
  return t;
}

describe('traversal traces', () => {
  it('emit exactly the reference order on every preset, all four orders', () => {
    for (const p of PRESETS) for (const o of ORDERS) expect(emitted(p.tree, traversalEvents(p.tree, o))).toEqual(reference(p.tree, o));
  });

  it('match the reference on 300 seeded random trees, and every call is matched by a return', () => {
    const rnd = mulberry32(41);
    for (let k = 0; k < 300; k++) {
      const t = randomTree(rnd);
      for (const o of ORDERS) {
        const ev = traversalEvents(t, o);
        expect(emitted(t, ev)).toEqual(reference(t, o));
        const n = Object.keys(t.nodes).length;
        expect(ev.filter((e) => e.kind === 'emit')).toHaveLength(n);
        if (o !== 'level') {
          expect(ev.filter((e) => e.kind === 'call')).toHaveLength(n);
          let depth = 0;
          for (const e of ev) {
            if (e.kind === 'call') depth++;
            if (e.kind === 'return') depth--;
            expect(depth).toBeGreaterThanOrEqual(0);
          }
          expect(depth).toBe(0);
        }
      }
    }
  });

  it('gives the hand-worked answers for the letters tree, whose in-order is NOT sorted', () => {
    const t = tree('letters');
    expect(reference(t, 'pre').join('')).toBe('ABDEGHCFI');
    expect(reference(t, 'in').join('')).toBe('DBGEHACIF');
    expect(reference(t, 'post').join('')).toBe('DGHEBIFCA');
    expect(reference(t, 'level').join('')).toBe('ABCDEFGHI');
    const inorder = reference(t, 'in');
    expect(inorder).not.toEqual([...inorder].sort());
  });
});

describe('expression tree (3 + 4) × 2', () => {
  const t = tree('expression');
  it('pre-order is Polish notation, in-order is infix without brackets, post-order is RPN', () => {
    expect(reference(t, 'pre')).toEqual(['×', '+', '3', '4', '2']);
    expect(reference(t, 'in')).toEqual(['3', '+', '4', '×', '2']);
    expect(reference(t, 'post')).toEqual(['3', '4', '+', '2', '×']);
  });
  it('the post-order output evaluates to 14 on a stack', () => {
    expect(evaluateRpn(reference(t, 'post')).value).toBe(14);
  });
  it('rejects a malformed expression', () => {
    expect(() => evaluateRpn(['3', '+'])).toThrow();
  });
});

describe('BST preset', () => {
  it('in-order is sorted, and pre-order is not', () => {
    const t = tree('bst');
    const inorder = reference(t, 'in').map(Number);
    expect(inorder).toEqual([...inorder].sort((a, b) => a - b));
    expect(reference(t, 'pre').map(Number)).not.toEqual([...inorder]);
  });
});

describe('editing', () => {
  it('adds to the first free side and removes only leaves (never the root)', () => {
    const t = tree('expression');
    expect(addChild(t, 0, 'x')).toBeNull();
    const added = addChild(t, 4, 'x')!;
    expect(added.tree.nodes[4].left).toBe(added.id);
    expect(isLeaf(added.tree, added.id)).toBe(true);
    expect(removeLeaf(t, 0)).toBeNull();
    expect(removeLeaf(t, 1)).toBeNull();
    const removed = removeLeaf(t, 3)!;
    expect(removed.nodes[3]).toBeUndefined();
    expect(removed.nodes[1].right).toBeNull();
    expect(reference(removed, 'pre')).toEqual(['×', '+', '3', '2']);
  });
});
