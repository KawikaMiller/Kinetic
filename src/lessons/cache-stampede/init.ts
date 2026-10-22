import { BROKEN_SEED, DEFAULT_LAMBDA, DEFAULT_RECOMPUTE_MS, NO_MITIGATION, type Mitigations } from './model';

/** Each scene's opening state is a pure function: a test switches through all three and checks it against the try-this text. */

export interface ExpiryState {
  lambda: number;
  recomputeMs: number;
  seed: number;
}

export const initialExpiry = (): ExpiryState => ({ lambda: DEFAULT_LAMBDA, recomputeMs: DEFAULT_RECOMPUTE_MS, seed: BROKEN_SEED });

export interface MitigationState extends ExpiryState {
  mitigations: Mitigations;
  jitterPct: number;
}

/** Scene 2 opens on the same herd as scene 1, with no mitigation on and the keys' TTLs synchronised. */
export const initialMitigation = (): MitigationState => ({ ...initialExpiry(), mitigations: { ...NO_MITIGATION }, jitterPct: 0 });

export interface SingleflightState {
  lambda: number;
  seed: number;
  releaseEarly: boolean;
}

export const initialSingleflight = (): SingleflightState => ({ lambda: DEFAULT_LAMBDA, seed: BROKEN_SEED, releaseEarly: false });

export const VIRAL_LAMBDA = 1500;
export const SLOW_QUERY_MS = 1500;
