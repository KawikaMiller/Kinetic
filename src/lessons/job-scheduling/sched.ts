/**
 * Scene 3: one cron job (`0 * * * *`, the top of every hour) on three scheduler replicas, on distSim.
 *
 * Time is scaled so the lease can be seen: ONE CRON MINUTE IS ONE SECOND OF SIMULATED TIME (MIN_MS = 1000), so an hour
 * is 60 s and a day 1,440 s. The lease (3 cron minutes, renewed every minute) is made up for the same reason.
 * Every replica has a timer for every fire time on its own clock. What a replica does when its timer goes off is the mode:
 * - `every`: all three run the job (the bug).
 * - `leader`: only the replica that believes it holds the lease runs it. It believes until the lock service says otherwise,
 *   so a replica paused past its lease still runs its late fire.
 * - `leader-fenced`: the same, and the database refuses a run whose token is lower than one it has applied.
 * - `dedupe`: every replica tries to insert the row (job, scheduled time) and a unique constraint lets exactly one in.
 * The "database" is one box: it stands for a table with a unique key and a token column.
 */
import { createCluster, type Cluster, type DistNode, type NodeCtx, type Safety } from '../../core/distSim';
import { mulberry32, type Rnd } from '../../core/random';

export type SchedMode = 'every' | 'leader' | 'leader-fenced' | 'dedupe';
export const SCHED_MODES: readonly SchedMode[] = ['every', 'leader', 'leader-fenced', 'dedupe'];
export const SCHED_LABEL: Record<SchedMode, string> = {
  every: 'Every replica fires',
  leader: 'Leader by lease',
  'leader-fenced': 'Leader by lease, with fencing',
  dedupe: 'Run-once by dedupe key',
};
export type Fault = 'none' | 'kill' | 'pause';
export const FAULTS: readonly Fault[] = ['none', 'kill', 'pause'];
export const FAULT_LABEL: Record<Fault, string> = { none: 'No fault', kill: 'Kill replica r1', pause: 'Pause replica r1' };

export const MIN_MS = 1_000;
export const HOUR_MS = 60 * MIN_MS;
export const DAY_HOURS = 24;
export const DAY_MS = DAY_HOURS * HOUR_MS;
export const SWEEP_HOURS = 6;
/** The calendar day the Gantt shows (a Monday, UTC): a fixed lesson date, not today. */
export const CAL_START = '2026-03-02T00:00:00Z';
export const LEASE_TTL_MS = 3 * MIN_MS;
export const RENEW_MS = MIN_MS;
const ACQUIRE_RETRY_MS = 2 * MIN_MS;
const START_STAGGER_MS = 200;
export const LATENCY_MS = { min: 5, max: 40 } as const;
/** The fault lands before the 03:00 fire: r1 dies at 02:58, or is frozen from 02:55. */
export const KILL_AT_MS = 2 * HOUR_MS + 58 * MIN_MS;
export const PAUSE_FROM_MS = 2 * HOUR_MS + 55 * MIN_MS;
export const PAUSE_RANGE = { min: 1 * MIN_MS, max: 30 * MIN_MS, step: MIN_MS } as const;
export const SKEW_RANGE = { min: -20 * MIN_MS, max: 20 * MIN_MS, step: 5 * MIN_MS } as const;
export const NET_RANGE = { min: 0, max: 0.3, step: 0.05 } as const;
/** A fire counts as missed when nothing took effect this long after its time. */
export const MISS_AFTER_MS = 10 * MIN_MS;

export type SMsg =
  | { type: 'acquire' }
  | { type: 'grant'; token: number }
  | { type: 'renew'; token: number }
  | { type: 'renewed' }
  | { type: 'lost' }
  | { type: 'run'; fire: number; token: number };

