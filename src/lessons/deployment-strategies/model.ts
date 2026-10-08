import { mulberry32 } from '../../core/random';

/**
 * The fleet and traffic model behind deployment-strategies. Everything here is simulated and
 * every number is illustrative: one tick is one minute, a pod takes BOOT_TICKS to become
 * ready, and the traffic is a toy 200 requests per minute.
 *
 * A run is built in two passes. The forward pass is the deploy as planned. Monitoring then
 * scans it for the first trigger (an alert on the overall error rate, or the canary's own
 * analysis), and the rollback pass takes over from that tick. Decisions only ever use data
 * from before the trigger, so this is the same as deciding as the minutes go by.
 */

export const REPLICAS = 20;
/** maxSurge / maxUnavailable slider step: 1 so the learner can land on 33%, the value that shows the up/down rounding asymmetry. */
export const ROLLOUT_PCT_STEP = 1;
export const REQ_PER_TICK = 200;
export const BOOT_TICKS = 2;
export const HORIZON = 60;
export const DEPLOY_START = 1;
/** Failure rate every version has on its own (timeouts, bad inputs): the noise a canary has to see through. */
export const NATURAL_ERROR = 0.005;
/** The global alert: overall 5xx rate at or above this for ALERT_WINDOW minutes in a row (a "for 5m" rule). */
export const ALERT_RATE = 0.02;
export const ALERT_WINDOW = 5;
/** Canary analysis fails when the canary's error rate is more than this many points above the baseline's. */
export const ANALYSIS_THRESHOLD_PCT = 2;
/** Requests in flight on a server that is killed without draining. */
export const DROP_PER_SERVER = 3;
export const CANARY_WEIGHTS = [0.01, 0.1, 0.5, 1] as const;

export type Strategy = 'recreate' | 'rolling' | 'bluegreen' | 'canary';
export type Schema = 'compatible' | 'breaking';
export type Phase = 'before' | 'deploy' | 'bake' | 'done' | 'rollback' | 'back';

export interface Config {
  strategy: Strategy;
  /** Extra failure probability of v2 on top of NATURAL_ERROR; 0 is no planted bug. */
  bugRate: number;
  /** Rolling update: maxSurge and maxUnavailable as a percentage of the replicas. */
  surgePct: number;
  unavailablePct: number;
  /** Canary: minutes spent at each of the first three weights. */
  bakeTicks: number;
  analysis: boolean;
  schema: Schema;
  drain: boolean;
  seed: number;
}

export const STRATEGIES: Strategy[] = ['recreate', 'rolling', 'bluegreen', 'canary'];

export const DEFAULTS: Config = {
  strategy: 'rolling',
  bugRate: 0.05,
  surgePct: 25,
  unavailablePct: 25,
  bakeTicks: 8,
  analysis: true,
  schema: 'compatible',
  drain: true,
  seed: 1,
};

// ── Rolling update arithmetic (Kubernetes) ──────────────────────────────

export interface Fenceposts {
  surge: number;
  unavailable: number;
  /** Both percentages are 0: the Kubernetes API refuses that, since a rollout could never move. */
  apiRejects: boolean;
}

/**
 * How many pods maxSurge and maxUnavailable allow. Kubernetes turns a percentage into pods
 * by rounding maxSurge UP and maxUnavailable DOWN, and if both come out as 0 it runs with
 * maxUnavailable 1 so the rollout can move. Integer arithmetic, so no float rounding creeps in.
 */
export function resolveFenceposts(replicas: number, surgePct: number, unavailablePct: number): Fenceposts {
  const surge = Math.floor((surgePct * replicas + 99) / 100);
  let unavailable = Math.floor((unavailablePct * replicas) / 100);
  if (surge === 0 && unavailable === 0) unavailable = 1;
  return { surge, unavailable, apiRejects: surgePct === 0 && unavailablePct === 0 };
}

/** The rolling controller's view: `old` ready pods being replaced by `ready` + `pending` new ones. */
export interface RollState {
  old: number;
  ready: number;
  /** Ticks left until each starting pod is ready. */
  pending: number[];
}

/**
 * One controller sync, in Kubernetes's order: new pods that finished starting become ready,
 * then scale the new set up (never past replicas + maxSurge pods in all), then scale the old
 * set down (never below replicas - maxUnavailable pods that are ready).
 */
