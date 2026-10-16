import { describe, expect, it } from 'vitest';
import { KEY_MAX, KEY_MIN, TREE_NODE_LIMIT, parseKey, parseKeyList, refuseOp } from './keyInput';

describe('parseKey', () => {
  it('reads a whole number in range, with a typographic minus', () => {
    expect(parseKey(' 42 ')).toEqual({ ok: true, value: 42 });
    expect(parseKey('−7')).toEqual({ ok: true, value: -7 });
    expect(parseKey(String(KEY_MAX))).toEqual({ ok: true, value: KEY_MAX });
  });

  it('refuses with a sentence: empty, not a number, out of range', () => {
    expect(parseKey('')).toEqual({ ok: false, error: 'Type a whole number.' });
    expect(parseKey('4.5')).toMatchObject({ ok: false, error: '"4.5" is not a whole number. Use plain digits, like 42.' });
    expect(parseKey(String(KEY_MAX + 1))).toEqual({ ok: false, error: `Keys go from ${KEY_MIN} to ${KEY_MAX}.` });
    expect(parseKey(String(KEY_MIN - 1))).toMatchObject({ ok: false });
  });
});

describe('parseKeyList', () => {
  it('splits on spaces and commas', () => {
    expect(parseKeyList('30 10, 20')).toEqual({ ok: true, value: [30, 10, 20] });
  });

  it('names the token it refuses and applies nothing', () => {
    expect(parseKeyList('')).toMatchObject({ ok: false });
    expect(parseKeyList('1 two 3')).toMatchObject({ ok: false, error: expect.stringContaining('"two"') });
    expect(parseKeyList('5 6 5')).toMatchObject({ ok: false, error: expect.stringContaining('5 is typed twice') });
  });

  it('holds at most the limit', () => {
    const keys = (n: number) => Array.from({ length: n }, (_, i) => i).join(' ');
    expect(parseKeyList(keys(TREE_NODE_LIMIT))).toMatchObject({ ok: true });
    expect(parseKeyList(keys(TREE_NODE_LIMIT + 1))).toEqual({ ok: false, error: `That is ${TREE_NODE_LIMIT + 1} keys; the drawing holds ${TREE_NODE_LIMIT}.` });
    expect(parseKeyList('1 2 3', 2)).toMatchObject({ ok: false });
  });
});

describe('refuseOp', () => {
  it('lets a fresh insert and a present delete through', () => {
    expect(refuseOp('insert', 5, 3, false)).toBeNull();
    expect(refuseOp('delete', 5, 3, true)).toBeNull();
  });

  it('refuses a duplicate, a full tree, an empty delete and a missing key, each in a sentence', () => {
    expect(refuseOp('insert', 5, 3, true)).toBe('5 is already in the tree.');
    expect(refuseOp('insert', 5, TREE_NODE_LIMIT, false)).toBe(`The tree already has ${TREE_NODE_LIMIT} nodes, the most the drawing holds.`);
    expect(refuseOp('delete', 5, 0, false)).toBe('The tree is empty: there is nothing to delete.');
    expect(refuseOp('delete', 5, 3, false)).toBe('5 is not in the tree.');
  });

  it('takes the limit from the caller', () => {
    expect(refuseOp('insert', 5, 7, false, 7)).toContain('7 nodes');
  });
});
