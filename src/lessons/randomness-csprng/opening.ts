import type { LcgParams } from './lcg';
import { DEFAULT_RANGE } from './bias';
import type { Coarseness } from './recovery';

export type SceneId = 'pairs' | 'planes' | 'recover' | 'seed' | 'sources' | 'bias';

/** Every scene opens here, so each try-this starts from a known state. */
export const OPENING = {
  scene: 'pairs' as SceneId,
  pairs: { preset: 'toy' as LcgParams['id'], seed: 0, count: 200 },
  planes: { count: 2000, degrees: 30, seed: 1 },
  recover: { seed: 12_345, revealed: 0 },
  seed: { coarseness: 'seconds' as Coarseness, window: 'day' },
  bias: { range: DEFAULT_RANGE },
};