export function rollStep(s: RollState, replicas: number, f: Fenceposts): { next: RollState; retired: number } {
  const aged = s.pending.map((p) => p - 1);
  const ready = s.ready + aged.filter((p) => p <= 0).length;
  const pending = aged.filter((p) => p > 0);

  const newTotal = ready + pending.length;
  const room = replicas + f.surge - (s.old + newTotal);
  const add = Math.max(0, Math.min(replicas - newTotal, room));
  for (let i = 0; i < add; i++) pending.push(BOOT_TICKS);

  const allPods = s.old + ready + pending.length;
  const minAvailable = replicas - f.unavailable;
  const retired = Math.max(0, Math.min(s.old, allPods - minAvailable - pending.length));
  return { next: { old: s.old - retired, ready, pending }, retired };
}

const rollDone = (s: RollState, replicas: number) => s.old === 0 && s.pending.length === 0 && s.ready === replicas;

// ── Timelines ───────────────────────────────────────────────────────────

export interface TickState {
  t: number;
  v1: number;
  v2: number;
  startingV1: number;
  startingV2: number;
  /** Running but receiving no traffic: the idle blue/green fleet. */
  standby: number;
  /** Share of the requests that reach a server which go to v2. */
  weight: number;
  /** Servers killed this minute while they were serving. */
  retired: number;
  phase: Phase;
}

export const served = (s: TickState) => s.v1 + s.v2 > 0;
export const podsRunning = (s: TickState) => s.v1 + s.v2 + s.startingV1 + s.startingV2 + s.standby;

const steady = (t: number): TickState => ({ t, v1: REPLICAS, v2: 0, startingV1: 0, startingV2: 0, standby: 0, weight: 0, retired: 0, phase: 'before' });

function rollingWeight(v1: number, v2: number): number {
  return v1 + v2 === 0 ? 0 : v2 / (v1 + v2);
}

export interface CanaryStage {
  weight: number;
  pods: number;
  start: number;
  ready: number;
  /** Last minute of the bake window, or null for the final (promoted) stage. */
  bakeEnd: number | null;
}

/** The canary's stages: each starts its pods, shifts the traffic weight when they are ready, then bakes. */
export function canarySchedule(bakeTicks: number): CanaryStage[] {
  const stages: CanaryStage[] = [];
  let start = DEPLOY_START;
  CANARY_WEIGHTS.forEach((weight, k) => {
    const last = k === CANARY_WEIGHTS.length - 1;
    const ready = start + BOOT_TICKS;
    const bakeEnd = last ? null : ready + bakeTicks - 1;
    stages.push({ weight, pods: Math.max(1, Math.ceil(weight * REPLICAS)), start, ready, bakeEnd });
    if (bakeEnd !== null) start = bakeEnd + 1;
  });
  return stages;
}

function canaryTick(t: number, stages: CanaryStage[]): TickState {
  if (t < DEPLOY_START) return steady(t);
  const k = stages.findIndex((s) => s.bakeEnd === null || t <= s.bakeEnd);
  const stage = stages[k];
  const before = k === 0 ? { weight: 0, pods: 0 } : stages[k - 1];
  const base = { t, startingV1: 0, standby: 0 };
  if (t < stage.ready) {
    return { ...base, v1: REPLICAS - before.pods, v2: before.pods, startingV2: stage.pods - before.pods, weight: before.weight, retired: 0, phase: 'deploy' };
  }
  return {
    ...base,
    v1: REPLICAS - stage.pods,
    v2: stage.pods,
    startingV2: 0,
    weight: stage.weight,
    retired: t === stage.ready ? stage.pods - before.pods : 0,
    phase: stage.bakeEnd === null ? 'done' : 'bake',
  };
}

function padTo(ticks: TickState[], length: number): TickState[] {
  const out = ticks.slice(0, length);
  while (out.length < length) {
    const last = out[out.length - 1];
    out.push({ ...last, t: last.t + 1, retired: 0 });
  }
  return out;
}

