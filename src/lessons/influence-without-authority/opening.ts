import type { ReactNode } from 'react';
import { EMPTY_PLAN, type Slot } from './model';

export type SceneId = 'map' | 'meeting' | 'leaves';

/** The three conversation slots and whether the meeting has been run: scene 1's state, kept by the Stage. */
export interface PlanState {
  slots: readonly Slot[];
  ran: boolean;
}

export const OPENING = {
  scene: 'map' as SceneId,
  plan: { slots: EMPTY_PLAN, ran: false } as PlanState,
};

/** What the Stage hands each scene. */
export interface SceneProps {
  picker: ReactNode;
}
