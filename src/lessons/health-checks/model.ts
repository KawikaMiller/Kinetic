/**
 * Four pods, three probes each, one shared database. Time moves in whole seconds; every number
 * is compressed for the lesson. `probeOutcome` decides what a probe sees at a moment, and the
 * simulation only applies the thresholds around it.
 */

export const PODS = 4;
export const HORIZON = 80;
/** Seconds a restarted container is held down before it starts (a real kubelet backs off, up to five minutes: CrashLoopBackOff). */
export const RESTART_DELAY_S = 2;
export const REQUESTS_PER_SECOND = 4;
/** Connections a starting pod opens to the database. */
export const POOL_ATTEMPTS = 5;

export type CheckKind = 'tcp' | 'handler' | 'db' | 'cache';
export type ProbeKind = 'startup' | 'liveness' | 'readiness';
export const CHECKS: CheckKind[] = ['tcp', 'handler', 'db', 'cache'];
export const PROBES: ProbeKind[] = ['startup', 'liveness', 'readiness'];

export interface ProbeConfig {
  enabled: boolean;
  check: CheckKind;
  /** Seconds between runs; the first run is when the container starts. */
  period: number;
  /** Failures in a row that count as failed. */
  threshold: number;
}

export type Config = Record<ProbeKind, ProbeConfig>;

export type ScenarioId = 'slow-boot' | 'db-outage' | 'deadlock' | 'early-ready' | 'flapping';

export interface Scenario {
  id: ScenarioId;
  label: string;
  /** Seconds after a container starts before its request handler answers (the app is still loading). */
  bootS: number;
  /** Extra seconds after that before its cache is warm. */
  cacheS: number;
  /** Windows [from, to) in which the database is unreachable. */
  dbDown: [number, number][];
  /** From this second on, this pod's handler hangs while its port stays open (until it is restarted). */
  deadlock: { pod: number; at: number } | null;
  /** The probe settings the scenario starts with: the mistake to find. */
  initial: Config;
}

const probe = (check: CheckKind, period: number, threshold: number, enabled = true): ProbeConfig => ({ enabled, check, period, threshold });
const noStartup = probe('handler', 5, 12, false);
export const STARTUP_DEFAULT = probe('handler', 5, 12);

const flapWindows = (): [number, number][] => [10, 20, 30, 40, 50, 60].map((s) => [s, s + 2]);

export const SCENARIOS: Scenario[] = [
  {
    id: 'slow-boot',
    label: 'Slow boot',
    bootS: 30,
    cacheS: 0,
    dbDown: [],
    deadlock: null,
    initial: { startup: noStartup, liveness: probe('handler', 5, 3), readiness: probe('handler', 5, 2) },
  },
  {
    id: 'db-outage',
    label: 'DB outage',
    bootS: 3,
    cacheS: 0,
    dbDown: [[10, 34]],
    deadlock: null,
    initial: { startup: noStartup, liveness: probe('db', 5, 3), readiness: probe('handler', 5, 2) },
  },
  {
    id: 'deadlock',
    label: 'Deadlocked process',
    bootS: 3,
    cacheS: 0,
    dbDown: [],
    deadlock: { pod: 2, at: 15 },
    initial: { startup: noStartup, liveness: probe('tcp', 5, 3), readiness: probe('tcp', 5, 2) },
  },
  {
    id: 'early-ready',
    label: 'Ready too early',
    bootS: 4,
    cacheS: 16,
    dbDown: [],
    deadlock: null,
    initial: { startup: noStartup, liveness: probe('handler', 5, 3), readiness: probe('handler', 5, 2) },
  },
  {
    id: 'flapping',
    label: 'Flapping',
    bootS: 3,
    cacheS: 0,
    dbDown: flapWindows(),
    deadlock: null,
    initial: { startup: noStartup, liveness: probe('handler', 5, 3), readiness: probe('db', 1, 1) },
  },
];

