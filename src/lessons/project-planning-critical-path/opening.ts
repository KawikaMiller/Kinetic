import { BROOKS_DEFAULT } from './brooks';
import { PRESET } from './cpm';
import { UNCERTAINTY_DEFAULT } from './uncertainty';

export type SceneId = 'path' | 'crash' | 'people' | 'brooks' | 'risk';

/**
 * What each scene opens on. Every scene is keyed in the Stage, and a test switches through all of them. The
 * dependency pickers open on Release before Design, so pressing "Add dependency" on a fresh load shows a refused cycle.
 */
export const OPENING = {
  scene: 'path' as SceneId,
  path: { plan: PRESET, selected: null as string | null, note: null as string | null, from: 'release', to: 'design', newLabel: '', newDays: '3' },
  crash: { taskId: 'api', delta: 0 },
  people: { engineers: 2 },
  brooks: { params: BROOKS_DEFAULT },
  risk: { ...UNCERTAINTY_DEFAULT },
};
