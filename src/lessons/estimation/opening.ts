import { QUANTITIES, SUM_DEFAULT, THREE_POINT_DEFAULT, type Guess, type Statistic } from './model';

export type SceneId = 'cone' | 'sum' | 'three' | 'calibration' | 'talk';

/**
 * What each scene opens on, as pure functions or constants: every scene is keyed in the Stage, and a test switches
 * through all of them, so state from one scene cannot bleed into the next.
 */
export const OPENING = {
  scene: 'cone' as SceneId,
  cone: { show: 'none' as 'none' | 'cone' | 'flat' },
  sum: { ...SUM_DEFAULT, statistic: 'mode' as Statistic },
  three: {
    optimistic: String(THREE_POINT_DEFAULT.optimistic),
    likely: String(THREE_POINT_DEFAULT.likely),
    pessimistic: String(THREE_POINT_DEFAULT.pessimistic),
  },
  calibration: { guesses: (): Guess[] => QUANTITIES.map(() => ({ low: '', high: '' })), scored: false },
};
