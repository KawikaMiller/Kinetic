import { describe, expect, it } from 'vitest';
import { parseBoundedBigInt, parseBoundedDecimal, parseBoundedInt, parseInteger, parseIntegers } from './parse';

/** Strings Number() turns into an integer that a learner never typed as one. */
const NOT_PLAIN_DECIMAL = ['0x10', '0b11', '0o7', '1e1', '1E2', '+5', '5.', '.5', '3.5', 'Infinity', 'ten', '1_000', '٣'];

describe('parseIntegers', () => {
  it('accepts commas and/or whitespace as separators', () => {
    expect(parseIntegers('1, 3 ,4  8')).toEqual([1, 3, 4, 8]);
    expect(parseIntegers('4,2,12')).toEqual([4, 2, 12]);
    expect(parseIntegers('-3 0 7')).toEqual([-3, 0, 7]);
    expect(parseIntegers(' 007, -0 ')).toEqual([7, -0]);
  });

  it('rejects empty input and anything that is not an integer', () => {
    expect(parseIntegers('')).toBeNull();
    expect(parseIntegers('  ')).toBeNull();
    expect(parseIntegers('1, x')).toBeNull();
    expect(parseIntegers('1.5, 2')).toBeNull();
  });

  it('accepts only plain decimal integers, not what Number() also understands', () => {
    for (const bad of NOT_PLAIN_DECIMAL) expect(parseIntegers(`1, ${bad}`), bad).toBeNull();
  });
});

describe('parseInteger', () => {
  it('reads one plain decimal integer, ignoring surrounding space', () => {
    expect(parseInteger('42')).toBe(42);
    expect(parseInteger(' -7 ')).toBe(-7);
    expect(parseInteger('0')).toBe(0);
  });

  it('is null for empty input, lists and anything Number() would stretch to an integer', () => {
    for (const bad of ['', '   ', '1 2', '1,2', ...NOT_PLAIN_DECIMAL]) expect(parseInteger(bad), bad).toBeNull();
  });
});

describe('parseBoundedInt', () => {
  const byte = { min: 0, max: 255 };

  it('reads plain decimal within the bounds, ignoring surrounding space', () => {
    expect(parseBoundedInt(' 202 ', byte)).toEqual({ ok: true, value: 202 });
    expect(parseBoundedInt('0', byte)).toEqual({ ok: true, value: 0 });
    expect(parseBoundedInt('-7', { min: -10, max: 10 })).toEqual({ ok: true, value: -7 });
  });

  it('refuses what Number() would stretch to an integer, with the generic messages', () => {
    for (const bad of [...NOT_PLAIN_DECIMAL, '1e400', '<b>1</b>', '🙂', '1 2', '1,2']) {
      expect(parseBoundedInt(bad, byte), bad).toEqual({ ok: false, error: `"${bad}" isn't a whole number.` });
    }
    expect(parseBoundedInt('   ', byte)).toEqual({ ok: false, error: 'Type a whole number.' });
    expect(parseBoundedInt('256', byte)).toEqual({ ok: false, error: 'Keep it between 0 and 255.' });
  });

  it('refuses long digit runs exactly instead of rounding them into range', () => {
    // 2⁵³ + 1 rounds to 2⁵³ as a Number; the bound check sees the real value.
    expect(parseBoundedInt('9007199254740993', { min: 0, max: 2 ** 53 }).ok).toBe(false);
    expect(parseBoundedInt('9'.repeat(400), byte).ok).toBe(false);
  });

  it('passes the value and cleaned text to the range messages', () => {
    const o = { ...byte, underscores: true, messages: { tooBig: (v: number, t: string) => `${v} from ${t}`, tooSmall: (v: number) => `low ${v}` } };
    expect(parseBoundedInt('1_000', o)).toEqual({ ok: false, error: '1000 from 1000' });
    expect(parseBoundedInt('-1', o)).toEqual({ ok: false, error: 'low -1' });
  });

  it('accepts 0x and 0b spellings only when asked, and only plain decimal takes a minus', () => {
    const o = { min: -128, max: 255, prefixes: ['hex', 'binary'] as const };
    expect(parseBoundedInt('0xCA', o)).toEqual({ ok: true, value: 202 });
    expect(parseBoundedInt('0Xca', o)).toEqual({ ok: true, value: 202 });
    expect(parseBoundedInt('0b11001010', o)).toEqual({ ok: true, value: 202 });
    for (const bad of ['0x', '0b2', '-0x5', '0o7']) expect(parseBoundedInt(bad, o).ok, bad).toBe(false);
    expect(parseBoundedInt('0xCA', byte).ok).toBe(false);
  });

  it('ignores underscores and spaces when asked', () => {
    expect(parseBoundedInt('0b1100_1010', { ...byte, prefixes: ['binary'], underscores: true })).toEqual({ ok: true, value: 202 });
    expect(parseBoundedInt('2 0 2', { ...byte, spaces: true })).toEqual({ ok: true, value: 202 });
    expect(parseBoundedInt('_', { ...byte, underscores: true })).toEqual({ ok: false, error: 'Type a whole number.' });
  });

  it('takes thousands commas only between groups of three, with an optional grouping message', () => {
    const o = { min: 0, max: 1e12, thousands: true };
    expect(parseBoundedInt('1,000,000', o)).toEqual({ ok: true, value: 1e6 });
    expect(parseBoundedInt('10,71', o)).toEqual({ ok: false, error: '"10,71" isn\'t a whole number.' });
    expect(parseBoundedInt('10,71', { ...o, messages: { grouping: 'groups of three' } })).toEqual({ ok: false, error: 'groups of three' });
  });

  it('reads a typographic minus when asked, and can refuse any minus up front', () => {
    expect(parseBoundedInt('−7', { min: -10, max: 10, typographicMinus: true })).toEqual({ ok: true, value: -7 });
    expect(parseBoundedInt('−7', { min: -10, max: 10 }).ok).toBe(false);
    const positive = { min: 2, max: 100, messages: { negative: 'no negatives' } };
    for (const t of ['-5', '−5', '-abc']) expect(parseBoundedInt(t, positive)).toEqual({ ok: false, error: 'no negatives' });
  });
});

