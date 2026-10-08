/**
 * A simulated function platform: one request per instance, warm reuse, idle reaping,
 * provisioned (always-warm) instances, a concurrency limit that throttles instead of queueing.
 * Every timing and price is an illustrative constant, not any provider's.
 */
import { mulberry32, expSample, type Rnd } from '../../core/random';

/** Length of one simulated run, seconds. */
export const HORIZON = 40;
/** The cold start's first two phases, and the handler: illustrative seconds. */
export const PROVISION_S = 0.4;
export const RUNTIME_S = 0.3;
export const HANDLER_S = 0.3;
/** How long a reaped instance stays drawn (fading) before its slot is free on screen. */
export const REAP_FADE_S = 1.2;

export type Profile = 'spiky' | 'steady' | 'batch';

/** A burst window [from, to): the profile's multiplier is 1 inside, `base` outside. */
interface Burst {
  from: number;
  to: number;
}
const BURSTS: Record<Profile, { base: number; windows: Burst[] }> = {
  spiky: { base: 0.08, windows: [{ from: 10, to: 12.5 }, { from: 22, to: 24.5 }, { from: 33, to: 35 }] },
  steady: { base: 1, windows: [] },
  batch: { base: 0, windows: [{ from: 8, to: 16 }] },
};

/** Share of the peak request rate that is arriving at time t (0..1). */
export function rateShare(profile: Profile, t: number): number {
  const { base, windows } = BURSTS[profile];
  return windows.some((w) => t >= w.from && t < w.to) ? 1 : base;
}

export interface Config {
  profile: Profile;
  /** Peak requests per second (the profile scales it down between bursts). */
  peakRate: number;
  /** Seconds of function-init work (SDK imports, connections) per cold start. */
  initS: number;
  /** Instances kept warm all the time (capped at the limit). */
  provisioned: number;
  /** Most requests running at once; one more is throttled (429), never queued. */
  limit: number;
  /** Seconds an idle instance stays warm before it is reaped. */
  idleReap: number;
  seed: number;
}

export const DEFAULT_CONFIG: Config = { profile: 'spiky', peakRate: 6, initS: 0.8, provisioned: 0, limit: 10, idleReap: 8, seed: 7 };

/** Request arrival times: a Poisson process at the peak rate, thinned by the profile. Sorted. */
export function arrivals(cfg: Pick<Config, 'profile' | 'peakRate' | 'seed'>): number[] {
  const rnd: Rnd = mulberry32(cfg.seed);
  const times: number[] = [];
  let t = 0;
  for (;;) {
    t += expSample(1 / cfg.peakRate, rnd);
    if (t >= HORIZON) return times;
    if (rnd() < rateShare(cfg.profile, t)) times.push(t);
  }
}

/** Most requests that would be running at once if each took only the handler time, i.e. the load itself. */
export function peakDemand(times: readonly number[]): number {
  let peak = 0;
  for (let i = 0; i < times.length; i++) {
    let n = 0;
    for (let j = 0; j <= i; j++) if (times[j] + HANDLER_S > times[i]) n++;
    peak = Math.max(peak, n);
  }
  return peak;
}

export type SegmentKind = 'provision' | 'runtime' | 'init' | 'handler' | 'idle';
export interface Segment {
  kind: SegmentKind;
  start: number;
  end: number;
  /** The request being served (handler) or waiting through the cold start. */
  request?: number;
}

export interface Instance {
  id: number;
  /** The row it occupies: the lowest free one when it was created. */
  slot: number;
  provisioned: boolean;
  createdAt: number;
  /** Everything it does, in order. A provisioned instance's last idle segment ends at Infinity. */
  segments: Segment[];
  /** When the idle timer reaps it; null for a provisioned instance. */
  reapedAt: number | null;
}

export type Outcome = 'warm' | 'cold' | 'throttled';
export interface RequestRecord {
  id: number;
  at: number;
  outcome: Outcome;
  instance: number | null;
  /** When the handler starts and ends (null if throttled). */
  handlerStart: number | null;
  end: number | null;
}

export interface Run {
  config: Config;
  requests: RequestRecord[];
  instances: Instance[];
  /** Seconds of billed time: handler time plus function-init time of cold starts. */
  billedSeconds: number;
  provisionedInstances: number;
}

