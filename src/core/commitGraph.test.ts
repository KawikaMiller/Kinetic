import { describe, expect, it } from 'vitest';
import { commitEdgePath, DEFAULT_SPACING, defaultLaneColor, layoutCommitGraph, shortMessage } from './commitGraph';

const commits = [
  { id: 'a', lane: 0, parents: [] },
  { id: 'b', lane: 0, parents: ['a'] },
  { id: 'c', lane: 1, parents: ['b'] },
  { id: 'd', lane: 0, parents: ['b', 'c'] },
];

describe('layoutCommitGraph', () => {
  const { col, row, padX, padY, bottomRoom } = DEFAULT_SPACING;
  const g = layoutCommitGraph(commits);

  it('puts commits in the given order, one column each, on their lane', () => {
    expect(g.at('a')).toEqual({ x: padX, y: padY });
    expect(g.at('c')).toEqual({ x: padX + 2 * col, y: padY + row });
    expect(g.at('d')).toEqual({ x: padX + 3 * col, y: padY });
    expect(g.at('nope')).toBeUndefined();
  });

  it('is exactly as wide as its commits and as tall as its lanes', () => {
    expect(g.width).toBe(padX * 2 + 3 * col);
    expect(g.height).toBe(padY + row + bottomRoom);
    expect(layoutCommitGraph([commits[0]]).width).toBe(padX * 2);
    expect(layoutCommitGraph([]).height).toBe(padY + bottomRoom);
  });
});

describe('commitEdgePath', () => {
  it('draws a straight line along one lane and an S-curve across lanes', () => {
    expect(commitEdgePath({ x: 0, y: 10 }, { x: 66, y: 10 }, 66)).toBe('M0,10 L66,10');
    expect(commitEdgePath({ x: 0, y: 10 }, { x: 66, y: 106 }, 66)).toBe('M0,10 C39.6,10 26.4,106 66,106');
  });
});

describe('labels', () => {
  it('cuts long commit messages with an ellipsis at 12 characters', () => {
    expect(shortMessage('add cart')).toBe('add cart');
    expect(shortMessage('twelve chars')).toBe('twelve chars');
    expect(shortMessage('edit README.md #3')).toBe('edit README…');
  });

  it('cycles lane colours', () => {
    expect(defaultLaneColor(0)).toBe('var(--info)');
    expect(defaultLaneColor(5)).toBe(defaultLaneColor(0));
  });
});
