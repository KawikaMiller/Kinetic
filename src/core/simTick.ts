/**
 * A fixed-tick, seeded simulation. The model advances in whole ticks from one seeded random
 * stream and never reads the wall clock, so a test, a step-player frame and the live view all
 * see the same trace: same seed, same history. The history is kept, so scrubbing to tick k
 * is a lookup, not a re-run. `useTickSim` (./useTickSim) feeds it from animation frames.
 *
 *   const sim = createTickSim({
 *     seed: 7,
 *     init: (rnd) => ({ queue: 0, served: 0 }),
 *     step: (s, rnd) => ({ queue: s.queue + (rnd() < 0.6 ? 1 : 0) - (rnd() < 0.7 ? 1 : 0), served: s.served }),
 *     check: (s) => (s.queue < 0 ? 'negative queue' : null),
 *   });
 *   sim.run(100);
 *   sim.at(40); // the state after 40 ticks
 */
import { mulberry32, type Rnd } from './random';

export interface TickSimSpec<S> {
  seed: number;
  /** The state at tick 0. Receives the sim's random stream. */
  init: (rnd: Rnd) => S;
  /**
   * The state after `tick` (1 for the first step). Pure in the sense that it must return a
   * new state and leave `state` alone: the history holds every state, and mutating one would
   * rewrite the past. All randomness comes from `rnd`.
   */
  step: (state: S, rnd: Rnd, tick: number) => S;
  /** A safety property, checked on every state including tick 0: a message when it is broken, else null. */
  check?: (state: S, tick: number) => string | null;
}

export interface TickViolation {
  tick: number;
  message: string;
}

export interface TickSim<S> {
  /** Every state so far: `history[k]` is the state after k ticks, `history[0]` the initial one. Do not mutate. */
  readonly history: readonly S[];
  /** Ticks run so far (history.length - 1). */
  readonly ticks: number;
  /** The latest state. */
  readonly state: S;
  /** The first tick at which `check` failed, or null. Once set, the sim stops advancing (the counterexample stays on screen). */
  readonly violation: TickViolation | null;
  /** Advance up to `n` ticks (fewer if a check fails); returns the ticks actually run. */
  run: (n: number) => number;
  /** The state after `tick` ticks, running forward first if needed. Null if a violation stopped the run before it. */
  at: (tick: number) => S | null;
  /** Start over from tick 0 (same seed, so the same trace). */
  reset: () => void;
}

export function createTickSim<S>(spec: TickSimSpec<S>): TickSim<S> {
  let rnd: Rnd;
  let history: S[];
  let violation: TickViolation | null;

  const verify = (state: S, tick: number) => {
    const message = spec.check?.(state, tick) ?? null;
    if (message !== null) violation = { tick, message };
  };

  const reset = () => {
    rnd = mulberry32(spec.seed);
    history = [spec.init(rnd)];
    violation = null;
    verify(history[0], 0);
  };

  const run = (n: number) => {
    let done = 0;
    while (done < n && !violation) {
      const tick = history.length;
      const next = spec.step(history[tick - 1], rnd, tick);
      history.push(next);
      verify(next, tick);
      done++;
    }
    return done;
  };

  reset();
  return {
    get history() {
      return history;
    },
    get ticks() {
      return history.length - 1;
    },
    get state() {
      return history[history.length - 1];
    },
    get violation() {
      return violation;
    },
    run,
    at(tick) {
      if (tick > history.length - 1) run(tick - (history.length - 1));
      return tick >= 0 && tick < history.length ? history[tick] : null;
    },
    reset,
  };
}

/**
 * How many whole ticks a frame owes. `carry` is the time left over from earlier frames; the
 * result is the ticks to run now and the new carry. At most `maxTicks` run per frame, and the
 * time beyond that is dropped (carry stays under one tick) so a slow frame can't snowball.
 */
export function ticksDue(carry: number, frameDt: number, dt: number, maxTicks: number): { ticks: number; carry: number } {
  const total = carry + frameDt;
  const wanted = Math.floor(total / dt);
  const ticks = Math.min(wanted, maxTicks);
  return { ticks, carry: ticks === wanted ? total - ticks * dt : 0 };
}
