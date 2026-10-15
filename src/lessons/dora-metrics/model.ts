import { exponential } from '../../core/distributions';
import { mulberry32, type Rnd } from '../../core/random';
import { createTickSim, type TickSim } from '../../core/simTick';

const MINUTES_PER_HOUR = 60;

/* ---------- scene 1: a simulated delivery pipeline (every constant illustrative) ---------- */

export const WORK_HOURS_PER_DAY = 8;
export const WEEKS = 12;
export const WORKING_DAYS = WEEKS * 5;
export const RUN_HOURS = WORKING_DAYS * WORK_HOURS_PER_DAY;

/** Share of changes that carry a defect before any automation. */
export const BASE_DEFECT_RATE = 0.03;
/** The most that full test automation lowers that share (60%). */
export const MAX_AUTOMATION_EFFECT = 0.6;
/** Working hours from a release being cut to it being live: CI and the deploy. */
export const PIPELINE_HOURS = 1;
/** A manual QA gate adds two working days. */
export const QA_GATE_HOURS = 2 * WORK_HOURS_PER_DAY;
/** Time to restore: detection, each step of bisecting the batch, and the rollback. */
export const RESTORE = { detectMin: 15, bisectStepMin: 20, rollbackMin: 15 } as const;
/** Share of failures that are fixed by a hotfix instead of a rollback, when rollback-first is off. */
export const FIX_FORWARD_SHARE = 0.5;
/** A team that "games" deployment frequency splits each change into this many deploys. */
export const SPLIT_FACTOR = 5;

export const CHANGES_PER_DAY_RANGE = { min: 1, max: 20, step: 1 } as const;
export const BATCH_RANGE = { min: 1, max: 30, step: 1 } as const;
export const CADENCE_RANGE = { min: 1, max: 10, step: 1 } as const;
export const AUTOMATION_RANGE = { min: 0, max: 1, step: 0.1 } as const;

export type ReleaseMode = 'batch' | 'train';
export type Gaming = 'none' | 'split' | 'rollbacks-only';
export const GAMING_OPTIONS: readonly Gaming[] = ['none', 'split', 'rollbacks-only'];
export const GAMING_NAME: Record<Gaming, string> = { none: 'no gaming', split: 'split into five deploys', 'rollbacks-only': 'count only rollbacks' };

export interface Pipeline {
  /** Merged changes per working day. */
  changesPerDay: number;
  mode: ReleaseMode;
  /** Release when this many changes have accumulated (mode batch). */
  batch: number;
  /** Release every this many working days (mode train). */
  cadenceDays: number;
  manualQa: boolean;
  /** 0 to 1: how much of the test suite is automated. */
  automation: number;
  /** Skip finding the culprit in the batch: roll back the whole release. */
  rollbackFirst: boolean;
}

export const PIPELINE_DEFAULT: Pipeline = { changesPerDay: 4, mode: 'batch', batch: 8, cadenceDays: 5, manualQa: true, automation: 0.3, rollbackFirst: false };
export const SCENE1_SEED = 1;

/** The chance a change is defective after automation. */
export const defectRate = (automation: number): number => BASE_DEFECT_RATE * (1 - MAX_AUTOMATION_EFFECT * automation);

/** P(a release of b changes fails) = 1 − (1 − f)^b. */
export const releaseFailureChance = (b: number, automation: number): number => 1 - (1 - defectRate(automation)) ** b;

/** ⌈log₂ b⌉, with no floating-point log: the number of halvings to get from b candidates to one. */
export function ceilLog2(b: number): number {
  let steps = 0;
  for (let n = 1; n < b; n *= 2) steps++;
  return steps;
}

/** Minutes from a failure to service restored: detect, bisect the batch (unless rollback-first), roll back. */
export const restoreMinutes = (b: number, rollbackFirst: boolean): number =>
  RESTORE.detectMin + (rollbackFirst ? 0 : ceilLog2(b) * RESTORE.bisectStepMin) + RESTORE.rollbackMin;

export interface Change {
  mergedAt: number;
  defective: boolean;
}

export interface Release {
  deployAt: number;
  changes: number;
  failed: boolean;
  /** How a failure was fixed: rolled back or fixed forward. Null for a good release. */
  fix: 'rollback' | 'hotfix' | null;
  restoreMin: number | null;
  /** Working hours each of the release's changes waited from merge to live. */
  leadHours: number[];
}

