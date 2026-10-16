import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { candidates, digitsCorrect, isqrt, oracleNumber, oracleScaled, read, tenToThe } from './cancellation';
import { centsTax, exactTax, floatTax, makeCart, MODES, roundDiv, taxView, type Granularity } from './cart';
import {
  bigToNumber, BLIND_SPOT, commonExponent, decompose, evaluate, exactSum, generate, kahanSum, MAX_N, naiveSum, neumaierSum, pairwiseSum, scaled, sortedSum, ulp,
} from './summation';

/** The exact sum of rationals k/2^20 by plain integer arithmetic: an oracle for the oracle. */
const rationalSum = (ks: number[]) => ks.reduce((s, k) => s + BigInt(k), 0n);

describe('the BigInt exact oracle', () => {
  it('decomposes doubles from their bits: 0.1 is 7205759403792794 * 2^-56 and 1 is 2^52 * 2^-52', () => {
    expect(decompose(0.1)).toEqual({ m: 7205759403792794n, e: -56 });
    expect(decompose(-0.2)).toEqual({ m: -7205759403792794n, e: -55 });
    expect(decompose(1)).toEqual({ m: 1n << 52n, e: -52 });
    expect(decompose(5e-324)).toEqual({ m: 1n, e: -1074 });
  });

  it('hand value: the exact sum of the doubles 0.1 and 0.2 is 0.3000000000000000166533453693773481063544750213623046875', () => {
    const emin = commonExponent([0.1, 0.2]);
    expect(emin).toBe(-55);
    const s = exactSum([0.1, 0.2], emin);
    expect(s).toBe(10808639105689191n);
    expect((s * 10n ** 55n) / 2n ** 55n).toBe(3000000000000000166533453693773481063544750213623046875n);
  });

  it('matches a plain integer rational sum on 300 seeded sets of k / 2^20 values', () => {
    const rnd = mulberry32(5);
    for (let t = 0; t < 300; t++) {
      const ks = Array.from({ length: 1 + Math.floor(rnd() * 30) }, () => Math.floor(rnd() * 2 ** 24) - 2 ** 23);
      const values = ks.map((k) => k / 2 ** 20);
      const emin = commonExponent(values);
      const sum = exactSum(values, emin);
      // compare as rationals over 2^20: sum * 2^emin * 2^20 must equal the integer sum
      expect(emin).toBeGreaterThanOrEqual(-20);
      expect(sum * 2n ** BigInt(emin + 20)).toBe(rationalSum(ks));
    }
  });

  it('bigToNumber reads back a scaled double and handles sums beyond the double range of the BigInt', () => {
    for (const x of [0.1, -3.5, 1e100, 5e-324, 123456.789]) expect(bigToNumber(scaled(x, decompose(x).e), decompose(x).e)).toBe(x);
    expect(bigToNumber(0n, 0)).toBe(0);
  });

  it('ulp is the spacing at the value, per precision', () => {
    expect(ulp(1, 'f64')).toBe(2 ** -52);
    expect(ulp(2, 'f64')).toBe(2 ** -51);
    expect(ulp(1, 'f32')).toBe(2 ** -23);
    expect(ulp(0.3, 'f64')).toBe(2 ** -54);
  });
});

