import { mulberry32 } from '../../core/random';
import { LAYERS, runSuite, type Bug, type Counts, type Layer, type TestRun } from './model';

/** Suite seconds shown per real second, so a slow suite visibly takes longer to play. */
export const TIME_SCALE = 40;
const SEED_BASE = 1000;

export interface World {
  runs: TestRun[];
  /** Suite seconds elapsed in the current run. */
  t: number;
  running: boolean;
  /** How many runs have been started (each one uses a new seed). */
  runCount: number;
}

export function createWorld(): World {
  return { runs: [], t: 0, running: false, runCount: 0 };
}

export function startRun(w: World, counts: Counts, bug: Bug | null): void {
  w.runCount += 1;
  w.runs = runSuite(counts, bug, mulberry32(SEED_BASE + w.runCount));
  w.t = 0;
  w.running = w.runs.length > 0;
}

export function advance(w: World, dt: number): void {
  if (!w.running) return;
  const end = w.runs[w.runs.length - 1].end;
  w.t = Math.min(end, w.t + dt * TIME_SCALE);
  if (w.t >= end) w.running = false;
}

export interface RunStats {
  t: number;
  total: number;
  done: number;
  flaky: number;
  failed: number;
  running: boolean;
  runCount: number;
  /** Suite seconds at which the first real failure finished, if any. */
  firstFailAt: number | null;
  firstFailLayer: Layer | null;
  flakyByLayer: Record<Layer, number>;
}

export function snapshot(w: World): RunStats {
  const done = w.runs.filter((r) => r.end <= w.t);
  const fail = done.find((r) => r.result === 'fail') ?? null;
  const flakyByLayer = Object.fromEntries(LAYERS.map((l) => [l, done.filter((r) => r.layer === l && r.result === 'flake').length])) as Record<Layer, number>;
  return {
    t: w.t,
    total: w.runs.length,
    done: done.length,
    flaky: done.filter((r) => r.result === 'flake').length,
    failed: done.filter((r) => r.result === 'fail').length,
    running: w.running,
    runCount: w.runCount,
    firstFailAt: fail?.end ?? null,
    firstFailLayer: fail?.layer ?? null,
    flakyByLayer,
  };
}
