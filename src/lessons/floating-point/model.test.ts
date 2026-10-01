import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  bitRole, decode, exactDecimal, f32Bits, f32FromBits, fields, float64Facts, neighbours, SIGN_BIT, SPECIALS, storedDigits, storeOutcome, typedOutcome, ulp, ulpAt,
} from './model';

const same = (a: number, b: number) => (Number.isNaN(a) ? Number.isNaN(b) : Object.is(a, b));

describe('bits come from a real float32', () => {
  it('0.1 is stored as 0x3DCCCCCD', () => {
    expect(f32Bits(0.1)).toBe(0x3dcccccd);
    expect(f32Bits(1)).toBe(0x3f800000);
    expect(f32Bits(-2)).toBe(0xc0000000);
  });

  it('the on-screen formula matches the hardware decoding for random and special patterns', () => {
    const rnd = mulberry32(1234);
    const patterns = [...SPECIALS.map((s) => s.bits), 0x00800000, 0x007fffff, SIGN_BIT | 1];
    for (let i = 0; i < 50000; i++) patterns.push(Math.floor(rnd() * 2 ** 32));
    for (const u of patterns) expect(same(decode(fields(u)), f32FromBits(u))).toBe(true);
  });

  it('classifies every special value', () => {
    const kind = (id: string) => fields(SPECIALS.find((s) => s.id === id)!.bits).kind;
    expect(kind('pzero')).toBe('zero');
    expect(kind('nzero')).toBe('zero');
    expect(kind('pinf')).toBe('infinity');
    expect(kind('ninf')).toBe('infinity');
    expect(kind('nan')).toBe('nan');
    expect(kind('subnormal')).toBe('subnormal');
    expect(kind('max')).toBe('normal');
    expect(Object.is(f32FromBits(SIGN_BIT), -0)).toBe(true);
    expect(f32FromBits(0x7f7fffff)).toBe(3.4028234663852886e38);
    expect(f32FromBits(1)).toBe(2 ** -149);
    expect(Number.isNaN(f32FromBits(0x7fc00000))).toBe(true);
  });

  it('names every bit by the field it belongs to', () => {
    const roles = Array.from({ length: 32 }, (_, i) => bitRole(i));
    expect(roles[0]).toBe('sign bit');
    expect(roles.slice(1, 9)).toEqual(Array.from({ length: 8 }, (_, k) => `exponent bit ${k + 1} of 8`));
    expect(roles[9]).toBe('mantissa bit 1 of 23');
    expect(roles[31]).toBe('mantissa bit 23 of 23');
    // the field a name claims is the field that bit really changes
    for (let i = 0; i < 32; i++) {
      const f = fields((1 << (31 - i)) >>> 0);
      const field = f.sign ? 'sign' : f.exponent ? 'exponent' : 'mantissa';
      expect(roles[i].startsWith(field)).toBe(true);
    }
  });
});

describe('exact stored values', () => {
  it('0.1 is really 0.100000001490116119384765625', () => {
    const stored = f32FromBits(f32Bits(0.1));
    expect(exactDecimal(stored)).toBe('0.100000001490116119384765625');
    expect(storedDigits(stored)).toBe('0.10000000149011611938');
  });

  it('prints integers, halves, negatives and subnormals exactly', () => {
    expect(exactDecimal(3)).toBe('3');
    expect(exactDecimal(0.5)).toBe('0.5');
    expect(exactDecimal(-0.75)).toBe('-0.75');
    expect(exactDecimal(2 ** 70)).toBe((2n ** 70n).toString());
    expect(exactDecimal(-0)).toBe('-0');
    expect(storedDigits(-0)).toBe('-0');
    expect(storedDigits(0)).toBe('0');
    const tiny = exactDecimal(2 ** -149);
    expect(tiny.startsWith('0.00000000000000000000000000000000000000000000140129846432481707')).toBe(true);
    expect(Number(tiny)).toBe(2 ** -149);
  });

  it('exact decimals round-trip to the same number', () => {
    const rnd = mulberry32(99);
    for (let i = 0; i < 5000; i++) {
      const x = f32FromBits(Math.floor(rnd() * 0x7f800000));
      expect(Number(exactDecimal(x))).toBe(x);
    }
  });
});