/** The deploy as planned, for HORIZON minutes. */
export function forwardTicks(cfg: Config): TickState[] {
  const ticks: TickState[] = [];
  if (cfg.strategy === 'canary') {
    const stages = canarySchedule(cfg.bakeTicks);
    for (let t = 0; t < HORIZON; t++) ticks.push(canaryTick(t, stages));
    return ticks;
  }
  const f = resolveFenceposts(REPLICAS, cfg.surgePct, cfg.unavailablePct);
  let roll: RollState = { old: REPLICAS, ready: 0, pending: [] };
  for (let t = 0; t < HORIZON; t++) {
    if (t < DEPLOY_START) {
      ticks.push(steady(t));
      continue;
    }
    const since = t - DEPLOY_START;
    const base = { t, startingV1: 0 };
    if (cfg.strategy === 'recreate') {
      const up = since >= BOOT_TICKS;
      ticks.push({ ...base, v1: 0, v2: up ? REPLICAS : 0, startingV2: up ? 0 : REPLICAS, standby: 0, weight: up ? 1 : 0, retired: since === 0 ? REPLICAS : 0, phase: up ? 'done' : 'deploy' });
    } else if (cfg.strategy === 'bluegreen') {
      const live = since >= BOOT_TICKS;
      ticks.push({ ...base, v1: live ? 0 : REPLICAS, v2: live ? REPLICAS : 0, startingV2: live ? 0 : REPLICAS, standby: live ? REPLICAS : 0, weight: live ? 1 : 0, retired: 0, phase: live ? 'done' : 'deploy' });
    } else {
      const { next, retired } = rollStep(roll, REPLICAS, f);
      roll = next;
      ticks.push({
        ...base, v1: roll.old, v2: roll.ready, startingV2: roll.pending.length, standby: 0,
        weight: rollingWeight(roll.old, roll.ready), retired, phase: rollDone(roll, REPLICAS) ? 'done' : 'deploy',
      });
    }
  }
  return ticks;
}

/** What happens after a trigger at `at`: ticks from at.t + 1 until the fleet is back on v1 (the caller pads). */
function rollbackTicks(cfg: Config, at: TickState): TickState[] {
  const out: TickState[] = [];
  const from = at.t + 1;
  const base = { startingV2: 0, startingV1: 0, standby: 0, weight: 0 };
  if (cfg.strategy === 'recreate') {
    for (let i = 0; i < BOOT_TICKS; i++) out.push({ ...base, t: from + i, v1: 0, v2: 0, startingV1: REPLICAS, retired: i === 0 ? at.v2 : 0, phase: 'rollback' });
    out.push({ ...base, t: from + BOOT_TICKS, v1: REPLICAS, v2: 0, retired: 0, phase: 'back' });
    return out;
  }
  if (cfg.strategy === 'bluegreen') {
    out.push({ ...base, t: from, v1: REPLICAS, v2: 0, standby: REPLICAS, retired: 0, phase: 'back' });
    return out;
  }
  if (cfg.strategy === 'canary' && at.v1 > 0) {
    const restoring = REPLICAS - at.v1;
    out.push({ ...base, t: from, v1: at.v1, v2: 0, startingV1: restoring, retired: at.v2, phase: 'back' });
    if (restoring > 0) {
      for (let i = 1; i < BOOT_TICKS; i++) out.push({ ...out[0], t: from + i, retired: 0 });
      out.push({ ...base, t: from + BOOT_TICKS, v1: REPLICAS, v2: 0, retired: 0, phase: 'back' });
    }
    return out;
  }
  // Rolling (and a canary already promoted to 100%): undoing is another rolling update, v2 -> v1.
  const f = resolveFenceposts(REPLICAS, cfg.surgePct, cfg.unavailablePct);
  let roll: RollState = { old: at.v2, ready: at.v1, pending: [] };
  for (let t = from; t < HORIZON && !(out.length && rollDone(roll, REPLICAS)); t++) {
    const step = rollStep(roll, REPLICAS, f);
    roll = step.next;
    out.push({
      t, v1: roll.ready, v2: roll.old, startingV1: roll.pending.length, startingV2: 0, standby: 0,
      weight: rollingWeight(roll.ready, roll.old), retired: step.retired, phase: roll.old === 0 ? 'back' : 'rollback',
    });
  }
  return out;
}

// ── Requests ────────────────────────────────────────────────────────────

export type Outcome = 'ok' | 'bug' | 'natural' | 'outage' | 'schema';
export interface Req {
  by: 'v1' | 'v2' | 'none';
  outcome: Outcome;
}

const schemaBroken = (cfg: Config, t: number) => cfg.schema === 'breaking' && t >= DEPLOY_START;

/**
 * The minute's requests, from a seeded stream (the same seed and minute always give the same
 * requests). Each request is routed to v2 with probability `weight`; v2 fails with the planted
 * bug's probability, v1 fails every time once the schema has moved under it, and anything can
 * fail on its own at NATURAL_ERROR. With no server up, the request is an outage.
 */
