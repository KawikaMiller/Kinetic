/**
 * columnar-storage: four ways to store one column, each with an exact decoder. Sizes are in bits, rounded up to whole
 * bytes at the end. The rules are this lesson's own (stated on screen), not any file format's.
 */
import { FIELD_BYTES, isNumeric, type Cell, type Column } from './table';

export type Encoding = 'none' | 'rle' | 'dict' | 'delta';
export const ENCODING_LABELS: Record<Encoding, string> = { none: 'None', rle: 'Run-length', dict: 'Dictionary', delta: 'Delta' };

export const FIELD_BITS = FIELD_BYTES * 8;
/** A run stores its value and a one-byte count. */
export const RUN_COUNT_BITS = 8;

export type Encoded =
  | { kind: 'none'; values: Cell[] }
  | { kind: 'rle'; runs: { value: Cell; count: number }[] }
  | { kind: 'dict'; dict: Cell[]; codes: number[] }
  | { kind: 'delta'; first: number | null; width: number; deltas: number[] };

/** Fewest bits that can tell `distinct` things apart: ceil(log2 distinct), and none at all for 0 or 1. */
export function codeWidth(distinct: number): number {
  let w = 0;
  while (2 ** w < distinct) w++;
  return w;
}

/** A signed step as a non-negative number: 0, -1, 1, -2, 2 become 0, 1, 2, 3, 4. */
export const zigzag = (d: number): number => (d >= 0 ? 2 * d : -2 * d - 1);
export const unzigzag = (z: number): number => (z % 2 === 0 ? z / 2 : -(z + 1) / 2);

/** Delta only suits a column of numbers. */
export const canDelta = (values: readonly Cell[]): boolean => values.every((v) => typeof v === 'number');
export const encodingsFor = (col: Column): Encoding[] => (isNumeric(col) ? ['none', 'rle', 'dict', 'delta'] : ['none', 'rle', 'dict']);

export function encode(values: readonly Cell[], kind: Encoding): Encoded {
  switch (kind) {
    case 'none':
      return { kind, values: [...values] };
    case 'rle': {
      const runs: { value: Cell; count: number }[] = [];
      for (const v of values) {
        const last = runs.at(-1);
        if (last && last.value === v) last.count++;
        else runs.push({ value: v, count: 1 });
      }
      return { kind, runs };
    }
    case 'dict': {
      const dict: Cell[] = [];
      const codes = values.map((v) => {
        let i = dict.indexOf(v);
        if (i < 0) i = dict.push(v) - 1;
        return i;
      });
      return { kind, dict, codes };
    }
    case 'delta': {
      if (!canDelta(values)) throw new TypeError('delta needs a column of numbers');
      const nums = values as number[];
      const deltas = nums.slice(1).map((v, i) => zigzag(v - nums[i]));
      const widest = deltas.reduce((m, z) => Math.max(m, z), 0);
      return { kind, first: nums.length === 0 ? null : nums[0], width: codeWidth(widest + 1), deltas };
    }
  }
}

export function decode(e: Encoded): Cell[] {
  switch (e.kind) {
    case 'none':
      return [...e.values];
    case 'rle':
      return e.runs.flatMap((r) => Array<Cell>(r.count).fill(r.value));
    case 'dict':
      return e.codes.map((c) => e.dict[c]);
    case 'delta': {
      if (e.first === null) return [];
      const out = [e.first];
      for (const z of e.deltas) out.push(out[out.length - 1] + unzigzag(z));
      return out;
    }
  }
}

/** Bits this encoding takes: the rules the stage states. */
export function encodedBits(e: Encoded): number {
  switch (e.kind) {
    case 'none':
      return e.values.length * FIELD_BITS;
    case 'rle':
      return e.runs.length * (FIELD_BITS + RUN_COUNT_BITS);
    case 'dict':
      return e.dict.length * FIELD_BITS + e.codes.length * codeWidth(e.dict.length);
    case 'delta':
      return e.first === null ? 0 : FIELD_BITS + e.deltas.length * e.width;
  }
}

export const encodedBytes = (e: Encoded): number => Math.ceil(encodedBits(e) / 8);

export const sameCells = (a: readonly Cell[], b: readonly Cell[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

/** The size of a column before (raw, 4 bytes a value) and after an encoding, and whether the decoder rebuilds it exactly. */
export function sizeReport(values: readonly Cell[], kind: Encoding): { before: number; after: number; roundTrips: boolean; encoded: Encoded } {
  const encoded = encode(values, kind);
  return { before: encodedBytes(encode(values, 'none')), after: encodedBytes(encoded), roundTrips: sameCells(decode(encoded), values), encoded };
}