describe('neighbours are nextafter through the bit pattern', () => {
  it('around 1.0', () => {
    const { below, above } = neighbours(f32Bits(1), 1);
    expect(above[0]).toBe(1 + 2 ** -23);
    expect(below[0]).toBe(1 - 2 ** -24);
  });

  it('above 0 is the smallest subnormal; nothing below 0; nothing above the max', () => {
    expect(neighbours(0, 1)).toEqual({ below: [], above: [2 ** -149] });
    expect(neighbours(0x7f7fffff, 1).above).toEqual([]);
  });

  it('gaps widen with magnitude: one ulp at 1, 1e6 and 2^24', () => {
    expect(ulp(f32Bits(1))).toBe(2 ** -23);
    expect(ulpAt(1e6)).toBe(0.0625);
    expect(ulpAt(2 ** 24)).toBe(2);
    expect(ulpAt(1e9)).toBeGreaterThan(ulpAt(1e6));
    // 2^24 + 1 isn't representable: it rounds back to 2^24
    expect(f32FromBits(f32Bits(2 ** 24 + 1))).toBe(2 ** 24);
  });
});

describe('float64 panel is computed', () => {
  it('reports the famous results', () => {
    const facts = Object.fromEntries(float64Facts().map((f) => [f.code.split('   ')[0], f.result]));
    expect(facts['0.1 + 0.2']).toBe('0.30000000000000004');
    expect(facts['0.1 + 0.2 === 0.3']).toBe('false');
    expect(facts['Math.abs((0.1 + 0.2) - 0.3) < Number.EPSILON']).toBe('true');
    expect(facts['(10 + 20) / 100 === 0.3']).toBe('true');
    expect(facts['NaN === NaN']).toBe('false');
    expect(facts['1 / -0']).toBe('-Infinity');
    // The EPSILON check that works near 1 fails for bigger numbers: that's the caveat row.
    expect(facts['Math.abs((1000.1 + 1000.2) - 2000.3) < Number.EPSILON']).toBe('false');
  });

  it('classifies what storing a number did to it', () => {
    expect(storeOutcome(0.5)).toBe('exact');
    expect(storeOutcome(0.1)).toBe('rounded');
    expect(storeOutcome(1e39)).toBe('overflow');
    expect(storeOutcome(-1e39)).toBe('overflow');
    expect(storeOutcome(1e-50)).toBe('underflow');
    expect(storeOutcome(Infinity)).toBe('exact');
    expect(storeOutcome(-0)).toBe('exact');
  });

  it('classifies typed text, catching what Number() already lost', () => {
    // Number() makes these ±Infinity or 0 before float32 is involved: still overflow/underflow.
    expect(typedOutcome('1e400')).toBe('overflow');
    expect(typedOutcome('-1e400')).toBe('overflow');
    expect(typedOutcome('1e-400')).toBe('underflow');
    expect(typedOutcome('-1e-400')).toBe('underflow');
    // Typed specials are stored as they are, and zero is its own case.
    expect(typedOutcome('Infinity')).toBe('infinity');
    expect(typedOutcome('-Infinity')).toBe('infinity');
    expect(typedOutcome('0')).toBe('zero');
    expect(typedOutcome('-0')).toBe('zero');
    expect(typedOutcome('0.000e5')).toBe('zero');
    expect(typedOutcome('0x0')).toBe('zero');
    // Ordinary numbers defer to storeOutcome.
    expect(typedOutcome(' 0.5 ')).toBe('exact');
    expect(typedOutcome('0.1')).toBe('rounded');
    expect(typedOutcome('1e39')).toBe('overflow');
    expect(typedOutcome('1e-50')).toBe('underflow');
  });
});
