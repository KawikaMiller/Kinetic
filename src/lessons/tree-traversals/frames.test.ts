import { describe, expect, it } from 'vitest';
import { traversalFrames } from './frames';
import { reference, type Order } from './model';
import { PRESETS } from './presets';

const ORDERS: Order[] = ['pre', 'in', 'post', 'level'];

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
