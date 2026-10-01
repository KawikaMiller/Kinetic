import { captionText as text } from '../../core/testing/captions';
import { describe, expect, it } from 'vitest';
import { traversalFrames } from './frames';
import { addChild, isSortedLabels, labelKind, newChildLabel, reference, removeLeaf, type BTree, type Order } from './model';
import { MAX_NODES, NEW_LABELS, PRESETS } from './presets';

const ORDERS: Order[] = ['pre', 'in', 'post', 'level'];

/** Caption text with the markup stripped. */

const bst = PRESETS.find((x) => x.id === 'bst')!;
const letters = PRESETS.find((x) => x.id === 'letters')!;
/** The in-order verdict: the last frame of the walk. */
const inOrderVerdict = (tree: typeof bst.tree, preset: Parameters<typeof traversalFrames>[2]) =>
  text(traversalFrames(tree, 'in', preset).at(-1)!.say);

describe('in-order verdict comes from the output, not the preset', () => {
  it('an edited search tree is still called sorted (remove leaf 35 from the BST)', () => {
    const id35 = Number(Object.keys(bst.tree.nodes).find((k) => bst.tree.nodes[Number(k)].label === '35'));
    const edited = removeLeaf(bst.tree, id35)!;
    expect(reference(edited, 'in')).toEqual(['20', '30', '40', '50', '60', '70', '80']);
    const v = inOrderVerdict(edited, 'custom');
    expect(v).toContain('sorted, because this is a search tree');
    expect(v).not.toContain('not');
  });

  it('removing every removable leaf, one at a time, keeps the verdict "sorted"', () => {
    let tree = bst.tree;
    for (;;) {
      const leaf = Object.keys(tree.nodes).map(Number).find((k) => removeLeaf(tree, k) !== null);
      if (leaf === undefined) break;
      tree = removeLeaf(tree, leaf)!;
      expect(inOrderVerdict(tree, 'custom')).toContain('sorted, because');
    }
  });

  it('the letters tree (not a search tree) is called not sorted, edited or not', () => {
    expect(inOrderVerdict(letters.tree, 'letters')).toContain('not sorted');
    const leafD = Number(Object.keys(letters.tree.nodes).find((k) => letters.tree.nodes[Number(k)].label === 'D'));
    expect(inOrderVerdict(removeLeaf(letters.tree, leafD)!, 'custom')).toContain('not sorted');
  });

  it('isSortedLabels compares numbers numerically and text as text', () => {
    expect(isSortedLabels(['9', '10', '200'])).toBe(true); // as text "10" < "9"
    expect(isSortedLabels(['10', '9'])).toBe(false);
    expect(isSortedLabels(['A', 'B', 'C'])).toBe(true);
    expect(isSortedLabels(['B', 'A'])).toBe(false);
    expect(isSortedLabels(['5', '5'])).toBe(false); // a search tree has no duplicate keys
    expect(isSortedLabels([])).toBe(true);
  });

  it('isSortedLabels never calls mixed numbers-and-letters labels sorted', () => {
    expect(labelKind(['20', 'J'])).toBe('mixed');
    expect(isSortedLabels(['10', '20', 'J'])).toBe(false); // as text this would look ordered
  });

  it('a mixed-label tree gets the explicit "can\'t be compared" verdict on all four orders', () => {
    const mixed = addChild(bst.tree, Number(Object.keys(bst.tree.nodes).find((k) => bst.tree.nodes[+k].label === '20')), 'J')!.tree;
    for (const o of ORDERS) expect(text(traversalFrames(mixed, o, 'custom').at(-1)!.say)).toContain("mixed labels can't be compared");
  });

  it('the expression tree keeps its own captions despite mixing numbers and operators', () => {
    const p = PRESETS.find((x) => x.id === 'expression')!;
    for (const o of ORDERS) expect(text(traversalFrames(p.tree, o, p.id).at(-1)!.say)).not.toContain("can't be compared");
  });

  it('post-order captions a leaf as having no children, and an inner node by what is below it', () => {
    const captions = traversalFrames(letters.tree, 'post', 'letters').map((f) => text(f.say));
    expect(captions).toContain("D has no children, so there's nothing to finish first: write D.");
    expect(captions).toContain('Everything below B is finished: write B last.');
    expect(captions.some((c) => /Both of D/.test(c))).toBe(false);
  });
});

