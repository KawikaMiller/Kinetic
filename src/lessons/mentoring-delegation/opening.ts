import { DEFAULT_PRESET, SEED, startPlacement } from './model';

export type SceneId = 'board' | 'feedback' | 'matrix';

/** What each scene opens on. Every scene is keyed in the Stage, and a test switches through all of them. */
export const OPENING = {
  scene: 'board' as SceneId,
  board: { plan: DEFAULT_PRESET.plan, seed: SEED, presetId: DEFAULT_PRESET.id as string | null },
  matrix: { placed: startPlacement(), chip: 'start' as string | null },
};
