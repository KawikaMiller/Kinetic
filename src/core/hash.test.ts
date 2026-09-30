import { describe, expect, it } from 'vitest';
import { fnv1a, hash32, hexHash } from './hash';

describe('fnv1a', () => {
  // Published FNV-1a 32-bit test vectors (ASCII input).
  it.each([
    ['', 0x811c9dc5],
    ['a', 0xe40c292c],
    ['foobar', 0xbf9cf968],
  ])('fnv1a(%j) matches the reference value', (input, expected) => {
    expect(fnv1a(input)).toBe(expected);
  });

  it('always returns an unsigned 32-bit integer', () => {
    for (const s of ['x', 'hello world', '🙂', 'a'.repeat(1000)]) {
      const h = fnv1a(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });
});

describe('hash32', () => {
  it('is deterministic and unsigned', () => {
    expect(hash32('key-1')).toBe(hash32('key-1'));
    expect(hash32('key-1')).toBeGreaterThanOrEqual(0);
  });

  it('spreads sequential keys evenly across buckets (where raw FNV low bits do not)', () => {
    const buckets = new Array(8).fill(0);
    for (let i = 0; i < 8000; i++) buckets[hash32(`user:${i}`) % 8]++;
    // each bucket should hold roughly 1000; allow ±15%
    for (const n of buckets) expect(Math.abs(n - 1000)).toBeLessThan(150);
  });
});

describe('hexHash', () => {
  it('is a zero-padded prefix of the FNV-1a hex digest', () => {
    expect(hexHash('a')).toBe('e40c292');
    expect(hexHash('', 8)).toBe('811c9dc5');
  });
});