export interface Leadership {
  to: string;
  token: number;
  at: number;
  /** When the lease last ran out or was replaced (null: still held at the end). */
  until: number | null;
}
export interface RunRow {
  id: number;
  at: number;
  fire: number;
  by: string;
  token: number;
  applied: boolean;
  /** Applied although another run of the same fire had been: the duplicate. */
  duplicate: boolean;
  reason: 'applied' | 'unique key' | 'stale token';
}
export type SState =
  | { role: 'lease'; grants: Leadership[] }
  | { role: 'replica'; leader: boolean }
  | { role: 'db'; log: RunRow[] };
export type SCluster = Cluster<SMsg, SState>;

export interface SchedSetup {
  seed: number;
  mode: SchedMode;
  fault: Fault;
  pauseMs: number;
  /** r1's clock offset, ms. */
  skewMs: number;
  loss: number;
  duplicate: number;
}

export const SCHED_BROKEN_SEED = 0;
export const DEFAULT_SCHED: SchedSetup = { seed: SCHED_BROKEN_SEED, mode: 'every', fault: 'none', pauseMs: 15 * MIN_MS, skewMs: 0, loss: 0, duplicate: 0 };

const REPLICAS = ['r1', 'r2', 'r3'] as const;
export const REPLICA_IDS: readonly string[] = REPLICAS;
export const LEASE = 'lease';
export const DB = 'db';

function leaseNode(): DistNode<SMsg, SState> {
  let holder: string | null = null;
  let token = 0;
  let expiresAt = 0;
  let waiters: string[] = [];
  const grants: Leadership[] = [];
  const lapsed = (ctx: NodeCtx<SMsg>) => holder === null || ctx.now() >= expiresAt;
  const close = (at: number) => {
    const g = grants[grants.length - 1];
    if (g && g.until === null) g.until = at;
  };
  const grantTo = (ctx: NodeCtx<SMsg>, who: string) => {
    close(expiresAt);
    token++;
    holder = who;
    expiresAt = ctx.now() + LEASE_TTL_MS;
    waiters = waiters.filter((w) => w !== who);
    grants.push({ to: who, token, at: ctx.trueNow, until: null });
    ctx.setTimer('expiry', LEASE_TTL_MS);
    ctx.send(who, { type: 'grant', token });
  };
  return {
    init: (ctx) => {
      waiters = [];
      if (holder !== null) ctx.setTimer('expiry', Math.max(0, expiresAt - ctx.now()));
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'acquire') {
        if (!lapsed(ctx) && holder === msg.from) ctx.send(msg.from, { type: 'grant', token });
        else if (lapsed(ctx)) grantTo(ctx, msg.from);
        else if (!waiters.includes(msg.from)) waiters.push(msg.from);
      } else if (m.type === 'renew') {
        if (holder === msg.from && m.token === token && !lapsed(ctx)) {
          expiresAt = ctx.now() + LEASE_TTL_MS;
          grants[grants.length - 1].until = null;
          ctx.setTimer('expiry', LEASE_TTL_MS);
          ctx.send(msg.from, { type: 'renewed' });
        } else {
          ctx.send(msg.from, { type: 'lost' });
        }
      }
    },
    onTimer: (ctx) => {
      if (!lapsed(ctx)) return;
      close(expiresAt);
      holder = null;
      const next = waiters.shift();
      if (next !== undefined) grantTo(ctx, next);
    },
    snapshot: () => ({ role: 'lease', grants: grants.map((g) => ({ ...g })) }),
  };
}