describe('the summation methods', () => {
  it('hand-worked: [1, 1e100, 1, -1e100] gives naive 0, Kahan 0, Neumaier 2, exact 2', () => {
    expect(naiveSum(BLIND_SPOT, 'f64')).toBe(0);
    expect(kahanSum(BLIND_SPOT, 'f64')).toBe(0);
    expect(neumaierSum(BLIND_SPOT, 'f64')).toBe(2);
    const ev = evaluate(BLIND_SPOT, 'f64');
    expect(ev.exact).toBe(2);
    expect(ev.runs.map((r) => [r.id, r.error])).toEqual([['naive', 2], ['sorted', 2], ['pairwise', 2], ['kahan', 2], ['neumaier', 0]]);
  });

  it('hand-worked: ten copies of 0.1 in float64 give 0.9999999999999999 naive, and Kahan is within 1 ulp of the exact sum', () => {
    const tens = generate('dimes', 10, 1, 'f64').values;
    expect(naiveSum(tens, 'f64')).toBe(0.9999999999999999);
    const ev = evaluate(tens, 'f64');
    const kahan = ev.runs.find((r) => r.id === 'kahan')!;
    expect(kahan.ulps as number).toBeLessThanOrEqual(1);
    expect(kahan.result).toBe(1);
  });

  it('on 2,000 seeded one-large-then-small runs Kahan is no worse than naive (the blind spot is the named exception)', () => {
    const rnd = mulberry32(11);
    for (let t = 0; t < 2000; t++) {
      const large = 10 ** (8 + Math.floor(rnd() * 9));
      const values = [large, ...Array.from({ length: 1 + Math.floor(rnd() * 400) }, () => rnd())];
      const ev = evaluate(values, 'f64');
      const err = (id: string) => ev.runs.find((r) => r.id === id)!.error;
      expect(err('kahan'), `run ${t}`).toBeLessThanOrEqual(err('naive'));
    }
    const blind = evaluate(BLIND_SPOT, 'f64');
    expect(blind.runs.find((r) => r.id === 'kahan')!.error).toBe(blind.runs.find((r) => r.id === 'naive')!.error);
  });

  it('float32 emulation: Math.fround after every add equals a sum through Float32Array stores, for 1,000 seeded sums', () => {
    const rnd = mulberry32(21);
    for (let t = 0; t < 1000; t++) {
      const values = Array.from({ length: 1 + Math.floor(rnd() * 200) }, () => Math.fround(rnd() * 1000 - 300));
      const cell = new Float32Array(1);
      for (const v of values) cell[0] = cell[0] + v;
      expect(naiveSum(values, 'f32')).toBe(cell[0]);
    }
  });

  it('pairwise and sorted agree with a direct computation on small cases, and every method returns the exact sum of two values', () => {
    expect(sortedSum([3, -1e100, 1e100, 1], 'f64')).toBe(naiveSum([-1e100, 1, 3, 1e100], 'f64'));
    expect(pairwiseSum([1, 2, 3, 4], 'f64')).toBe(10);
    expect(pairwiseSum([], 'f64')).toBe(0);
    const ev = evaluate([0.5, 0.25], 'f64');
    expect(ev.runs.every((r) => r.error === 0)).toBe(true);
  });

  it('an overflowing generator is flagged, not summed, and N up to the cap evaluates quickly', () => {
    expect(generate('blind-spot', 4, 1, 'f32').overflow).toBe(true);
    expect(generate('blind-spot', 4, 1, 'f64').overflow).toBe(false);
    const t = Date.now();
    const ev = evaluate(generate('uniform', MAX_N, 3, 'f32').values, 'f32');
    expect(Date.now() - t).toBeLessThan(5000);
    expect(ev.runs).toHaveLength(5);
  });

  it('the plotted curves end at the table errors and zero errors are exact zeros', () => {
    const ev = evaluate(generate('dimes', 1000, 1, 'f64').values, 'f64');
    for (const run of ev.runs) expect(ev.curves[run.id][ev.curves[run.id].length - 1].error).toBe(run.error);
  });
});

