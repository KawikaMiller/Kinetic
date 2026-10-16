import { describe, expect, it } from 'vitest';
import { modInverse, modPow } from '../../core/numberTheory';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { FACTS } from './facts';
import { currentOf, heldAt, powFrames } from './frames';
import lesson from './index';
import { bitLength } from '../../core/bits';
import { bitsOf, fermatCensus, fermatVerdict, naiveMultiplications, operationCount, popcount, powRun, type Direction } from './modpow';
import { HEADLINE, LIMIT, N_PRESETS, OPENING, parseBase, parseExponent, parseModulus, parseN, parseP, PRESETS, TIMING_PRESETS } from './presets';
import { isProbablePrime } from '../../core/numberTheory';

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('modular-exponentiation');
    expect(els).toHaveLength(5);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('modular-exponentiation')).toEqual([]);
  });

  it('each scene opens on a fixed, pure state', () => {
    expect(OPENING.square).toEqual(HEADLINE);
    expect(OPENING.reduce).toEqual(HEADLINE);
    expect(OPENING.direction).toMatchObject({ ...HEADLINE, direction: 'ltr' });
    expect(OPENING.fermat).toEqual({ a: 7n, p: 101n, n: 561 });
    expect(OPENING.timing.exponent).toBe(1_000_000n);
    for (const p of PRESETS) {
      expect(parseBase(String(p.triple.base)).ok).toBe(true);
      expect(parseExponent(String(p.triple.exponent)).ok).toBe(true);
      expect(parseModulus(String(p.triple.modulus)).ok).toBe(true);
    }
    expect(TIMING_PRESETS.map(bitLength)).toEqual([16, 16, 16, 20]);
    expect(N_PRESETS.every((n) => parseN(String(n)).ok)).toBe(true);
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: 7^1000000 mod 1000003 takes 19 squarings and 6 multiplications, 25 against 999,999, and the answer matches the full power reduced', () => {
    const { base, exponent, modulus } = OPENING.square;
    const run = powRun(base, exponent, modulus, 'ltr');
    expect([bitLength(exponent), popcount(exponent), run.squarings, run.multiplications, operationCount(run)]).toEqual([20, 7, 19, 6, 25]);
    expect(naiveMultiplications(exponent)).toBe(999_999n);
    expect(run.result).toBe((7n ** 1_000_000n) % modulus);
    expect(FACTS.result).toBe(String(run.result));
    expect(FACTS.naive).toBe('999,999');
    expect(lesson.tryThis[0]).toContain('20 bits and 7 of them are 1');
    expect(lesson.tryThis[0]).toContain('19 squarings and 6 multiplications');
  });

  it('try-this 2: the full power has 845,099 digits and the reduced value never passes the 7 digits of the modulus', () => {
    expect(FACTS.fullDigits).toBe('845,099');
    expect(FACTS.reducedDigits).toBeLessThanOrEqual(FACTS.modulusDigits);
    expect(FACTS.modulusDigits).toBe(7);
    expect(lesson.tryThis[1]).toContain('845,099 digits');
  });

  it('try-this 3: right to left gives the same result and count while holding two numbers', () => {
    const { base, exponent, modulus } = OPENING.direction;
    const ltr = powRun(base, exponent, modulus, 'ltr');
    const rtl = powRun(base, exponent, modulus, 'rtl');
    expect(rtl.result).toBe(ltr.result);
    expect(operationCount(rtl)).toBe(operationCount(ltr));
    expect([ltr.held, rtl.held]).toEqual([1, 2]);
    expect(FACTS.rtlSame).toBe(true);
    expect(lesson.tryThis[2]).toContain('2 numbers instead of 1');
  });

  it('try-this 4: 7^99 mod 101 = 29 by both routes, and 561 passes 318 of 318 coprime bases', () => {
    const { a, p, n } = OPENING.fermat;
    expect(modPow(a, p - 2n, p)).toBe(29n);
    expect(modInverse(a, p)).toBe(29n);
    expect((7n * 29n) % 101n).toBe(1n);
    expect([FACTS.fermatInverse, FACTS.euclidInverse]).toEqual(['29', '29']);
    const c = fermatCensus(n);
    expect([c.passing, c.coprime]).toEqual([318, 318]);
    expect(fermatVerdict(n, c, isProbablePrime(BigInt(n)).prime)).toBe('carmichael');
    expect(lesson.tryThis[3]).toContain('318 of 318');
  });

  it('try-this 5: 32768 and 65535 have 16 bits and need 15 and 30 multiplications', () => {
    expect([FACTS.shortOps, FACTS.longOps]).toEqual([15, 30]);
    expect(bitLength(32768n)).toBe(bitLength(65535n));
    expect(lesson.tryThis[4]).toContain('15 multiplications and the second 30');
  });
});

