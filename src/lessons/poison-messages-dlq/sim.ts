// The live wrapper around model.ts: real time in, fixed ticks out, plus the snapshot React renders.
import { createSampler } from '../../core/sim';
import {
  createWorld, isDown, OUTAGE_SCENARIO, POISON_SCENARIO, REDRIVE_SCENARIO, redriveStart, stats, tick, TICK, toSeconds, type DlqEntry, type Scenario, type Settings,
  type SimEvent, type Stats, type World,
} from './model';

export type SceneId = 'poison' | 'transient' | 'redrive';

/** Simulated seconds that pass per real second. */
export const TIME_SCALE = 3;
/** Cells shown in the lane: the message being handled and the ones behind it. */
export const LANE_CELLS = 12;
/** Processed ids kept for the history row. */
export const HISTORY = 14;
/** DLQ rows listed before "and N more". */
export const DLQ_ROWS = 6;
const LAG_EVERY = 0.5;
const LAG_CAP = 60;

export const SCENARIOS: Record<SceneId, Scenario> = { poison: POISON_SCENARIO, transient: OUTAGE_SCENARIO, redrive: REDRIVE_SCENARIO };

/** Float noise allowed when counting whole ticks (20 ticks of 0.05 s must make exactly one second). */
const TICK_EPSILON = 1e-9;

export interface Live {
  world: World;
  /** Ticks owed but not yet run (less than one after every advance). */
  acc: number;
  lag: ReturnType<typeof createSampler<number>>;
}

export function createLive(scene: SceneId, settings: Settings): Live {
  const world = scene === 'redrive' ? redriveStart(settings) : createWorld(SCENARIOS[scene], settings);
  return { world, acc: 0, lag: createSampler<number>({ every: LAG_EVERY, cap: LAG_CAP }) };
}

/** Advance by real seconds `dt` (scaled): whole ticks only, the remainder carried to the next frame. */
export function advance(l: Live, dt: number): SimEvent[] {
  l.acc += (dt * TIME_SCALE) / TICK;
  while (l.acc >= 1 - TICK_EPSILON) {
    l.acc -= 1;
    tick(l.world);
    l.lag.tick(toSeconds(l.world.tick), () => l.world.queue.length);
  }
  return l.world.events.splice(0);
}

export interface LaneCell {
  id: number;
  /** A bad message that will fail (the bug is not fixed). */
  poison: boolean;
}

export interface Snapshot {
  stats: Stats;
  time: number;
  lane: LaneCell[];
  /** Waiting beyond the cells shown. */
  more: number;
  headId: number | null;
  headAttempts: number;
  /** Seconds until the head may be tried again (0 when it is its turn or nothing waits). */
  retryIn: number;
  paused: boolean;
  down: boolean;
  dlq: DlqEntry[];
  processed: { id: number; redriven: boolean }[];
  /** Each redriven message that has been processed, and the highest id already done when it was. */
  redriven: { id: number; after: number }[];
  lagHistory: readonly number[];
}

export function snapshot(l: Live): Snapshot {
  const { world: w } = l;
  const lane = w.queue.slice(0, LANE_CELLS).map((m) => ({ id: m.id, poison: w.scenario.poison.has(m.id) && !w.settings.bugFixed }));
  return {
    stats: stats(w),
    time: toSeconds(w.tick),
    lane,
    more: Math.max(0, w.queue.length - LANE_CELLS),
    headId: w.queue[0]?.id ?? null,
    headAttempts: w.headAttempts,
    retryIn: w.queue[0] && w.headReadyAt > w.tick ? toSeconds(w.headReadyAt - w.tick) : 0,
    paused: w.paused,
    down: isDown(w.scenario, w.tick),
    dlq: [...w.dlq],
    processed: w.processed.slice(-HISTORY).map((id) => ({ id, redriven: w.redrivenProcessed.has(id) })),
    redriven: redrivenAfter(w.processed, w.redrivenProcessed),
    lagHistory: [...l.lag.values],
  };
}

/** For every redriven id in processing order: the highest id that had been processed before it. */
export function redrivenAfter(processed: readonly number[], redriven: ReadonlySet<number>): { id: number; after: number }[] {
  const out: { id: number; after: number }[] = [];
  let highest = 0;
  for (const id of processed) {
    if (redriven.has(id)) out.push({ id, after: highest });
    highest = Math.max(highest, id);
  }
  return out;
}
