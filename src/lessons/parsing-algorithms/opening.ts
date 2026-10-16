export type SceneId = 'topdown' | 'bottomup' | 'lockstep' | 'precedence';
export type ConflictPolicy = 'shift' | 'reduce';

const SAMPLE = 'id + id * id';

/** What each scene opens on. */
export const OPENING = {
  scene: 'topdown' as SceneId,
  topdown: { preset: 'layered', tokens: SAMPLE },
  bottomup: { preset: 'layered' },
  lockstep: { preset: 'll', tokens: SAMPLE, policy: 'shift' as ConflictPolicy },
  /** The precedence game opens on the table that gets the usual precedence wrong: reduce everywhere. */
  precedence: { tokens: SAMPLE, afterPlusSeesStar: 'reduce' as ConflictPolicy, afterStarSeesPlus: 'reduce' as ConflictPolicy, afterPlusSeesPlus: 'reduce' as ConflictPolicy, afterStarSeesStar: 'reduce' as ConflictPolicy },
};
