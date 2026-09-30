import { describe, expect, it } from 'vitest';
import {
  MAX_N, REFERENCES, ceilLog2, decimalExponent, halvingSteps, parseCount, pow2, referenceAtOrBelow, squares,
} from './model';

describe('ceilLog2', () => {
  it('is exact at the powers-of-two boundaries', () => {
    const cases: [number, number][] = [[1, 0], [2, 1], [3, 2], [4, 2], [5, 3], [1023, 10], [1024, 10], [1025, 11]];
    for (const [n, bits] of cases) expect(ceilLog2(n)).toBe(bits);
  });
  it('matches the definition "smallest b with 2^b ≥ n" for every n up to 100,000', () => {
    for (let n = 1; n <= 100_000; n++) {
      const b = ceilLog2(n);
      expect(2 ** b).toBeGreaterThanOrEqual(n);
      if (b > 0) expect(2 ** (b - 1)).toBeLessThan(n);
    }
  });
  it('stays exact at 2^k and 2^k ± 1 all the way to 2^40, where Math.log2 alone can round wrong', () => {
    for (let k = 1; k <= 40; k++) {
      expect(ceilLog2(2 ** k)).toBe(k);
      expect(ceilLog2(2 ** k + 1)).toBe(k + 1);
      expect(ceilLog2(2 ** k - 1)).toBe(k === 1 ? 0 : k);
    }
  });
  it('a billion needs 30 bits and a million 20: log grows very slowly', () => {
    expect(ceilLog2(1_000_000_000)).toBe(30);
    expect(ceilLog2(1_000_000)).toBe(20);
  });
});

describe('halving', () => {
  it('reaches 1 in exactly ⌈log₂ n⌉ halvings, for every n up to 20,000 and at each power of two', () => {
    for (let n = 1; n <= 20_000; n++) expect(halvingSteps(n).length - 1).toBe(ceilLog2(n));
    for (let k = 0; k <= 40; k++) expect(halvingSteps(2 ** k).length - 1).toBe(k);
  });
  it('never drops below 1 and always halves (rounding up)', () => {
    const steps = halvingSteps(1_000_000);
    expect(steps[0]).toBe(1_000_000);
    expect(steps[steps.length - 1]).toBe(1);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBe(Math.ceil(steps[i - 1] / 2));
  });
});

describe('powers and references', () => {
  it('pow2 is exact and refuses what a double can\'t hold exactly', () => {
    expect(pow2(32)).toBe(4_294_967_296);
    expect(pow2(40)).toBe(1_099_511_627_776);
    expect(() => pow2(54)).toThrow();
    expect(() => pow2(1.5)).toThrow();
  });
  it('the real-world references are the exact powers: 2^8 = 256, 2^16 = 65,536, 2^32 = 4,294,967,296', () => {
    const value = (k: number) => pow2(REFERENCES.find((r) => r.k === k)!.k);
    expect(value(8)).toBe(256);
    expect(value(16)).toBe(65_536);
    expect(value(32)).toBe(4_294_967_296);
    expect(value(10)).toBe(1024);
  });
  it('2^10 ≈ 10^3: ten doublings add about three zeros', () => {
    expect(decimalExponent(10)).toBeCloseTo(3.0103, 4);
    expect(decimalExponent(30)).toBeCloseTo(9.031, 3);
  });
  it('referenceAtOrBelow picks the biggest landmark not above 2^k', () => {
    expect(referenceAtOrBelow(5)).toBeNull();
    expect(referenceAtOrBelow(17)?.k).toBe(16);
    expect(referenceAtOrBelow(40)?.k).toBe(40);
  });
  it('squares draws every unit up to 2^10, then 1,024 squares worth 2^(k−10) each, always totalling 2^k', () => {
    for (let k = 0; k <= 40; k++) {
      const s = squares(k);
      expect(s.count * s.eachWorth).toBe(pow2(k));
      expect(s.count).toBeLessThanOrEqual(1024);
    }
  });
});

describe('parseCount', () => {
  it('reads grouped digits and scientific notation, refuses the rest', () => {
    expect(parseCount('1,000,000')).toBe(1_000_000);
    expect(parseCount('1e9')).toBe(1_000_000_000);
    expect(parseCount('50')).toBe(50);
    for (const bad of ['', '0', '-3', '2.5', 'abc', String(MAX_N * 2)]) expect(parseCount(bad)).toBeNull();
  });
});
