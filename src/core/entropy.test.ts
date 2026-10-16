import { describe, expect, it } from 'vitest';
import { binaryEntropy, entropy, entropyTerm, orderZeroBits, orderZeroBitsPerChar, surprise, textEntropy } from './entropy';

describe('entropy of a distribution', () => {
  it('hand vectors: a fair coin is 1 bit, uniform over 8 is 3, (1/2, 1/4, 1/4) is 1.5', () => {
    expect(entropy([0.5, 0.5])).toBe(1);
    expect(entropy(Array(8).fill(1 / 8))).toBeCloseTo(3, 12);
    expect(entropy([0.5, 0.25, 0.25])).toBe(1.5);
  });

  it('0 log 0 is 0, and a certain outcome carries no entropy', () => {
    expect(entropyTerm(0)).toBe(0);
    expect(entropy([1, 0, 0])).toBe(0);
  });

  it('binaryEntropy(0.1) is 0.4690 bits and is symmetric about 1/2', () => {
    expect(binaryEntropy(0.1)).toBeCloseTo(0.469, 3);
    expect(binaryEntropy(0.9)).toBeCloseTo(binaryEntropy(0.1), 12);
    expect(binaryEntropy(0.5)).toBe(1);
  });

  it('surprise is -log2 p, infinite for an impossible outcome', () => {
    expect(surprise(0.25)).toBe(2);
    expect(surprise(1)).toBe(0);
    expect(surprise(0)).toBe(Infinity);
  });
});

describe('order-0 entropy of a text', () => {
  it('mississippi: counts i 4, s 4, p 2, m 1 of 11 characters give the closed-form entropy', () => {
    const expected = -(2 * (4 / 11) * Math.log2(4 / 11) + (2 / 11) * Math.log2(2 / 11) + (1 / 11) * Math.log2(1 / 11));
    const t = textEntropy('mississippi')!;
    expect(t.n).toBe(11);
    expect(t.bitsPerChar).toBeCloseTo(expected, 12);
    expect(t.totalBits).toBeCloseTo(11 * expected, 10);
    expect(t.symbols.map((s) => `${s.sym}${s.count}`)).toEqual(['i4', 's4', 'p2', 'm1']);
  });

  it('one repeated character has zero entropy; two alternating ones have exactly 1 bit', () => {
    expect(textEntropy('aaaaaaaa')!.bitsPerChar).toBe(0);
    expect(textEntropy('abababab')!.bitsPerChar).toBe(1);
    expect(orderZeroBits('ab'.repeat(50))).toBeCloseTo(100, 9);
    expect(orderZeroBitsPerChar('ab'.repeat(50))).toBeCloseTo(1, 12);
  });

  it('an empty text has no entropy table and zero bits', () => {
    expect(textEntropy('')).toBeNull();
    expect(orderZeroBits('')).toBe(0);
    expect(orderZeroBitsPerChar('')).toBe(0);
  });

  it('counts code points, and flags a character outside ASCII', () => {
    const t = textEntropy('a😀')!;
    expect(t.n).toBe(2);
    expect(t.nonAscii).toBe(true);
    expect(textEntropy('ab')!.nonAscii).toBe(false);
  });
});
