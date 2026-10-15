import { ticksDue, type TickSim } from './simTick';
import { useSimulation } from './useSimulation';

/** Seconds of real time per sim tick by default (30 ticks a second), and the most ticks one frame may run. */
export const DEFAULT_TICK_SECONDS = 1 / 30;
export const DEFAULT_MAX_TICKS_PER_FRAME = 5;

export interface TickSimOptions<S, Snap> {
  /** Build a fresh sim (called lazily, and again on reset). */
  make: () => TickSim<S>;
  /** Real seconds per tick. Default 1/30. */
  dt?: number;
  /** Cap on ticks per animation frame; the excess is dropped, never queued. Default 5. */
  maxTicksPerFrame?: number;
  /** Plain-data view for React, as in useSimulation. */
  snapshot: (sim: TickSim<S>) => Snap;
  snapshotEvery?: number;
  onSnapshot?: (sim: TickSim<S>, snap: Snap) => void;
  initiallyPaused?: boolean;
}

interface TickWorld<S> {
  sim: TickSim<S>;
  carry: number;
}

/**
 * `useSimulation` for a `createTickSim` model: the world is the tick sim plus the leftover
 * time, and each frame runs whole fixed ticks. Wall-clock time only decides *how many* ticks
 * run, never what they do, so the live view shows the same trace as a test with that seed.
 * `world().sim` reaches the sim (from handlers, effects and draw callbacks, never render).
 */
export function useTickSim<S, Snap>(o: TickSimOptions<S, Snap>) {
  const dt = o.dt ?? DEFAULT_TICK_SECONDS;
  const max = o.maxTicksPerFrame ?? DEFAULT_MAX_TICKS_PER_FRAME;
  return useSimulation<TickWorld<S>, Snap>({
    create: () => ({ sim: o.make(), carry: 0 }),
    step: (world, frameDt) => {
      const due = ticksDue(world.carry, frameDt, dt, max);
      world.carry = due.carry;
      world.sim.run(due.ticks);
    },
    snapshot: (world) => o.snapshot(world.sim),
    onSnapshot: o.onSnapshot && ((world, snap) => o.onSnapshot?.(world.sim, snap)),
    snapshotEvery: o.snapshotEvery,
    initiallyPaused: o.initiallyPaused,
  });
}
