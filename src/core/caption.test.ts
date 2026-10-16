import { describe, expect, it } from 'vitest';
import { sameIntroKey, sameIntroValue } from './caption';

describe('intro keys are compared by value', () => {
  it('a string or number key is its own one-element list', () => {
    expect(sameIntroKey('a', 'a')).toBe(true);
    expect(sameIntroKey('a', 'b')).toBe(false);
    expect(sameIntroKey(3, [3])).toBe(true);
    expect(sameIntroKey(3, [4])).toBe(false);
    expect(sameIntroKey(NaN, NaN)).toBe(true);
  });

  it('a fresh array with the same contents is the same key (the render-loop case), a changed one is not', () => {
    expect(sameIntroKey([1, 'x'], [1, 'x'])).toBe(true);
    expect(sameIntroKey([1, 'x'], [1, 'y'])).toBe(false);
    expect(sameIntroKey([1], [1, 2])).toBe(false);
    expect(sameIntroKey([], [])).toBe(true);
  });

  it('a fresh object or nested array inside the key is compared by contents', () => {
    expect(sameIntroKey([{ engine: 'wasm', sizes: [1, 2] }], [{ engine: 'wasm', sizes: [1, 2] }])).toBe(true);
    expect(sameIntroKey([{ engine: 'wasm', sizes: [1, 2] }], [{ engine: 'wasm', sizes: [1, 3] }])).toBe(false);
    expect(sameIntroKey([{ a: 1 }], [{ a: 1, b: undefined }])).toBe(false);
  });

  it('functions and class instances compare by identity, and a cycle terminates', () => {
    const f = () => 1;
    expect(sameIntroValue(f, f)).toBe(true);
    expect(sameIntroValue(() => 1, () => 1)).toBe(false);
    expect(sameIntroValue(new Map(), new Map())).toBe(false);
    const a: Record<string, unknown> = {};
    a.self = a;
    const b: Record<string, unknown> = {};
    b.self = b;
    expect(sameIntroValue(a, b)).toBe(false);
  });
});
