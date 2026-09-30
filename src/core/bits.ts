import type { ReactNode } from 'react';
import type { Tone } from './tone';

/** One bit, most significant first in every array this module produces. */
export type Bit = 0 | 1;

/** A labelled run of bits drawn as one bracket (a nibble, a byte, sign/exponent/mantissa). */
export interface BitGroup {
  /** Inclusive start index. */
  from: number;
  /** Inclusive end index. */
  to: number;
  tone?: Tone;
  label?: ReactNode;
}

const MAX_WIDTH = 53; // Number.MAX_SAFE_INTEGER has 53 bits

function checkWidth(width: number) {
  if (!Number.isInteger(width) || width < 1 || width > MAX_WIDTH) {
    throw new RangeError(`bit width must be an integer from 1 to ${MAX_WIDTH}, got ${width}`);
  }
}

/**
 * `value` as `width` bits, MSB first. Negative values come out in two's complement,
 * and anything outside the width wraps: toBits(-1, 8) → 11111111, toBits(256, 8) → 0.
 */
export function toBits(value: number, width: number): Bit[] {
  checkWidth(width);
  const size = 2 ** width;
  // Only add `size` for negatives: `v % size + size` would overflow 2^53 at full width.
  const rem = Math.trunc(value) % size;
  const unsigned = rem < 0 ? rem + size : rem;
  const bits: Bit[] = [];
  for (let i = width - 1; i >= 0; i--) bits.push((Math.floor(unsigned / 2 ** i) % 2) as Bit);
  return bits;
}

/** The unsigned value of MSB-first bits. */
export function fromBits(bits: readonly Bit[]): number {
  checkWidth(bits.length);
  return bits.reduce<number>((acc, b) => acc * 2 + b, 0);
}

/** The same bits read as a two's-complement signed number. */
export function fromBitsSigned(bits: readonly Bit[]): number {
  const unsigned = fromBits(bits);
  return bits[0] === 1 ? unsigned - 2 ** bits.length : unsigned;
}

/** A copy with bit `i` flipped. */
export function flipBit(bits: readonly Bit[], i: number): Bit[] {
  return bits.map((b, j) => (j === i ? ((1 - b) as Bit) : b));
}

/** Place value of bit `i` in an MSB-first strip of `width` bits: 2^(width-1-i). */
export const placeValue = (i: number, width: number) => 2 ** (width - 1 - i);

/**
 * Split `width` bits into consecutive groups of `size` (nibbles, bytes, base64's 6-bit
 * groups, rwx triples), left to right. By default the groups start at the MSB end, so the
 * last group is the short one when `size` doesn't divide `width`. With `align: 'right'` they
 * start at the LSB end instead, so the short group is the leftmost: how bytes of a number
 * line up (12 bits → 4 + 8). `index` counts left to right either way.
 */
export function chunkGroups(
  width: number,
  size: number,
  o: { tone?: Tone; label?: (index: number, from: number, to: number) => ReactNode; align?: 'left' | 'right' } = {},
): BitGroup[] {
  const lead = o.align === 'right' ? width % size || size : size;
  const groups: BitGroup[] = [];
  for (let from = 0, index = 0; from < width; from += index === 0 ? lead : size, index++) {
    const to = Math.min(width, from + (index === 0 ? lead : size)) - 1;
    groups.push({ from, to, tone: o.tone, label: o.label?.(index, from, to) });
  }
  return groups;
}
