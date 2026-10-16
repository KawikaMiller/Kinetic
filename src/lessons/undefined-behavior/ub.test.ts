import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { CATEGORIES, KEY, score, SNIPPETS, type Category } from './classification';
import { asWritten, assumingNoOverflow, boundaryValues, defenceOutcome, DEFENCES, differingInputs, isDefined, MEMORY, NULL_OUTCOMES, POINTERS, rangeOf, retarget, sanitizerMessage, WIDTHS, withCheck, withoutCheck, wrap, type IntType } from './ub';

const TYPES: IntType[] = WIDTHS.flatMap((width) => [true, false].map((signed) => ({ width, signed })));

/** The second, separately written key: each snippet with the ISO C 2011 clause its category comes from (quoted from memory, chipped on screen). */
const STANDARD_TABLE: [code: string, clause: string, category: Category][] = [
  ['INT_MAX + 1', '6.5p5: an exceptional condition (result not representable) is undefined', 'undefined'],
  ['UINT_MAX + 1u', '6.2.5p9: unsigned arithmetic reduces modulo, so it never overflows', 'defined'],
  ['char c = 200;  /* plain char is signed */', '6.3.1.3p3: out-of-range conversion to a signed type is implementation-defined', 'implementation-defined'],
  ['f(a(), b())', '6.5.2.2p10: the order of argument evaluation is unspecified', 'unspecified'],
  ['int v = *p;  /* p is null */', '6.5.3.2p4: dereferencing an invalid pointer such as null is undefined', 'undefined'],
  ['x >> 1  /* x is a negative int */', '6.5.7p5: right shift of a negative value is implementation-defined', 'implementation-defined'],
  ['1 << 32  /* 32-bit int */', '6.5.7p3: a shift count at least the width is undefined', 'undefined'],
  ['INT_MIN / -1', '6.5.5p6 with 6.5p5: an unrepresentable quotient is undefined', 'undefined'],
];

describe('the wrap arithmetic', () => {
  it('at widths 8 and 16 the written function equals the plain JavaScript shift reference for every input', () => {
    for (const width of [8, 16] as const) {
      const shift = 32 - width;
      const { min, max } = rangeOf({ width, signed: true });
      for (let x = min; x <= max; x++) {
        const wrapped = ((x + 1) << shift) >> shift;
        expect(asWritten(x, { width, signed: true }), `${width}-bit ${x}`).toBe(wrapped < x ? 1 : 0);
      }
    }
  });

  it('at 32 bits it equals ((x + 1) | 0) < x on the boundary values and 10,000 seeded inputs', () => {
    const t: IntType = { width: 32, signed: true };
    const rnd = mulberry32(8);
    const inputs = [...boundaryValues(t), ...Array.from({ length: 10_000 }, () => Math.floor(rnd() * 2 ** 32) - 2 ** 31)];
    for (const x of inputs) expect(asWritten(x, t)).toBe(((x + 1) | 0) < x ? 1 : 0);
  });

  it('unsigned wrap is defined: the maximum plus one is 0 and the check fires', () => {
    for (const width of WIDTHS) {
      const t: IntType = { width, signed: false };
      expect(wrap(rangeOf(t).max + 1, t)).toBe(0);
      expect(asWritten(rangeOf(t).max, t)).toBe(1);
    }
  });
});

describe('the exhaustive strip', () => {
  it('of the 2^w signed inputs exactly one (the maximum) differs between the columns, and it is the undefined one; none differ for unsigned', () => {
    for (const width of [8, 16] as const) {
      const signed = differingInputs({ width, signed: true });
      expect(signed).toEqual([2 ** (width - 1) - 1]);
      expect(isDefined(signed[0], { width, signed: true })).toBe(false);
      expect(differingInputs({ width, signed: false })).toEqual([]);
    }
  });

  it('every input where the original is defined returns 0 in both columns', () => {
    const t: IntType = { width: 8, signed: true };
    for (let x = rangeOf(t).min; x <= rangeOf(t).max; x++) {
      if (!isDefined(x, t)) continue;
      expect([asWritten(x, t), assumingNoOverflow(x, t)]).toEqual([0, 0]);
    }
  });
});

