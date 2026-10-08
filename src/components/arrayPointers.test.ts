import { describe, expect, it } from 'vitest';
import { mergeSharedPointers, resolveCellTone } from './arrayPointers';

describe('mergeSharedPointers', () => {
  it('leaves pointers on different cells alone', () => {
    const ps = [{ i: 0, label: 'i', tone: 'info' as const, id: 'i' }, { i: 3, label: 'k', id: 'k' }];
    expect(mergeSharedPointers(ps)).toEqual(ps);
  });

  it('joins labels on a shared cell, keeping the first pointer’s tone and id', () => {
    const merged = mergeSharedPointers([
      { i: 2, label: 'i', tone: 'info', id: 'i' },
      { i: 4, label: 'j', tone: 'violet', id: 'j' },
      { i: 2, label: 'k', tone: 'muted', id: 'k' },
    ]);
    expect(merged).toEqual([
      { i: 2, label: 'i·k', tone: 'info', id: 'i' },
      { i: 4, label: 'j', tone: 'violet', id: 'j' },
    ]);
  });

  it('matches quickselect’s old local merge for three pointers on one cell', () => {
    const merged = mergeSharedPointers([{ i: 1, label: 'i', id: 'i' }, { i: 1, label: 'j', id: 'j' }, { i: 1, label: 'k', id: 'k' }]);
    expect(merged).toEqual([{ i: 1, label: 'i·j·k', id: 'i' }]);
  });

  it('takes a custom separator, and keeps non-string labels as a node list', () => {
    expect(mergeSharedPointers([{ i: 0, label: 'head' }, { i: 0, label: 'tail' }], ' = ')[0].label).toBe('head = tail');
    const node = { type: 'b' };
    expect(mergeSharedPointers([{ i: 0, label: 'a' }, { i: 0, label: node as never }])[0].label).toEqual(['a', '·', node]);
  });

  it('does not mutate its input', () => {
    const ps = [{ i: 0, label: 'a' }, { i: 0, label: 'b' }];
    mergeSharedPointers(ps);
    expect(ps).toEqual([{ i: 0, label: 'a' }, { i: 0, label: 'b' }]);
  });
});

describe('resolveCellTone', () => {
  it('reads a bare tone as a tint and fills in the default fill', () => {
    expect(resolveCellTone('hi')).toEqual({ tone: 'hi', fill: 'tint' });
    expect(resolveCellTone({ tone: 'ok' })).toEqual({ tone: 'ok', fill: 'tint' });
    expect(resolveCellTone({ tone: 'ok', fill: 'outline' })).toEqual({ tone: 'ok', fill: 'outline' });
  });

  it('is null for no tone', () => {
    expect(resolveCellTone(null)).toBeNull();
    expect(resolveCellTone(undefined)).toBeNull();
  });
});
