/** Opening states of the five scenes (pure data, tested against the try-this entries). */
export const SCENES = ['matrix', 'factorise', 'neighbours', 'funnel', 'loop'] as const;
export type SceneId = (typeof SCENES)[number];

export const MATRIX_DEFAULT = { showTruth: false, rateAs: 4 } as const;
export const FACTOR_DEFAULT = { factors: 6, lambda: 0, learningRate: 0.05, epochs: 150, seed: 1, showTruth: false } as const;
/** The comparison model in the neighbours scene and the funnel's scorer: fixed, shown on screen. */
export const REFERENCE_MF = { factors: 2, lambda: 0.02, learningRate: 0.05, epochs: 150, seed: 1 } as const;
export const NEIGHBOUR_DEFAULT = { minOverlap: 2 } as const;
export const FUNNEL_DEFAULT = { user: 0, popularityPct: 0 } as const;
export const LOOP_DEFAULT = { exploration: false, seed: 1 } as const;

export const LAMBDA_MAX = 0.2;
export const RATE_MIN = 0.01;
export const RATE_MAX = 0.1;
export const EPOCHS_MAX = 300;
