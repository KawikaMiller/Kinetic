import { describe, expect, it } from 'vitest';
import {
  commitEdgePath, DEFAULT_SPACING, defaultLaneColor, depthColumns, fitMessages, layoutCommitGraph, MAX_FITTED_MESSAGE_CHARS,
  MAX_MESSAGE_CHARS, MESSAGE_CHAR_W, shortMessage,
} from './commitGraph';

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

describe('columns and lane gutter', () => {
  const { col, padX } = DEFAULT_SPACING;

  it('lets commits share a column, and sizes the width to the last column', () => {
    const shared = [
      { id: 'a', lane: 0, parents: [], column: 0 },
      { id: 'b', lane: 1, parents: ['a'], column: 1 },
      { id: 'c', lane: 2, parents: ['a'], column: 1 },
    ];
    const g = layoutCommitGraph(shared);
    expect(g.at('b')!.x).toBe(g.at('c')!.x);
    expect(g.width).toBe(padX * 2 + col);
  });

  it('shifts everything right by the gutter', () => {
    const plain = layoutCommitGraph(commits);
    const withGutter = layoutCommitGraph(commits, DEFAULT_SPACING, 40);
    expect(withGutter.at('d')!.x).toBe(plain.at('d')!.x + 40);
    expect(withGutter.width).toBe(plain.width + 40);
  });

  it('puts parallel work in one column by history depth', () => {
    const day = [
      { id: 'root', lane: 0, parents: [] },
      { id: 'x1', lane: 1, parents: ['root'] },
      { id: 'y1', lane: 2, parents: ['root'] },
      { id: 'x2', lane: 1, parents: ['x1'] },
      { id: 'merge', lane: 0, parents: ['root', 'x2', 'y1'] },
    ];
    expect(Object.fromEntries(depthColumns(day))).toEqual({ root: 0, x1: 1, y1: 1, x2: 2, merge: 3 });
  });
});

describe('fitMessages', () => {
  it('keeps messages that fit and cuts the ones that would run into a neighbour', () => {
    const row = [
      { id: 'a', lane: 0, parents: [], message: 'initial commit' },
      { id: 'b', lane: 0, parents: ['a'], message: 'fix' },
    ];
    const tight = { ...DEFAULT_SPACING, col: 5 * MESSAGE_CHAR_W };
    const out = fitMessages(row, layoutCommitGraph(row, tight).at);
    expect(out.get('b')).toBe('fix');
    expect(out.get('a')).toBe('init…');
    expect(out.get('a')!.length * MESSAGE_CHAR_W).toBeLessThanOrEqual(tight.col);
  });

  it('gives a message all the room it has, not the 12-character shortMessage cap', () => {
    const row = [
      { id: 'a', lane: 0, parents: [], message: 'add payments (reads env)' },
      { id: 'b', lane: 0, parents: ['a'], message: 'x' },
    ];
    const roomy = { ...DEFAULT_SPACING, col: 30 * MESSAGE_CHAR_W };
    const out = fitMessages(row, layoutCommitGraph(row, roomy).at);
    expect(out.get('a')).toBe('add payments (reads env)');
    expect(shortMessage('add payments (reads env)')).toHaveLength(MAX_MESSAGE_CHARS);
  });

  it('a lone commit keeps its message up to MAX_FITTED_MESSAGE_CHARS', () => {
    const one = [{ id: 'a', lane: 0, parents: [], message: 'a long commit message' }];
    expect(fitMessages(one, layoutCommitGraph(one).at).get('a')).toBe('a long commit message');
    const long = [{ id: 'a', lane: 0, parents: [], message: 'x'.repeat(40) }];
    const cut = fitMessages(long, layoutCommitGraph(long).at).get('a')!;
    expect(cut).toHaveLength(MAX_FITTED_MESSAGE_CHARS);
    expect(cut.endsWith('…')).toBe(true);
  });
});