export const scenarioById = (id: ScenarioId): Scenario => SCENARIOS.find((s) => s.id === id)!;

/** What is true of one container at one moment. */
export interface Facts {
  /** Seconds since this container started. */
  age: number;
  /** Seconds since the run began. */
  t: number;
  /** The handler is hung: the port still accepts connections, nothing answers. */
  hung: boolean;
  scenario: Pick<Scenario, 'bootS' | 'cacheS' | 'dbDown'>;
}

/** Is this pod's handler hung at second t? Only the incarnation that was running when the deadlock hit. */
export const isHung = (s: Pick<Scenario, 'deadlock'>, pod: number, t: number, startedAt: number) =>
  s.deadlock !== null && s.deadlock.pod === pod && t >= s.deadlock.at && startedAt <= s.deadlock.at;

export const dbUp = (s: Pick<Scenario, 'dbDown'>, t: number) => !s.dbDown.some(([from, to]) => t >= from && t < to);
export const portOpen = (f: Facts) => f.age >= 1;
export const handlerUp = (f: Facts) => f.age >= f.scenario.bootS && !f.hung;
export const cacheWarm = (f: Facts) => f.age >= f.scenario.bootS + f.scenario.cacheS;

/** Does this check pass right now? Deeper checks pass only when everything shallower does. */
export function checkPasses(check: CheckKind, f: Facts): boolean {
  switch (check) {
    case 'tcp':
      return portOpen(f);
    case 'handler':
      return handlerUp(f);
    case 'db':
      return handlerUp(f) && dbUp(f.scenario, f.t);
    case 'cache':
      return handlerUp(f) && cacheWarm(f);
  }
}

export type ProbeResult = 'pass' | 'fail' | 'idle';

/**
 * What one probe sees at this moment. It only runs when it is enabled, due (age is a multiple
 * of its period) and not held back: liveness and readiness wait for the startup probe to have
 * succeeded. 'idle' means it did not run.
 */
export function probeOutcome(kind: ProbeKind, cfg: ProbeConfig, startupDone: boolean, f: Facts): ProbeResult {
  if (!cfg.enabled) return 'idle';
  if (f.age % cfg.period !== 0) return 'idle';
  if (kind !== 'startup' && !startupDone) return 'idle';
  if (kind === 'startup' && startupDone) return 'idle';
  return checkPasses(cfg.check, f) ? 'pass' : 'fail';
}

export type RequestOutcome = 'ok' | 'slow' | 'error';

/** A request that reaches a pod: it fails if the handler is hung or the database is gone, and is slow while the cache is cold. */
export function requestOutcome(f: Facts): RequestOutcome {
  if (!handlerUp(f) || !dbUp(f.scenario, f.t)) return 'error';
  return cacheWarm(f) ? 'ok' : 'slow';
}

export interface PodSecond {
  /** The container is running (not waiting to restart). */
  up: boolean;
  ready: boolean;
  results: Record<ProbeKind, ProbeResult>;
  /** The container was restarted by a probe this second, and which probe gave up on it. */
  restarted: boolean;
  restartCause: ProbeKind | null;
  /** The first second of a new container. */
  started: boolean;
  /** Seconds since its container started (null while down). */
  age: number | null;
  hung: boolean;
}

export interface Second {
  t: number;
  pods: PodSecond[];
  /** Requests this second, by outcome, and how many found no ready pod. */
  requests: { ok: number; slow: number; error: number; unrouted: number };
  dbUp: boolean;
  /** Connections tried against the database this second. */
  dbAttempts: number;
}

export interface Run {
  config: Config;
  scenario: Scenario;
  seconds: Second[];
  restarts: number[];
}

interface PodState {
  startedAt: number;
  restartAt: number | null;
  startupDone: boolean;
  fails: Record<ProbeKind, number>;
  ready: boolean;
  restarts: number;
}

