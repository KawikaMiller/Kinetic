import type { NodeId } from './model';

export type SceneId = 'canvas' | 'story';

/** What each scene opens on. Every scene is keyed in the Stage, and a test switches through both. */
export const OPENING = {
  scene: 'canvas' as SceneId,
  /** Every node present. */
  removed: new Set<NodeId>() as ReadonlySet<NodeId>,
};
