/**
 * warehouse-lake-lakehouse, scene 1: what happens when scans and point operations share one store. A small fixed-tick,
 * seeded queue: each store serves one operation at a time, in arrival order, and an operation takes
 * ceil(cost / COST_PER_TICK) ticks, with costs from `workload.ts`. A scan holds its store, so point operations behind it wait.
 */
import { createTickSim, type TickSim } from '../../core/simTick';
import { MIX, isScan, opCost, sharesStore, storeOf, type Op, type Placement, type Store } from './workload';

export const CONTENTION_TICKS = 240;
/** Value-equivalents a store works through in one tick (illustrative). */
export const COST_PER_TICK = 100;
/** Chance per tick that a point operation arrives, and that a scan does. */
export const POINT_RATE = 0.4;
export const SCAN_RATE = 0.012;
/** The lowest seed whose shared store makes a point operation wait at least this many ticks (a test pins it). */
export const WAIT_TO_SHOW = 10;
export const DEFAULT_CONTENTION_SEED = 0;

export interface Job {
  id: number;
  scan: boolean;
  store: Store;
  arrivedAt: number;
  /** Ticks of service this job needs. */
  need: number;
}

export interface Served {
  id: number;
  scan: boolean;
  /** Ticks spent waiting before service began. */
  wait: number;
}

export interface ContentionState {
  arrived: number;
  queues: Record<Store, Job[]>;
  serving: Record<Store, { job: Job; left: number } | null>;
  served: Served[];
  /** Point operations waiting or being served, per tick (history of the "queue"). */
  pointsWaiting: number;
}

const representative = (kind: 'point' | 'scan'): Op => MIX.find((o) => (kind === 'scan') === isScan(o))!;
const ticksFor = (op: Op, store: Store): number => Math.ceil(opCost(op, store).cost / COST_PER_TICK);

const empty = (): ContentionState => ({ arrived: 0, queues: { row: [], column: [] }, serving: { row: null, column: null }, served: [], pointsWaiting: 0 });

/** The queue under a placement, seeded: same seed, same arrivals. Scans and point operations draw their own random numbers in a fixed order each tick. */
export function createContention(p: Placement, seed: number): TickSim<ContentionState> {
  const point = representative('point');
  const scan = representative('scan');
  return createTickSim<ContentionState>({
    seed,
    init: empty,
    step: (s, rnd, tick) => {
      const queues: Record<Store, Job[]> = { row: [...s.queues.row], column: [...s.queues.column] };
      const serving = { row: s.serving.row && { ...s.serving.row }, column: s.serving.column && { ...s.serving.column } };
      const served = [...s.served];
      let arrived = s.arrived;
      const pointArrives = rnd() < POINT_RATE;
      const scanArrives = rnd() < SCAN_RATE;
      for (const [arrives, op] of [[pointArrives, point], [scanArrives, scan]] as const) {
        if (!arrives) continue;
        const store = storeOf(op, p);
        queues[store].push({ id: arrived++, scan: isScan(op), store, arrivedAt: tick, need: ticksFor(op, store) });
      }
      for (const store of ['row', 'column'] as const) {
        if (serving[store] === null && queues[store].length > 0) {
          const job = queues[store].shift()!;
          serving[store] = { job, left: job.need };
          served.push({ id: job.id, scan: job.scan, wait: tick - job.arrivedAt });
        }
        if (serving[store] !== null) {
          serving[store]!.left -= 1;
          if (serving[store]!.left <= 0) serving[store] = null;
        }
      }
      const pointsWaiting = (['row', 'column'] as const).reduce((n, st) => n + queues[st].filter((j) => !j.scan).length, 0);
      return { arrived, queues, serving, served, pointsWaiting };
    },
    check: (s) => {
      const inFlight = s.queues.row.length + s.queues.column.length + (s.serving.row ? 1 : 0) + (s.serving.column ? 1 : 0);
      const startedAndDone = s.served.length - (s.serving.row ? 1 : 0) - (s.serving.column ? 1 : 0);
      return s.arrived === startedAndDone + inFlight ? null : `${s.arrived} operations arrived but ${startedAndDone} finished and ${inFlight} are in flight`;
    },
  });
}

export interface ContentionResult {
  seed: number;
  shared: boolean;
  /** Mean ticks a point operation waited before service began; 0 with none. */
  meanPointWait: number;
  maxPointWait: number;
  pointsServed: number;
  scansServed: number;
  /** Point operations in the queue at each tick, for the sparkline. */
  queue: number[];
  violation: string | null;
}

export function runContention(p: Placement, seed: number = DEFAULT_CONTENTION_SEED): ContentionResult {
  const sim = createContention(p, seed);
  sim.run(CONTENTION_TICKS);
  const pointWaits = sim.state.served.filter((j) => !j.scan).map((j) => j.wait);
  return {
    seed,
    shared: sharesStore(p),
    meanPointWait: pointWaits.length === 0 ? 0 : pointWaits.reduce((a, b) => a + b, 0) / pointWaits.length,
    maxPointWait: pointWaits.length === 0 ? 0 : Math.max(...pointWaits),
    pointsServed: pointWaits.length,
    scansServed: sim.state.served.length - pointWaits.length,
    queue: sim.history.map((s) => s.pointsWaiting),
    violation: sim.violation?.message ?? null,
  };
}
