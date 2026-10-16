import { DEFAULT_MIX_INDEX, MIXES } from './pool';
import { TOTAL_WORK, type Params } from './forkjoin';
import type { StarveParams } from './starve';

/** What each scene opens on, as pure functions the tests walk. */

export interface PoolOpening {
  cores: number;
  mixIndex: number;
  pool: number;
}
export const poolOpening = (): PoolOpening => ({ cores: 4, mixIndex: DEFAULT_MIX_INDEX, pool: 4 });
export const mixRatio = (o: PoolOpening): number => MIXES[o.mixIndex];

export type StealModel = 'greedy' | 'slow';
export interface ForkOpening {
  params: Params;
  model: StealModel;
}
export const forkOpening = (): ForkOpening => ({
  params: { n: TOTAL_WORK, grain: 8, ratioPct: 50, forkCost: 0, workers: 4, steal: true, stealLatency: 0, seed: 1 },
  model: 'greedy',
});

/** The grain scene: spawn cost is a named constant of the scene, so the sweep means one thing. */
export const FORK_COST = 8;
export interface GrainOpening {
  workers: number;
  grain: number;
  seed: number;
}
export const grainOpening = (): GrainOpening => ({ workers: 4, grain: 16, seed: 1 });

export const starveOpening = (): StarveParams => ({ workers: 3, depth: 3, helping: false, seed: 1 });

export const SCENE_OPENINGS = { pool: poolOpening, fork: forkOpening, grain: grainOpening, starve: starveOpening } as const;
