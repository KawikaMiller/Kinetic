import { useReducedMotion } from 'motion/react';
import { useCallback } from 'react';
import { SHAKE } from './motion';

type ShakeFrames = { x: number[] };

const STILL = { x: 0 };

/**
 * A "No!" shake for error feedback (a refused action, a crash, an OOM kill) that holds
 * still under prefers-reduced-motion. Stages render with reducedMotion="never" so their
 * teaching motion survives; feedback shakes aren't teaching motion, so they opt back in.
 *
 *   const { shake } = useShake();
 *   <motion.g animate={shake(world.crashed)} />
 *   <motion.div animate={{ opacity: 1, ...shake(alarm) }} />
 *
 * `allowed` is false under reduced motion, for imperative `animate(el, …)` calls.
 */
export function useShake(frames: ShakeFrames = SHAKE) {
  const allowed = !useReducedMotion();
  const shake = useCallback((active: boolean) => (active && allowed ? frames : STILL), [allowed, frames]);
  return { shake, allowed };
}
