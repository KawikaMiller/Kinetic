import { describe, expect, it } from 'vitest';
import { beginSession, submitOp, type OpSessionModel } from './opSession';

/** A "tree" that is just a sorted list of keys, with one frame per key it touched. */
const LIST: OpSessionModel<number[], string> = {
  run: ({ base, op, key }) => ({
    tree: op === 'insert' ? [...base, key].sort((a, b) => a - b) : base.filter((k) => k !== key),
    frames: [`${op} ${key}`],
  }),
  sizeOf: (tree) => tree.length,
  hasKey: (tree, key) => tree.includes(key),
};

describe('tree operation session', () => {
  it('begins with the frames of the first operation and no note', () => {
    expect(beginSession(LIST, { base: [], op: 'insert', key: 4 })).toEqual({ tree: [4], frames: ['insert 4'], note: null });
  });

  it('a typed key starts the operation on the tree the last one ended with', () => {
    const first = beginSession(LIST, { base: [], op: 'insert', key: 4 });
    const next = submitOp(LIST, first, 'insert', ' 2 ');
    expect(next.started).toBe(true);
    expect(next.session).toEqual({ tree: [2, 4], frames: ['insert 2'], note: null });
  });

  it('a refused request changes nothing but the note', () => {
    const first = beginSession(LIST, { base: [], op: 'insert', key: 4 });
    for (const [op, text, note] of [
      ['insert', '4', '4 is already in the tree.'],
      ['delete', '9', '9 is not in the tree.'],
      ['insert', 'x', '"x" is not a whole number. Use plain digits, like 42.'],
    ] as const) {
      const refused = submitOp(LIST, first, op, text);
      expect(refused.started).toBe(false);
      expect(refused.session).toEqual({ ...first, note });
    }
  });

  it('refuses an insert into a full tree', () => {
    const full = beginSession(LIST, { base: Array.from({ length: 30 }, (_, i) => i), op: 'insert', key: 30 });
    expect(full.tree).toHaveLength(31);
    expect(submitOp(LIST, full, 'insert', '99').started).toBe(false);
  });
});
