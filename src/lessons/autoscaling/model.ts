import { mulberry32 } from '../../core/random';
import { createTickSim, type TickSim } from '../../core/simTick';

/* ---------- constants (all illustrative) ---------- */

export const MINUTES_PER_DAY = 1440;
/** Two days are simulated: predictive scaling needs a yesterday, so every score counts the second day only. */
export const RUN_DAYS = 2;
export const RUN_MINUTES = RUN_DAYS * MINUTES_PER_DAY;
export const SCORED_FROM = MINUTES_PER_DAY;
/** Requests per second one ready instance serves (made up). */
export const INSTANCE_RPS = 100;
/** A minute is a violation when load is above this share of ready capacity, or anything is dropped. */
export const VIOLATION_PCT = 90;
/** The latency proxy 1/(1 − ρ) is capped at this many service times. */
export const LATENCY_CAP = 50;
/** An illustrative price for one instance for one hour. */
export const PRICE_PER_INSTANCE_HOUR = 0.1;
const MINUTES_PER_HOUR = 60;

export const MAX_INSTANCES = 24;

export type Preset = 'daily' | 'flash' | 'sawtooth' | 'noisy';
export const PRESETS: readonly Preset[] = ['daily', 'flash', 'sawtooth', 'noisy'];
export const PRESET_NAME: Record<Preset, string> = { daily: 'daily wave', flash: 'flash spike ×4', sawtooth: 'batch sawtooth', noisy: 'noisy' };

export type Policy = 'reactive' | 'scheduled' | 'predictive';
export const POLICIES: readonly Policy[] = ['reactive', 'scheduled', 'predictive'];
export const POLICY_NAME: Record<Policy, string> = { reactive: 'reactive', scheduled: 'scheduled', predictive: 'predictive' };

/** The flash spike: ×4 from this minute of day 2 for this many minutes, on a flat 300/s base. It never happens on day 1. */
export const FLASH = { startMinute: MINUTES_PER_DAY + 14 * MINUTES_PER_HOUR, minutes: 20, factor: 4, base: 300 } as const;
/** The scheduled policy raises the minimum between 08:00 and 20:00 each day. */
export const SCHEDULE = { fromMinute: 8 * MINUTES_PER_HOUR, toMinute: 20 * MINUTES_PER_HOUR, minimum: 8 } as const;
const NOISE = { base: 350, spread: 150 } as const;

/** Offered load (requests/s, whole numbers) for each minute of the run. Only `noisy` reads the seed. */
export function loadCurve(preset: Preset, seed: number): number[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: RUN_MINUTES }, (_, t) => {
    const minuteOfDay = t % MINUTES_PER_DAY;
    switch (preset) {
      case 'daily': return Math.round(350 + 250 * Math.sin((2 * Math.PI * (minuteOfDay - 540)) / MINUTES_PER_DAY));
      case 'flash': return t >= FLASH.startMinute && t < FLASH.startMinute + FLASH.minutes ? FLASH.base * FLASH.factor : FLASH.base;
      case 'sawtooth': return 200 + Math.round((400 * (t % MINUTES_PER_HOUR)) / MINUTES_PER_HOUR);
      case 'noisy': return Math.round(NOISE.base + NOISE.spread * (2 * rnd() - 1));
    }
  });
}

/** A minute worth looking at when the scene opens: after the spike starts, on the morning climb, and so on. */
export const FOCUS_MINUTE: Record<Preset, number> = {
  daily: MINUTES_PER_DAY + 9 * MINUTES_PER_HOUR,
  flash: FLASH.startMinute + 4,
  sawtooth: MINUTES_PER_DAY + 10 * MINUTES_PER_HOUR + 50,
  noisy: MINUTES_PER_DAY + 12 * MINUTES_PER_HOUR,
};

/* ---------- the controller ---------- */

