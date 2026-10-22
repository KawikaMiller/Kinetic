import type { ReactNode } from 'react';
import { emptyClassify, type ClassifyState } from '../../core/classify';
import { CAP, SERVICES, WEIGHT, type ServiceId, type TeamId } from './model';

export type SceneId = 'board' | 'numbers' | 'reference' | 'move';

/** What every scene opens on. The board and the cap live in the Stage (every scene reads them); the rest is per scene. */
export const OPENING = {
  scene: 'board' as SceneId,
  board: emptyClassify(SERVICES),
  cap: CAP.default as number,
  weight: WEIGHT.default as number,
  move: { service: 'payments' as ServiceId, team: 'A' as TeamId },
};

/** What the Stage hands each scene. */
export interface SceneProps {
  picker: ReactNode;
  board: ClassifyState;
  onBoard: (next: ClassifyState) => void;
  cap: number;
  onCap: (cap: number) => void;
}