const freshState = (t: number, cfg: Config): PodState => ({
  startedAt: t,
  restartAt: null,
  startupDone: !cfg.startup.enabled,
  fails: { startup: 0, liveness: 0, readiness: 0 },
  ready: false,
  restarts: 0,
});

export function simulate(config: Config, scenario: Scenario): Run {
  const pods = Array.from({ length: PODS }, () => freshState(0, config));
  const seconds: Second[] = [];
  let rotation = 0;

  for (let t = 0; t < HORIZON; t++) {
    let dbAttempts = 0;
    const row: PodSecond[] = [];
    pods.forEach((s, i) => {
      let started = t === 0;
      if (s.restartAt === t) {
        Object.assign(s, { ...freshState(t, config), restarts: s.restarts });
        started = true;
      }
      if (started) dbAttempts += POOL_ATTEMPTS;
      if (s.restartAt !== null) {
        row.push({ up: false, ready: false, results: { startup: 'idle', liveness: 'idle', readiness: 'idle' }, restarted: false, restartCause: null, started: false, age: null, hung: false });
        return;
      }
      const hung = isHung(scenario, i, t, s.startedAt);
      const facts: Facts = { age: t - s.startedAt, t, hung, scenario };
      const results: Record<ProbeKind, ProbeResult> = { startup: 'idle', liveness: 'idle', readiness: 'idle' };
      let restarted = false;
      let restartCause: ProbeKind | null = null;
      for (const kind of PROBES) {
        const cfg = config[kind];
        results[kind] = restarted ? 'idle' : probeOutcome(kind, cfg, s.startupDone, facts);
        if (results[kind] !== 'idle' && cfg.check === 'db') dbAttempts += 1;
        if (results[kind] === 'pass') {
          s.fails[kind] = 0;
          if (kind === 'startup') s.startupDone = true;
          if (kind === 'readiness') s.ready = true;
        } else if (results[kind] === 'fail') {
          s.fails[kind] += 1;
          if (s.fails[kind] >= cfg.threshold) {
            if (kind === 'readiness') s.ready = false;
            else {
              restarted = true;
              restartCause = kind;
            }
          }
        }
      }
      if (restarted) {
        s.restarts += 1;
        s.ready = false;
        s.restartAt = t + RESTART_DELAY_S;
      }
      row.push({ up: true, ready: s.ready, results, restarted, restartCause, started, age: facts.age, hung });
    });

    const ready = pods.map((s, i) => ({ s, i })).filter(({ s }) => s.restartAt === null && s.ready);
    const requests = { ok: 0, slow: 0, error: 0, unrouted: 0 };
    for (let r = 0; r < REQUESTS_PER_SECOND; r++) {
      if (ready.length === 0) {
        requests.error += 1;
        requests.unrouted += 1;
        continue;
      }
      const { s, i } = ready[rotation % ready.length];
      rotation += 1;
      const hung = isHung(scenario, i, t, s.startedAt);
      requests[requestOutcome({ age: t - s.startedAt, t, hung, scenario })] += 1;
    }
    seconds.push({ t, pods: row, requests, dbUp: dbUp(scenario, t), dbAttempts });
  }
  return { config, scenario, seconds, restarts: pods.map((p) => p.restarts) };
}

/** Totals over the first `n` seconds (the stats at a moment in the run). */
export function totalsAt(run: Run, n: number) {
  const seen = run.seconds.slice(0, n);
  return {
    restarts: seen.reduce((sum, s) => sum + s.pods.filter((p) => p.restarted).length, 0),
    errors: seen.reduce((sum, s) => sum + s.requests.error, 0),
    slow: seen.reduce((sum, s) => sum + s.requests.slow, 0),
    served: seen.reduce((sum, s) => sum + s.requests.ok, 0),
    dbAttempts: seen.reduce((sum, s) => sum + s.dbAttempts, 0),
    rotationChanges: seen.reduce((sum, s, k) => sum + s.pods.filter((p, i) => k > 0 && p.ready !== seen[k - 1].pods[i].ready).length, 0),
  };
}