export function sampleRequests(cfg: Config, tick: TickState): Req[] {
  const rnd = mulberry32(cfg.seed * 7919 + tick.t * 104729 + 17);
  const up = served(tick);
  const broken = schemaBroken(cfg, tick.t);
  const out: Req[] = [];
  for (let i = 0; i < REQ_PER_TICK; i++) {
    const route = rnd();
    const bug = rnd();
    const natural = rnd();
    if (!up) {
      out.push({ by: 'none', outcome: 'outage' });
      continue;
    }
    const by = route < tick.weight ? 'v2' : 'v1';
    let outcome: Outcome = 'ok';
    if (by === 'v2' && bug < cfg.bugRate) outcome = 'bug';
    else if (by === 'v1' && broken) outcome = 'schema';
    else if (natural < NATURAL_ERROR) outcome = 'natural';
    out.push({ by, outcome });
  }
  return out;
}

export interface Tally {
  /** Requests that reached a server of each version, and how many of them failed. */
  n1: number;
  n2: number;
  failed1: number;
  failed2: number;
  bug: number;
  schema: number;
  outage: number;
  natural: number;
  /** In-flight requests lost to servers killed without draining. */
  dropped: number;
}

export const droppedAt = (cfg: Config, tick: TickState) => (cfg.drain ? 0 : tick.retired * DROP_PER_SERVER);

export function tally(cfg: Config, tick: TickState, reqs: readonly Req[] = sampleRequests(cfg, tick)): Tally {
  const t: Tally = { n1: 0, n2: 0, failed1: 0, failed2: 0, bug: 0, schema: 0, outage: 0, natural: 0, dropped: droppedAt(cfg, tick) };
  for (const r of reqs) {
    if (r.by === 'v1') t.n1++;
    if (r.by === 'v2') t.n2++;
    if (r.outcome === 'ok') continue;
    if (r.by === 'v1') t.failed1++;
    if (r.by === 'v2') t.failed2++;
    t[r.outcome]++;
  }
  return t;
}

/** Failures caused by the deploy (not the background noise) in one minute's sample. */
export const hitBy = (t: Tally) => t.bug + t.schema + t.outage + t.dropped;

/** Expected deploy-caused failures in a minute: the closed form, share on v2 x bug rate x requests, plus outage, schema and drops. */
export function expectedHit(cfg: Config, tick: TickState): number {
  const perRequest = served(tick) ? tick.weight * cfg.bugRate + (1 - tick.weight) * (schemaBroken(cfg, tick.t) ? 1 : 0) : 1;
  return REQ_PER_TICK * perRequest + droppedAt(cfg, tick);
}

/** The alert's view of a minute: expected 5xx rate among requests that reached a server (an outage never gets that far). */
export function alertRate(cfg: Config, tick: TickState): number | null {
  if (!served(tick)) return null;
  const v2 = cfg.bugRate + (1 - cfg.bugRate) * NATURAL_ERROR;
  const v1 = schemaBroken(cfg, tick.t) ? 1 : NATURAL_ERROR;
  return tick.weight * v2 + (1 - tick.weight) * v1;
}

// ── Monitoring ──────────────────────────────────────────────────────────

/**
 * The canary's verdict over one bake window: fail when the canary's error rate is more than
 * `thresholdPct` points above the baseline's. Compared as integers (cross-multiplied), so a
 * difference of exactly the threshold passes. No canary requests means nothing to judge: pass.
 */
export function analysisFails(canaryErrors: number, canaryN: number, baseErrors: number, baseN: number, thresholdPct = ANALYSIS_THRESHOLD_PCT): boolean {
  if (canaryN === 0) return false;
  if (baseN === 0) return canaryErrors * 100 > thresholdPct * canaryN;
  return (canaryErrors * baseN - baseErrors * canaryN) * 100 > thresholdPct * canaryN * baseN;
}

export interface Window {
  from: number;
  to: number;
  canaryErrors: number;
  canaryN: number;
  baseErrors: number;
  baseN: number;
  fails: boolean;
}

export function analysisWindow(tallies: readonly Tally[], from: number, to: number): Window {
  const w: Window = { from, to, canaryErrors: 0, canaryN: 0, baseErrors: 0, baseN: 0, fails: false };
  for (let t = from; t <= to; t++) {
    w.canaryErrors += tallies[t].failed2;
    w.canaryN += tallies[t].n2;
    w.baseErrors += tallies[t].failed1;
    w.baseN += tallies[t].n1;
  }
  w.fails = analysisFails(w.canaryErrors, w.canaryN, w.baseErrors, w.baseN);
  return w;
}

