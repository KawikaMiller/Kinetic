import { startState, type ThreatState } from './model';

export type SceneId = 'diagram' | 'mitigate' | 'sprint';

/** Every scene opens on this state. The learner's progress lives in the Stage and is shared by the first two scenes. */
export const OPENING = {
  scene: 'diagram' as SceneId,
  state: (): ThreatState => startState(),
  /** Nothing is selected until the learner picks an element, a cell or a threat. */
  selected: null as string | null,
};
