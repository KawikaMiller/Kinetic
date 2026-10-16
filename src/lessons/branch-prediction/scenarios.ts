/** The streams, the sorted-versus-unsorted loop and the speculation strip: pure, seeded, and clock-free. */
import { mulberry32 } from '../../core/random';
import {
  PREDICTOR_KINDS, missCount, randomOutcomes, run, totalCycles,
  type PredictorConfig, type PredictorKind,
} from './predictor';

// ---- The predictor lab's outcome streams -------------------------------------------------------------------

/** One lab run is this many branches (4 rows of the 16-cell pattern). */
export const LAB_LENGTH = 64;
export const PATTERN_LENGTH = 16;
export const LAB_SEED = 11;
export const P_STEP = 0.05;
export const DEFAULT_P = 0.7;

export type StreamSource =
  | { kind: 'pattern'; pattern: readonly boolean[] }
  | { kind: 'random'; p: number }
  | { kind: 'sorted' }
  | { kind: 'unsorted' };

const T = true;
const N = false;
const repeat = (unit: readonly boolean[], times: number) => Array.from({ length: unit.length * times }, (_, i) => unit[i % unit.length]);

export const PATTERN_PRESETS: readonly { id: string; label: string; pattern: boolean[] }[] = [
  { id: 'always', label: 'Always taken', pattern: repeat([T], PATTERN_LENGTH) },
  { id: 'alternating', label: 'Alternating TN', pattern: repeat([T, N], PATTERN_LENGTH / 2) },
  { id: 'loop', label: 'Loop of four (TTTN)', pattern: repeat([T, T, T, N], PATTERN_LENGTH / 4) },
  { id: 'pairs', label: 'Pairs (TTNN)', pattern: repeat([T, T, N, N], PATTERN_LENGTH / 4) },
];

export const DEFAULT_PATTERN = PATTERN_PRESETS[2].pattern;
export const DEFAULT_SOURCE: StreamSource = { kind: 'pattern', pattern: DEFAULT_PATTERN };

export function labOutcomes(source: StreamSource): boolean[] {
  switch (source.kind) {
    case 'pattern': return repeat(source.pattern, LAB_LENGTH / source.pattern.length);
    case 'random': return randomOutcomes(mulberry32(LAB_SEED), source.p, LAB_LENGTH);
    case 'sorted': return dataStride('sorted');
    case 'unsorted': return dataStride('unsorted');
  }
}

/** Every 4th value of the 256, so a sorted run keeps its single transition within 64 cells. */
const DATA_STRIDE = 4;
const dataStride = (order: DataOrder) => branchOutcomes(dataValues(order)).filter((_, i) => i % DATA_STRIDE === 0);

export const EVERY_RANGE = { min: 3, max: 12, default: 6 } as const;

export interface LabState {
  kind: PredictorKind;
  initialCounter: number;
  historyBits: number;
  penalty: number;
  /** One branch every this many instructions. */
  every: number;
  source: StreamSource;
  p: number;
}

/** The predictor lab as it opens, and what a scene switch resets it to. */
export const labOpening = (): LabState => ({
  kind: 'two-bit', initialCounter: 2, historyBits: 2, penalty: 15, every: EVERY_RANGE.default, source: DEFAULT_SOURCE, p: DEFAULT_P,
});

// ---- The sorted-versus-unsorted loop -----------------------------------------------------------------------

export type DataOrder = 'sorted' | 'unsorted';
export const DATA_SEED = 4242;
export const DATA_COUNT = 256;
export const VALUE_MAX = 255;
/** The loop's branch: `if (x >= THRESHOLD) sum += x`. */
export const THRESHOLD = 128;
/** Instructions per iteration (illustrative): load, compare, branch, add, increment, loop-back. */
export const ITER_INSTRUCTIONS = 6;
/** The same iteration with the select done by arithmetic: load, compare, mask, and, add, increment, loop-back, plus one. */
export const BRANCHLESS_INSTRUCTIONS = 8;
export const PENALTY_RANGE = { min: 5, max: 25, step: 1, default: 15 } as const;

/** 256 seeded values in 0-255; the sorted order is the same values ascending. */
export function dataValues(order: DataOrder): number[] {
  const rnd = mulberry32(DATA_SEED);
  const values = Array.from({ length: DATA_COUNT }, () => Math.floor(rnd() * (VALUE_MAX + 1)));
  return order === 'sorted' ? values.slice().sort((a, b) => a - b) : values;
}

export const branchOutcomes = (values: readonly number[]): boolean[] => values.map((x) => x >= THRESHOLD);

export const transitions = (outcomes: readonly boolean[]) => outcomes.filter((o, i) => i > 0 && o !== outcomes[i - 1]).length;

export interface LoopCost {
  iterations: number;
  branchless: boolean;
  instructions: number;
  /** Branch mispredictions: none when there is no branch. */
  misses: number;
  cycles: number;
  transitions: number;
  taken: number;
}

