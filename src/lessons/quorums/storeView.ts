/**
 * quorums, scene 3: the schedules the learner can run, and what a run looks like frame by frame. Pure.
 */
import { checkInvariants, linearizable } from '../../core/distSim';
import { mulberry32 } from '../../core/random';
import {
  BROKEN_SEED_NO_OVERLAP, TIMEOUT_MS, historyFor, homesOf, opsOf, readsSeeAcknowledgedWrites, storeCluster,
  type StoreCluster, type StoreConfig, type StoreOp, type StoreSetup,
} from './store';

export type Schedule = 'inflight' | 'sloppy' | 'seeded';
export const SCHEDULES: readonly { id: Schedule; label: string }[] = [
  { id: 'inflight', label: 'A write in flight' },
  { id: 'sloppy', label: 'A partition' },
  { id: 'seeded', label: 'Seeded run' },
];
export const STORE_N = 3;
/** How many seeds the "lowest seed that breaks it" button searches. */
export const SEARCH_SEEDS = 500;
export const DEFAULT_STORE: { schedule: Schedule; w: number; r: number; sloppy: boolean; repair: boolean; seed: number; faults: boolean } = {
  schedule: 'inflight', w: 2, r: 2, sloppy: false, repair: false, seed: BROKEN_SEED_NO_OVERLAP, faults: false,
};

/** How long each schedule runs, true ms. */
export const HORIZON_MS: Record<Schedule, number> = { inflight: 120, sloppy: 400, seeded: 400 };
const SLOPPY_PARTITION = { a: ['W', 'A', 'S1', 'S2'], b: ['X', 'B', 'C'], from: 0, to: 300 } as const;

/** A fixed network for the hand-built schedules: replies to a coordinator are instant, other links are listed or 5 ms. */
const fixed = (table: Record<string, number>) => (_rnd: () => number, from: string, to: string) => (['W', 'X', 'Y'].includes(to) ? 0 : (table[`${from}>${to}`] ?? 5));
const IN_FLIGHT = fixed({ 'W>B': 50, 'W>C': 50, 'X>B': 500, 'Y>A': 500 });

export interface StoreControls {
  schedule: Schedule;
  w: number;
  r: number;
  sloppy: boolean;
  repair: boolean;
  seed: number;
  faults: boolean;
}

export function setupFor(c: StoreControls): StoreSetup {
  const config: StoreConfig = { n: STORE_N, w: c.w, r: c.r, sloppy: c.sloppy, repair: c.repair };
  if (c.schedule === 'inflight') {
    // Version 1 reaches A at 5 ms and B, C at 50 ms. X reads at 10 ms and hears A and C first, Y reads at 20 ms and hears B and C first.
    return { seed: 0, config, writes: [0], reads: [{ at: 10, via: 'X' }, { at: 20, via: 'Y' }], latency: IN_FLIGHT, faults: {} };
  }
  if (c.schedule === 'sloppy') {
    return { seed: 0, config, writes: [0], reads: [{ at: 100, via: 'X' }, { at: 340, via: 'X' }], latency: fixed({}), partition: { ...SLOPPY_PARTITION, a: [...SLOPPY_PARTITION.a], b: [...SLOPPY_PARTITION.b] } };
  }
  return { seed: c.seed, config, faults: c.faults ? { loss: 0.1, duplicate: 0.15, chaos: true } : {} };
}

export interface ReplicaFrame {
  version: number;
  hints: Record<string, number>;
  up: boolean;
}
export interface StoreFrame {
  t: number;
  replicas: Record<string, ReplicaFrame>;
}

export interface StoreRun {
  frames: StoreFrame[];
  ops: StoreOp[];
  /** Why the acknowledged-write invariant broke, or null when it held through the run. */
  invariant: string | null;
  /** The linearizable checker's reason, or null when the history is linearizable. */
  linearizable: string | null;
  cluster: StoreCluster;
  end: number;
}

const names = (n: number): string[] => [...homesOf(n), 'S1', 'S2'];

export function runStore(setup: StoreSetup, until: number): StoreRun {
  const invariant = checkInvariants(storeCluster(setup), [readsSeeAcknowledgedWrites], { until });
  const c = storeCluster(setup);
  c.start();
  const frames: StoreFrame[] = [];
  const capture = () => {
    const snap = c.snapshot();
    frames.push({
      t: c.time,
      replicas: Object.fromEntries(
        names(setup.config.n).map((id) => {
          const s = snap.nodes[id].state;
          return [id, { version: s?.role === 'replica' ? s.version : 0, hints: s?.role === 'replica' ? s.hints : {}, up: snap.nodes[id].up }];
        }),
      ),
    });
  };
  capture();
  while (c.nextTime() <= until && c.step()) capture();
  const ops = opsOf(c.snapshot());
  return { frames, ops, invariant: invariant.ok ? null : invariant.message, linearizable: linearizable(historyFor(ops), { initial: 0 }), cluster: c, end: c.time };
}

/** The lowest seed below `limit` on which the seeded schedule breaks the acknowledged-write invariant for these controls, or null. */
export function lowestBrokenSeed(c: StoreControls, limit: number): number | null {
  for (let seed = 0; seed < limit; seed++) {
    const setup = setupFor({ ...c, schedule: 'seeded', seed });
    if (!checkInvariants(storeCluster(setup), [readsSeeAcknowledgedWrites], { until: HORIZON_MS.seeded }).ok) return seed;
  }
  return null;
}

/** A seeded "random" subset of the replicas, for the sets in scene 1. */
export function randomSet(n: number, size: number, seed: number): number[] {
  const rnd = mulberry32(seed);
  const pool = Array.from({ length: n }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size).sort((a, b) => a - b);
}

export const NO_QUORUM_AT = TIMEOUT_MS;