function replicaNode(mode: SchedMode, index: number): DistNode<SMsg, SState> {
  let leader = false;
  let token = 0;
  const leads = mode === 'leader' || mode === 'leader-fenced';
  return {
    init: (ctx) => {
      leader = false;
      for (let k = 1; k <= DAY_HOURS; k++) {
        const delay = k * HOUR_MS - ctx.now();
        if (delay > 0) ctx.setTimer(`fire:${k}`, delay);
      }
      if (leads) ctx.setTimer('acquire', index * START_STAGGER_MS);
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'grant') {
        leader = true;
        token = m.token;
        ctx.cancelTimer('acquire');
        ctx.setTimer('renew', RENEW_MS);
      } else if (m.type === 'lost') {
        leader = false;
      }
    },
    onTimer: (ctx, timerId) => {
      if (timerId === 'acquire') {
        if (!leader) {
          ctx.send(LEASE, { type: 'acquire' });
          ctx.setTimer('acquire', ACQUIRE_RETRY_MS);
        }
      } else if (timerId === 'renew') {
        if (leader) {
          ctx.send(LEASE, { type: 'renew', token });
          ctx.setTimer('renew', RENEW_MS);
        }
      } else if (timerId.startsWith('fire:')) {
        const fire = Number(timerId.slice(5));
        if (leads && !leader) return;
        ctx.send(DB, { type: 'run', fire, token: leads ? token : 0 });
      }
    },
    snapshot: () => ({ role: 'replica', leader }),
  };
}

function dbNode(mode: SchedMode): DistNode<SMsg, SState> {
  const log: RunRow[] = [];
  let highest = 0;
  const done = new Set<number>();
  return {
    init: () => {},
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type !== 'run') return;
      const duplicate = done.has(m.fire);
      let reason: RunRow['reason'] = 'applied';
      if (mode === 'dedupe' && duplicate) reason = 'unique key';
      if (mode === 'leader-fenced' && m.token < highest) reason = 'stale token';
      const applied = reason === 'applied';
      if (applied) {
        highest = Math.max(highest, m.token);
        done.add(m.fire);
      }
      log.push({ id: log.length, at: ctx.trueNow, fire: m.fire, by: msg.from, token: m.token, applied, duplicate: applied && duplicate, reason });
    },
    onTimer: () => {},
    snapshot: () => ({ role: 'db', log: [...log] }),
  };
}

export function schedCluster(s: SchedSetup): SCluster {
  const c = createCluster<SMsg, SState>({
    seed: s.seed,
    nodes: {
      [LEASE]: leaseNode(),
      r1: replicaNode(s.mode, 0),
      r2: replicaNode(s.mode, 1),
      r3: replicaNode(s.mode, 2),
      [DB]: dbNode(s.mode),
    },
    latency: (rnd) => Math.round(LATENCY_MS.min + rnd() * (LATENCY_MS.max - LATENCY_MS.min)),
    loss: s.loss,
    duplicate: s.duplicate,
    clocks: [{}, { offsetMs: s.skewMs }, {}, {}, {}],
  });
  if (s.fault === 'kill') c.crash('r1', KILL_AT_MS);
  if (s.fault === 'pause') c.pause('r1', PAUSE_FROM_MS, PAUSE_FROM_MS + s.pauseMs);
  return c;
}

/* ---------- invariants ---------- */

const dbOf = (snap: { nodes: Record<string, { state?: SState }> }) => snap.nodes[DB].state as Extract<SState, { role: 'db' }>;

/** J1: every scheduled (job, time) takes effect at most once. */
export const j1AtMostOncePerFire: Safety<SState> = (snap) => {
  const counts = new Map<number, number>();
  for (const r of dbOf(snap).log) if (r.applied) counts.set(r.fire, (counts.get(r.fire) ?? 0) + 1);
  for (const [fire, n] of counts) if (n > 1) return `the ${String(fire).padStart(2, '0')}:00 fire took effect ${n} times`;
  return null;
};

/* ---------- seeded schedules ---------- */

const SWEEP_STREAM = 0x85ebca6b;
const pickFrom = (rnd: Rnd, lo: number, hi: number, step: number) => lo + step * Math.floor(rnd() * ((hi - lo) / step + 1));

/**
 * Which extra faults a sweep draws on top of the base (a fault: none, kill or pause; a pause length; message loss).
 * Clock skew and duplicated messages each give a second way to run a fire twice that fencing does not stop, so the
 * pinned seeds come from the base draw, where the only way to a double run is a leader paused past its lease.
 */