export interface Controller {
  policy: Policy;
  /** Target utilisation, a whole percent. */
  targetPct: number;
  /** Minutes before a launched instance serves, beyond the minute the decision takes. */
  warmupMin: number;
  /** Minutes of silence after a scale-out and after a scale-in before the next one in that direction. */
  cooldownOut: number;
  cooldownIn: number;
  min: number;
  max: number;
  /** Whether instances still warming count as "current" in the desired-count formula. */
  warmingCounts: boolean;
}

export const CONTROLLER_DEFAULT: Controller = {
  policy: 'reactive', targetPct: 60, warmupMin: 2, cooldownOut: 1, cooldownIn: 10, min: 2, max: MAX_INSTANCES, warmingCounts: false,
};
export const TARGET_RANGE = { min: 30, max: 95, step: 5 } as const;
export const WARMUP_RANGE = { min: 0, max: 10, step: 1 } as const;
export const COOLDOWN_RANGE = { min: 0, max: 30, step: 1 } as const;
export const COUNT_RANGE = { min: 1, max: MAX_INSTANCES, step: 1 } as const;

/** ⌈a ÷ b⌉ for whole numbers, with no floating-point division: 3 × 10 ÷ 30 is exactly 1. */
export const ceilDiv = (a: number, b: number): number => Math.floor((a + b - 1) / b);

/**
 * The target-tracking formula: desired = ⌈current × metric ÷ target⌉, with the metric and the target as whole percents.
 * The float form `Math.ceil(3 * 0.1 / 0.3)` is 2, because 3 × 0.1 / 0.3 is 1.0000000000000002.
 */
export const desiredCount = (current: number, utilPct: number, targetPct: number): number => ceilDiv(current * utilPct, targetPct);

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Load as a whole percent of `capacity` (requests/s), rounded to the nearest percent. */
export const utilisationPct = (load: number, capacity: number): number => Math.round((100 * load) / capacity);

/** Whether the minute is over the violation line: load above 90% of ready capacity (integers, no division), or anything dropped. */
export const isViolation = (load: number, capacity: number): boolean => 100 * load > VIOLATION_PCT * capacity;

/** The latency proxy: 1 / (1 − ρ) service times, with ρ the share of ready capacity in use, capped. */
export function latencyProxy(load: number, capacity: number): number {
  const rho = Math.min(1, load / capacity);
  return rho >= 1 ? LATENCY_CAP : Math.min(LATENCY_CAP, 1 / (1 - rho));
}

/** May an action at minute `t` go ahead, `last` being the minute of the previous one in this direction? Edge: `cooldown` minutes later is still silent. */
export const cooldownAllows = (t: number, last: number, cooldown: number): boolean => t - last > cooldown;

/* ---------- the fleet, one minute per tick ---------- */

export interface Lifetime {
  /** The lane the instance sits in (the lowest free slot when it launched). */
  slot: number;
  launchedAt: number;
  /** The first minute it serves. */
  readyAt: number;
  /** The minute it was removed, or null while it runs. Filled in later, so only the picture reads it. */
  endedAt: number | null;
}

export interface FleetState {
  /** Ticks run: tick k has processed minute k − 1. */
  tick: number;
  minute: number;
  load: number;
  ready: number;
  warming: number;
  served: number;
  dropped: number;
  /** The whole-percent utilisation the controller saw, the count it asked for, and the net change it made (positive: launched). */
  utilPct: number;
  desired: number;
  change: number;
  lastOut: number;
  lastIn: number;
  /** The live instances (shared records; see Lifetime). */
  live: Lifetime[];
  all: Lifetime[];
}

const readyCount = (live: readonly Lifetime[], t: number): number => live.filter((i) => i.readyAt <= t).length;