export interface DeliveryState {
  day: number;
  /** Changes merged so far, not yet released (shared, append-only: states read their own prefix). */
  pending: Change[];
  releases: Release[];
  nextArrival: number;
  changesMerged: number;
}

const gates = (p: Pipeline): number => PIPELINE_HOURS + (p.manualQa ? QA_GATE_HOURS : 0);

function cut(p: Pipeline, rnd: Rnd, changes: Change[], at: number): Release {
  const failed = changes.some((c) => c.defective);
  const fix = failed ? (p.rollbackFirst || rnd() >= FIX_FORWARD_SHARE ? 'rollback' : 'hotfix') : null;
  const deployAt = at + gates(p);
  return {
    deployAt, changes: changes.length, failed, fix, restoreMin: failed ? restoreMinutes(changes.length, p.rollbackFirst) : null,
    leadHours: changes.map((c) => deployAt - c.mergedAt),
  };
}

/** The twelve weeks, a working day a tick: Poisson arrivals through the day (exponential gaps), and a release whenever the rule says. */
export function createDelivery(p: Pipeline, seed: number): TickSim<DeliveryState> {
  const f = defectRate(p.automation);
  const gap = (rnd: Rnd) => exponential(rnd, p.changesPerDay / WORK_HOURS_PER_DAY);
  return createTickSim<DeliveryState>({
    seed,
    init: (rnd) => ({ day: 0, pending: [], releases: [], nextArrival: gap(rnd), changesMerged: 0 }),
    step: (s, rnd, tick) => {
      const dayEnd = tick * WORK_HOURS_PER_DAY;
      const pending = [...s.pending];
      const releases = [...s.releases];
      let nextArrival = s.nextArrival;
      let merged = s.changesMerged;
      while (nextArrival < dayEnd) {
        pending.push({ mergedAt: nextArrival, defective: rnd() < f });
        merged++;
        nextArrival += gap(rnd);
        if (p.mode === 'batch' && pending.length >= p.batch) {
          const batch = pending.splice(0, p.batch);
          releases.push(cut(p, rnd, batch, batch[batch.length - 1].mergedAt));
        }
      }
      if (p.mode === 'train' && tick % p.cadenceDays === 0 && pending.length > 0) releases.push(cut(p, rnd, pending.splice(0, pending.length), dayEnd));
      return { day: tick, pending, releases, nextArrival, changesMerged: merged };
    },
  });
}

export interface DeliveryMetrics {
  releases: number;
  changesReleased: number;
  /** Releases per week. */
  deploymentsPerWeek: number;
  /** Median working hours from merge to live, over the released changes; null with no release. */
  leadHoursMedian: number | null;
  leadHoursMean: number | null;
  /** Share of releases that failed. */
  failureRate: number | null;
  /** Median minutes to restore, over failures; null when nothing failed. */
  restoreMedianMin: number | null;
  failures: number;
  rollbacks: number;
}

