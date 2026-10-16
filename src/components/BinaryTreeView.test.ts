import { describe, expect, it } from 'vitest';
import { binaryTreeBox } from './BinaryTreeView';

const AVL_BOX = { top: 30, maxGap: 48 };

describe('binaryTreeBox', () => {
  it('a lone node keeps the minimum width and the widest level gap (hand-worked)', () => {
    expect(binaryTreeBox(1, 1, AVL_BOX)).toEqual({ width: 330, height: 70, gap: 48 });
  });

  it('a perfect 31-node tree is as wide as the cap allows, with the gap at its maximum', () => {
    // 31 columns of 30px plus 2 x 30 padding is 990, capped at 960; depth 4, so 300 / 4 = 75, capped at 48.
    expect(binaryTreeBox(31, 5, AVL_BOX)).toEqual({ width: 960, height: 30 + 4 * 48 + 40, gap: 48 });
  });

  it('a 31-node chain squeezes its levels to the minimum gap', () => {
    // depth 30: 300 / 30 = 10, raised to the 14px floor.
    expect(binaryTreeBox(31, 31, AVL_BOX)).toEqual({ width: 960, height: 30 + 30 * 14 + 40, gap: 14 });
  });

  it('takes the top room and the gap cap from the lesson', () => {
    expect(binaryTreeBox(1, 1, { top: 32, maxGap: 50 })).toEqual({ width: 330, height: 72, gap: 50 });
  });
});
