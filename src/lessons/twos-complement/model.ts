import { toBits, type Bit } from '../../core/bits';

export const BYTE = 256;
export const INT8_MIN = -128;
export const INT8_MAX = 127;
export const INT32_MIN = -(2 ** 31);
export const INT32_MAX = 2 ** 31 - 1;

/** A value as a signed 8-bit integer: keep the low byte, sign-extend bit 7. */
export const wrap8 = (x: number) => (x << 24) >> 24;

/** The same low byte read as unsigned (0..255). */
export const unsigned8 = (x: number) => x & 0xff;

/** A value as a signed 32-bit integer (what `x | 0` does in JavaScript). */
export const wrap32 = (x: number) => x | 0;

/** The same 32 bits read as unsigned (what `x >>> 0` does). */
export const unsigned32 = (x: number) => x >>> 0;

/** Positions on the 256-step wheel, where turning never stops: `turns` counts every click. */
export const wheelIndex = (turns: number) => ((turns % BYTE) + BYTE) % BYTE;

export interface Crossing {
  /** Went between 127 and -128 (the signed seam). */
  signed: boolean;
  /** Went between 255 and 0 (the unsigned seam). */
  unsigned: boolean;
}

/** Which seams a move from byte `from` by `delta` steps (|delta| < 256) crosses. */
export function crossings(from: number, delta: number): Crossing {
  const signed = wrap8(from) + delta;
  const plain = unsigned8(from) + delta;
  return { signed: signed > INT8_MAX || signed < INT8_MIN, unsigned: plain > 0xff || plain < 0 };
}

/** Same for a 32-bit counter. */
export function crossings32(from: number, delta: number): Crossing {
  const signed = wrap32(from) + delta;
  const plain = unsigned32(from) + delta;
  return { signed: signed > INT32_MAX || signed < INT32_MIN, unsigned: plain > 2 ** 32 - 1 || plain < 0 };
}

export interface NegateSteps {
  original: Bit[];
  inverted: Bit[];
  result: Bit[];
  resultValue: number;
}

/** Two's-complement negation, the way hardware does it: invert every bit, then add 1. */
export function negateSteps(value: number): NegateSteps {
  const inverted = ~value & 0xff;
  const result = (inverted + 1) & 0xff;
  return { original: toBits(value, 8), inverted: toBits(inverted, 8), result: toBits(result, 8), resultValue: wrap8(result) };
}

export interface ByteSum {
  a: Bit[];
  b: Bit[];
  sum: Bit[];
  /** carries[i] is the carry INTO column i (MSB-first); the rightmost column gets 0. */
  carries: Bit[];
  carryOut: Bit;
  /** The 8-bit result read unsigned and signed. */
  resultUnsigned: number;
  resultSigned: number;
  /** What the sum would be with unlimited bits. */
  trueUnsigned: number;
  trueSigned: number;
  /** Unsigned answer is wrong: a carry fell off the top. */
  unsignedWraps: boolean;
  /** Signed answer is wrong: both inputs had the same sign and the result's sign differs. */
  signedOverflow: boolean;
}

/** Ripple-carry addition of two bytes, column by column, as the ALU does it. */
export function addBytes(x: number, y: number): ByteSum {
  const a = toBits(x, 8);
  const b = toBits(y, 8);
  const sum: Bit[] = new Array(8).fill(0);
  const carries: Bit[] = new Array(8).fill(0);
  let carry: Bit = 0;
  for (let i = 7; i >= 0; i--) {
    carries[i] = carry;
    const total: number = a[i] + b[i] + carry;
    sum[i] = (total % 2) as Bit;
    carry = total >= 2 ? 1 : 0;
  }
  const resultUnsigned = unsigned8(x + y);
  const resultSigned = wrap8(x + y);
  const sameSign = a[0] === b[0];
  return {
    a,
    b,
    sum,
    carries,
    carryOut: carry,
    resultUnsigned,
    resultSigned,
    trueUnsigned: unsigned8(x) + unsigned8(y),
    trueSigned: wrap8(x) + wrap8(y),
    unsignedWraps: carry === 1,
    signedOverflow: sameSign && sum[0] !== a[0],
  };
}

/** A Unix timestamp (seconds) as an ISO date: where the year-2038 counter points. */
export const unixDate = (seconds: number) => new Date(seconds * 1000).toISOString().replace('.000Z', 'Z');

export interface AddPreset {
  label: string;
  a: number;
  b: number;
}

export const ADD_PRESETS: readonly AddPreset[] = [
  { label: '127 + 1', a: 127, b: 1 },
  { label: '100 + 50', a: 100, b: 50 },
  { label: '-1 + 1', a: -1, b: 1 },
  { label: '-128 + -1', a: -128, b: -1 },
  { label: '20 + 22', a: 20, b: 22 },
];

/** Starting point for the 32-bit counter: three clicks below INT32_MAX. */
export const COUNTER32_START = INT32_MAX - 2;