describe('the Fermat verdicts', () => {
  it('561 and 1105 are fooled for every coprime base, 1009 passes as a prime, 221 and even numbers are exposed', () => {
    const verdict = (n: number) => fermatVerdict(n, fermatCensus(n), isProbablePrime(BigInt(n)).prime);
    expect(verdict(561)).toBe('carmichael');
    expect(verdict(1105)).toBe('carmichael');
    expect(verdict(1009)).toBe('prime');
    expect(verdict(221)).toBe('exposed');
    expect(verdict(1000)).toBe('exposed');
    expect(verdict(6)).toBe('exposed');
  });

  it('a census over every n from 5 to 600 finds the odd composites that pass for all coprime bases to be exactly the Carmichael numbers 561', () => {
    const fooled: number[] = [];
    for (let n = 5; n <= 600; n++) {
      const c = fermatCensus(n);
      if (fermatVerdict(n, c, isProbablePrime(BigInt(n)).prime) === 'carmichael') fooled.push(n);
    }
    expect(fooled).toEqual([561]);
  });
});

describe('every caption is computed from the run and reads cleanly', () => {
  it('walks both directions over small and large cases: no NaN, one frame per step plus the opening and the close, and the closing counts equal the run', () => {
    const cases: [bigint, bigint, bigint][] = [[7n, 1_000_000n, 1_000_003n], [4n, 13n, 497n], [3n, 0n, 7n], [3n, 5n, 1n], [2n, 1n, 9n], [-2n, 77n, 31n], [5n, 10n ** 30n, 10n ** 30n - 1n], [0n, 9n, 5n]];
    let frames = 0;
    for (const [b, e, n] of cases) {
      for (const d of ['ltr', 'rtl'] as Direction[]) {
        const run = powRun(b, e, n, d);
        const list = powFrames(run, bitsOf(e), e, n);
        expect(list).toHaveLength(run.steps.length + 2);
        for (const f of list) {
          expect(expectCaption(f.say), `${b}^${e} mod ${n} ${d}`).not.toMatch(/NaN|undefined|null|Infinity/);
          const held = heldAt(run, f.ops, e, n);
          expect(held.result >= 0n && held.result < n || n === 1n).toBe(true);
          frames++;
        }
        expect(heldAt(run, run.steps.length, e, n).result).toBe(run.result);
        expect(currentOf(run, 0)).toBeNull();
        expect(expectCaption(list[list.length - 1].say)).toContain(`${operationCount(run)} in all`);
      }
    }
    expect(frames).toBeGreaterThan(200);
  });
});

describe('hostile input', () => {
  it('the modulus refuses 0, negatives, decimals, exponents, hex and more than 30 digits, and keeps 1 with a note elsewhere', () => {
    for (const bad of ['0', '-5', '2.5', '1e400', 'ff', '0xff', '', '1000000000000000000000000000001', 'x']) expect(parseModulus(bad).ok, bad).toBe(false);
    expect(parseModulus('0')).toMatchObject({ ok: false, error: expect.stringContaining('0 would mean dividing by zero') });
    expect(parseModulus('1')).toEqual({ ok: true, value: 1n });
    expect(parseModulus(String(LIMIT))).toEqual({ ok: true, value: LIMIT });
  });

  it('the exponent refuses negatives, decimals, 1e400, hex without 0x and more than 10^30; 0 and 10^30 are allowed', () => {
    for (const bad of ['-1', '1.5', '1e400', 'ff', '', '1000000000000000000000000000001']) expect(parseExponent(bad).ok, bad).toBe(false);
    expect(parseExponent('0')).toEqual({ ok: true, value: 0n });
    expect(parseExponent(String(LIMIT))).toEqual({ ok: true, value: LIMIT });
  });

  it('the base takes any whole number up to 30 digits, negatives included, and refuses the rest; p needs 3 or more; n stays between 5 and 5,000', () => {
    expect(parseBase('-12')).toEqual({ ok: true, value: -12n });
    expect(parseBase('1e400').ok).toBe(false);
    expect(parseBase('ff').ok).toBe(false);
    expect(parseP('2').ok).toBe(false);
    expect(parseP('3').ok).toBe(true);
    expect(parseN('4').ok).toBe(false);
    expect(parseN('5001').ok).toBe(false);
    expect(parseN('5000').ok).toBe(true);
  });
});
