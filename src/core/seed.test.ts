import { describe, expect, it } from 'vitest';
import { nextSeed, parseSeed, resyncSeedText, SEED_MAX } from './seed';

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

  it('resyncs the text to a seed set by the program, and leaves the typed text alone otherwise', () => {
    expect(resyncSeedText('42', 42)).toBe('42');
    expect(resyncSeedText('042', 42)).toBe('042');
    expect(resyncSeedText('42', 7)).toBe('7');
    expect(resyncSeedText('', 7)).toBe('7');
    expect(resyncSeedText('abc', 0)).toBe('0');
  });

  it('typing 4 then 42 never rewrites the text: each keystroke is a seed change that agrees with it', () => {
    let text = '';
    for (const typed of ['4', '42']) {
      text = typed;
      const parsed = parseSeed(typed);
      if (parsed.ok) text = resyncSeedText(text, parsed.value);
      expect(text).toBe(typed);
    }
  });
});