export interface SweepExtras {
  skew?: boolean;
  duplicates?: boolean;
}

/** What the sweep draws for a seed, every value on its control's grid. */
export function schedSweep(seed: number, mode: SchedMode, extras: SweepExtras = {}): SchedSetup {
  const rnd = mulberry32(seed ^ SWEEP_STREAM);
  const fault = FAULTS[Math.floor(rnd() * FAULTS.length)];
  const pauseMs = pickFrom(rnd, PAUSE_RANGE.min, PAUSE_RANGE.max, PAUSE_RANGE.step);
  const skewMs = pickFrom(rnd, SKEW_RANGE.min, SKEW_RANGE.max, SKEW_RANGE.step);
  const loss = 0.05 * Math.floor(rnd() * 4);
  const duplicate = 0.05 * Math.floor(rnd() * 4);
  return { seed, mode, fault, pauseMs, skewMs: extras.skew ? skewMs : 0, loss, duplicate: extras.duplicates ? duplicate : 0 };
}
export const schedScenario = (mode: SchedMode, extras: SweepExtras = {}) => (seed: number) => schedCluster(schedSweep(seed, mode, extras));
export const SWEEP_UNTIL_MS = SWEEP_HOURS * HOUR_MS + MIN_MS;

/** Pinned: the lowest seed of forSeeds(0..199) that breaks J1 in each mode (a test recomputes them); null: none does. */
export const PINNED_SCHED_SEED: Record<SchedMode, number | null> = { every: 0, leader: 0, 'leader-fenced': null, dedupe: null };

/* ---------- reading a run ---------- */

export interface SchedRun {
  setup: SchedSetup;
  cluster: SCluster;
  grants: Leadership[];
  rows: RunRow[];
  /** Fires nothing took effect for, by hour number. */
  missed: number[];
  /** r1's frozen window or crash time, from the trace. */
  pause: { from: number; to: number } | null;
  crashedAt: number | null;
  end: number;
}

export function runSched(setup: SchedSetup, until = DAY_MS + MIN_MS): SchedRun {
  const cluster = schedCluster(setup);
  cluster.run({ until });
  const snap = cluster.snapshot();
  const rows = dbOf(snap).log;
  const lease = snap.nodes[LEASE].state as Extract<SState, { role: 'lease' }>;
  const applied = new Set(rows.filter((r) => r.applied).map((r) => r.fire));
  const hours = Math.floor(until / HOUR_MS);
  const missed = Array.from({ length: hours }, (_, i) => i + 1).filter((k) => k * HOUR_MS + MISS_AFTER_MS <= until && !applied.has(k));
  const p = cluster.trace.find((r) => r.kind === 'pause');
  const r = cluster.trace.find((x) => x.kind === 'resume');
  const crash = cluster.trace.find((x) => x.kind === 'crash');
  return {
    setup,
    cluster,
    grants: lease.grants,
    rows,
    missed,
    pause: p ? { from: p.t, to: r?.t ?? until } : null,
    crashedAt: crash?.t ?? null,
    end: until,
  };
}

export interface SchedStats {
  /** Runs that took effect. */
  applied: number;
  /** Fires that took effect more than once. */
  repeatedFires: number;
  /** Runs beyond the first of their fire. */
  extraRuns: number;
  /** Attempts turned away (unique key or stale token). */
  turnedAway: number;
  missed: number;
}

export function schedStatsAt(run: SchedRun, until: number): SchedStats {
  const rows = run.rows.filter((r) => r.at <= until);
  return {
    applied: rows.filter((r) => r.applied).length,
    repeatedFires: new Set(rows.filter((r) => r.duplicate).map((r) => r.fire)).size,
    extraRuns: rows.filter((r) => r.duplicate).length,
    turnedAway: rows.filter((r) => !r.applied).length,
    missed: run.missed.filter((k) => k * HOUR_MS + MISS_AFTER_MS <= until).length,
  };
}
