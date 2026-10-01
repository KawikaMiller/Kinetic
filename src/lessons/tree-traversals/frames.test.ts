import { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { traversalFrames } from './frames';
import { isSortedLabels, reference, removeLeaf, type Order } from './model';
import { PRESETS } from './presets';

const ORDERS: Order[] = ['pre', 'in', 'post', 'level'];

/** Caption text with the markup stripped. */
const text = (node: ReactNode) =>
  isValidElement(node)
    ? renderToStaticMarkup(node)
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
    : String(node ?? '');

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

  it('post-order captions a leaf as having no children, and an inner node by what is below it', () => {
    const captions = traversalFrames(letters.tree, 'post', 'letters').map((f) => text(f.say));
    expect(captions).toContain("D has no children, so there's nothing to finish first: write D.");
    expect(captions).toContain('Everything below B is finished: write B last.');
    expect(captions.some((c) => /Both of D/.test(c))).toBe(false);
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