/** Simulate one run. Ties go to the instance: finishing or reaping at time t happens before an arrival at t. */
export function simulate(cfg: Config, times: readonly number[] = arrivals(cfg)): Run {
  const provisionedCount = Math.min(cfg.provisioned, cfg.limit);
  const instances: Instance[] = [];
  const busyUntil = new Map<number, number>();
  const alive = new Set<number>();
  const requests: RequestRecord[] = [];

  for (let slot = 0; slot < provisionedCount; slot++) {
    instances.push({ id: slot, slot, provisioned: true, createdAt: 0, segments: [], reapedAt: null });
    busyUntil.set(slot, 0);
    alive.add(slot);
  }

  const reapedAtOf = (inst: Instance) => (busyUntil.get(inst.id) ?? 0) + cfg.idleReap;
  const lowestFreeSlot = () => {
    const used = new Set([...alive].map((id) => instances[id].slot));
    let s = 0;
    while (used.has(s)) s++;
    return s;
  };

  times.forEach((t, id) => {
    for (const instId of [...alive]) {
      const inst = instances[instId];
      if (!inst.provisioned && reapedAtOf(inst) <= t) {
        inst.reapedAt = reapedAtOf(inst);
        alive.delete(instId);
      }
    }
    const idle = [...alive].map((i) => instances[i]).filter((i) => (busyUntil.get(i.id) ?? 0) <= t);
    if (idle.length) {
      const inst = idle.reduce((a, b) => (b.slot < a.slot ? b : a));
      const end = t + HANDLER_S;
      inst.segments.push({ kind: 'handler', start: t, end, request: id });
      busyUntil.set(inst.id, end);
      requests.push({ id, at: t, outcome: 'warm', instance: inst.id, handlerStart: t, end });
    } else if (alive.size < cfg.limit) {
      const instId = instances.length;
      const p = t + PROVISION_S;
      const r = p + RUNTIME_S;
      const i = r + cfg.initS;
      const end = i + HANDLER_S;
      instances.push({
        id: instId,
        slot: lowestFreeSlot(),
        provisioned: false,
        createdAt: t,
        reapedAt: null,
        segments: [
          { kind: 'provision', start: t, end: p, request: id },
          { kind: 'runtime', start: p, end: r, request: id },
          { kind: 'init', start: r, end: i, request: id },
          { kind: 'handler', start: i, end, request: id },
        ],
      });
      busyUntil.set(instId, end);
      alive.add(instId);
      requests.push({ id, at: t, outcome: 'cold', instance: instId, handlerStart: i, end });
    } else {
      requests.push({ id, at: t, outcome: 'throttled', instance: null, handlerStart: null, end: null });
    }
  });

  for (const inst of instances) {
    if (!inst.provisioned) inst.reapedAt = reapedAtOf(inst);
    // Fill the gaps between its work with idle segments (the hatched "warm" bars).
    const filled: Segment[] = [];
    let cursor = inst.createdAt;
    for (const seg of inst.segments) {
      if (seg.start > cursor) filled.push({ kind: 'idle', start: cursor, end: seg.start });
      filled.push(seg);
      cursor = seg.end;
    }
    filled.push({ kind: 'idle', start: cursor, end: inst.reapedAt ?? Infinity });
    inst.segments = filled;
  }

  const billedSeconds = requests.reduce((sum, r) => {
    if (r.outcome === 'throttled') return sum;
    return sum + HANDLER_S + (r.outcome === 'cold' ? cfg.initS : 0);
  }, 0);
  return { config: cfg, requests, instances, billedSeconds, provisionedInstances: provisionedCount };
}

/** What an instance is doing at time `now`: a segment kind, 'reaped' (fading), or null (not created yet, or long gone). */
export function stateAt(inst: Instance, now: number): SegmentKind | 'reaped' | null {
  if (now < inst.createdAt) return null;
  const seg = inst.segments.find((s) => now >= s.start && now < s.end);
  if (seg) return seg.kind;
  if (inst.reapedAt !== null && now >= inst.reapedAt && now < inst.reapedAt + REAP_FADE_S) return 'reaped';
  return null;
}

// Prices: illustrative, in dollars.
export const PRICE_PER_REQUEST = 0.0000004;
export const PRICE_PER_BILLED_SECOND = 0.0000083;
export const PRICE_PER_PROVISIONED_SECOND = 0.0000021;
export const PRICE_VM_PER_SECOND = 0.0000115;
/** Requests one VM serves at once, illustrative. */
export const VM_SLOTS = 8;
/** Seconds in the 30-day month the run is repeated across. */
export const MONTH_S = 30 * 24 * 3600;

export interface CostInput {
  requests: number;
  billedSeconds: number;
  provisionedInstanceSeconds: number;
}

/** Pay-per-request bill: linear in requests, billed seconds and provisioned instance-seconds. */
export function functionCost(c: CostInput): number {
  return c.requests * PRICE_PER_REQUEST + c.billedSeconds * PRICE_PER_BILLED_SECOND + c.provisionedInstanceSeconds * PRICE_PER_PROVISIONED_SECOND;
}

/** VMs needed to serve the offered load, and what they cost for `seconds`. */
export function vmFleet(demand: number): number {
  return Math.max(1, Math.ceil(demand / VM_SLOTS));
}
export const vmCost = (vms: number, seconds: number) => vms * seconds * PRICE_VM_PER_SECOND;

export interface Costs {
  /** Dollars per month if this run's pattern repeated for a month. */
  functions: number;
  vm: number;
  vms: number;
  served: number;
}

export function costs(run: Run, times: readonly number[]): Costs {
  const scale = MONTH_S / HORIZON;
  const served = run.requests.filter((r) => r.outcome !== 'throttled').length;
  const functions =
    functionCost({ requests: served, billedSeconds: run.billedSeconds, provisionedInstanceSeconds: run.provisionedInstances * HORIZON }) * scale;
  const vms = vmFleet(peakDemand(times));
  return { functions, vm: vmCost(vms, MONTH_S), vms, served };
}

export interface Summary {
  cold: number;
  warm: number;
  throttled: number;
  coldShare: number;
  latencies: number[];
}

/** Counts and latencies (arrival to finish) of the requests that have finished by `now`. */
export function summaryAt(run: Run, now: number): Summary {
  const seen = run.requests.filter((r) => r.at <= now);
  const cold = seen.filter((r) => r.outcome === 'cold').length;
  const warm = seen.filter((r) => r.outcome === 'warm').length;
  const throttled = seen.filter((r) => r.outcome === 'throttled').length;
  const served = cold + warm;
  const latencies = run.requests.filter((r) => r.end !== null && r.end <= now).map((r) => (r.end as number) - r.at);
  return { cold, warm, throttled, coldShare: served === 0 ? 0 : cold / served, latencies };
}
