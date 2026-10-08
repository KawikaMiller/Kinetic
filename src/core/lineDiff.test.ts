import { describe, expect, it } from 'vitest';
import { lineDiff } from './lineDiff';

const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);

describe('lineDiff', () => {
  it('is empty for identical listings', () => {
    expect(lineDiff(['a', 'b'], ['a', 'b'])).toEqual({ added: new Set(), removed: new Set() });
  });

  it('marks an inserted line as added and a deleted one as removed', () => {
    const d = lineDiff(['a', 'b', 'c'], ['a', 'x', 'b']);
    expect(sorted(d.added)).toEqual([1]);
    expect(sorted(d.removed)).toEqual([2]);
  });

  it('treats a moved line as removed from its old place and added at its new one', () => {
    const d = lineDiff(['a', 'b', 'c'], ['b', 'c', 'a']);
    expect(sorted(d.added)).toEqual([2]);
    expect(sorted(d.removed)).toEqual([0]);
  });

  it('handles an empty side', () => {
    expect(sorted(lineDiff([], ['a', 'b']).added)).toEqual([0, 1]);
    expect(sorted(lineDiff(['a', 'b'], []).removed)).toEqual([0, 1]);
  });
});
