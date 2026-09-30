import { useCallback, useEffect, useRef, useState } from 'react';
import { useLoop } from './hooks';

export interface SimulationOptions<W, S> {
  /** Build a fresh world. Called lazily on first use and on reset(). */
  create: () => W;
  /** Advance the world by dt seconds, mutating it in place. dt is already capped by useLoop. */
  step: (world: W, dt: number) => void;
  /** Cheap, plain-data view of the world for React to render (stats, labels). */
  snapshot: (world: W) => S;
  /** Seconds between snapshots. Default 0.3: plenty for numbers, cheap for React. */
  snapshotEvery?: number;
  /** Runs right after each snapshot, e.g. to narrate "insight" captions from it. */
  onSnapshot?: (world: W, snap: S) => void;
  initiallyPaused?: boolean;
}

/**
 * A live simulation: a mutable world in a ref, advanced every animation frame,
 * with a throttled snapshot in React state. React never re-renders per frame.
 *
 * `world()` is a stable accessor. Call it from handlers, effects and draw
 * callbacks, never during render: render from `snap` instead.
 *
 * Canvas lessons redraw on their own loop, registered after this hook so it
 * runs after each step:
 *   const sim = useSimulation({ ... });
 *   const { wrapRef, canvasRef, redraw } = useCanvas((ctx, w, h) => draw(ctx, w, h, sim.world()));
 *   useLoop(redraw, !sim.paused);
 */
export function useSimulation<W, S>(o: SimulationOptions<W, S>) {
  const opts = useRef(o);
  useEffect(() => {
    opts.current = o;
  });
  const worldRef = useRef<W | null>(null);
  const sinceSnap = useRef(Infinity);
  const [snap, setSnap] = useState<S | null>(null);
  const [paused, setPaused] = useState(o.initiallyPaused ?? false);

  const world = useCallback(() => (worldRef.current ??= opts.current.create()), []);

  const takeSnapshot = useCallback(() => {
    const w = world();
    const s = opts.current.snapshot(w);
    setSnap(s);
    opts.current.onSnapshot?.(w, s);
  }, [world]);

  // First snapshot on mount, so a sim that starts paused still has stats to render.
  useEffect(() => {
    takeSnapshot();
  }, [takeSnapshot]);

  useLoop((dt) => {
    const w = world();
    opts.current.step(w, dt);
    sinceSnap.current += dt;
    if (sinceSnap.current >= (opts.current.snapshotEvery ?? 0.3)) {
      sinceSnap.current = 0;
      takeSnapshot();
    }
  }, !paused);

  const reset = useCallback(() => {
    worldRef.current = opts.current.create();
    sinceSnap.current = 0;
    takeSnapshot();
  }, [takeSnapshot]);

  /**
   * Re-read `snap` right now, even while paused: call it after an action changes the
   * world. Skips `onSnapshot`, so the action's own caption isn't replaced by an insight.
   */
  const refresh = useCallback(() => setSnap(opts.current.snapshot(world())), [world]);

  const togglePause = useCallback(() => setPaused((p) => !p), []);

  return { world, snap, paused, setPaused, togglePause, reset, refresh };
}
