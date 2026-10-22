import type { ReactNode } from 'react';

export type SceneId = 'panel' | 'loop' | 'calibrate' | 'debrief';

/** Scene 1's controls: the panel and the hire rate (a whole percent). */
export interface PanelState {
  k: number;
  sigma: number;
  hire: number;
  rho: number;
}

/** The lesson's default seed: shown on screen, shared by every scene. */
export const DEFAULT_SEED = 1;

/** What every scene opens on. The seed and scene 1's controls live in the Stage and survive a scene switch. */
export const OPENING = {
  scene: 'panel' as SceneId,
  seed: DEFAULT_SEED,
  panel: { k: 3, sigma: 1.2, hire: 10, rho: 0 } as PanelState,
};

/** What the Stage hands each scene. */
export interface SceneProps {
  picker: ReactNode;
  seed: number;
  onSeed: (seed: number) => void;
}
