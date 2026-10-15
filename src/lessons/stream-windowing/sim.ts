/**
 * stream-windowing: the engine as a seeded tick simulation (one tick, one arrival), so scrubbing is free and the safety check
 * runs after every tick. The check is `checkStream`; a violation stops the run and stays on screen.
 */
import { createTickSim, type TickSim } from '../../core/simTick';
import { checkStream, newStream, step, type Stream, type StreamCfg } from './engine';
import type { Evt } from './events';

export type StreamSim = TickSim<Stream>;

export const makeSim = (seed: number, arrivals: readonly Evt[], cfg: StreamCfg): StreamSim =>
  createTickSim<Stream>({ seed, init: () => newStream(arrivals, cfg), step: (s) => step(s), check: (s) => checkStream(s) });
