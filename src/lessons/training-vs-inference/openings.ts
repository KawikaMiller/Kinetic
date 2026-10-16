/** Each scene's opening state, as a pure function of nothing, so a test can switch through every scene. */
import { CHECKPOINT_DEFAULT } from './checkpoint';
import { PARAMETER_STOPS, PARAMETERS_DEFAULT, TOKEN_STOPS, TOKENS_DEFAULT, type Regime } from './memory';
import { HORIZON_MS } from './serving';
import { BATCH_SIZES, type Preprocessing } from './training';

export const loopOpening = () => ({ batch: BATCH_SIZES[0] as number, stall: false });
export const memoryOpening = () => ({ stop: PARAMETER_STOPS.indexOf(PARAMETERS_DEFAULT), regime: 'training' as Regime, tokenStop: TOKEN_STOPS.indexOf(TOKENS_DEFAULT) });
export const servingOpening = () => ({ lambda: 120, maxBatch: 8, maxWaitMs: 10, now: HORIZON_MS });
export const skewOpening = () => ({ how: 'matching' as Preprocessing, drift: 0 });
export const checkpointOpening = () => ({ ...CHECKPOINT_DEFAULT });
