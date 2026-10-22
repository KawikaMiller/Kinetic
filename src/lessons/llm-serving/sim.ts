import { exponential } from '../../core/distributions';
import { nearestRank } from '../../core/stats';
import { mulberry32 } from '../../core/random';
import { createTickSim, type TickSim } from '../../core/simTick';
import { DEVICE_MEM, MAX_SEQ, TOY_KV, WEIGHT_BYTES, decodeTiming, kvBytesPerToken, prefillTiming } from './cost';

/**
 * The batching simulator, local to llm-serving. TIME MODEL: one tick is ONE SCHEDULER ITERATION, not a fixed
 * span of time (AC-0/T4 decisions §4). The clock `t` is a simulated time in seconds that advances by the cost
 * model of ./cost on every iteration, so an iteration that prefills a long prompt moves it further than a decode
 * step. Frames and wall time never enter. Same seed and settings give the same history.
 *
 * Both policies reserve a request's whole final length (prompt + output tokens) of cache when they admit it, so no
 * request is ever evicted; this is a simplification of real servers and the page says so. A request that could
 * never fit in the whole budget is rejected, not queued forever.
 */

export type Policy = 'static' | 'continuous';

export const HORIZON_SECONDS = 20;
export const PROMPT_MIN = 64;
export const PROMPT_MAX = 1024;
export const OUTPUT_MEAN = 150;
export const OUTPUT_MAX = 1024;
export const STATIC_WAIT_SECONDS = 0.05;
export const RATE_MIN = 1;
export const RATE_MAX = 60;
export const SLOTS_MIN = 1;
export const SLOTS_MAX = 64;
export const MEM_MIN_GB = 8;
export const MEM_MAX_GB = 80;
export const DEFAULT_SLOTS = 16;
export const DEFAULT_RATE = 20;
export const DEFAULT_SEED = 1;
/** A safety cap on iterations so a bad setting can never spin: far above any workload of this page. */
export const MAX_ITERATIONS = 400_000;

export interface Request {
  id: number;
  arrive: number;
  prompt: number;
  output: number;
}

/** Poisson arrivals at `rate` per second over the horizon; lengths from the seeded stream. */
export function makeWorkload(seed: number, rate: number): Request[] {
  const rnd = mulberry32(seed);
  const out: Request[] = [];
  let t = exponential(rnd, rate);
  while (t < HORIZON_SECONDS) {
    const prompt = PROMPT_MIN + Math.floor(rnd() * (PROMPT_MAX - PROMPT_MIN + 1));
    const output = Math.min(OUTPUT_MAX, 1 + Math.floor(exponential(rnd, 1 / OUTPUT_MEAN)));
    out.push({ id: out.length, arrive: t, prompt, output });
    t += exponential(rnd, rate);
  }
  return out;
}

export type Reservation = 'need' | 'max';

export interface Settings {
  policy: Policy;
  slots: number;
  deviceGb: number;
  /** "need" sets aside the request's own final length; "max" sets aside MAX_SEQ tokens for every request. */
  reservation: Reservation;
}

export const DEFAULT_SETTINGS: Settings = { policy: 'continuous', slots: DEFAULT_SLOTS, deviceGb: DEVICE_MEM / 1e9, reservation: 'need' };

export interface Done {
  id: number;
  slot: number;
  /** When its prefill started and when its first token appeared. */
  start: number;
  first: number;
  end: number;
  /** When its slot was freed: equal to `end` for continuous, the batch's end for static (the idle tail between). */
  freed: number;
  prev: Done | null;
}

export interface Running {
  id: number;
  slot: number;
  start: number;
  first: number;
  generated: number;
  reserved: number;
}

export interface SimState {
  t: number;
  /** Requests that have arrived by `t`. */
  arrived: number;
  /** Next request to admit: requests [head, arrived) are waiting. */
  head: number;
  running: readonly Running[];
  finished: Done | null;
  finishedCount: number;
  rejected: number;
  /** Decode iterations run and, summed, the sequences that emitted a token in them. */
  decodeIterations: number;
  busySlotSteps: number;
  /** Static: members of the current batch have this many decode steps left. */
  stepsLeft: number;
  /** Static: members that have produced their last token, waiting for the batch to end. */
  batchRecords: readonly (Running & { end: number })[];
  idle: boolean;
  done: boolean;
}

