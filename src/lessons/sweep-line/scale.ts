import { mulberry32 } from '../../core/random';
import { bruteCrossings, sweepCrossings, type HSeg, type VSeg } from './segments';

export const SCALE_N = 64;
export const SCALE_SEED = 11;
const SCALE_GRID = 200;
const SCALE_SPAN = 12;

/** A seeded sparse input: short segments scattered over a large grid, so few cross. Model only: far too big to draw. */
export function sparseSet(n: number, seed = SCALE_SEED): { hs: HSeg[]; vs: VSeg[] } {
  const rnd = mulberry32(seed);
  const hs = Array.from({ length: n }, () => {
    const x0 = Math.floor(rnd() * SCALE_GRID);
    return { y: Math.floor(rnd() * SCALE_GRID), x0, x1: x0 + 1 + Math.floor(rnd() * SCALE_SPAN) };
  });
  const vs = Array.from({ length: n }, () => {
    const y0 = Math.floor(rnd() * SCALE_GRID);
    return { x: Math.floor(rnd() * SCALE_GRID), y0, y1: y0 + 1 + Math.floor(rnd() * SCALE_SPAN) };
  });
  return { hs, vs };
}

export interface ScaleNote {
  n: number;
  sweep: number;
  brute: number;
  pairs: number;
  crossings: number;
}

/** The same two counts at a size the stage cannot draw: real runs on a seeded sparse input. */
export function scaleNote(n = SCALE_N): ScaleNote {
  const { hs, vs } = sparseSet(n);
  const sweep = sweepCrossings(hs, vs);
  const brute = bruteCrossings(hs, vs);
  return { n, sweep: sweep.comparisons, brute: brute.comparisons, pairs: brute.pairs, crossings: sweep.crossings.length };
}