describe('retargeting the input', () => {
  it('hand-worked: 70000 does not fit 16 bits and wraps to 4464, said in words', () => {
    const r = retarget(70000, { width: 32, signed: true }, { width: 16, signed: true });
    expect(r.x).toBe(4464);
    expect(r.note).toContain('70,000');
    expect(r.note).toContain('4,464');
  });

  it('a value that fits is kept silently, and every result lies in the new range', () => {
    expect(retarget(5, { width: 32, signed: true }, { width: 8, signed: false })).toEqual({ x: 5, note: null });
    for (const from of TYPES) {
      for (const to of TYPES) {
        for (const x of boundaryValues(from)) {
          const r = retarget(x, from, to);
          expect(r.x).toBeGreaterThanOrEqual(rangeOf(to).min);
          expect(r.x).toBeLessThanOrEqual(rangeOf(to).max);
        }
      }
    }
  });
});

describe('the null check', () => {
  it('for every non-null pointer in the picker the two versions agree; null is excluded by the contract and never evaluated', () => {
    for (const p of POINTERS.filter((x) => x.address !== 0)) {
      expect(withCheck(p.address)).toBe(withoutCheck(p.address));
      expect(withCheck(p.address)).toBe(MEMORY.get(p.address));
    }
    expect(MEMORY.has(0)).toBe(false);
    expect(NULL_OUTCOMES).toHaveLength(3);
  });
});

describe('the classification key', () => {
  it('matches the separately written table taken from the standard wording', () => {
    expect(SNIPPETS.map((s) => [s.code, s.category])).toEqual(STANDARD_TABLE.map(([code, , category]) => [code, category]));
    expect(SNIPPETS.every((s) => CATEGORIES.some((c) => c.id === s.category))).toBe(true);
    expect(new Set(SNIPPETS.map((s) => s.category)).size).toBe(4);
  });

  it('a key with one item flipped fails that comparison, and a perfect answer scores 8 of 8', () => {
    const flipped = SNIPPETS.map((s, i) => (i === 1 ? { ...s, category: 'undefined' as Category } : s));
    expect(flipped.map((s) => s.category)).not.toEqual(STANDARD_TABLE.map(([, , c]) => c));
    expect(score(SNIPPETS, KEY, KEY)).toBe(8);
    expect(score(SNIPPETS, KEY, Object.fromEntries(SNIPPETS.map((s) => [s.id, null])))).toBe(0);
  });
});

describe('the defences', () => {
  const max = rangeOf({ width: 32, signed: true }).max;

  it('-fwrapv, a language that wraps and the checked add all notice the overflow; doing nothing returns 0', () => {
    const real = ((max + 1) | 0) < max ? 1 : 0;
    expect(defenceOutcome('wrapv', max).result).toBe(real);
    expect(defenceOutcome('language', max).result).toBe(real);
    expect(defenceOutcome('checked', max).result).toBe(1);
    expect(defenceOutcome('none', max).result).toBe(0);
    expect(defenceOutcome('sanitize', max).result).toBeNull();
  });

  it('the sanitizer message carries the numbers, and every defence but "nothing" restores defined behaviour', () => {
    expect(sanitizerMessage(max)).toBe("runtime error: signed integer overflow: 2147483647 + 1 cannot be represented in type 'int'");
    expect(DEFENCES.filter((d) => defenceOutcome(d.id, max).defined).map((d) => d.id)).toEqual(['wrapv', 'sanitize', 'checked', 'language']);
  });

  it('away from the maximum every defence agrees with plain execution', () => {
    for (const d of DEFENCES) expect(defenceOutcome(d.id, 5).result ?? 0).toBe(0);
  });
});