export interface Sim {
  workload: readonly Request[];
  settings: Settings;
  budget: number;
  kvPerToken: number;
  tick: TickSim<SimState>;
}

const arrivedBy = (workload: readonly Request[], from: number, t: number): number => {
  let n = from;
  while (n < workload.length && workload[n].arrive <= t) n += 1;
  return n;
};

const reservedFor = (r: Request, kvPerToken: number, reservation: Reservation): number =>
  (reservation === 'max' ? Math.max(MAX_SEQ, r.prompt + r.output) : r.prompt + r.output) * kvPerToken;

export const budgetFor = (deviceGb: number): number => Math.max(0, deviceGb * 1e9 - WEIGHT_BYTES);

const INITIAL: SimState = {
  t: 0, arrived: 0, head: 0, running: [], finished: null, finishedCount: 0, rejected: 0, decodeIterations: 0, busySlotSteps: 0,
  stepsLeft: 0, batchRecords: [], idle: false, done: false,
};

const lowestFreeSlot = (running: readonly Running[]): number => {
  const used = new Set(running.map((r) => r.slot));
  let slot = 0;
  while (used.has(slot)) slot += 1;
  return slot;
};

const reservedTotal = (running: readonly Running[]): number => running.reduce((sum, r) => sum + r.reserved, 0);

const contextTokens = (workload: readonly Request[], running: readonly Running[]): number =>
  running.reduce((sum, r) => sum + workload[r.id].prompt + r.generated, 0);

/** One iteration of the continuous policy. */
function stepContinuous(sim: Omit<Sim, 'tick'>, s: SimState): SimState {
  const { workload, settings, budget, kvPerToken } = sim;
  let t = s.t;
  let idle = false;
  if (s.running.length === 0 && s.head >= s.arrived) {
    if (s.arrived >= workload.length) return { ...s, done: true };
    t = workload[s.arrived].arrive;
    idle = true;
  }
  const arrivedNow = arrivedBy(workload, s.arrived, t);
  const waiting = arrivedNow - s.head;
  if (waiting > 0) {
    const req = workload[s.head];
    const need = reservedFor(req, kvPerToken, settings.reservation);
    if (need > budget) return { ...s, t, arrived: arrivedNow, head: s.head + 1, rejected: s.rejected + 1, idle };
    if (s.running.length < settings.slots && need <= budget - reservedTotal(s.running)) {
      const slot = lowestFreeSlot(s.running);
      const t1 = t + prefillTiming(req.prompt).seconds;
      const run: Running = { id: req.id, slot, start: t, first: t1, generated: 1, reserved: need };
      const arrived = arrivedBy(workload, arrivedNow, t1);
      if (req.output === 1) {
        const rec: Done = { id: req.id, slot, start: t, first: t1, end: t1, freed: t1, prev: s.finished };
        return { ...s, t: t1, arrived, head: s.head + 1, finished: rec, finishedCount: s.finishedCount + 1, idle };
      }
      return { ...s, t: t1, arrived, head: s.head + 1, running: [...s.running, run], idle };
    }
  }
  const dt = decodeTiming(s.running.length, contextTokens(workload, s.running), kvPerToken).seconds;
  const t1 = t + dt;
  let finished = s.finished;
  let finishedCount = s.finishedCount;
  const running: Running[] = [];
  for (const r of s.running) {
    const generated = r.generated + 1;
    if (generated >= workload[r.id].output) {
      finished = { id: r.id, slot: r.slot, start: r.start, first: r.first, end: t1, freed: t1, prev: finished };
      finishedCount += 1;
    } else {
      running.push({ ...r, generated });
    }
  }
  return {
    ...s, t: t1, arrived: arrivedBy(workload, arrivedNow, t1), running, finished, finishedCount, idle,
    decodeIterations: s.decodeIterations + 1, busySlotSteps: s.busySlotSteps + s.running.length,
  };
}

