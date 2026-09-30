import { describe, expect, it } from 'vitest';
import { fromBits, fromBitsSigned } from '../../core/bits';
import {
  addBytes, crossings, crossings32, INT32_MAX, INT32_MIN, negateSteps, unixDate, unsigned32, unsigned8, wheelIndex, wrap32, wrap8,
} from './model';

describe('wrap8 is ((x << 24) >> 24)', () => {
  it('matches an Int8Array for a wide range', () => {
    const view = new Int8Array(1);
    for (let x = -70000; x <= 70000; x += 7) {
      view[0] = x;
      expect(wrap8(x)).toBe(view[0]);
    }
  });

  it('127 + 1 is -128, and unsigned 255 + 1 is 0', () => {
    expect(wrap8(127 + 1)).toBe(-128);
    expect(unsigned8(255 + 1)).toBe(0);
    expect(wrap8(-128 - 1)).toBe(127);
  });
});

describe('negate: invert then add one', () => {
  it('equals -x (wrapped) for every byte', () => {
    for (let x = -128; x <= 127; x++) {
      const n = negateSteps(x);
      expect(n.resultValue).toBe(wrap8(-x));
      expect(fromBits(n.inverted)).toBe(~x & 0xff);
      expect(fromBitsSigned(n.original)).toBe(x);
    }
  });

  it('negating -128 gives -128: it has no positive twin in 8 bits', () => {
    expect(negateSteps(-128).resultValue).toBe(-128);
    expect(negateSteps(0).resultValue).toBe(0);
    expect(negateSteps(5).resultValue).toBe(-5);
  });
});

describe('addBytes', () => {
  it('bit-by-bit sum equals real 8-bit arithmetic for every pair', () => {
    for (let x = -128; x <= 127; x++) {
      for (let y = -128; y <= 127; y++) {
        const s = addBytes(x, y);
        expect(fromBits(s.sum)).toBe(unsigned8(x + y));
        expect(s.resultSigned).toBe(wrap8(x + y));
        // overflow flag == (inputs share a sign and the result's sign differs) == true result out of range
        expect(s.signedOverflow).toBe(x + y > 127 || x + y < -128);
        expect(s.unsignedWraps).toBe(unsigned8(x) + unsigned8(y) > 255);
        expect(s.carryOut).toBe(s.unsignedWraps ? 1 : 0);
      }
    }
  });

  it('-1 + 1 wraps unsigned (255 + 1) but is correct signed', () => {
    const s = addBytes(-1, 1);
    expect(s.unsignedWraps).toBe(true);
    expect(s.signedOverflow).toBe(false);
    expect(s.resultSigned).toBe(0);
  });

  it('carries feed each column from the right', () => {
    const s = addBytes(0b0000_0011, 0b0000_0001);
    expect(s.carries).toEqual([0, 0, 0, 0, 0, 1, 1, 0]);
  });
});

describe('seams', () => {
  it('detects the signed seam at 127/-128 and the unsigned seam at 255/0', () => {
    expect(crossings(127, 1)).toEqual({ signed: true, unsigned: false });
    expect(crossings(255, 1)).toEqual({ signed: false, unsigned: true });
    expect(crossings(128, -1)).toEqual({ signed: true, unsigned: false });
    expect(crossings(0, -1)).toEqual({ signed: false, unsigned: true });
    expect(crossings(10, 16)).toEqual({ signed: false, unsigned: false });
  });

  it('32-bit: INT_MAX + 1 is INT_MIN (x | 0) and the unsigned view keeps counting', () => {
    expect(wrap32(INT32_MAX + 1)).toBe(INT32_MIN);
    expect(unsigned32(INT32_MAX + 1)).toBe(2 ** 31);
    expect(crossings32(INT32_MAX, 1)).toEqual({ signed: true, unsigned: false });
    expect(crossings32(-1, 1)).toEqual({ signed: false, unsigned: true });
  });

  it('wheel index wraps both ways', () => {
    expect(wheelIndex(-1)).toBe(255);
    expect(wheelIndex(256)).toBe(0);
    expect(wheelIndex(-257)).toBe(255);
  });
});

describe('year 2038', () => {
  it('the last second a signed 32-bit time_t holds, and where it wraps to', () => {
    expect(unixDate(INT32_MAX)).toBe('2038-01-19T03:14:07Z');
    expect(unixDate(INT32_MIN)).toBe('1901-12-13T20:45:52Z');
  });
});
