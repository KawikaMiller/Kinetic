/**
 * Serving with dynamic batching, as a fixed-tick seeded simulation (scenes 1 and 3). Requests arrive as a Poisson
 * stream at `lambda` per second (exponential gaps, drawn once from the seed so every batch setting sees the same
 * arrivals). One server takes a batch of b requests in `a + c b` ms. A batch goes when `maxBatch` requests are
 * queued or `maxWaitMs` has passed since the oldest queued request arrived. The state is a handful of numbers (the
 * queue is a range of arrival indices), so a long run costs no memory per tick. No wall-clock time is read, and no
 * real server was measured: every constant here is illustrative.
 */
import { percentile } from '../../core/sim';
import { createTickSim, type TickSim } from '../../core/simTick';
import { mulberry32 } from '../../core/random';

/** The fixed cost of one batch and the cost per request in it, in ms (illustrative). */
export const FIXED_MS = 20;
export const PER_ITEM_MS = 2;
export const TICK_MS = 0.25;
export const LATENCY_BUDGET_MS = 100;
export const HORIZON_MS = 5000;
/** The largest max batch the scene offers. */
export const MAX_BATCH_LIMIT = 32;
/** Scene 1's clock runs to this many ms. */
export const LOOP_HORIZON_MS = 4000;
export const ARRIVAL_SEED = 5;

export const serviceMs = (batch: number): number => FIXED_MS + PER_ITEM_MS * batch;
/** Requests per second a server taking batches of `batch` can sustain: batch / (a + c batch). */
export const capacityPerSecond = (batch: number): number => (1000 * batch) / serviceMs(batch);

export interface ServingParams {
  /** Requests per second. */
  lambda: number;
  maxBatch: number;
  maxWaitMs: number;
  /** The server does nothing from the first to the second time, in ms (a pause); null for none. */
  stall?: readonly [number, number] | null;
}

/** Arrival times in ms: a Poisson process at `lambda` per second over `horizonMs`, from `seed`. */
export function makeArrivals(seed: number, lambda: number, horizonMs: number): number[] {
  const rnd = mulberry32(seed);
  const times: number[] = [];
  let t = 0;
  for (;;) {
    t += (-Math.log(1 - rnd()) * 1000) / lambda;
    if (t >= horizonMs) return times;
    times.push(t);
  }
}

export interface Batch {
  /** Index in the arrival list of the first request, and how many are in the batch. */
  first: number;
  count: number;
  start: number;
  end: number;
}

interface Cons<T> {
  head: T;
  tail: Cons<T> | null;
}

export interface ServingState {
  tick: number;
  /** Time in ms. */
  t: number;
  /** Requests that have arrived, and the index of the oldest one still queued. */
  arrived: number;
  next: number;
  current: Batch | null;
  /** Finished batches, newest first. */
  done: Cons<Batch> | null;
  served: number;
  batches: number;
  busyMs: number;
}

export const initialServing = (): ServingState => ({ tick: 0, t: 0, arrived: 0, next: 0, current: null, done: null, served: 0, batches: 0, busyMs: 0 });

const stalledAt = (p: ServingParams, t: number) => !!p.stall && t > p.stall[0] && t <= p.stall[1];

/** One tick (TICK_MS) of the server. Returns a new state and leaves `s` alone. */
export function stepServing(s: ServingState, arrivals: readonly number[], p: ServingParams): ServingState {
  const t = (s.tick + 1) * TICK_MS;
  let { arrived, next, current, done, served, batches, busyMs } = s;
  while (arrived < arrivals.length && arrivals[arrived] <= t) arrived++;
  const stalled = stalledAt(p, t);
  if (current && stalled) current = { ...current, end: current.end + TICK_MS };
  if (current && current.end <= t) {
    done = { head: current, tail: done };
    batches++;
    served += current.count;
    current = null;
  }
  if (!current && !stalled) {
    const queued = arrived - next;
    if (queued > 0 && (queued >= p.maxBatch || t - arrivals[next] >= p.maxWaitMs)) {
      const count = Math.min(p.maxBatch, queued);
      current = { first: next, count, start: t, end: t + serviceMs(count) };
      next += count;
    }
  }
  if (current && !stalled) busyMs += TICK_MS;
  return { tick: s.tick + 1, t, arrived, next, current, done, served, batches, busyMs };
}