export const median = (xs: readonly number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const mean = (xs: readonly number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function measureDelivery(releases: readonly Release[]): DeliveryMetrics {
  const leads = releases.flatMap((r) => r.leadHours);
  const failed = releases.filter((r) => r.failed);
  return {
    releases: releases.length,
    changesReleased: leads.length,
    deploymentsPerWeek: releases.length / WEEKS,
    leadHoursMedian: median(leads),
    leadHoursMean: mean(leads),
    failureRate: releases.length ? failed.length / releases.length : null,
    restoreMedianMin: median(failed.map((r) => r.restoreMin!)),
    failures: failed.length,
    rollbacks: failed.filter((r) => r.fix === 'rollback').length,
  };
}

export function runDelivery(p: Pipeline, seed: number): DeliveryMetrics & { releaseList: Release[] } {
  const sim = createDelivery(p, seed);
  sim.run(WORKING_DAYS);
  return { ...measureDelivery(sim.state.releases), releaseList: sim.state.releases };
}

/** What a gamed team would report next to what is real: only the named metric moves. */
export interface Reported {
  deploymentsPerWeek: number;
  failureRate: number | null;
  leadHoursMedian: number | null;
  restoreMedianMin: number | null;
}

export function reportedMetrics(m: DeliveryMetrics, gaming: Gaming): Reported {
  return {
    deploymentsPerWeek: gaming === 'split' ? m.deploymentsPerWeek * SPLIT_FACTOR : m.deploymentsPerWeek,
    failureRate: gaming === 'rollbacks-only' && m.releases ? m.rollbacks / m.releases : m.failureRate,
    leadHoursMedian: m.leadHoursMedian,
    restoreMedianMin: m.restoreMedianMin,
  };
}

/** Illustrative bands, never DORA's: good, between, poor. Each upTo is inclusive, in the metric's own unit. */
export const BANDS = {
  deploymentsPerWeek: { poorBelow: 1, goodFrom: 5, max: 40 },
  leadHours: { goodUpTo: WORK_HOURS_PER_DAY, betweenUpTo: 5 * WORK_HOURS_PER_DAY, max: 80 },
  failureRate: { goodUpTo: 0.15, betweenUpTo: 0.3, max: 0.6 },
  restoreMin: { goodUpTo: 60, betweenUpTo: 8 * MINUTES_PER_HOUR, max: 960 },
} as const;

/* ---------- scene 2: measuring from a log, with definitions the learner changes ---------- */

export type LeadStart = 'commit' | 'pr' | 'merge';
export type FailureDef = 'rollback' | 'rollback-or-hotfix' | 'incident';
export type RestoreEnd = 'restored' | 'fix';
export const LEAD_STARTS: readonly LeadStart[] = ['commit', 'pr', 'merge'];
export const FAILURE_DEFS: readonly FailureDef[] = ['rollback', 'rollback-or-hotfix', 'incident'];
export const RESTORE_ENDS: readonly RestoreEnd[] = ['restored', 'fix'];

export const LEAD_START_NAME: Record<LeadStart, string> = { commit: 'first commit', pr: 'pull request opened', merge: 'merge' };
export const FAILURE_NAME: Record<FailureDef, string> = {
  rollback: 'a rollback',
  'rollback-or-hotfix': 'a rollback or a hotfix within 24 h',
  incident: 'linked to an incident',
};
export const RESTORE_END_NAME: Record<RestoreEnd, string> = { restored: 'service restored', fix: 'fix deployed' };

/** The sentence a metric's label says about where lead time starts: the label test holds the number to this. */
export const leadTimeLabel = (start: LeadStart): string => `from ${LEAD_START_NAME[start]} to production`;

export interface Definitions {
  leadStart: LeadStart;
  failure: FailureDef;
  restoreEnd: RestoreEnd;
}
export const DEFINITIONS_DEFAULT: Definitions = { leadStart: 'merge', failure: 'rollback', restoreEnd: 'restored' };

export interface Deployment {
  id: number;
  /** Hours since the log's start (a Monday 00:00 UTC). */
  commitAt: number;
  prAt: number;
  mergeAt: number;
  deployAt: number;
  outcome: 'ok' | 'rollback' | 'hotfix';
  /** Linked to an incident record, whatever the outcome. */
  incident: boolean;
  /** Minutes from the deploy to service restored, and hours from the deploy to the fix being deployed. Null for a good deploy. */
  restoredMin: number | null;
  fixHours: number | null;
}

export const LOG_START = '2026-03-02T00:00:00Z';
export const LOG_WEEKS = 4;
export const LOG_DEPLOYMENTS = 50;
export const HOURS_PER_WEEK = 168;
export const LOG_SEED = 1;
const WEEKDAYS_PER_WEEK = 5;
const HOURS_PER_DAY = 24;
/** The planted failures: a seeded log always holds each kind, so every definition gives a different number. In every failure the fix is deployed after service is restored, so ending the clock at the fix always moves the median. */
export const PLANTED = { rollbacks: 3, quickHotfixes: 2, lateHotfixes: 1, okIncidents: 2 } as const;
const HOTFIX_WINDOW_HOURS = 24;
const LATE_HOTFIX_HOURS = 40;
/** After a rollback or a mitigation the real fix ships later: this many hours, plus up to FOLLOW_UP_SPREAD_HOURS more. */
const FOLLOW_UP_MIN_HOURS = 2;
const FOLLOW_UP_SPREAD_HOURS = 22;
const followUpHours = (restoredMin: number, rnd: Rnd): number => restoredMin / MINUTES_PER_HOUR + FOLLOW_UP_MIN_HOURS + Math.floor(rnd() * FOLLOW_UP_SPREAD_HOURS);

/** A seeded log of 50 deployments over 4 weeks, with planted failures (3 rollbacks, 2 quick hotfixes, 1 late hotfix, 2 incidents on good deploys). */
export function makeLog(seed: number): Deployment[] {
  const rnd = mulberry32(seed);
  const days = LOG_WEEKS * WEEKDAYS_PER_WEEK;
  const deployAts = Array.from({ length: LOG_DEPLOYMENTS }, () => {
    const day = Math.floor(rnd() * days);
    const calendarDay = Math.floor(day / WEEKDAYS_PER_WEEK) * 7 + (day % WEEKDAYS_PER_WEEK);
    return calendarDay * HOURS_PER_DAY + 9 + rnd() * 8;
  }).sort((a, b) => a - b);
  const log: Deployment[] = deployAts.map((deployAt, id) => {
    const mergeAt = deployAt - (0.3 + 20 * rnd() ** 2);
    const prAt = mergeAt - (1 + 28 * rnd());
    const commitAt = prAt - (0.5 + 8 * rnd());
    return { id: id + 1, commitAt, prAt, mergeAt, deployAt, outcome: 'ok', incident: false, restoredMin: null, fixHours: null };
  });
  const order = Array.from({ length: LOG_DEPLOYMENTS }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  let next = 0;
  const plant = (n: number, make: (d: Deployment, k: number) => void) => {
    for (let k = 0; k < n; k++) make(log[order[next++]], k);
  };
  const restore = () => 45 + Math.floor(rnd() * 75);
  plant(PLANTED.rollbacks, (d, k) => {
    d.outcome = 'rollback';
    d.incident = k < 2;
    d.restoredMin = restore();
    d.fixHours = followUpHours(d.restoredMin, rnd);
  });
  plant(PLANTED.quickHotfixes, (d, k) => {
    d.outcome = 'hotfix';
    d.incident = k === 0;
    d.restoredMin = restore() + 60;
    d.fixHours = 3 + Math.floor(rnd() * 18);
  });
  plant(PLANTED.lateHotfixes, (d) => {
    d.outcome = 'hotfix';
    d.incident = true;
    d.restoredMin = restore() + 60;
    d.fixHours = LATE_HOTFIX_HOURS;
  });
  plant(PLANTED.okIncidents, (d) => {
    d.incident = true;
    d.restoredMin = restore();
    d.fixHours = followUpHours(d.restoredMin, rnd);
  });
  return log;
}

/** Whether a deployment counts as a failure under a definition. */
export function isFailure(d: Deployment, def: FailureDef): boolean {
  if (def === 'rollback') return d.outcome === 'rollback';
  if (def === 'incident') return d.incident;
  return d.outcome === 'rollback' || (d.outcome === 'hotfix' && d.fixHours! <= HOTFIX_WINDOW_HOURS);
}

export const leadStartOf = (d: Deployment, start: LeadStart): number => (start === 'commit' ? d.commitAt : start === 'pr' ? d.prAt : d.mergeAt);

/** Hours from the chosen start to the deploy, for every deployment. */
export const leadHours = (log: readonly Deployment[], start: LeadStart): number[] => log.map((d) => d.deployAt - leadStartOf(d, start));

/** Minutes to restore for each failure, ending at the chosen point. */
export const restoreMins = (log: readonly Deployment[], def: FailureDef, end: RestoreEnd): number[] =>
  log.filter((d) => isFailure(d, def)).map((d) => (end === 'restored' ? d.restoredMin! : d.fixHours! * MINUTES_PER_HOUR));

export interface LogMetrics {
  deploymentsPerWeek: number;
  leadMedian: number;
  leadMean: number;
  failures: number;
  failureRate: number;
  /** Null when no deployment failed: there is nothing to restore from. */
  restoreMedian: number | null;
  restoreMean: number | null;
}

export function logMetrics(log: readonly Deployment[], defs: Definitions): LogMetrics {
  const leads = leadHours(log, defs.leadStart);
  const restores = restoreMins(log, defs.failure, defs.restoreEnd);
  const failures = log.filter((d) => isFailure(d, defs.failure)).length;
  return {
    deploymentsPerWeek: log.length / LOG_WEEKS,
    leadMedian: median(leads)!,
    leadMean: mean(leads)!,
    failures,
    failureRate: failures / log.length,
    restoreMedian: median(restores),
    restoreMean: mean(restores),
  };
}

/** The deployments of one week (0-based) of the log, by deploy time. */
export const weekOf = (log: readonly Deployment[], week: number): Deployment[] =>
  log.filter((d) => d.deployAt >= week * HOURS_PER_WEEK && d.deployAt < (week + 1) * HOURS_PER_WEEK);

export const LOG_DEFAULT = { defs: DEFINITIONS_DEFAULT, week: 0, seed: LOG_SEED };
