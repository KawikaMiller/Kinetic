/** Each scene's opening state, as a pure function of nothing, so a test can switch through every scene. */
import { COST_DEFAULT } from './cost';
import { DK_DEFAULT, DK_STOPS } from './scaling';
import { EMBEDDINGS } from './tokens';

export const headOpening = () => ({ embeddings: EMBEDDINGS.map((r) => [...r]), token: 1 });
export const scaleOpening = () => ({ stop: DK_STOPS.indexOf(DK_DEFAULT) });
export const headsOpening = () => ({ causal: false, positions: false, twoHeads: false, order: null as number[] | null, shuffles: 0 });
export const lookupOpening = () => ({ seed: 1, item: 0, next: 1, mix: 0 });
export const costOpening = () => ({ ...COST_DEFAULT });
