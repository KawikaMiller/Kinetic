import { DEFAULT_SCENARIO, DEFAULT_WATCHDOG, type Protocol, type Scenario, type TaskId } from './sched';

export type Variant = 'generic' | 'pathfinder';

/** What the two scenes call the tasks. The Pathfinder names are from memory and simplified; the scheduler underneath is the same. */
export const NAMES: Record<Variant, Record<TaskId, string>> = {
  generic: { H: 'H', M: 'M', L: 'L' },
  pathfinder: { H: 'bus management', M: 'communications', L: 'meteorological data' },
};

export interface SchedOpening {
  scenario: Scenario;
  protocol: Protocol;
  /** The seed the scenario came from, or null for the hand-picked one. */
  fromSeed: number | null;
  watchdog: number;
}

/** What each scene opens on, as pure functions the tests walk. The generic scene starts with no protocol and a missed deadline; the Pathfinder scene with no protocol and a reset. */
export const genericOpening = (): SchedOpening => ({ scenario: { ...DEFAULT_SCENARIO }, protocol: 'none', fromSeed: null, watchdog: DEFAULT_WATCHDOG });
export const pathfinderOpening = (): SchedOpening => ({ scenario: { ...DEFAULT_SCENARIO }, protocol: 'none', fromSeed: null, watchdog: DEFAULT_WATCHDOG });
export const openingOf = (variant: Variant): SchedOpening => (variant === 'generic' ? genericOpening() : pathfinderOpening());

export const SCENE_OPENINGS = { generic: genericOpening, pathfinder: pathfinderOpening } as const;
