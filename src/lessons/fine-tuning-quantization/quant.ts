import { normal } from '../../core/distributions';
import { mulberry32 } from '../../core/random';

/**
 * A symmetric integer quantiser on one small seeded weight matrix, and the meter that stands for quality:
 * the relative output error of one toy layer on seeded inputs (never "accuracy").
 */

export const SIZE = 8;
export const OUTLIER_AT = { row: 3, col: 5 } as const;
export const OUTLIER_FACTOR = 20;
export const INPUTS = 200;
export const MIN_BITS = 2;
export const MAX_BITS = 16;
export const BITS_CHOICES = [8, 6, 5, 4, 3, 2] as const;
export const DEFAULT_QUANT_SEED = 1;

export type Scheme = { kind: 'tensor' } | { kind: 'group'; size: number };

export const TENSOR: Scheme = { kind: 'tensor' };

export interface QuantResult {
  /** The dequantised weights. */
  dequantised: number[][];
  /** The integer codes. */
  codes: number[][];
  /** One scale per tensor or per group, in row-major group order. */
  scales: number[];
}

const levels = (bits: number): number => 2 ** (bits - 1) - 1;

/** Quantise a flat list with one scale: scale = max|w| / (2^(bits-1) - 1), code = round(w / scale), a zero list stays zero. */
export function quantiseGroup(w: readonly number[], bits: number): { codes: number[]; deq: number[]; scale: number } {
  if (!Number.isInteger(bits) || bits < MIN_BITS || bits > MAX_BITS) throw new RangeError(`bits must be a whole number from ${MIN_BITS} to ${MAX_BITS}`);
  const peak = w.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const scale = peak / levels(bits);
  if (scale === 0) return { codes: w.map(() => 0), deq: w.map(() => 0), scale: 0 };
  const codes = w.map((v) => Math.max(-levels(bits), Math.min(levels(bits), Math.round(v / scale))) + 0); // + 0 turns -0 into 0
  return { codes, deq: codes.map((c) => c * scale), scale };
}

/** Quantise a matrix per tensor (one scale) or per group along each row. */
export function quantise(w: readonly (readonly number[])[], bits: number, scheme: Scheme): QuantResult {
  if (scheme.kind === 'tensor') {
    const flat = w.flat();
    const { codes, deq, scale } = quantiseGroup(flat, bits);
    const cols = w[0].length;
    const unflat = (xs: number[]) => w.map((_, r) => xs.slice(r * cols, (r + 1) * cols));
    return { codes: unflat(codes), dequantised: unflat(deq), scales: [scale] };
  }
  const codes: number[][] = [];
  const dequantised: number[][] = [];
  const scales: number[] = [];
  for (const row of w) {
    const rc: number[] = [];
    const rd: number[] = [];
    for (let start = 0; start < row.length; start += scheme.size) {
      const g = quantiseGroup(row.slice(start, start + scheme.size), bits);
      rc.push(...g.codes);
      rd.push(...g.deq);
      scales.push(g.scale);
    }
    codes.push(rc);
    dequantised.push(rd);
  }
  return { codes, dequantised, scales };
}

/** A seeded SIZE x SIZE matrix of standard-normal entries, with the outlier entry multiplied when asked. */
export function makeWeights(seed: number, outlier: boolean): number[][] {
  const rnd = mulberry32(seed);
  const w = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => normal(rnd)));
  if (outlier) w[OUTLIER_AT.row][OUTLIER_AT.col] *= OUTLIER_FACTOR;
  return w;
}

/** Seeded standard-normal input vectors for the output-error meter. */
export function makeInputs(seed: number, count = INPUTS): number[][] {
  const rnd = mulberry32(seed + 1_000_003);
  return Array.from({ length: count }, () => Array.from({ length: SIZE }, () => normal(rnd)));
}

export interface OutputError {
  /** Per output row: ||(w - w_hat) . x|| / ||w . x|| over the inputs. */
  perRow: number[];
  /** The root-mean-square of the rows. */
  rms: number;
}

const dot = (a: readonly number[], b: readonly number[]): number => a.reduce((s, v, i) => s + v * b[i], 0);

export function outputError(w: readonly (readonly number[])[], what: readonly (readonly number[])[], inputs: readonly (readonly number[])[]): OutputError {
  const perRow = w.map((row, i) => {
    let num = 0;
    let den = 0;
    for (const x of inputs) {
      const exact = dot(row, x);
      num += (exact - dot(what[i], x)) ** 2;
      den += exact ** 2;
    }
    return den === 0 ? 0 : Math.sqrt(num / den);
  });
  return { perRow, rms: Math.sqrt(perRow.reduce((s, e) => s + e * e, 0) / perRow.length) };
}

/** Squared error of each weight as a share of the matrix's total weight energy, for the heat map. */
export const weightErrors = (w: readonly (readonly number[])[], what: readonly (readonly number[])[]): number[][] =>
  w.map((row, i) => row.map((v, j) => (v - what[i][j]) ** 2));

/** Bits per weight, scales included: one 16-bit scale per tensor or per group. */
export function bitsPerWeight(bits: number, scheme: Scheme, weights = SIZE * SIZE): number {
  return bits + 16 / (scheme.kind === 'tensor' ? weights : scheme.size);
}

export interface Comparison {
  perTensor: OutputError;
  perGroup: OutputError;
}

/** The two schemes on one seeded matrix at one bit width. */
export function compareSchemes(seed: number, outlier: boolean, bits: number, groupSize: number): Comparison {
  const w = makeWeights(seed, outlier);
  const x = makeInputs(seed);
  return {
    perTensor: outputError(w, quantise(w, bits, TENSOR).dequantised, x),
    perGroup: outputError(w, quantise(w, bits, { kind: 'group', size: groupSize }).dequantised, x),
  };
}
