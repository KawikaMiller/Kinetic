import type { DefenceId } from './matrix';
import type { ScenarioId } from './provenance';
import type { LockWhen, Policy } from './resolve';

export type SceneId = 'spread' | 'integrity' | 'matrix' | 'provenance';
export const OPENING_SCENE: SceneId = 'spread';

/** The day the first scene's install runs, counted from the day the bad release is published. */
export const INSTALL_DAY = 2;

export interface SpreadState {
  policy: Policy;
  lockWhen: LockWhen;
}

export interface IntegrityState {
  /** The byte index the learner flipped, or null. */
  flipped: number | null;
  checkOn: boolean;
  installDay: number;
  cooldown: number;
}

export interface MatrixState {
  defences: DefenceId[];
  name: string;
}

export interface ProvenanceState {
  scenario: ScenarioId;
  query: string;
}

/** Every scene's opening state as a pure function (a fresh copy each time), so a test can switch through them and see none leaks into another. */
export const initialSpread = (): SpreadState => ({ policy: 'ranges', lockWhen: 'before' });
export const initialIntegrity = (): IntegrityState => ({ flipped: null, checkOn: true, installDay: INSTALL_DAY, cooldown: 0 });
export const initialMatrix = (): MatrixState => ({ defences: ['pin-lock', 'integrity'], name: 'tiny-pas' });
export const initialProvenance = (): ProvenanceState => ({ scenario: 'genuine', query: 'tiny-pad' });

export const INSTALL_DAY_RANGE = { min: 0, max: 8 } as const;
export const COOLDOWN_RANGE = { min: 0, max: 7 } as const;
