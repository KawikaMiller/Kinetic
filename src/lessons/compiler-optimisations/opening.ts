import type { LoopOptions, PassId } from './passes';
import { P1_DEFAULT_INPUT, P2_DEFAULT, REASSOC_DEFAULT } from './programs';

export type SceneId = 'ssa' | 'passes' | 'loop' | 'refusals';
export type RefusalCase = 'alias' | 'float' | 'reassoc';

/** The order the pass tray opens in: constant folding before propagation, so the first round has nothing to fold. */
export const DEFAULT_ORDER: readonly PassId[] = ['fold', 'propagate', 'cse', 'dce', 'algebra'];

/** Orders the preset chips load. */
export const ORDER_PRESETS: { id: string; label: string; order: readonly PassId[] }[] = [
  { id: 'fold-first', label: 'Fold first', order: DEFAULT_ORDER },
  { id: 'propagate-first', label: 'Propagate first', order: ['propagate', 'fold', 'cse', 'dce', 'algebra'] },
  { id: 'dce-first', label: 'DCE first', order: ['dce', 'fold', 'propagate', 'cse', 'algebra'] },
  { id: 'good', label: 'A good order', order: ['algebra', 'cse', 'propagate', 'fold', 'dce'] },
];

export const NO_LOOP_PASSES: LoopOptions = { inlining: false, hoisting: false, dce: false, deleteLoops: false };

/** Addresses of the aliasing scene: two names for two cells, or two names for one cell. */
export const ADDR = { p: 100, q: 200 };

export const FLOAT_CHIPS: readonly number[] = [5, -3, 0, Infinity, NaN];
export const INT_CHIPS: readonly number[] = [5, -3, 0];

export const OPENING = {
  scene: 'ssa' as SceneId,
  ssa: { branchTaken: true, selected: null as string | null },
  passes: { order: DEFAULT_ORDER, enabled: new Set<PassId>(DEFAULT_ORDER), fixedPoint: false, input: P1_DEFAULT_INPUT, step: 0 },
  loop: { options: NO_LOOP_PASSES, resultUsed: true, x: P2_DEFAULT.x, n: P2_DEFAULT.n },
  refusals: {
    kind: 'alias' as RefusalCase,
    alias: { same: false, promise: false },
    float: { ty: 'f64' as 'i32' | 'f64', x: 5 },
    reassoc: { ...REASSOC_DEFAULT, allow: false },
  },
};

export const INT32 = { min: -(2 ** 31), max: 2 ** 31 - 1 };
/** The loop trip count stays small enough that the interpreter answers instantly. */
export const N_MAX = 100_000;
export const X_RANGE = { min: -1000, max: 1000 };
export const DECIMAL_RANGE = { min: -1e300, max: 1e300 };

/** The x of the float scene when its type changes: a float that is not a 32-bit integer falls back to the opening value. */
export function xForType(x: number, ty: 'i32' | 'f64'): number {
  if (ty === 'f64') return x;
  return Number.isInteger(x) && x >= INT32.min && x <= INT32.max ? x : OPENING.refusals.float.x;
}