/** One iteration of the static policy: form and prefill a batch, or run one lockstep decode step. */
function stepStatic(sim: Omit<Sim, 'tick'>, s: SimState): SimState {
  const { workload, settings, budget, kvPerToken } = sim;
  if (s.running.length > 0) {
    const context = s.running.reduce((sum, r) => sum + workload[r.id].prompt + r.generated, 0);
    const t1 = s.t + decodeTiming(s.running.length, context, kvPerToken).seconds;
    const emitting = s.running.filter((r) => r.generated < workload[r.id].output);
    const nowDone = emitting.filter((r) => r.generated + 1 === workload[r.id].output).map((r) => ({ ...r, end: t1 }));
    const stepped = s.running.map((r) => (r.generated < workload[r.id].output ? { ...r, generated: r.generated + 1 } : r));
    const stepsLeft = s.stepsLeft - 1;
    const base: SimState = {
      ...s, t: t1, arrived: arrivedBy(workload, s.arrived, t1), decodeIterations: s.decodeIterations + 1,
      busySlotSteps: s.busySlotSteps + emitting.length, idle: false, batchRecords: [...s.batchRecords, ...nowDone],
    };
    return stepsLeft > 0 ? { ...base, running: stepped, stepsLeft } : finishBatch(base, t1);
  }
  let t = s.t;
  let idle = false;
  if (s.head >= s.arrived) {
    if (s.arrived >= workload.length) return { ...s, done: true };
    t = workload[s.arrived].arrive;
    idle = true;
  }
  const first = workload[s.head];
  if (reservedFor(first, kvPerToken, settings.reservation) > budget) {
    return { ...s, t, arrived: arrivedBy(workload, s.arrived, t), head: s.head + 1, rejected: s.rejected + 1, idle };
  }
  const full = s.head + settings.slots - 1 < workload.length ? workload[s.head + settings.slots - 1].arrive : Infinity;
  const leave = Math.max(t, Math.min(first.arrive + STATIC_WAIT_SECONDS, full));
  const arrivedAtLeave = arrivedBy(workload, s.arrived, leave);
  const members: Running[] = [];
  let reserved = 0;
  let next = s.head;
  while (next < arrivedAtLeave && members.length < settings.slots) {
    const need = reservedFor(workload[next], kvPerToken, settings.reservation);
    if (need > budget - reserved) break;
    reserved += need;
    members.push({ id: next, slot: members.length, start: leave, first: 0, generated: 1, reserved: need });
    next += 1;
  }
  const t1 = leave + prefillTiming(members.reduce((sum, r) => sum + workload[r.id].prompt, 0)).seconds;
  const withFirst = members.map((r) => ({ ...r, first: t1 }));
  const instant = withFirst.filter((r) => workload[r.id].output === 1).map((r) => ({ ...r, end: t1 }));
  const stepsLeft = Math.max(0, ...members.map((r) => workload[r.id].output - 1));
  const base: SimState = {
    ...s, t: t1, arrived: arrivedBy(workload, arrivedAtLeave, t1), head: next, idle, stepsLeft, running: withFirst, batchRecords: instant,
  };
  return stepsLeft === 0 ? finishBatch(base, t1) : base;
}

/** The batch is over: every slot is freed now; each member finished at its own last token, so the gap is its idle tail. */
function finishBatch(s: SimState, freed: number): SimState {
  let finished = s.finished;
  for (const r of s.batchRecords) {
    finished = { id: r.id, slot: r.slot, start: r.start, first: r.first, end: r.end, freed, prev: finished };
  }
  return { ...s, running: [], batchRecords: [], finished, finishedCount: s.finishedCount + s.batchRecords.length, stepsLeft: 0 };
}
const clampTo = (v: number, [lo, hi]: readonly [number, number]): number => Math.min(hi, Math.max(lo, Math.round(v)));

/** Controls past their ends are clamped to them, never run. */
export function clampSettings(s: Settings): Settings {
  return { ...s, slots: clampTo(s.slots, [SLOTS_MIN, SLOTS_MAX]), deviceGb: clampTo(s.deviceGb, [MEM_MIN_GB, MEM_MAX_GB]) };
}
export const clampRate = (rate: number): number => clampTo(rate, [RATE_MIN, RATE_MAX]);

/** The simulator over a given workload (the tests build hand cases); `seed` only names the run. */
export function createSimOn(workload: readonly Request[], seed: number, settings: Settings): Sim {
  const budget = budgetFor(settings.deviceGb);
  const kvPerToken = kvBytesPerToken(TOY_KV);
  const partial = { workload, settings, budget, kvPerToken };
  const step = settings.policy === 'continuous' ? stepContinuous : stepStatic;
  const tick = createTickSim<SimState>({
    seed,
    init: () => INITIAL,
    step: (s) => (s.done ? s : step(partial, s)),
    check: (s) => (reservedTotal(s.running) > budget ? `cache in use ${reservedTotal(s.running)} bytes exceeds the budget ${budget}` : null),
  });
  return { ...partial, tick };
}

