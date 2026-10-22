import type { ReactNode } from 'react';
import type { ClassifyState } from '../../core/classify';
import { DEFAULT_PLACEMENT, defaultAssumptions, type Assumptions, type ComponentId } from './model';

export type SceneId = 'place' | 'cost' | 'story';

/** What every scene opens on. The placements, the chosen component and the assumptions live in the Stage: scenes 1 and 2 share them. */
export const OPENING = {
  scene: 'place' as SceneId,
  board: { answers: { ...DEFAULT_PLACEMENT }, checked: false } as ClassifyState,
  component: 'email' as ComponentId,
  assumptions: defaultAssumptions(),
};

/** What the Stage hands each scene. */
export interface SceneProps {
  picker: ReactNode;
  board: ClassifyState;
  onBoard: (next: ClassifyState) => void;
  component: ComponentId;
  onComponent: (id: ComponentId) => void;
  assumptions: Assumptions;
  onAssumptions: (next: Assumptions) => void;
}
