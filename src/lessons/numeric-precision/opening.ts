import type { Granularity, Mode, Representation } from './cart';
import type { FunctionId } from './cancellation';
import { K_DEFAULT } from './cancellation';
import type { GeneratorId, Precision } from './summation';

export type SceneId = 'summation' | 'cancellation' | 'cents';

/** Presets of the summation scene. */
export const SUM_PRESETS: { id: string; label: string; generator: GeneratorId; n: number; precision: Precision }[] = [
  { id: 'ten-dimes', label: 'Ten dimes', generator: 'dimes', n: 10, precision: 'f64' },
  { id: 'million-steps', label: 'A million small steps (200,000 in float32)', generator: 'dimes', n: 200_000, precision: 'f32' },
  { id: 'blind-spot', label: "Kahan's blind spot, float64", generator: 'blind-spot', n: 4, precision: 'f64' },
];

export const OPENING = {
  scene: 'summation' as SceneId,
  summation: { generator: 'dimes' as GeneratorId, n: 10, precision: 'f64' as Precision, seed: 42 },
  cancellation: { id: 'sqrt-difference' as FunctionId, k: K_DEFAULT },
  cents: { items: 200, bp: 500, mode: 'half-up' as Mode, granularity: 'line' as Granularity, representation: 'float' as Representation, seed: 42 },
};

/** A receipt long enough for float rounding to show. */
export const LONG_RECEIPT = { items: 200, bp: 500 };