export type TriggerKind = 'alert' | 'analysis';
export interface Trigger {
  tick: number;
  kind: TriggerKind;
  /** The analysis window that failed. */
  window?: Window;
  /** A breaking schema change leaves nothing to roll back to. */
  blocked: boolean;
}

/** The first moment monitoring would act, scanning the forward timeline in order. */
export function findTrigger(cfg: Config, ticks: readonly TickState[], tallies: readonly Tally[]): Trigger | null {
  const blocked = cfg.schema === 'breaking';
  const stages = cfg.strategy === 'canary' && cfg.analysis ? canarySchedule(cfg.bakeTicks) : [];
  let streak = 0;
  for (const tick of ticks) {
    const rate = alertRate(cfg, tick);
    streak = rate !== null && rate >= ALERT_RATE ? streak + 1 : 0;
    const stage = stages.find((s) => s.bakeEnd === tick.t);
    if (stage) {
      const window = analysisWindow(tallies, stage.ready, stage.bakeEnd!);
      if (window.fails) return { tick: tick.t, kind: 'analysis', window, blocked };
    }
    if (streak >= ALERT_WINDOW) return { tick: tick.t, kind: 'alert', blocked };
  }
  return null;
}

// ── A whole run ─────────────────────────────────────────────────────────

export interface Run {
  cfg: Config;
  ticks: TickState[];
  tallies: Tally[];
  trigger: Trigger | null;
  /** First minute of traffic on v2, or null if none ever reached it. */
  firstExposure: number | null;
  /** First minute the whole deploy is on v2, or null. */
  completedAt: number | null;
  /** First minute after the trigger with servers up and no traffic on v2. */
  rolledBackAt: number | null;
  /** The most servers running at once (the cost of the strategy). */
  peakPods: number;
  /** Most traffic share v2 ever got while serving. */
  peakExposure: number;
  expectedHit: number;
  sampledHit: number;
}

export function simulate(cfg: Config): Run {
  const forward = forwardTicks(cfg);
  const forwardTallies = forward.map((t) => tally(cfg, t));
  const trigger = findTrigger(cfg, forward, forwardTallies);
  let ticks = forward;
  if (trigger && !trigger.blocked) {
    ticks = padTo([...forward.slice(0, trigger.tick + 1), ...rollbackTicks(cfg, forward[trigger.tick])], HORIZON);
  }
  const tallies = ticks.map((t, i) => (t === forward[i] ? forwardTallies[i] : tally(cfg, t)));
  const sum = (f: (t: Tally) => number) => tallies.reduce((n, t) => n + f(t), 0);
  const firstExposure = ticks.find((t) => served(t) && t.weight > 0)?.t ?? null;
  const completedAt = forward.find((t) => t.v2 === REPLICAS && t.v1 === 0)?.t ?? null;
  const rolledBackAt = trigger && !trigger.blocked ? (ticks.find((t) => t.t > trigger.tick && served(t) && t.weight === 0)?.t ?? null) : null;
  return {
    cfg, ticks, tallies, trigger, firstExposure, completedAt, rolledBackAt,
    peakPods: Math.max(...ticks.map(podsRunning)),
    peakExposure: Math.max(0, ...ticks.filter(served).map((t) => t.weight)),
    expectedHit: ticks.reduce((n, t) => n + expectedHit(cfg, t), 0),
    sampledHit: sum(hitBy),
  };
}

/** Minutes from the first request on v2 to the trigger; null without either. */
export function detectAfter(run: Run): number | null {
  return run.trigger && run.firstExposure !== null ? run.trigger.tick - run.firstExposure : null;
}

/** Minutes from the trigger until no traffic is on v2; null when nothing triggered or rollback is blocked. */
export function rollbackAfter(run: Run): number | null {
  return run.trigger && run.rolledBackAt !== null ? run.rolledBackAt - run.trigger.tick : null;
}

/** Servers kept as a share of the replicas: the cost bar's number. */
export const costRatio = (run: Run) => run.peakPods / REPLICAS;

/** Cumulative sampled deploy-caused failures up to and including minute `t`. */
export function hitSoFar(run: Run, t: number): number {
  let n = 0;
  for (let i = 0; i <= t; i++) n += hitBy(run.tallies[i]);
  return n;
}
