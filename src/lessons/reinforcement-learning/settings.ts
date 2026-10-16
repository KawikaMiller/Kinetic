/** Opening states of the five scenes (pure data, tested against the try-this entries). */
import type { PresetId } from './presets';
import type { Brush } from './world';

export const SCENES = ['world', 'learn', 'exact', 'explore', 'approx'] as const;
export type SceneId = (typeof SCENES)[number];

export const WORLD_BRUSH: Brush = 'wall';
export const LEARN_DEFAULT = { alpha: 0.3, gamma: 0.97, epsilon: 1, decay: true, seed: 1, perPress: 100 } as const;
/** The exact-answer scene trains with the learn scene's settings, fixed, for a number of episodes the learner sets. */
export const EXACT_DEFAULT = { episodes: 3000 } as const;
export const EXPLORE_DEFAULT = { preset: 'greedy' as PresetId };
export const APPROX_DEFAULT = { maze: false, updates: 5000 } as const;

export const ALPHA_MIN = 0.05;
export const ALPHA_MAX = 1;
export const GAMMA_MIN = 0.5;
export const GAMMA_MAX = 1;
export const EPSILON_MAX = 1;
export const PER_PRESS = [1, 10, 100, 1000] as const;
export const EPISODES_CAP = 20000;
export const EXACT_MAX = 6000;
export const SMOOTH_WINDOW = 20;