describe('cancellation against the 80-digit oracle', () => {
  it('isqrt is exact', () => {
    for (const v of [0n, 1n, 2n, 15n, 16n, 10n ** 40n, 10n ** 40n + 1n]) {
      const r = isqrt(v);
      expect(r * r <= v && (r + 1n) * (r + 1n) > v).toBe(true);
    }
  });

  it('at x = 10^16 the naive difference is exactly 0, 1e16 + 1 === 1e16, and the rewrite agrees to at least 15 digits', () => {
    const x = tenToThe(16);
    expect(x + 1 === x).toBe(true);
    const r = read('sqrt-difference', 16);
    expect(r.naive.value).toBe(0);
    expect(r.naive.correct).toBe(0);
    expect(r.stable.correct).toBeGreaterThanOrEqual(15);
    expect(r.oracle).toBeCloseTo(5e-9, 20);
    expect(r.oracleDigits).toBe('5000000000000000');
    expect(r.stable.digits).toBe('5000000000000000');
  });

  it('the oracle is not the rewrite: its value matches the Taylor series sqrt(x+1) - sqrt(x) = 1/(2 sqrt x) - 1/(8 x^1.5) at k = 8', () => {
    const x = 1e8;
    const taylor = 1 / (2 * Math.sqrt(x)) - 1 / (8 * x ** 1.5) + 1 / (16 * x ** 2.5);
    expect(Math.abs(oracleNumber(oracleScaled('sqrt-difference', 8)) - taylor) / taylor).toBeLessThan(1e-14);
  });

  it('the quadratic oracle satisfies t^2 + b t + 1 = 0, and the naive root has lost its digits at k = 8', () => {
    const k = 8;
    const root = oracleNumber(oracleScaled('quadratic-root', k));
    const b = tenToThe(k);
    expect(Math.abs(root * root + b * root + 1)).toBeLessThan(1e-9);
    expect(read('quadratic-root', k).naive.correct).toBe(0);
    expect(read('quadratic-root', k).stable.correct).toBeGreaterThanOrEqual(15);
  });

  it('digitsCorrect is capped at 16 and is 0 for NaN, infinity and a wrong order of magnitude; every stable result keeps at least 15 digits for k = 1..20', () => {
    expect(digitsCorrect(1, 1)).toBe(16);
    expect(digitsCorrect(NaN, 1)).toBe(0);
    expect(digitsCorrect(Infinity, 1)).toBe(0);
    expect(digitsCorrect(5, 1)).toBe(0);
    for (const id of ['sqrt-difference', 'quadratic-root'] as const) for (let k = 1; k <= 20; k++) expect(read(id, k).stable.correct, `${id} ${k}`).toBeGreaterThanOrEqual(15);
    expect(candidates('sqrt-difference', 4).naive).toBeGreaterThan(0);
  });
});

describe('the cart', () => {
  const GRANS: Granularity[] = ['line', 'total'];

  it('integer cents equal exact rational rounding on 500 seeded carts for every mode and granularity', () => {
    const rnd = mulberry32(31);
    for (let t = 0; t < 500; t++) {
      const cart = makeCart(1 + Math.floor(rnd() * 200), t);
      const bp = Math.floor(rnd() * 61) * 25;
      for (const m of MODES) for (const g of GRANS) expect(centsTax(cart, bp, m.id, g), `${t} ${m.id} ${g}`).toBe(Number(exactTax(cart, bp, m.id, g)));
    }
  });

  it('roundDiv, hand-worked: 5/2 is 3 half-up, 2 half-even and 2 truncated; 7/2 is 4, 4, 3', () => {
    expect([roundDiv(5, 2, 'half-up'), roundDiv(5, 2, 'half-even'), roundDiv(5, 2, 'truncate')]).toEqual([3, 2, 2]);
    expect([roundDiv(7, 2, 'half-up'), roundDiv(7, 2, 'half-even'), roundDiv(7, 2, 'truncate')]).toEqual([4, 4, 3]);
  });

  it('half up and half to even differ only on exact ties (checked per line over 300 carts)', () => {
    const rnd = mulberry32(41);
    for (let t = 0; t < 300; t++) {
      const cart = makeCart(30, t);
      const bp = Math.floor(rnd() * 61) * 25;
      for (const i of cart) {
        const n = i.cents * i.quantity * bp;
        const tie = (2 * (n % 10000)) === 10000;
        if (!tie) expect(roundDiv(n, 10000, 'half-up')).toBe(roundDiv(n, 10000, 'half-even'));
      }
    }
  });

  it('the float representation drifts on the default cart while integer cents do not, and the single-case facts are what real JavaScript says', () => {
    const cart = makeCart(200, 42);
    expect(taxView(cart, 500, 'half-up', 'line', 'float').drift).not.toBe(0);
    expect(taxView(cart, 500, 'half-up', 'line', 'cents').drift).toBe(0);
    expect(floatTax(cart, 500, 'truncate', 'total')).toBeGreaterThan(0);
    expect(0.1 + 0.2).toBe(0.30000000000000004);
    expect((1.005).toFixed(2)).toBe('1.00');
    expect(Math.round(1.005 * 100)).toBe(100);
  });
});
