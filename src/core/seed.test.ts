import { describe, expect, it } from 'vitest';
import { nextSeed, parseSeed, SEED_MAX } from './seed';

describe('seed field', () => {
  it('refuses non-seeds and accepts the whole range', () => {
    for (const bad of ['', '  ', 'abc', '-1', '1e3', '3.5', '+5', 'Infinity', String(SEED_MAX + 1), '<b>1</b>']) {
      expect(parseSeed(bad).ok, JSON.stringify(bad)).toBe(false);
    }
    expect(parseSeed('0')).toEqual({ ok: true, value: 0 });
    expect(parseSeed(String(SEED_MAX))).toEqual({ ok: true, value: SEED_MAX });
    expect(nextSeed(SEED_MAX)).toBe(0);
    expect(nextSeed(7)).toBe(8);
  });
});
