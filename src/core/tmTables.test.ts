import { describe, expect, it } from 'vitest';
import { mustParseTm, runTm, tapeText } from './tm';
import { ANBNCN, INCREMENT_REFERENCE, PALINDROME_REFERENCE, PRIME, WW } from './tmTables';
import { stringsUpTo } from './testing/strings';

const BUDGET = 20_000;
const accepts = (tm: Parameters<typeof runTm>[0], input: string, maxSteps = BUDGET) => {
  const run = runTm(tm, input, { maxSteps });
  return run.status === 'halted' && run.config.state === 'accept';
};

describe('mustParseTm', () => {
  it('parses a table and throws the parser message on a mistake', () => {
    expect(mustParseTm('q0 _ -> _ S halt').rules).toHaveLength(1);
    expect(() => mustParseTm('q0 _ -> _ X halt')).toThrow();
  });
});

describe('the reference tables', () => {
  it('increment adds one to every binary string up to length 8 (BigInt oracle)', () => {
    const tm = mustParseTm(INCREMENT_REFERENCE);
    for (const s of stringsUpTo(['0', '1'], 8)) {
      const run = runTm(tm, s, { maxSteps: BUDGET });
      expect(run.status, s).toBe('halted');
      const expected = (BigInt(`0b${s || '0'}`) + 1n).toString(2);
      expect(tapeText(run.config).replace(/^0+(?=.)/, ''), s).toBe(expected);
    }
  });

  it('palindrome accepts exactly the palindromes over a and b up to length 8', () => {
    const tm = mustParseTm(PALINDROME_REFERENCE);
    for (const s of stringsUpTo(['a', 'b'], 8)) expect(accepts(tm, s), s).toBe(s === [...s].reverse().join(''));
  });
});

describe('the context-sensitive machines', () => {
  const isAnBnCn = (s: string) => {
    const n = s.length / 3;
    return Number.isInteger(n) && s === 'a'.repeat(n) + 'b'.repeat(n) + 'c'.repeat(n);
  };
  it('a^n b^n c^n accepts exactly its language on every string over abc up to length 9', () => {
    for (const s of stringsUpTo(['a', 'b', 'c'], 9)) expect(accepts(ANBNCN, s), s).toBe(isAnBnCn(s));
  });

  it('ww accepts exactly the squares over ab up to length 10', () => {
    for (const s of stringsUpTo(['a', 'b'], 10)) {
      const half = s.length / 2;
      expect(accepts(WW, s), s).toBe(Number.isInteger(half) && s.slice(0, half) === s.slice(half));
    }
  });

  it('a^n is accepted exactly when n is prime, for n up to 30', () => {
    const isPrime = (n: number) => n >= 2 && Array.from({ length: n - 2 }, (_, i) => i + 2).every((d) => n % d !== 0);
    for (let n = 0; n <= 30; n++) expect(accepts(PRIME, 'a'.repeat(n), 2_000_000), `n = ${n}`).toBe(isPrime(n));
  });
});