describe('parseBoundedBigInt', () => {
  it('reads values past 2⁵³ exactly', () => {
    expect(parseBoundedBigInt('12345678901234567890123', { min: 0n, max: 10n ** 40n })).toEqual({ ok: true, value: 12345678901234567890123n });
    expect(parseBoundedBigInt('1'.repeat(41), { min: 0n, max: 10n ** 40n - 1n }).ok).toBe(false);
  });

  it('reads a hex-only field: bare digits are hex, so "1e400" is 0x1E400', () => {
    const hex = { min: 0n, max: 2n ** 64n - 1n, prefixes: ['hex'] as const, plainRadix: 16 as const, underscores: true, spaces: true };
    expect(parseBoundedBigInt('1e400', hex)).toEqual({ ok: true, value: 0x1e400n });
    expect(parseBoundedBigInt('0xFFFF FFFF FFFF FFFF', hex)).toEqual({ ok: true, value: 2n ** 64n - 1n });
    expect(parseBoundedBigInt(' dead_BEEF ', hex)).toEqual({ ok: true, value: 0xdeadbeefn });
    for (const bad of ['-1', '0x', 'xyz', '1.5']) expect(parseBoundedBigInt(bad, hex).ok, bad).toBe(false);
  });

  it('gives the range messages a bigint', () => {
    const o = { min: 2n, max: 99n, messages: { tooSmall: (v: bigint) => `${v} is too small` } };
    expect(parseBoundedBigInt('1', o)).toEqual({ ok: false, error: '1 is too small' });
  });
});

describe('parseBoundedDecimal', () => {
  const field = { min: -10, max: 10 };
  const value = (t: string, o: Parameters<typeof parseBoundedDecimal>[1] = field) => {
    const r = parseBoundedDecimal(t, o);
    return r.ok ? r.value : null;
  };
  it('reads plain decimals within bounds, inclusive', () => {
    expect(value('2.5')).toBe(2.5);
    expect(value(' -3 ')).toBe(-3);
    expect(value('10')).toBe(10);
    expect(value('-10.000')).toBe(-10);
    expect(value('0')).toBe(0);
  });
  it('refuses exponents, Infinity, NaN, signs, half-written numbers, units and markup', () => {
    for (const t of ['1e3', '1E3', 'Infinity', '-Infinity', 'NaN', '+5', '.5', '2.', '1,5', '1 000', '2kg', '<b>1</b>', '0x10', '🙂', '--1', '1.2.3']) {
      expect(value(t), t).toBeNull();
    }
  });
  it('reads a typographic minus only when asked', () => {
    expect(value('−2.5')).toBeNull();
    expect(value('−2.5', { ...field, typographicMinus: true })).toBe(-2.5);
  });
  it('refuses out-of-range values rather than clamping, with generic or custom messages', () => {
    expect(parseBoundedDecimal('10.5', field)).toEqual({ ok: false, error: 'Keep it between -10 and 10.' });
    expect(parseBoundedDecimal('', field)).toEqual({ ok: false, error: 'Type a number.' });
    expect(parseBoundedDecimal('1e3', field)).toEqual({ ok: false, error: "\"1e3\" isn't a plain number like 2.5 or -3." });
    const custom = parseBoundedDecimal('-0.5', { min: 0, max: 1, messages: { tooSmall: (v, t) => `${t} is below 0 (read ${v})` } });
    expect(custom).toEqual({ ok: false, error: '-0.5 is below 0 (read -0.5)' });
    expect(parseBoundedDecimal('-1', { ...field, messages: { negative: 'positive only' } })).toEqual({ ok: false, error: 'positive only' });
  });
});
