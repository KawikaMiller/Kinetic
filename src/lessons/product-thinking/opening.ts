import { DESIGN_DEFAULT } from './folklore';
import { POWER_DEFAULT } from './power';
import { GUARDRAIL_DEFAULT, SERIES_SEED, type MetricId } from './series';
import { REQUEST_LEVEL } from './tree';

export type SceneId = 'tree' | 'series' | 'power' | 'folklore';

/** What each scene opens on. Every scene is keyed in the Stage, and a test switches through all of them. */
export const OPENING = {
  scene: 'tree' as SceneId,
  tree: { level: REQUEST_LEVEL },
  series: { metric: 'signups' as MetricId, pushed: false, guardrails: GUARDRAIL_DEFAULT, seed: SERIES_SEED },
  power: { ...POWER_DEFAULT },
  folklore: { design: DESIGN_DEFAULT },
};
