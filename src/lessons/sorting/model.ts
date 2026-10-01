import { randInt, shuffle, type Rnd } from '../../core/random';
import type { Frame } from '../../core/types';

export interface Bar {
  id: number;
  v: number;
}

export type AlgoId = 'bubble' | 'insertion' | 'selection' | 'merge' | 'quick';
export type Kind = 'start' | 'compare' | 'swap' | 'write' | 'mark' | 'done';
export type Preset = 'random' | 'nearly' | 'reversed' | 'few';

export interface SortFrame extends Frame {
  order: Bar[];
  kind: Kind;
  /** Positions being compared / moved this frame. */
  a: number | null;
  b: number | null;
  /** Pivot (quick) or current minimum (selection). */
  pivot: number | null;
  /** Active sub-range for divide-and-conquer algorithms. */
  range: [number, number] | null;
  sorted: number[];
  comparisons: number;
  writes: number;
}

export const ALGOS: Record<AlgoId, { name: string; big: string; note: string; writeLabel: string }> = {
  bubble: { name: 'Bubble', big: 'O(n²)', note: 'best O(n) if already sorted', writeLabel: 'Swaps' },
  insertion: { name: 'Insertion', big: 'O(n²)', note: 'O(n) on nearly-sorted data', writeLabel: 'Swaps' },
  selection: { name: 'Selection', big: 'O(n²)', note: 'always n²/2 comparisons', writeLabel: 'Swaps' },
  merge: { name: 'Merge', big: 'O(n log n)', note: 'guaranteed, uses O(n) extra memory', writeLabel: 'Writes' },
  quick: { name: 'Quick', big: 'O(n log n)', note: 'average; O(n²) worst case', writeLabel: 'Swaps' },
};

export const ALGO_IDS = Object.keys(ALGOS) as AlgoId[];

/** "Few unique" squashes the values into this many distinct heights. */
const FEW_UNIQUE_LEVELS = 4;
/** "Nearly sorted" does one neighbour swap per this many bars. */
const NEARLY_SORTED_SWAP_EVERY = 10;

export function makeBars(n: number, preset: Preset, rnd: Rnd = Math.random): Bar[] {
  let values = Array.from({ length: n }, (_, i) => i + 1);
  if (preset === 'few') {
    values = values.map((v) => Math.ceil((v / n) * FEW_UNIQUE_LEVELS) * Math.ceil(n / FEW_UNIQUE_LEVELS));
  }
  if (preset === 'random' || preset === 'few') values = shuffle(values, rnd);
  if (preset === 'reversed') values.reverse();
  if (preset === 'nearly') {
    for (let k = 0; k < Math.max(1, Math.floor(n / NEARLY_SORTED_SWAP_EVERY)); k++) {
      const i = randInt(0, n - 2, rnd);
      [values[i], values[i + 1]] = [values[i + 1], values[i]];
    }
  }
  return values.map((v, id) => ({ id, v }));
}

/** A frame that does one unit of work: a comparison, a swap or a write (not narration). */
export const isWorkFrame = (f: SortFrame) => f.kind === 'compare' || f.kind === 'swap' || f.kind === 'write';

/**
 * The race timeline for one algorithm: its start, every unit of work, and its finish.
 * Narration frames (a pass ending, a pivot being chosen) don't cost a tick, so the
 * race is decided by work done, not by how much the lesson has to say.
 */
export function raceSteps(frames: readonly SortFrame[]): SortFrame[] {
  return frames.filter((f, i) => i === 0 || i === frames.length - 1 || isWorkFrame(f));
}

/** 1-based finishing places by timeline length; equal lengths share a place. */
export function racePlaces(lengths: readonly number[]): number[] {
  return lengths.map((len) => lengths.filter((other) => other < len).length + 1);
}
