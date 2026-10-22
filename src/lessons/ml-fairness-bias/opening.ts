import { DEFAULT } from './model';
import type { Criterion } from './model';
import type { OptionId } from './options';
import { SHARES, LABEL_NOISE } from './sources';

export type SceneId = 'threshold' | 'tradeoff' | 'options' | 'sources' | 'choose';

/** What each scene opens on. Every scene is keyed in the Stage, and a test switches through all of them. */
export const OPENING = {
  scene: 'threshold' as SceneId,
  threshold: { params: DEFAULT, t: 0.5 },
  tradeoff: { population: 'different' as 'different' | 'equal', scorer: 'imperfect' as 'imperfect' | 'perfect', tA: 0.5, tB: 0.5, criterion: 'tpr' as Criterion },
  options: { params: DEFAULT, picked: 'one' as OptionId },
  sources: { share: SHARES.default, noise: LABEL_NOISE.b.default },
};
