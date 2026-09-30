import { toBits, type Bit } from '../../core/bits';

// Everything here goes through a real float32 in a DataView: the bits on screen are
// exactly what the hardware stores, never a hand-rolled encoding.

const view = new DataView(new ArrayBuffer(8));

export const SIGN_BIT = 0x80000000;
export const EXP_BIAS = 127;
export const MANTISSA_BITS = 23;
const EXP_ALL_ONES = 0xff;
const MANTISSA_MASK = 0x7fffff;
const INFINITY_BITS = 0x7f800000;

/** The 32 bits (as an unsigned integer) of `x` rounded to float32. */
export function f32Bits(x: number): number {
  view.setFloat32(0, x);
  return view.getUint32(0);
}

/** The float32 value a 32-bit pattern encodes. */
export function f32FromBits(bits: number): number {
  view.setUint32(0, bits >>> 0);
  return view.getFloat32(0);
}

export const bitsOf = (u32: number): Bit[] => toBits(u32, 32);

export type Kind = 'zero' | 'subnormal' | 'normal' | 'infinity' | 'nan';

export interface Fields {
  sign: 0 | 1;
  /** Stored (biased) exponent, 0..255. */
  exponent: number;
  /** Stored fraction bits, 0..2^23-1. */
  mantissa: number;
  kind: Kind;
}

export function fields(u32: number): Fields {
  const sign = (u32 >>> 31) as 0 | 1;
  const exponent = (u32 >>> MANTISSA_BITS) & EXP_ALL_ONES;
  const mantissa = u32 & MANTISSA_MASK;
  const kind: Kind =
    exponent === EXP_ALL_ONES ? (mantissa ? 'nan' : 'infinity') : exponent === 0 ? (mantissa ? 'subnormal' : 'zero') : 'normal';
  return { sign, exponent, mantissa, kind };
}

/** The significand as a number: 1.m for normal values, 0.m for subnormals. */
export const significand = (f: Fields) => (f.kind === 'normal' ? 1 : 0) + f.mantissa / 2 ** MANTISSA_BITS;

/** The true (unbiased) power of two: e − 127, or −126 for subnormals. */
export const power = (f: Fields) => (f.kind === 'normal' ? f.exponent - EXP_BIAS : 1 - EXP_BIAS);

/**
 * The value from the textbook formula (−1)^s × significand × 2^power. Deliberately
 * independent of the DataView decoding, so tests can check the formula shown on screen.
 */
export function decode(f: Fields): number {
  const signed = f.sign ? -1 : 1;
  if (f.kind === 'nan') return NaN;
  if (f.kind === 'infinity') return signed * Infinity;
  return signed * significand(f) * 2 ** power(f);
}

/** Bits with the sign cleared: the magnitude's pattern. Consecutive magnitudes have consecutive patterns. */
const magnitudeBits = (u32: number) => (u32 & ~SIGN_BIT) >>> 0;

/**
 * Representable magnitudes around |x|: `count` below and above, found by stepping the
 * bit pattern by ±1 (that is exactly nextafter for floats of one sign).
 */
export function neighbours(u32: number, count: number): { below: number[]; above: number[] } {
  const mag = magnitudeBits(u32);
  const below: number[] = [];
  const above: number[] = [];
  for (let k = 1; k <= count; k++) {
    if (mag - k >= 0) below.unshift(f32FromBits(mag - k));
    if (mag + k < INFINITY_BITS) above.push(f32FromBits(mag + k));
  }
  return { below, above };
}

/** Gap from |x| to the next representable float32 above it (one ulp). */
export function ulp(u32: number): number {
  const mag = magnitudeBits(u32);
  if (mag >= INFINITY_BITS - 1) return Infinity;
  return f32FromBits(mag + 1) - f32FromBits(mag);
}

/** The ulp at a magnitude, for the "gaps widen" axis. */
export const ulpAt = (magnitude: number) => ulp(f32Bits(magnitude));

/**
 * The exact decimal value of a JavaScript number (every float32 is one), with no
 * rounding at all: 0.1f → 0.100000001490116119384765625.
 */
export function exactDecimal(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  if (x === 0) return Object.is(x, -0) ? '-0' : '0';
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const negative = hi >>> 31 === 1;
  const exp = (hi >>> 20) & 0x7ff;
  const frac = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  const mant = exp === 0 ? frac : frac | (1n << 52n);
  const e = (exp === 0 ? 1 : exp) - 1075; // value = mant × 2^e
  let digits: string;
  if (e >= 0) {
    digits = (mant << BigInt(e)).toString();
  } else {
    const scaled = (mant * 5n ** BigInt(-e)).toString().padStart(-e + 1, '0'); // mant × 5^-e / 10^-e
    const point = scaled.length + e;
    digits = `${scaled.slice(0, point)}.${scaled.slice(point)}`.replace(/\.?0+$/, '');
  }
  return negative ? `-${digits}` : digits;
}

/** The stored value to 20 significant digits (toPrecision rounds the exact value correctly, but drops the sign of −0). */
export const storedDigits = (x: number) => (Object.is(x, -0) ? '-0' : Number.isFinite(x) ? x.toPrecision(20) : String(x));

export interface Special {
  id: string;
  label: string;
  bits: number;
}

export const SPECIALS: readonly Special[] = [
  { id: 'one', label: '1.0', bits: 0x3f800000 },
  { id: 'tenth', label: '0.1', bits: f32Bits(0.1) },
  { id: 'pzero', label: '+0', bits: 0x00000000 },
  { id: 'nzero', label: '−0', bits: SIGN_BIT },
  { id: 'pinf', label: '+∞', bits: INFINITY_BITS },
  { id: 'ninf', label: '−∞', bits: (INFINITY_BITS | SIGN_BIT) >>> 0 },
  { id: 'nan', label: 'NaN', bits: 0x7fc00000 },
  { id: 'subnormal', label: 'smallest subnormal', bits: 0x00000001 },
  { id: 'max', label: 'largest float32', bits: 0x7f7fffff },
  { id: 'int24', label: '2²⁴ = 16,777,216', bits: f32Bits(2 ** 24) },
];

/** Real float64 arithmetic for the "0.1 + 0.2" panel: computed, never typed in as strings. */
export function float64Facts() {
  const a = 0.1;
  const b = 0.2;
  const sum = a + b;
  const cents = 10 + 20;
  return [
    { code: '0.1 + 0.2', result: String(sum) },
    { code: '0.1 + 0.2 === 0.3', result: String(sum === 0.3) },
    { code: 'Math.abs((0.1 + 0.2) - 0.3) < Number.EPSILON', result: String(Math.abs(sum - 0.3) < Number.EPSILON) },
    { code: '(10 + 20) / 100 === 0.3   // work in whole cents', result: String(cents / 100 === 0.3) },
    // eslint-disable-next-line use-isnan -- this comparison is the lesson: it's always false
    { code: 'NaN === NaN', result: String(Number.NaN === Number.NaN) },
    { code: 'Object.is(-0, 0)', result: String(Object.is(-0, 0)) },
    { code: '1 / -0', result: String(1 / -0) },
  ];
}