/**
 * Cycles for the loop. The branchy loop pays `penalty` per miss; the branchless loop has no data-dependent branch, so
 * its stream is empty and its cost is the same for every data order. The loop's own back-edge is assumed predicted.
 */
export function loopCost(order: DataOrder, cfg: PredictorConfig, penalty: number, branchless: boolean): LoopCost {
  const outcomes = branchOutcomes(dataValues(order));
  const perIteration = branchless ? BRANCHLESS_INSTRUCTIONS : ITER_INSTRUCTIONS;
  const instructions = outcomes.length * perIteration;
  const misses = branchless ? 0 : missCount(run(cfg, outcomes));
  return {
    iterations: outcomes.length,
    branchless,
    instructions,
    misses,
    cycles: totalCycles(instructions, misses, penalty),
    transitions: transitions(outcomes),
    taken: outcomes.filter(Boolean).length,
  };
}

/** The loop scene has no initial-counter or history control, so these are pinned constants there. */
export const LOOP_INITIAL_COUNTER = 2;
export const LOOP_HISTORY_BITS = 2;

export interface SortedState {
  order: DataOrder;
  kind: PredictorKind;
  branchless: boolean;
  penalty: number;
}

export const sortedOpening = (): SortedState => ({ order: 'unsorted', kind: 'two-bit', branchless: false, penalty: PENALTY_RANGE.default });

export const loopConfig = (kind: PredictorKind): PredictorConfig => ({ kind, initialCounter: LOOP_INITIAL_COUNTER, historyBits: LOOP_HISTORY_BITS });

/** Which iterations the predictor missed (for the miss marks), in order. */
export const missedIterations = (order: DataOrder, cfg: PredictorConfig): boolean[] =>
  run(cfg, branchOutcomes(dataValues(order))).map((s) => !s.hit);

// ---- The accuracy-against-p curves -------------------------------------------------------------------------

export const CURVE_SAMPLES = 1500;
export const CURVE_SEED = 5;
export const P_GRID: readonly number[] = Array.from({ length: Math.round(1 / P_STEP) + 1 }, (_, i) => Math.round(i * P_STEP * 100) / 100);

export interface AccuracyCurve {
  kind: PredictorKind;
  points: [number, number][];
}

/** Accuracy of every predictor on the same seeded independent stream at each p. */
export function accuracyCurves(initialCounter: number, historyBits: number): AccuracyCurve[] {
  const streams = P_GRID.map((p) => randomOutcomes(mulberry32(CURVE_SEED), p, CURVE_SAMPLES));
  return PREDICTOR_KINDS.map((kind) => ({
    kind,
    points: P_GRID.map((p, i): [number, number] => [p, 1 - missCount(run({ kind, initialCounter, historyBits }, streams[i])) / CURVE_SAMPLES]),
  }));
}

// ---- The speculation strip ---------------------------------------------------------------------------------

export const DEPTH_RANGE = { min: 2, max: 16, default: 3 } as const;

export interface SpeculationState {
  depth: number;
  guessRight: boolean;
}

export const speculationOpening = (): SpeculationState => ({ depth: DEPTH_RANGE.default, guessRight: false });

export interface Speculation {
  depth: number;
  guessRight: boolean;
  /** Younger instructions fetched down the guessed path before the branch resolves. */
  inFlightYounger: number;
  /** Of those, the ones thrown away: none on a right guess. */
  flushed: number;
  /** Fetch cycles lost: the slots spent on discarded work (one instruction fetched per cycle). */
  lostCycles: number;
}

/** A scalar pipeline fetches one instruction a cycle; the branch resolves at the end of stage `depth`. */
export function speculation(depth: number, guessRight: boolean): Speculation {
  const younger = depth - 1;
  return { depth, guessRight, inFlightYounger: younger, flushed: guessRight ? 0 : younger, lostCycles: guessRight ? 0 : younger };
}

export type SlotKind = 'branch' | 'speculative' | 'kept' | 'flushed' | 'empty';

export interface StripFrame {
  /** 1..depth are fetch cycles; depth + 1 is the resolution. */
  cycle: number;
  /** One entry per stage, 1..depth: the instruction there (0 = the branch, k = k-th younger), and what it is now. */
  slots: { age: number | null; kind: SlotKind }[];
  resolved: boolean;
}

/** The pipeline at one cycle: the branch fetched in cycle 1 is in stage `cycle`, the instruction fetched in cycle j is in stage `cycle - j + 1`. */
export function stripAt(depth: number, guessRight: boolean, cycle: number): StripFrame {
  const resolved = cycle > depth;
  const at = Math.min(cycle, depth);
  const slots = Array.from({ length: depth }, (_, s): StripFrame['slots'][number] => {
    const age = at - (s + 1);
    if (age < 0) return { age: null, kind: 'empty' };
    if (age === 0) return { age, kind: 'branch' };
    if (!resolved) return { age, kind: 'speculative' };
    return { age, kind: guessRight ? 'kept' : 'flushed' };
  });
  return { cycle, slots, resolved };
}
