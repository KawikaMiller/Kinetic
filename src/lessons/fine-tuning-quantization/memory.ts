/**
 * Parameter and memory arithmetic of fine-tuning-quantization: pure formulas of the learner's controls.
 * No real model is loaded; the parameter count `P` and the adapter fraction `f` are numbers the learner moves.
 */

export const DIM_LIMITS = { min: 1, max: 16_384 } as const;
export const DEFAULT_DIM = 4096;
export const DEFAULT_RANK = 8;
/** Bytes per trained parameter under mixed-precision Adam: from memory, repeated from the training-vs-inference lesson. */
export const TRAIN_BYTES_PER_PARAM = 16;
export const FROZEN_BITS = 16;
export const QUANT_BITS = 4;
export const PARAMS_DEFAULT = 7e9;
/** The slider value of P is in billions of parameters. */
export const PARAMS_BILLIONS = { min: 0.1, max: 100, step: 0.1 } as const;
/** f is in hundredths of a percent on its slider: 1 is 0.01%, 500 is 5%. */
export const FRACTION_HUNDREDTHS = { min: 1, max: 500, default: 50 } as const;
export const GROUP_SCALE_BITS = 16;

/** Weight memory by the one-line formula `parameters x bits / 8` (llm-serving writes the same line; the duplication is accepted). */
export const weightBytes = (params: number, bits: number): number => (params * bits) / 8;

export const fullParams = (dIn: number, dOut: number): number => dIn * dOut;
export const adapterParams = (dIn: number, dOut: number, r: number): number => r * (dIn + dOut);
export const adapterShare = (dIn: number, dOut: number, r: number): number => adapterParams(dIn, dOut, r) / fullParams(dIn, dOut);

/** The rank at which the adapter has as many parameters as the matrix; past it the adapter is bigger. */
export const crossoverRank = (dIn: number, dOut: number): number => (dIn * dOut) / (dIn + dOut);

/** A rank cannot exceed the smaller dimension of the matrix it updates. */
export const maxRank = (dIn: number, dOut: number): number => Math.min(dIn, dOut);

export interface MemoryLines {
  full: number;
  lora: number;
  quantised: number;
}

/** Bytes for the whole model: training every parameter, a frozen 16-bit base with trained adapters, a 4-bit base with trained adapters. Activations and scales are excluded. */
export function memoryLines(params: number, fraction: number): MemoryLines {
  const adapters = TRAIN_BYTES_PER_PARAM * fraction * params;
  return {
    full: TRAIN_BYTES_PER_PARAM * params,
    lora: weightBytes(params, FROZEN_BITS) + adapters,
    quantised: weightBytes(params, QUANT_BITS) + adapters,
  };
}

/** Bits per weight including one 16-bit scale per group of `groupSize` weights. */
export const bitsWithScales = (bits: number, groupSize: number): number => bits + GROUP_SCALE_BITS / groupSize;
