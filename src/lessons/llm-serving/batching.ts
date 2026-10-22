import type { GanttBar } from '../../components/GanttLanes';
import { barsAt } from '../../core/gantt';
import {
  DEFAULT_RATE, DEFAULT_SEED, DEFAULT_SETTINGS, MEM_MAX_GB, MEM_MIN_GB, RATE_MAX, RATE_MIN, SLOTS_MAX, SLOTS_MIN, blockedAt, createSim,
  createSimOn, finishedList, reservedBytes, runToEnd, statsOf, type FinishedRecord, type Request, type Settings, type Sim, type SimState, type SimStats,
} from './sim';
import { decimalBytes, plainSeconds } from './text';

export const BATCH_LIMITS = { rate: [RATE_MIN, RATE_MAX], slots: [SLOTS_MIN, SLOTS_MAX], memoryGb: [MEM_MIN_GB, MEM_MAX_GB] } as const;
export const BATCH_OPENING = { seed: DEFAULT_SEED, rate: DEFAULT_RATE, settings: DEFAULT_SETTINGS, position: 500 } as const;
export const SCRUB_STEPS = 1000;
export const LANES_SHOWN = 16;
export const WINDOW_SECONDS = 2;
export const AHEAD_SECONDS = 0.25;
const TRACE_POINTS = 240;

export interface BatchRun {
  sim: Sim;
  end: SimState;
  stats: SimStats;
  finished: FinishedRecord[];
  /** Iterations whose queue head could not start for want of cache. */
  cacheBlocked: number;
  trace: [number, number][];
}

/** One whole run of the batching simulator (cached by the scene on its inputs). */
export function runBatching(seed: number, rate: number, settings: Settings, workload?: readonly Request[]): BatchRun {
  const sim = workload ? createSimOn(workload, seed, settings) : createSim(seed, rate, settings);
  const end = runToEnd(sim);
  const history = sim.tick.history;
  const stride = Math.max(1, Math.floor(history.length / TRACE_POINTS));
  const trace: [number, number][] = [];
  let cacheBlocked = 0;
  history.forEach((s, i) => {
    if (blockedAt(sim, s)?.reason === 'cache') cacheBlocked += 1;
    if (i % stride === 0 || i === history.length - 1) trace.push([s.t, s.arrived - s.head]);
  });
  return { sim, end, stats: statsOf(sim, end), finished: finishedList(sim, end), cacheBlocked, trace };
}

/** The iteration a scrub position stands for. */
export const tickAt = (run: BatchRun, position: number): number => Math.round((position / SCRUB_STEPS) * run.sim.tick.ticks);

/** Gantt bars of the first lanes around time `now`: prefill, decode and (static) the idle tail, each clipped to what has happened by `now`. */
export function ganttBars(run: BatchRun, now: number): GanttBar[] {
  const all: GanttBar[] = [];
  for (const r of run.finished) {
    if (r.slot >= LANES_SHOWN || r.freed < now - WINDOW_SECONDS || r.start > now) continue;
    const lane = `slot${r.slot}`;
    all.push({ id: `p${r.id}`, lane, start: r.start, end: r.first, tone: 'hi' });
    if (r.end > r.first) all.push({ id: `d${r.id}`, lane, start: r.first, end: r.end, tone: 'info', label: `#${r.id + 1}` });
    if (r.freed > r.end) all.push({ id: `i${r.id}`, lane, start: r.end, end: r.freed, tone: 'dim', kind: 'wait' });
  }
  return barsAt(all, now);
}

export function batchCaption(run: BatchRun, state: SimState, tick: number, rate: number): string {
  const { stats, sim } = run;
  const policy = sim.settings.policy === 'continuous' ? 'Continuous batching' : 'Static batching';
  const ttft = stats.ttftP50 === null || stats.ttftP99 === null ? 'no request finished' : `time to first token p50 ${plainSeconds(stats.ttftP50)}, p99 ${plainSeconds(stats.ttftP99)}`;
  const refused = stats.rejected > 0 ? ` ${stats.rejected} ${stats.rejected === 1 ? 'request needed' : 'requests needed'} more cache than the whole budget (${decimalBytes(sim.budget)}) and ${stats.rejected === 1 ? 'was' : 'were'} rejected, not queued forever.` : '';
  const head = `${policy} at ${rate} requests per second: ${stats.finished} of ${stats.arrivals} requests finished, ${Math.round(stats.tokensPerSecond).toLocaleString('en-US')} output tokens per second, ${ttft}.${refused}`;
  const blocked = blockedAt(sim, state);
  const waiting = state.arrived - state.head;
  const where = `At iteration ${tick.toLocaleString('en-US')} (simulated time ${state.t.toFixed(2)} s) ${waiting} ${waiting === 1 ? 'request is' : 'requests are'} waiting and ${state.running.length} running.`;
  if (blocked?.reason === 'cache') {
    return `${head} ${where} The next request needs ${decimalBytes(blocked.needBytes)} of cache and ${decimalBytes(blocked.freeBytes)} is free: it waits.`;
  }
  if (blocked?.reason === 'slots') return `${head} ${where} Every slot is busy, so the next request waits for one.`;
  return `${head} ${where}`;
}

export const cacheLine = (run: BatchRun, state: SimState) => ({ used: reservedBytes(state), budget: run.sim.budget });
