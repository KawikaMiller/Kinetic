/**
 * time-series-data: a Gorilla-style encoder and decoder, real and exact. Timestamps are stored by delta of delta, values by XOR with the
 * previous value. This follows Pelkonen et al., "Gorilla" (VLDB 2015), as the author remembers it; the lesson chips the exact bit
 * windows "from memory, verify", and says other systems differ.
 *
 *  timestamps: the first in 64 bits; the first delta in 14 bits; then the delta of delta D:
 *    D = 0: '0'   D in [-63, 64]: '10' + 7 bits   [-255, 256]: '110' + 9 bits   [-2047, 2048]: '1110' + 12 bits   else '1111' + 32 bits
 *  values: the first as 64 bits; then x = bits(v) XOR bits(previous):
 *    x = 0: '0'.  Otherwise '1', then '0' + the meaningful bits when they fit in the previous window of leading and trailing zeros,
 *    or '1' + 5 bits of leading zeros (capped at 31) + 6 bits of length (64 is written as 0) + the meaningful bits.
 */

export interface Point {
  /** Whole seconds. */
  t: number;
  v: number;
}

export const FIRST_DELTA_BITS = 14;
export const MAX_FIRST_DELTA = 2 ** FIRST_DELTA_BITS - 1;
export const RAW_POINT_BYTES = 16;
export const RAW_POINT_BITS = RAW_POINT_BYTES * 8;

/** One labelled run of an encoded point, for drawing. */
export interface Segment {
  label: string;
  bits: string;
}
export interface Encoded {
  bits: string;
  /** Bits each point took. */
  perPoint: number[];
  segments: Segment[][];
}

const view = new DataView(new ArrayBuffer(8));
const bitsOf = (v: number): bigint => {
  view.setFloat64(0, v);
  return view.getBigUint64(0);
};
const fromBits = (b: bigint): number => {
  view.setBigUint64(0, b);
  return view.getFloat64(0);
};
const MASK64 = (1n << 64n) - 1n;

const bin = (value: bigint, width: number): string => (value & ((1n << BigInt(width)) - 1n)).toString(2).padStart(width, '0');
const signed = (d: number, offset: number, width: number) => bin(BigInt(d + offset), width);

/** The control prefix and field width for a delta of delta. */
export function dodWindow(d: number): { prefix: string; width: number; offset: number } {
  if (d === 0) return { prefix: '0', width: 0, offset: 0 };
  if (d >= -63 && d <= 64) return { prefix: '10', width: 7, offset: 63 };
  if (d >= -255 && d <= 256) return { prefix: '110', width: 9, offset: 255 };
  if (d >= -2047 && d <= 2048) return { prefix: '1110', width: 12, offset: 2047 };
  return { prefix: '1111', width: 32, offset: 0 };
}

const leadingZeros = (x: bigint) => bin(x, 64).indexOf('1');
const trailingZeros = (x: bigint) => 63 - bin(x, 64).lastIndexOf('1');
const MAX_LEAD = 31;

export function encode(points: readonly Point[]): Encoded {
  let out = '';
  const perPoint: number[] = [];
  const segments: Segment[][] = [];
  let prevDelta = 0;
  let prevBits = 0n;
  let window: { lead: number; trail: number } | null = null;
  points.forEach((p, i) => {
    const segs: Segment[] = [];
    const add = (label: string, bits: string) => segs.push({ label, bits });
    if (i === 0) {
      add('timestamp', bin(BigInt(p.t), 64));
    } else if (i === 1) {
      const d = p.t - points[0].t;
      if (d < 0 || d > MAX_FIRST_DELTA) throw new RangeError(`the first delta must fit ${FIRST_DELTA_BITS} bits`);
      add('first delta', bin(BigInt(d), FIRST_DELTA_BITS));
      prevDelta = d;
    } else {
      const delta = p.t - points[i - 1].t;
      const dod = delta - prevDelta;
      const w = dodWindow(dod);
      if (w.width === 32 && (dod < -(2 ** 31) || dod >= 2 ** 31)) throw new RangeError('delta of delta does not fit 32 bits');
      add('delta of delta', w.width === 0 ? w.prefix : w.prefix + signed(dod, w.offset, w.width));
      prevDelta = delta;
    }
    const b = bitsOf(p.v);
    if (i === 0) add('value', bin(b, 64));
    else {
      const x = (b ^ prevBits) & MASK64;
      if (x === 0n) add('value', '0');
      else {
        const lead = Math.min(leadingZeros(x), MAX_LEAD);
        const trail = trailingZeros(x);
        if (window && lead >= window.lead && trail >= window.trail) {
          const len = 64 - window.lead - window.trail;
          add('value', '10' + bin(x >> BigInt(window.trail), len));
        } else {
          const len = 64 - lead - trail;
          add('value', '11' + bin(BigInt(lead), 5) + bin(BigInt(len === 64 ? 0 : len), 6) + bin(x >> BigInt(trail), len));
          window = { lead, trail };
        }
      }
    }
    prevBits = b;
    const text = segs.map((s) => s.bits).join('');
    out += text;
    perPoint.push(text.length);
    segments.push(segs);
  });
  return { bits: out, perPoint, segments };
}

export function decode(bits: string, count: number): Point[] {
  let pos = 0;
  const read = (n: number): bigint => {
    const chunk = bits.slice(pos, pos + n);
    if (chunk.length < n) throw new RangeError('the bit stream ended early');
    pos += n;
    return n === 0 ? 0n : BigInt(`0b${chunk}`);
  };
  const out: Point[] = [];
  let prevDelta = 0;
  let prevBits = 0n;
  let window: { lead: number; trail: number } | null = null;
  for (let i = 0; i < count; i++) {
    let t: number;
    if (i === 0) t = Number(read(64));
    else if (i === 1) {
      prevDelta = Number(read(FIRST_DELTA_BITS));
      t = out[0].t + prevDelta;
    } else {
      let prefix = 0;
      while (prefix < 4 && read(1) === 1n) prefix++;
      const [width, offset] = [[0, 0], [7, 63], [9, 255], [12, 2047], [32, 0]][prefix];
      let dod = 0;
      if (width > 0) {
        const raw = Number(read(width));
        dod = width === 32 ? (raw >= 2 ** 31 ? raw - 2 ** 32 : raw) : raw - offset;
      }
      prevDelta += dod;
      t = out[i - 1].t + prevDelta;
    }
    let b: bigint;
    if (i === 0) b = read(64);
    else if (read(1) === 0n) b = prevBits;
    else {
      let lead: number;
      let trail: number;
      let len: number;
      if (read(1) === 0n) {
        if (!window) throw new RangeError('a reused window before any window');
        ({ lead, trail } = window);
        len = 64 - lead - trail;
      } else {
        lead = Number(read(5));
        const l = Number(read(6));
        len = l === 0 ? 64 : l;
        trail = 64 - lead - len;
        window = { lead, trail };
      }
      b = prevBits ^ ((read(len) << BigInt(trail)) & MASK64);
    }
    prevBits = b;
    out.push({ t, v: fromBits(b) });
  }
  return out;
}

export const encodedBytes = (e: Encoded): number => Math.ceil(e.bits.length / 8);
export const bitsPerPoint = (e: Encoded): number => (e.perPoint.length === 0 ? 0 : e.bits.length / e.perPoint.length);
/** Raw size over encoded size (a ratio above 1 means it shrank). */
export const ratioAgainstRaw = (e: Encoded): number => (e.bits.length === 0 ? 0 : (e.perPoint.length * RAW_POINT_BITS) / e.bits.length);