export function createSim(seed: number, rate: number, settings: Settings = DEFAULT_SETTINGS): Sim {
  return createSimOn(makeWorkload(seed, clampRate(rate)), seed, clampSettings(settings));
}

/** Run to completion (every request finished or rejected), within the iteration cap. One iteration at a time, so no padding ticks follow the end. */
export function runToEnd(sim: Sim): SimState {
  let ran = 0;
  while (!sim.tick.state.done && !sim.tick.violation && ran < MAX_ITERATIONS) {
    ran += sim.tick.run(1);
  }
  return sim.tick.state;
}

export interface FinishedRecord extends Done {
  ttft: number;
  arrive: number;
  output: number;
}

export function finishedList(sim: Sim, s: SimState): FinishedRecord[] {
  const out: FinishedRecord[] = [];
  for (let d = s.finished; d; d = d.prev) {
    const req = sim.workload[d.id];
    out.push({ ...d, ttft: d.first - req.arrive, arrive: req.arrive, output: req.output });
  }
  return out.reverse();
}

export interface SimStats {
  tokensPerSecond: number;
  ttftP50: number | null;
  ttftP99: number | null;
  utilisation: number | null;
  makespan: number;
  finished: number;
  rejected: number;
  arrivals: number;
  iterations: number;
}

/** Statistics of a finished run. Throughput is output tokens over the time the last request finished. */
export function statsOf(sim: Sim, s: SimState): SimStats {
  const list = finishedList(sim, s);
  const tokens = list.reduce((sum, r) => sum + r.output, 0);
  const makespan = list.reduce((m, r) => Math.max(m, r.end), 0);
  const ttfts = list.map((r) => r.ttft).sort((a, b) => a - b);
  return {
    tokensPerSecond: makespan > 0 ? tokens / makespan : 0,
    ttftP50: ttfts.length ? nearestRank(ttfts, 50) : null,
    ttftP99: ttfts.length ? nearestRank(ttfts, 99) : null,
    utilisation: s.decodeIterations > 0 ? s.busySlotSteps / (sim.settings.slots * s.decodeIterations) : null,
    makespan,
    finished: list.length,
    rejected: s.rejected,
    arrivals: sim.workload.length,
    iterations: sim.tick.ticks,
  };
}

/** What the head of the queue is waiting for at a state, or null when nothing waits or it can be admitted. */
export interface Blocked {
  /** 'batch': a static batch is running, so nothing joins it even though slots may be free. */
  reason: 'slots' | 'cache' | 'batch';
  needBytes: number;
  freeBytes: number;
}

export function blockedAt(sim: Sim, s: SimState): Blocked | null {
  if (s.arrived - s.head <= 0) return null;
  const need = reservedFor(sim.workload[s.head], sim.kvPerToken, sim.settings.reservation);
  const free = sim.budget - reservedTotal(s.running);
  if (need > sim.budget) return null;
  if (sim.settings.policy === 'static' && s.running.length > 0) return { reason: 'batch', needBytes: need, freeBytes: free };
  if (s.running.length >= sim.settings.slots) return { reason: 'slots', needBytes: need, freeBytes: free };
  if (need > free) return { reason: 'cache', needBytes: need, freeBytes: free };
  return null;
}

export const reservedBytes = (s: SimState): number => reservedTotal(s.running);

/** The most cache one request can be set aside (reserving the maximum sequence), and the smallest budget a control reaches: the rejection guard never fires between them. */
export const LARGEST_RESERVATION_BYTES = Math.max(MAX_SEQ, PROMPT_MAX + OUTPUT_MAX) * kvBytesPerToken(TOY_KV);
export const SMALLEST_BUDGET_BYTES = budgetFor(MEM_MIN_GB);

/** Token-slots a lockstep batch keeps busy: sum of outputs over (members x longest). The hand case (10, 10, 10, 200) is 230 / 800. */
export function lockstepUtilisation(outputs: readonly number[]): number {
  return outputs.reduce((a, b) => a + b, 0) / (outputs.length * Math.max(...outputs));
}
