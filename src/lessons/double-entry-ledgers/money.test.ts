import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import {
  PAYMENT_COUNTS, REPRESENTATIONS, TAX_LINES, TAX_RATES, addMoney, allocate, expectedTotal, formatMoney, parseMoney, splitBill, sumPayments, taxRounding, type Representation,
} from './money';

describe('summing payments of $0.10 really runs the loop', () => {
  it('10,000 payments as a JavaScript number do not make 1000, and as integer cents make 100,000 exactly', () => {
    let float = 0;
    let cents = 0;
    for (let i = 0; i < 10_000; i++) {
      float += 0.1;
      cents += 10;
    }
    expect(float).not.toBe(1000);
    expect(cents).toBe(100_000);
    const run = sumPayments('float', 10_000);
    expect(run.equal).toBe(false);
    expect(run.shown).toBe(float.toPrecision(17));
    expect(run.drift).toBe((float - 1000).toExponential(3));
    expect(sumPayments('cents', 10_000)).toMatchObject({ shown: '$1,000.00', equal: true, drift: '0' });
    expect(sumPayments('bigint', 10_000)).toMatchObject({ shown: '$1,000.00', equal: true, drift: '0' });
  });

  it('for every count and representation, the float result matches an independent loop and the integer ones are exact', () => {
    for (const n of PAYMENT_COUNTS) {
      let float = 0;
      for (let i = 0; i < n; i++) float += 0.1;
      const want = n / 10;
      const f = sumPayments('float', n);
      expect(f.equal, `float ${n}`).toBe(float === want);
      expect(f.shown, `float ${n}`).toBe(float.toPrecision(17));
      for (const rep of ['cents', 'bigint'] as Representation[]) {
        const r = sumPayments(rep, n);
        expect(r.equal, `${rep} ${n}`).toBe(true);
        expect(r.drift).toBe('0');
        expect(r.expected).toBe(expectedTotal(n));
      }
    }
    expect(REPRESENTATIONS).toHaveLength(3);
  });

  it('a float never lands on the exact total for these counts, which is the lesson', () => {
    for (const n of PAYMENT_COUNTS) expect(sumPayments('float', n).equal, `${n}`).toBe(false);
  });

  it('writes the exact total as dollars and cents', () => {
    expect(expectedTotal(10)).toBe('1.00');
    expect(expectedTotal(10_000)).toBe('1000.00');
    expect(expectedTotal(10_000_000)).toBe('1000000.00');
  });
});

describe('splitting a bill', () => {
  it('$100.00 three ways: rounding each share loses a cent, largest remainder gives 33.34, 33.33, 33.33', () => {
    const s = splitBill(10_000n, 3);
    expect(s.naive).toEqual([3333n, 3333n, 3333n]);
    expect(s.naiveSum).toBe(9_999n);
    expect(s.fair).toEqual([3334n, 3333n, 3333n]);
    expect(s.fairSum).toBe(10_000n);
  });

  it('naive rounding can also gain a cent', () => {
    expect(splitBill(10_001n, 2).naiveSum).toBe(10_002n);
    expect(splitBill(10_001n, 2).fairSum).toBe(10_001n);
  });

  it('largest remainder sums to the total and is within one cent of the ideal share, on 10,000 seeded (total, parts) pairs', () => {
    const rnd = mulberry32(12);
    for (let i = 0; i < 10_000; i++) {
      const parts = randInt(1, 9, rnd);
      const weights = Array.from({ length: parts }, () => BigInt(randInt(1, 10, rnd)));
      const total = BigInt(randInt(0, 1_000_000, rnd)) * 7n + BigInt(randInt(0, 6, rnd));
      const shares = allocate(total, weights);
      const sumW = weights.reduce((a, b) => a + b, 0n);
      expect(shares.reduce((a, b) => a + b, 0n), `#${i}`).toBe(total);
      shares.forEach((share, k) => {
        const off = share * sumW - total * weights[k];
        expect(off < 0n ? -off : off, `#${i} share ${k}`).toBeLessThan(sumW);
        expect(share).toBeGreaterThanOrEqual(0n);
      });
    }
  });

  it('gives the left-over cents to the largest remainders, ties to the earlier share', () => {
    expect(allocate(100n, [1n, 1n, 1n])).toEqual([34n, 33n, 33n]);
    expect(allocate(5n, [1n, 1n, 1n, 1n])).toEqual([2n, 1n, 1n, 1n]);
    expect(allocate(10n, [3n, 1n])).toEqual([8n, 2n]);
    expect(allocate(0n, [1n, 2n])).toEqual([0n, 0n]);
  });
});