/** Run to `horizonMs` without keeping the history (long runs, sweeps and tests). */
export function runServing(arrivals: readonly number[], p: ServingParams, horizonMs: number): ServingState {
  let s = initialServing();
  const ticks = Math.round(horizonMs / TICK_MS);
  for (let i = 0; i < ticks; i++) s = stepServing(s, arrivals, p);
  return s;
}

export const queuedCount = (s: ServingState): number => s.arrived - s.next;
export const inServiceCount = (s: ServingState): number => s.current?.count ?? 0;

/** Finished batches, oldest first. */
export function finishedBatches(s: ServingState): Batch[] {
  const out: Batch[] = [];
  for (let c = s.done; c; c = c.tail) out.push(c.head);
  return out.reverse();
}

/** The latency of every finished request, in ms, in the order they finished. */
export function latencies(s: ServingState, arrivals: readonly number[]): number[] {
  return finishedBatches(s).flatMap((b) => Array.from({ length: b.count }, (_, i) => b.end - arrivals[b.first + i]));
}

export interface ServingStats {
  /** Finished requests per second of simulated time. */
  throughput: number;
  p50: number;
  p99: number;
  meanBatch: number;
  utilisation: number;
  queued: number;
  inService: number;
  served: number;
  arrived: number;
}

export function servingStats(s: ServingState, arrivals: readonly number[]): ServingStats {
  const sorted = latencies(s, arrivals).sort((a, b) => a - b);
  return {
    throughput: s.t === 0 ? 0 : (s.served * 1000) / s.t,
    p50: percentile(sorted, 0.5),
    p99: percentile(sorted, 0.99),
    meanBatch: s.batches === 0 ? 0 : s.served / s.batches,
    utilisation: s.t === 0 ? 0 : s.busyMs / s.t,
    queued: queuedCount(s),
    inService: inServiceCount(s),
    served: s.served,
    arrived: s.arrived,
  };
}

/** Requests that already took longer than `deadlineMs` by now: finished late, or still waiting past it. */
export function lateCount(s: ServingState, arrivals: readonly number[], deadlineMs: number): number {
  const finishedLate = latencies(s, arrivals).filter((l) => l > deadlineMs).length;
  let pending = 0;
  for (let i = s.next; i < s.arrived; i++) if (s.t - arrivals[i] > deadlineMs) pending++;
  if (s.current) for (let i = s.current.first; i < s.current.first + s.current.count; i++) if (s.t - arrivals[i] > deadlineMs) pending++;
  return finishedLate + pending;
}

/** Is the stream faster than a server with this batch size can drain? Then the queue grows without bound. */
export const overloaded = (lambda: number, maxBatch: number): boolean => lambda > capacityPerSecond(maxBatch);

/** The smallest batch size (up to `limit`) whose capacity meets the arrival rate, or null when none does. */
export function kneeBatch(lambda: number, limit: number): number | null {
  for (let b = 1; b <= limit; b++) if (capacityPerSecond(b) >= lambda) return b;
  return null;
}

/** The safety property of the simulation: no request is ever lost or made twice. */
export const conservation = (s: ServingState): string | null =>
  s.arrived === s.served + queuedCount(s) + inServiceCount(s) ? null : `arrived ${s.arrived} but served ${s.served} + queued ${queuedCount(s)} + in service ${inServiceCount(s)}`;

/** The serving simulation as a seeded tick sim with its history, so a scene can scrub to any time; it runs to `horizonMs`. */
export function servingSim(arrivals: readonly number[], p: ServingParams, horizonMs: number): TickSim<ServingState> {
  const sim = createTickSim<ServingState>({
    seed: ARRIVAL_SEED,
    init: initialServing,
    step: (s) => stepServing(s, arrivals, p),
    check: conservation,
  });
  sim.run(Math.round(horizonMs / TICK_MS));
  return sim;
}

/** The state at time `ms` of a sim made by `servingSim`. */
export const stateAtMs = (sim: TickSim<ServingState>, ms: number): ServingState => sim.at(Math.round(ms / TICK_MS)) ?? sim.state;
