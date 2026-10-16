/**
 * Textbook branch predictors, as pure state machines. Every cost here is a count of model cycles or
 * instructions, never a measurement, and nothing in this file reads a clock.
 */

export type PredictorKind = 'static-taken' | 'static-not-taken' | 'one-bit' | 'two-bit' | 'two-level';

/** The 2-bit counter's four states: 0 strongly not-taken, 1 weakly not-taken, 2 weakly taken, 3 strongly taken. */
export const COUNTER_MAX = 3;
export const COUNTER_NAMES = ['strongly not-taken', 'weakly not-taken', 'weakly taken', 'strongly taken'] as const;
/** A counter predicts taken from this state up. */
export const TAKEN_FROM = 2;

export const HISTORY_RANGE = { min: 1, max: 4 } as const;

export interface PredictorConfig {
  kind: PredictorKind;
  /** The starting state of every 2-bit counter (also what the 1-bit predictor's first guess follows). */
  initialCounter: number;
  /** Two-level only: how many past outcomes index the table. Ignored by every other kind. */
  historyBits: number;
}

export interface PredictorState {
  kind: PredictorKind;
  /** 1-bit: the last outcome. */
  last: boolean;
  /** 2-bit: the one counter. */
  counter: number;
  /** Two-level: the last `bits` outcomes, newest in bit 0 (1 = taken). */
  history: number;
  bits: number;
  /** Two-level: one 2-bit counter per history pattern. */
  table: readonly number[];
}

export const clampCounter = (v: number) => Math.max(0, Math.min(COUNTER_MAX, Math.round(v)));

export function initPredictor(cfg: PredictorConfig): PredictorState {
  const c = clampCounter(cfg.initialCounter);
  const bits = Math.max(HISTORY_RANGE.min, Math.min(HISTORY_RANGE.max, Math.round(cfg.historyBits)));
  return {
    kind: cfg.kind,
    last: c >= TAKEN_FROM,
    counter: c,
    history: 0,
    bits,
    table: Array.from({ length: 2 ** bits }, () => c),
  };
}

export function predict(s: PredictorState): boolean {
  switch (s.kind) {
    case 'static-taken': return true;
    case 'static-not-taken': return false;
    case 'one-bit': return s.last;
    case 'two-bit': return s.counter >= TAKEN_FROM;
    case 'two-level': return s.table[s.history] >= TAKEN_FROM;
  }
}

/** A taken branch moves a counter up one, a not-taken one down one, saturating at both ends. */
export const bump = (counter: number, taken: boolean) => (taken ? Math.min(COUNTER_MAX, counter + 1) : Math.max(0, counter - 1));

export function update(s: PredictorState, taken: boolean): PredictorState {
  switch (s.kind) {
    case 'one-bit': return { ...s, last: taken };
    case 'two-bit': return { ...s, counter: bump(s.counter, taken) };
    case 'two-level': {
      const table = s.table.slice();
      table[s.history] = bump(table[s.history], taken);
      const mask = 2 ** s.bits - 1;
      return { ...s, table, history: ((s.history << 1) | (taken ? 1 : 0)) & mask };
    }
    default: return s;
  }
}

export interface Step {
  index: number;
  taken: boolean;
  guess: boolean;
  hit: boolean;
  /** The predictor's state just before this branch (what the guess came from). */
  before: PredictorState;
  after: PredictorState;
}

export function run(cfg: PredictorConfig, outcomes: readonly boolean[]): Step[] {
  let s = initPredictor(cfg);
  return outcomes.map((taken, index) => {
    const before = s;
    const guess = predict(before);
    s = update(before, taken);
    return { index, taken, guess, hit: guess === taken, before, after: s };
  });
}

export const missCount = (steps: readonly { hit: boolean }[]) => steps.filter((s) => !s.hit).length;

export function accuracy(steps: readonly { hit: boolean }[]): number {
  return steps.length === 0 ? 0 : 1 - missCount(steps) / steps.length;
}

/** Total cycles = instructions + misses x penalty (the lesson's one cost formula). */
export const totalCycles = (instructions: number, misses: number, penalty: number) => instructions + misses * penalty;

/**
 * The 2-bit counter's long-run accuracy on independent outcomes with taken-probability p, from the four-state
 * birth-death chain: pi_i is proportional to (p / (1 - p))^i, so detailed balance fixes every state's share.
 */
export function twoBitStationaryAccuracy(p: number): number {
  if (p <= 0 || p >= 1) return 1;
  const r = p / (1 - p);
  const weights = [0, 1, 2, 3].map((i) => r ** i);
  const total = weights.reduce((a, b) => a + b, 0);
  const takenShare = (weights[2] + weights[3]) / total;
  return takenShare * p + (1 - takenShare) * (1 - p);
}

/** Independent seeded outcomes, taken with probability p. */
export function randomOutcomes(rnd: () => number, p: number, n: number): boolean[] {
  return Array.from({ length: n }, () => rnd() < p);
}

export const PREDICTOR_LABELS: Record<PredictorKind, string> = {
  'static-taken': 'Always taken',
  'static-not-taken': 'Never taken',
  'one-bit': '1-bit',
  'two-bit': '2-bit counter',
  'two-level': 'Two-level history',
};

export const PREDICTOR_KINDS: readonly PredictorKind[] = ['static-taken', 'static-not-taken', 'one-bit', 'two-bit', 'two-level'];