describe('tax rounding is a business rule', () => {
  it('three lines of $0.35 at 10%: 4 cents each is 12, one 10.5 cents on the total is 11', () => {
    const t = taxRounding(TAX_LINES, 1000);
    expect(t.perLine.taxes).toEqual([4n, 4n, 4n]);
    expect(t.perLine.tax).toBe(12n);
    expect(t.perTotal.tax).toBe(11n);
    expect(t.perLine.total).toBe(117n);
    expect(t.perTotal.total).toBe(116n);
    expect(t.difference).toBe(1n);
  });

  it('differs by a cent at 5%, 8% and 10%, and agrees at 20%, worked by hand', () => {
    // 35 x 5% = 1.75 -> 2 each = 6 against 105 x 5% = 5.25 -> 5; 35 x 8% = 2.8 -> 3 each = 9 against 8.4 -> 8; 35 x 20% = 7 each = 21 against 21.
    expect(TAX_RATES.map((r) => taxRounding(TAX_LINES, r.bp).difference)).toEqual([1n, 1n, 1n, 0n]);
  });
});

describe('the amount parser', () => {
  const ok = (text: string) => {
    const r = parseMoney(text);
    return r.ok ? r.value : null;
  };

  it('accepts 12.34 and its plain relatives as BigInt cents', () => {
    expect(ok('12.34')).toBe(1234n);
    expect(ok('12')).toBe(1200n);
    expect(ok('0.5')).toBe(50n);
    expect(ok('0.05')).toBe(5n);
    expect(ok('007.50')).toBe(750n);
    expect(ok(' 5.00 ')).toBe(500n);
    expect(typeof ok('1')).toBe('bigint');
  });

  it('accepts exactly one trillion dollars and refuses a cent more', () => {
    expect(ok('1000000000000')).toBe(100_000_000_000_000n);
    expect(ok('1000000000000.00')).toBe(100_000_000_000_000n);
    expect(ok('1000000000000.01')).toBeNull();
  });

  it('refuses three decimals, an exponent, a sign, a comma, full-width and other-script digits, each with a reason', () => {
    for (const bad of ['12.345', '1e3', '-5', '+5', '12,34', '１２.３４', '١٢', '', '.5', '12.', '12 34', 'abc', '12.3.4', '0x10', '1_000']) {
      const r = parseMoney(bad);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      if (!r.ok) expect(r.error.length, JSON.stringify(bad)).toBeGreaterThan(10);
    }
    expect(parseMoney('12.345')).toEqual({ ok: false, error: 'At most two decimals: money is counted in whole cents.' });
  });

  it('formats cents with grouping and a real minus sign', () => {
    expect(formatMoney(123_456n)).toBe('$1,234.56');
    expect(formatMoney(5n)).toBe('$0.05');
    expect(formatMoney(0n)).toBe('$0.00');
    expect(formatMoney(-500n)).toBe('−$5.00');
    expect(formatMoney(100_000_000_000_000n)).toBe('$1,000,000,000,000.00');
  });
});

describe('two currencies', () => {
  it('refuses to add USD to EUR and says no rate was applied', () => {
    const r = addMoney({ cents: 500n, currency: 'USD' }, { cents: 500n, currency: 'EUR' });
    expect(r).toEqual({ ok: false, error: 'No conversion rate was applied, so USD and EUR cannot be added.' });
  });

  it('adds the same currency', () => {
    expect(addMoney({ cents: 500n, currency: 'EUR' }, { cents: 250n, currency: 'EUR' })).toEqual({ ok: true, value: { cents: 750n, currency: 'EUR' } });
  });
});
