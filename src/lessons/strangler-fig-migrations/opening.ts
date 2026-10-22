import { initialFacade } from './model';

export type SceneId = 'facade' | 'story' | 'ledger';

/** What each scene opens on. Every scene is keyed in the Stage, and a test switches through all of them. */
export const OPENING = {
  scene: 'facade' as SceneId,
  facade: initialFacade(),
  ledger: { filter: 'all' as 'all' | 'calm' },
};