describe('adding nodes keeps labels consistent with the tree', () => {
  /** Fill a tree by always adding under the first node with room, as far as the cap and keys allow. */
  const fill = (start: BTree) => {
    let tree = start;
    for (;;) {
      if (Object.keys(tree.nodes).length >= MAX_NODES) return tree;
      const ids = Object.keys(tree.nodes).map(Number);
      const parent = ids.find((id) => newChildLabel(tree, id, NEW_LABELS) !== null);
      if (parent === undefined) return tree;
      tree = addChild(tree, parent, newChildLabel(tree, parent, NEW_LABELS)!)!.tree;
    }
  };

  it('a numeric search tree only ever gets numeric keys that keep it a search tree', () => {
    // Try every node as the place for each next child, not just the first with room.
    let frontier: BTree[] = [bst.tree];
    for (let round = 0; round < 3; round++) {
      const next: BTree[] = [];
      for (const tree of frontier) {
        for (const id of Object.keys(tree.nodes).map(Number)) {
          const label = newChildLabel(tree, id, NEW_LABELS);
          if (label === null) continue;
          const grown = addChild(tree, id, label)!.tree;
          const labels = Object.values(grown.nodes).map((n) => n.label);
          expect(labelKind(labels)).toBe('numeric');
          expect(isSortedLabels(reference(grown, 'in'))).toBe(true);
          next.push(grown);
        }
      }
      frontier = next.slice(0, 40);
    }
    const full = fill(bst.tree);
    expect(labelKind(Object.values(full.nodes).map((n) => n.label))).toBe('numeric');
    expect(isSortedLabels(reference(full, 'in'))).toBe(true);
    expect(inOrderVerdict(full, 'custom')).toContain('sorted, because');
  });

  it('a letters tree keeps getting letters', () => {
    const full = fill(letters.tree);
    expect(labelKind(Object.values(full.nodes).map((n) => n.label))).toBe('text');
  });

  it('gives no key when the gap between neighbours has no whole number left', () => {
    const tight: BTree = { root: 0, nodes: { 0: { label: '10', left: 1, right: null }, 1: { label: '9', left: null, right: null } } };
    const below9 = Number(newChildLabel(tight, 1, NEW_LABELS)); // left of 9: any whole number below it
    expect(Number.isInteger(below9) && below9 < 9).toBe(true);
    const closed: BTree = {
      root: 0,
      nodes: { 0: { label: '10', left: 1, right: null }, 1: { label: '8', left: null, right: 2 }, 2: { label: '9', left: null, right: null } },
    };
    // 9 sits in (8, 10): its right side would need a key in (9, 10), and its left one in (8, 9).
    expect(newChildLabel(closed, 2, NEW_LABELS)).toBeNull();
  });
});

describe('traversal frames', () => {
  it('end with exactly the reference output, an empty stack and every frame captioned', () => {
    for (const p of PRESETS) {
      for (const o of ORDERS) {
        const frames = traversalFrames(p.tree, o, p.id);
        const walkEnd = frames.filter((f) => !f.rpn).at(-1)!;
        expect(walkEnd.emitted.map((id) => p.tree.nodes[id].label)).toEqual(reference(p.tree, o));
        expect(walkEnd.stack).toEqual([]);
        expect(walkEnd.queue).toEqual([]);
        for (const f of frames) expect(f.say).toBeDefined();
      }
    }
  });

  it('evaluates the expression tree\'s post-order output to 14', () => {
    const p = PRESETS.find((x) => x.id === 'expression')!;
    expect(traversalFrames(p.tree, 'post', p.id).at(-1)!.rpn!.stack).toEqual([14]);
  });

  it('never has more stack frames than the tree is deep', () => {
    const bst = PRESETS.find((x) => x.id === 'bst')!;
    const depth = (id: number | null): number =>
      id === null ? 0 : 1 + Math.max(depth(bst.tree.nodes[id].left), depth(bst.tree.nodes[id].right));
    const max = Math.max(...traversalFrames(bst.tree, 'in', bst.id).map((f) => f.stack.length));
    expect(max).toBe(depth(bst.tree.root));
  });
});
