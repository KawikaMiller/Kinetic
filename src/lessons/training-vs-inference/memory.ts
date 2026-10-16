/**
 * Scene 2: memory and compute, from the sizes typed. Every real-world figure is a named constant: the bytes per
 * parameter come from Rajbhandari et al. (ZeRO, 2020: from memory, verify), the 6 N D rule from Kaplan et al. (2020:
 * from memory, verify), and the sizes and the device memory are illustrative.
 */

export type Regime = 'inference' | 'training';

/** Bytes per parameter by component (decimal bytes). */
export interface Component {
  id: 'weights' | 'gradients' | 'optimizer';
  label: string;
  bytes: number;
}

/** Half-precision weights: 2 bytes each. */
export const WEIGHT_BYTES = 2;
/** Mixed-precision training with Adam: fp16 weights 2 + fp16 gradients 2 + (fp32 master weights 4 + two fp32 moments 8) = 16. */
export const TRAINING_BYTES = { weights: 2, gradients: 2, optimizer: 4 + 4 + 4 } as const;
export const TRAINING_BYTES_PER_PARAMETER = TRAINING_BYTES.weights + TRAINING_BYTES.gradients + TRAINING_BYTES.optimizer;

export const COMPONENTS: Record<Regime, readonly Component[]> = {
  inference: [{ id: 'weights', label: 'weights (half precision)', bytes: WEIGHT_BYTES }],
  training: [
    { id: 'weights', label: 'weights (half precision)', bytes: TRAINING_BYTES.weights },
    { id: 'gradients', label: 'gradients (half precision)', bytes: TRAINING_BYTES.gradients },
    { id: 'optimizer', label: 'master weights and Adam moments (full precision)', bytes: TRAINING_BYTES.optimizer },
  ],
};

export const bytesPerParameter = (regime: Regime): number => COMPONENTS[regime].reduce((s, c) => s + c.bytes, 0);

/** Illustrative sizes, in parameters. */
export const PARAMETER_STOPS: readonly number[] = [1e6, 1e7, 1e8, 1e9, 7e9, 1e10];
export const PARAMETER_MAX = 1e10;
export const PARAMETERS_DEFAULT = 1e9;
/** Illustrative device memory in decimal bytes (80 GB). */
export const DEVICE_BYTES = 80e9;
/** Training tokens D, illustrative. */
export const TOKEN_STOPS: readonly number[] = [1e9, 1e10, 1e11, 1e12];
export const TOKENS_DEFAULT = 1e10;

export interface MemoryFigures {
  perComponent: { id: Component['id']; label: string; bytesPerParameter: number; bytes: number }[];
  total: number;
  /** Does the total fit the illustrative device (before activations)? */
  fits: boolean;
}

export function memoryFigures(parameters: number, regime: Regime): MemoryFigures {
  const clamped = Math.min(parameters, PARAMETER_MAX);
  const perComponent = COMPONENTS[regime].map((c) => ({ id: c.id, label: c.label, bytesPerParameter: c.bytes, bytes: c.bytes * clamped }));
  const total = perComponent.reduce((s, c) => s + c.bytes, 0);
  return { perComponent, total, fits: total <= DEVICE_BYTES };
}

/** Training memory over inference memory for the same parameters: 16 / 2 = 8. */
export const trainingRatio = (): number => bytesPerParameter('training') / bytesPerParameter('inference');

/** Rule-of-thumb compute: training about 6 N D floating-point operations; one forward token about 2 N. */
export const trainingFlops = (parameters: number, tokens: number): number => 6 * parameters * tokens;
export const forwardFlopsPerToken = (parameters: number): number => 2 * parameters;