function lowestFreeSlot(live: readonly Lifetime[]): number {
  const used = new Set(live.map((i) => i.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  return slot;
}

/** The count the policy wants at minute t, before the min and max. */
function policyTarget(c: Controller, curve: readonly number[], t: number, current: number, utilPct: number): number {
  if (c.policy !== 'predictive' || t + 1 < MINUTES_PER_DAY) return desiredCount(current, utilPct, c.targetPct);
  // Provision now for the busiest minute of yesterday between now and when a launch would serve.
  let peak = 0;
  for (let s = t + 1; s <= t + 1 + c.warmupMin; s++) peak = Math.max(peak, curve[s - MINUTES_PER_DAY] ?? 0);
  return ceilDiv(peak * 100, INSTANCE_RPS * c.targetPct);
}

/** The static fleet that would carry the run's busiest minute at the target utilisation. */
export const staticFleet = (curve: readonly number[], c: Controller): number => clamp(ceilDiv(Math.max(...curve) * 100, INSTANCE_RPS * c.targetPct), 1, Infinity);

export function createFleetSim(preset: Preset, c: Controller, seed: number): TickSim<FleetState> {
  const curve = loadCurve(preset, seed);
  const floor = (t: number) => (c.policy === 'scheduled' && t % MINUTES_PER_DAY >= SCHEDULE.fromMinute && t % MINUTES_PER_DAY < SCHEDULE.toMinute ? Math.max(c.min, SCHEDULE.minimum) : c.min);
  return createTickSim<FleetState>({
    seed,
    init: () => {
      const start = clamp(ceilDiv(curve[0] * 100, INSTANCE_RPS * c.targetPct), floor(0), c.max);
      const all: Lifetime[] = [];
      for (let slot = 0; slot < start; slot++) all.push({ slot, launchedAt: 0, readyAt: 0, endedAt: null });
      return { tick: 0, minute: -1, load: 0, ready: start, warming: 0, served: 0, dropped: 0, utilPct: 0, desired: start, change: 0, lastOut: -Infinity, lastIn: -Infinity, live: [...all], all };
    },
    step: (s, _rnd, tick) => {
      const t = tick - 1;
      const load = curve[t];
      const live = [...s.live];
      const ready = readyCount(live, t);
      const warming = live.length - ready;
      const capacity = ready * INSTANCE_RPS;
      const served = Math.min(load, capacity);
      const util = utilisationPct(load, capacity);
      const current = c.warmingCounts ? live.length : ready;
      const want = clamp(policyTarget(c, curve, t, current, util), floor(t), c.max);
      let { lastOut, lastIn } = s;
      let change = 0;
      if (want > live.length && cooldownAllows(t, lastOut, c.policy === 'predictive' ? -1 : c.cooldownOut)) {
        for (let n = live.length; n < want; n++) {
          const life: Lifetime = { slot: lowestFreeSlot(live), launchedAt: t, readyAt: t + 1 + c.warmupMin, endedAt: null };
          live.push(life);
          s.all.push(life);
          change++;
        }
        lastOut = t;
      } else if (want < live.length && cooldownAllows(t, lastIn, c.policy === 'predictive' ? -1 : c.cooldownIn)) {
        // Newest first: instances still warming go before ones that are serving.
        const removed = [...live].sort((a, b) => b.launchedAt - a.launchedAt || b.readyAt - a.readyAt).slice(0, live.length - want);
        for (const life of removed) {
          life.endedAt = t + 1;
          live.splice(live.indexOf(life), 1);
          change--;
        }
        lastIn = t;
      }
      return {
        tick, minute: t, load, ready, warming, served, dropped: load - served,
        utilPct: util, desired: want, change, lastOut, lastIn, live, all: s.all,
      };
    },
    check: (s) => (s.served + s.dropped === s.load && (s.tick === 0 || s.ready >= 1) ? null : 'served + dropped no longer equals the offered load, or no instance was ready'),
  });
}

export interface MinuteRow {
  minute: number;
  load: number;
  ready: number;
  warming: number;
  /** Instances paid for this minute: ready plus warming. */
  billed: number;
  served: number;
  dropped: number;
  utilPct: number;
  proxy: number;
  violation: boolean;
  change: number;
  desired: number;
}

export interface FleetSummary {
  violationMinutes: number;
  instanceMinutes: number;
  dropped: number;
  served: number;
  /** Reversals in the direction of fleet changes (scale out, then in, or in, then out). */
  flaps: number;
  peakInstances: number;
}

export interface FleetRun {
  preset: Preset;
  controller: Controller;
  rows: MinuteRow[];
  lifetimes: Lifetime[];
  summary: FleetSummary;
}

/** Reversals in a series of changes: each time a change has the opposite sign to the previous non-zero one. */
export function countReversals(changes: readonly number[]): number {
  let last = 0;
  let flips = 0;
  for (const c of changes) {
    if (c === 0) continue;
    const sign = c > 0 ? 1 : -1;
    if (last !== 0 && sign !== last) flips++;
    last = sign;
  }
  return flips;
}

/** Every minute of one run, and the scores of the second day. */
export function runFleet(preset: Preset, controller: Controller, seed: number): FleetRun {
  const sim = createFleetSim(preset, controller, seed);
  sim.run(RUN_MINUTES);
  const rows: MinuteRow[] = sim.history.slice(1).map((s) => {
    // `warming` and `ready` describe the minute served; the fleet after the decision is in `live`.
    const warming = s.warming;
    return {
      minute: s.minute, load: s.load, ready: s.ready, warming, billed: s.ready + warming, served: s.served, dropped: s.dropped, utilPct: s.utilPct,
      proxy: latencyProxy(s.load, s.ready * INSTANCE_RPS), violation: isViolation(s.load, s.ready * INSTANCE_RPS) || s.dropped > 0, change: s.change, desired: s.desired,
    };
  });
  const scored = rows.filter((r) => r.minute >= SCORED_FROM);
  return {
    preset, controller, rows, lifetimes: sim.state.all,
    summary: {
      violationMinutes: scored.filter((r) => r.violation).length,
      instanceMinutes: scored.reduce((sum, r) => sum + r.billed, 0),
      dropped: scored.reduce((sum, r) => sum + r.dropped, 0),
      served: scored.reduce((sum, r) => sum + r.served, 0),
      flaps: countReversals(scored.map((r) => r.change)),
      peakInstances: Math.max(...scored.map((r) => r.billed)),
    },
  };
}

/** The 3 × 4 table: every policy against every preset, each cell its own run. */
export function policyTable(base: Controller, seed: number): Record<Policy, Record<Preset, FleetSummary>> {
  const out = {} as Record<Policy, Record<Preset, FleetSummary>>;
  for (const policy of POLICIES) {
    out[policy] = {} as Record<Preset, FleetSummary>;
    for (const preset of PRESETS) out[policy][preset] = runFleet(preset, { ...base, policy }, seed).summary;
  }
  return out;
}

/** Instance-hours of a summary, and what they cost. */
export const instanceHours = (s: FleetSummary): number => s.instanceMinutes / MINUTES_PER_HOUR;
export const cost = (hours: number): number => hours * PRICE_PER_INSTANCE_HOUR;

export interface Bill {
  autoHours: number;
  staticHours: number;
  staticInstances: number;
  /** The share saved against the static fleet, or null when there is no static cost. */
  saving: number | null;
  violationMinutes: number;
}

/** The scored day's bill against a fleet fixed at the size the busiest minute needs. */
export function bill(run: FleetRun): Bill {
  const curve = run.rows.map((r) => r.load);
  const staticInstances = staticFleet(curve, run.controller);
  const staticHours = (staticInstances * MINUTES_PER_DAY) / MINUTES_PER_HOUR;
  const autoHours = instanceHours(run.summary);
  return { autoHours, staticHours, staticInstances, saving: staticHours > 0 ? 1 - autoHours / staticHours : null, violationMinutes: run.summary.violationMinutes };
}

export const SCENE_DEFAULT = { preset: 'flash' as Preset, controller: CONTROLLER_DEFAULT, seed: 1 };
