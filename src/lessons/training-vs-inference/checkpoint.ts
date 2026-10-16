/**
 * Scene 5: checkpoint intervals. A job of 10,000 one-second steps (illustrative) on hardware that fails at random
 * with a mean time between failures M. After every K steps the job pays a checkpoint cost C; a failure throws away
 * the steps since the last checkpoint. A seeded Monte Carlo (100 runs per K) gives the expected total time, and
 * the classical Young/Daly estimate sqrt(2 C M) (from memory, verify) is drawn next to the simulated minimum.
 */
import { mulberry32, type Rnd } from '../../core/random';

export const JOB_STEPS = 10_000;
export const STEP_SECONDS = 1;
export const RUNS = 100;
export const CHECKPOINT_SEED = 7;
/** A run that has not finished after this many times the ideal time is stopped there (and counted as unfinished). */
export const GIVE_UP_FACTOR = 100;
/** The intervals tried, in steps. */
export const INTERVALS: readonly number[] = [25, 50, 100, 200, 300, 400, 500, 700, 1000, 1500, 2500, 5000, 10000];
export const CHECKPOINT_DEFAULT = { mtbf: 3600, cost: 30, interval: 500 } as const;
export const MTBF_STOPS: readonly number[] = [600, 1200, 1800, 3600, 7200, 14400, 28800];
export const COST_STOPS: readonly number[] = [5, 10, 20, 30, 60, 120];

export interface CheckpointModel {
  /** Mean time between failures, seconds. */
  mtbf: number;
  /** Seconds one checkpoint takes. */
  cost: number;
}

const exponential = (rnd: Rnd, mean: number) => -Math.log(1 - rnd()) * mean;

/**
 * One run: total seconds until all steps are done. Work is cut into cycles of K steps and a checkpoint (the last
 * cycle may be shorter); a failure inside a cycle loses it and the run restarts that cycle with a fresh failure clock.
 */
export function simulateRun({ mtbf, cost }: CheckpointModel, interval: number, rnd: Rnd): number {
  let clock = 0;
  let done = 0;
  let untilFailure = exponential(rnd, mtbf);
  const giveUp = GIVE_UP_FACTOR * JOB_STEPS * STEP_SECONDS;
  while (done < JOB_STEPS && clock < giveUp) {
    const steps = Math.min(interval, JOB_STEPS - done);
    const cycle = steps * STEP_SECONDS + cost;
    if (untilFailure < cycle) {
      clock += untilFailure;
      untilFailure = exponential(rnd, mtbf);
    } else {
      clock += cycle;
      untilFailure -= cycle;
      done += steps;
    }
  }
  return Math.min(clock, giveUp);
}

export interface IntervalResult {
  interval: number;
  /** Mean total seconds over the runs. */
  expected: number;
  /** Runs that were stopped at GIVE_UP_FACTOR times the ideal time without finishing. */
  unfinished: number;
}

/** Expected total time for each interval, from `runs` seeded runs per interval (the same failure stream for every interval). */
export function sweepIntervals(model: CheckpointModel, runs = RUNS, intervals: readonly number[] = INTERVALS, seed = CHECKPOINT_SEED): IntervalResult[] {
  return intervals.map((interval) => {
    let total = 0;
    let unfinished = 0;
    for (let r = 0; r < runs; r++) {
      const seconds = simulateRun(model, interval, mulberry32(seed * 100_003 + r));
      total += seconds;
      if (seconds >= GIVE_UP_FACTOR * JOB_STEPS * STEP_SECONDS) unfinished++;
    }
    return { interval, expected: total / runs, unfinished };
  });
}

/** The classical estimate of the best interval: sqrt(2 C M) seconds of work, as steps. */
export const youngDaly = ({ mtbf, cost }: CheckpointModel): number => Math.sqrt(2 * cost * mtbf) / STEP_SECONDS;

export const bestInterval = (results: readonly IntervalResult[]): IntervalResult => results.reduce((a, b) => (b.expected < a.expected ? b : a));

/** Time the job would take with no failures and no checkpoints. */
export const idealSeconds = JOB_STEPS * STEP_SECONDS;

/**
 * True when one cycle (K steps and a checkpoint) is longer than the mean time between failures: a cycle then
 * usually fails before it finishes (it completes with probability exp(-cycle / M) < 37%), so most work is redone.
 */
export const noProgress = ({ mtbf, cost }: CheckpointModel, interval: number): boolean => mtbf < interval * STEP_SECONDS + cost;
