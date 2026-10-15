/**
 * inverted-index, scene 4: shrinking a posting list. Document ids are stored as gaps from the previous id, and each number is written
 * in variable-byte form: 7 data bits per byte, the high bit set on every byte but the last (one common scheme; others put the flag on
 * the last byte). Pure.
 */
import { mulberry32 } from '../../core/random';

/** The big-collection example: this many seeded ids among 10 to this power documents, unless the learner moves the slider. */
export const BIG_SEED = 9;
export const DEFAULT_EXPONENT = 6;
/** How many ids the big-collection example draws. */
export const POSTINGS_SHOWN = 24;
/** Bytes a fixed-width id takes. */
export const FIXED_BYTES = 4;
const MORE = 0x80;
const DATA_MASK = 0x7f;

/** A non-negative integer as variable-byte bytes, least significant group first. */
export function encodeVByte(n: number): number[] {
  if (!Number.isInteger(n) || n < 0) throw new RangeError('variable-byte codes non-negative whole numbers');
  const bytes: number[] = [];
  let rest = n;
  while (rest > DATA_MASK) {
    bytes.push((rest % MORE) | MORE);
    rest = Math.floor(rest / MORE);
  }
  bytes.push(rest);
  return bytes;
}

/** The numbers in a byte stream. Throws on a stream that ends in the middle of a number. */
export function decodeVByte(bytes: readonly number[]): number[] {
  const out: number[] = [];
  let value = 0;
  let scale = 1;
  let open = false;
  for (const b of bytes) {
    value += (b & DATA_MASK) * scale;
    open = (b & MORE) !== 0;
    if (open) scale *= MORE;
    else {
      out.push(value);
      value = 0;
      scale = 1;
    }
  }
  if (open) throw new RangeError('the byte stream ends inside a number');
  return out;
}

/** Ids as gaps: the first id, then each id minus the one before. Needs ascending ids. */
export const toGaps = (ids: readonly number[]): number[] => ids.map((id, i) => (i === 0 ? id : id - ids[i - 1]));
export const fromGaps = (gaps: readonly number[]): number[] => gaps.reduce<number[]>((acc, g) => [...acc, (acc.at(-1) ?? 0) + g], []);

export const encodeList = (numbers: readonly number[]): number[] => numbers.flatMap(encodeVByte);

export interface Sizes {
  fixed: number;
  ids: number;
  gaps: number;
}

/** Bytes for a sorted id list stored fixed-width, as variable-byte ids and as variable-byte gaps. */
export const sizesOf = (ids: readonly number[]): Sizes => ({
  fixed: ids.length * FIXED_BYTES,
  ids: encodeList(ids).length,
  gaps: encodeList(toGaps(ids)).length,
});

/** `count` distinct ascending ids drawn from [1, universe], seeded. */
export function seededIds(count: number, universe: number, seed: number): number[] {
  const rnd = mulberry32(seed);
  const picked = new Set<number>();
  while (picked.size < Math.min(count, universe)) picked.add(1 + Math.floor(rnd() * universe));
  return [...picked].sort((a, b) => a - b);
}
