/**
 * leases-fencing: a lock service with a lease, two clients and a storage server, on distSim.
 *
 * Nodes (declaration order matters for `clocks`): `lock` (one box standing in for a replicated store),
 * clients `A` and `B`, and `store`, a server that holds one value.
 * - The lock grants a lease with a TTL measured on ITS OWN clock and a token that counts up by one at
 *   every grant. A client that asks while the lease is held waits in the lock's queue; a lapsed lease
 *   goes to the first waiter. Its counter survives a restart (a node's state outside `init` is durable).
 * - A client works for a while, then writes. Between "the job is done" and "the write leaves" there is a
 *   short gap (`GAP_MS`): the window in which a check-then-act race lives.
 * - The store applies a write according to the mode: always, or, with fencing, only if the token is not
 *   lower than the highest it has applied.
 *
 * Ground truth for the checks: every grant and every write carries the grant's `epoch` (its true position
 * in the lock's grant order). The store never reads it; only the invariants do, so a store that compares
 * the wrong thing (no fencing, random tokens) is caught by what really happened.
 */
import { checkInvariants, createCluster, type Cluster, type DistNode, type NodeCtx, type Safety } from '../../core/distSim';
import { mulberry32 } from '../../core/random';

export type FenceMode = 'none' | 'check' | 'fence' | 'fence-random';
export const FENCE_MODES: readonly FenceMode[] = ['none', 'check', 'fence', 'fence-random'];
export const MODE_LABEL: Record<FenceMode, string> = {
  none: 'No fencing',
  check: 'Check the lease first',
  fence: 'Fencing tokens',
  'fence-random': 'Fencing, random tokens',
};
export type PauseAt = 'job' | 'write';

export const LOCK = 'lock';
export const CLIENT_A = 'A';
export const CLIENT_B = 'B';
export const STORE = 'store';
export const NODE_IDS = [LOCK, CLIENT_A, CLIENT_B, STORE] as const;

/** The first token the lock hands out (earlier holders came and went before this run). Illustrative. */
export const FIRST_TOKEN = 33;
/** With random tokens the lock draws from 1..RANDOM_TOKEN_MAX. */
export const RANDOM_TOKEN_MAX = 99;
export const TTL_DEFAULT_MS = 10_000;
/** The first scene has no renewals, so the TTL stays above the job (WORK_A_MS): a lease that ends mid-job needs no pause to fail. */
export const TTL_RANGE = { min: 5_000, max: 20_000, step: 1_000 } as const;
/** Scene 2 allows a wider TTL: 1 to 30 s. */
export const TTL_RANGE_RENEW = { min: 1_000, max: 30_000, step: 1_000 } as const;
export const WORK_A_MS = 4_000;
export const WORK_B_MS = 1_500;
export const WORK_A_RENEW_MS = 11_000;
/** The gap between a finished job (and its check) and the write leaving the client: shorter than a round trip to the lock service (twice LATENCY_MS.min), so no reply can overtake the write. */
export const GAP_MS = 5;
export const B_START_MS = 500;
export const ACQUIRE_RETRY_MS = 3_000;
/** A client that hears nothing asks again, doubling the wait each time up to this. */
export const ACQUIRE_RETRY_CAP_MS = 24_000;
export const PAUSE_JOB_FROM_MS = 2_000;
export const PAUSE_AFTER_WORK_MS = 2;
export const PAUSE_RANGE = { min: 0, max: 30_000, step: 500 } as const;
export const OFFSET_RANGE = { min: -20_000, max: 20_000, step: 1_000 } as const;
export const DRIFT_RANGE = { min: -100_000, max: 100_000, step: 5_000 } as const;
export const NET_RANGE = { min: 0, max: 0.3, step: 0.05 } as const;
export const LATENCY_MS = { min: 5, max: 40 } as const;
export const LOCK_CRASH_AT_MS = 5_000;
export const LOCK_RESTART_AT_MS = 8_000;
export const PARTITION_FROM_MS = 3_000;
export const PARTITION_TO_MS = 40_000;
export const HORIZON_MS = 60_000;
export const HEARTBEAT_DEFAULT_MS = 3_000;
export const HEARTBEAT_RANGE = { min: 500, max: 15_000, step: 500 } as const;
const TOKEN_STREAM = 0x5bd1e995;
const SWEEP_STREAM = 0x27d4eb2f;

export type Msg =
  | { type: 'acquire' }
  | { type: 'grant'; token: number; epoch: number; expiresAt: number }
  | { type: 'renew'; token: number }
  | { type: 'renewed'; token: number; expiresAt: number }
  | { type: 'lost'; token: number }
  | { type: 'release'; token: number }
  | { type: 'write'; value: string; token: number; epoch: number }
  | { type: 'stored'; token: number }
  | { type: 'rejected'; token: number; highest: number };

export interface Grant {
  to: string;
  token: number;
  epoch: number;
  /** True ms when the lock granted it. */
  at: number;
  /** True ms when the lease runs out as things stand (the lock's clock is the reference, so its time is true time); a renewal moves it. */
  expiresAt: number;
  /** True ms of each renewal the lock accepted. */
  renewedAt: number[];
  /** When and how the lease ended; null while it is still held at the end of the run. */
  endedAt: number | null;
  endedBy: 'expiry' | 'release' | null;
}

/** A client that stopped before writing: its own check found the lease lapsed ('check'), or the lock service told it so ('lost'). */
export interface Abandon {
  at: number;
  why: 'check' | 'lost';
}

export interface StoreEntry {
  id: number;
  /** True ms when the store handled it (for drawing). */
  at: number;
  from: string;
  value: string;
  token: number;
  epoch: number;
  applied: boolean;
  /** Applied while a write from a newer lease had already arrived. */
  stale: boolean;
  /** The highest token the store had applied when this write arrived. */
  highestBefore: number;
  /** Refused although no newer lease had written yet: the token check turned away the rightful holder. */
  refusedNewest: boolean;
}

export type LeaseState =
  | { role: 'lock'; grants: Grant[] }
  | { role: 'client'; token: number | null; epoch: number | null; done: boolean; abandon: Abandon | null }
  | { role: 'store'; value: string | null; valueEpoch: number; highestToken: number; log: StoreEntry[] };
export type LeaseCluster = Cluster<Msg, LeaseState>;

export interface LeaseSetup {
  seed: number;
  mode: FenceMode;
  ttlMs: number;
  pauseMs: number;
  pauseAt: PauseAt;
  aOffsetMs: number;
  aDriftPpm: number;
  loss: number;
  duplicate: number;
  lockCrash: boolean;
  /** How long A's job takes (local ms). B's is WORK_B_MS. */
  workMs: number;
  /** A renews every this many ms while it works; null: no renewals (scene 1). */
  heartbeatMs: number | null;
  /** A is cut off from the lock service (not from storage) from PARTITION_FROM_MS. */
  partition: boolean;
  /** The storage server takes part in fencing; false is an outside service that cannot check a token. */
  storeChecks: boolean;
  /** Test only (no control sets it): a lock service that forgets its counter and holder when it restarts. */
  lockAmnesia: boolean;
}

export const LEASE_BROKEN_SEED = 1;
export const DEFAULT_SETUP: LeaseSetup = {
  seed: LEASE_BROKEN_SEED,
  mode: 'none',
  ttlMs: TTL_DEFAULT_MS,
  pauseMs: 12_000,
  pauseAt: 'job',
  aOffsetMs: 0,
  aDriftPpm: 0,
  loss: 0,
  duplicate: 0,
  lockCrash: false,
  workMs: WORK_A_MS,
  heartbeatMs: null,
  partition: false,
  storeChecks: true,
  lockAmnesia: false,
};

const fencingOn = (mode: FenceMode) => mode === 'fence' || mode === 'fence-random';

/* ---------- the lock service ---------- */

function lockNode(setup: LeaseSetup): DistNode<Msg, LeaseState> {
  let holder: string | null = null;
  let token = FIRST_TOKEN - 1;
  let epoch = 0;
  let expiresAt = 0;
  const grants: Grant[] = [];
  let waiters: string[] = [];
  const drawToken = mulberry32(setup.seed ^ TOKEN_STREAM);

  const lapsed = (ctx: NodeCtx<Msg>) => holder === null || ctx.now() >= expiresAt;
  /** Close the current lease in the record, if one is open. */
  const endLease = (by: 'expiry' | 'release', at: number) => {
    const open = grants[grants.length - 1];
    if (holder !== null && open && open.endedAt === null) {
      open.endedAt = at;
      open.endedBy = by;
    }
  };
  const grantTo = (ctx: NodeCtx<Msg>, client: string) => {
    endLease('expiry', expiresAt);
    epoch++;
    token = setup.mode === 'fence-random' ? 1 + Math.floor(drawToken() * RANDOM_TOKEN_MAX) : token + 1;
    holder = client;
    expiresAt = ctx.now() + setup.ttlMs;
    waiters = waiters.filter((w) => w !== client);
    grants.push({ to: client, token, epoch, at: ctx.trueNow, expiresAt, renewedAt: [], endedAt: null, endedBy: null });
    ctx.setTimer('expiry', setup.ttlMs);
    ctx.send(client, { type: 'grant', token, epoch, expiresAt });
  };
  const expire = (ctx: NodeCtx<Msg>) => {
    if (!lapsed(ctx)) return;
    endLease('expiry', expiresAt);
    holder = null;
    const next = waiters.shift();
    if (next !== undefined) grantTo(ctx, next);
  };

  let booted = false;
  return {
    init: (ctx) => {
      waiters = [];
      if (booted && setup.lockAmnesia) {
        holder = null;
        token = FIRST_TOKEN - 1;
        expiresAt = 0;
      }
      booted = true;
      if (holder !== null) ctx.setTimer('expiry', Math.max(0, expiresAt - ctx.now()));
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      const from = msg.from;
      if (m.type === 'acquire') {
        if (!lapsed(ctx) && holder === from) {
          ctx.send(from, { type: 'grant', token, epoch, expiresAt });
        } else if (lapsed(ctx)) {
          grantTo(ctx, from);
        } else if (!waiters.includes(from)) {
          waiters.push(from);
        }
      } else if (m.type === 'renew') {
        if (holder === from && m.token === token && !lapsed(ctx)) {
          expiresAt = ctx.now() + setup.ttlMs;
          grants[grants.length - 1].expiresAt = expiresAt;
          grants[grants.length - 1].renewedAt.push(ctx.trueNow);
          ctx.setTimer('expiry', setup.ttlMs);
          ctx.send(from, { type: 'renewed', token, expiresAt });
        } else {
          ctx.send(from, { type: 'lost', token: m.token });
        }
      } else if (m.type === 'release') {
        if (holder === from && m.token === token && !lapsed(ctx)) {
          endLease('release', ctx.trueNow);
          holder = null;
          ctx.cancelTimer('expiry');
          const next = waiters.shift();
          if (next !== undefined) grantTo(ctx, next);
        }
      }
    },
    onTimer: (ctx) => expire(ctx),
    snapshot: () => ({ role: 'lock', grants: grants.map((g) => ({ ...g, renewedAt: [...g.renewedAt] })) }),
  };
}

/* ---------- a client ---------- */

function clientNode(id: string, setup: LeaseSetup, startMs: number): DistNode<Msg, LeaseState> {
  let held: { token: number; epoch: number; expiresAt: number } | null = null;
  let done = false;
  /** The job is finished and its write is on the way: a late "lease lost" no longer stops it. */
  let finishing = false;
  let abandon: Abandon | null = null;
  const isA = id === CLIENT_A;
  const workMs = isA ? setup.workMs : WORK_B_MS;
  const heartbeat = isA ? setup.heartbeatMs : null;
  let retryMs = ACQUIRE_RETRY_MS;

  return {
    init: (ctx) => {
      if (startMs === 0) ctx.send(LOCK, { type: 'acquire' });
      ctx.setTimer('retry', startMs === 0 ? ACQUIRE_RETRY_MS : startMs);
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'grant') {
        if (held && held.epoch >= m.epoch) return;
        held = { token: m.token, epoch: m.epoch, expiresAt: m.expiresAt };
        ctx.cancelTimer('retry');
        ctx.setTimer('work', workMs);
        if (heartbeat !== null) ctx.setTimer('hb', heartbeat);
      } else if (m.type === 'renewed') {
        if (held && held.token === m.token) held.expiresAt = m.expiresAt;
      } else if (m.type === 'lost') {
        if (held && held.token === m.token && !done && !finishing) {
          held = null;
          abandon = { at: ctx.trueNow, why: 'lost' };
          ctx.cancelTimer('work');
          ctx.cancelTimer('hb');
        }
      }
    },
    onTimer: (ctx, timerId) => {
      if (timerId === 'retry') {
        if (held === null && !done) {
          ctx.send(LOCK, { type: 'acquire' });
          ctx.setTimer('retry', retryMs);
          retryMs = Math.min(retryMs * 2, ACQUIRE_RETRY_CAP_MS);
        }
      } else if (timerId === 'hb') {
        if (held && !done) {
          ctx.send(LOCK, { type: 'renew', token: held.token });
          ctx.setTimer('hb', heartbeat!);
        }
      } else if (timerId === 'work') {
        if (!held) return;
        if (isA && setup.mode === 'check' && !(ctx.now() < held.expiresAt)) {
          held = null;
          abandon = { at: ctx.trueNow, why: 'check' };
          ctx.cancelTimer('hb');
          return;
        }
        finishing = true;
        ctx.setTimer('send', GAP_MS);
      } else if (timerId === 'send') {
        if (!held || done) return;
        done = true;
        ctx.cancelTimer('hb');
        ctx.send(STORE, { type: 'write', value: `${id}'s result`, token: held.token, epoch: held.epoch });
        ctx.send(LOCK, { type: 'release', token: held.token });
      }
    },
    snapshot: () => ({ role: 'client', token: held?.token ?? null, epoch: held?.epoch ?? null, done, abandon }),
  };
}

/* ---------- the storage server ---------- */

function storeNode(setup: LeaseSetup): DistNode<Msg, LeaseState> {
  let value: string | null = null;
  let valueEpoch = 0;
  let highestToken = 0;
  let highestEpochSeen = 0;
  const log: StoreEntry[] = [];
  const checks = fencingOn(setup.mode) && setup.storeChecks;

  return {
    init: () => {},
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type !== 'write') return;
      const applied = !(checks && m.token < highestToken);
      const stale = applied && m.epoch < highestEpochSeen;
      const refusedNewest = !applied && m.epoch >= highestEpochSeen;
      highestEpochSeen = Math.max(highestEpochSeen, m.epoch);
      log.push({ id: log.length, at: ctx.trueNow, from: msg.from, value: m.value, token: m.token, epoch: m.epoch, applied, stale, highestBefore: highestToken, refusedNewest });
      if (applied) {
        value = m.value;
        valueEpoch = m.epoch;
        highestToken = Math.max(highestToken, m.token);
        ctx.send(msg.from, { type: 'stored', token: m.token });
      } else {
        ctx.send(msg.from, { type: 'rejected', token: m.token, highest: highestToken });
      }
    },
    onTimer: () => {},
    snapshot: () => ({ role: 'store', value, valueEpoch, highestToken, log: [...log] }),
  };
}

/* ---------- assembling a run ---------- */

interface Window {
  from: number;
  to: number;
}

function assemble(setup: LeaseSetup, pause: Window | null): LeaseCluster {
  const c = createCluster<Msg, LeaseState>({
    seed: setup.seed,
    nodes: {
      [LOCK]: lockNode(setup),
      [CLIENT_A]: clientNode(CLIENT_A, setup, 0),
      [CLIENT_B]: clientNode(CLIENT_B, setup, B_START_MS),
      [STORE]: storeNode(setup),
    },
    latency: (rnd) => Math.round(LATENCY_MS.min + rnd() * (LATENCY_MS.max - LATENCY_MS.min)),
    loss: setup.loss,
    duplicate: setup.duplicate,
    clocks: [{}, { offsetMs: setup.aOffsetMs, driftPpm: setup.aDriftPpm }, {}, {}],
  });
  if (pause) c.pause(CLIENT_A, pause.from, pause.to);
  if (setup.lockCrash) {
    c.crash(LOCK, LOCK_CRASH_AT_MS);
    c.restart(LOCK, LOCK_RESTART_AT_MS);
  }
  if (setup.partition) c.partition(CLIENT_A, LOCK, PARTITION_FROM_MS, PARTITION_TO_MS);
  return c;
}

/** True ms at which A's job finishes in this setup, found by a run without the pause; null if it never does. */
export function workDoneAt(setup: LeaseSetup): number | null {
  const dry = assemble({ ...setup, pauseMs: 0 }, null);
  dry.start();
  let seen = 0;
  while (dry.time <= HORIZON_MS && dry.step()) {
    for (; seen < dry.trace.length; seen++) {
      const r = dry.trace[seen];
      if (r.kind === 'timer' && r.node === CLIENT_A && r.detail === 'work') return r.t;
    }
  }
  return null;
}

/** The window A is frozen in, or null for no pause. A pause "before the write" starts just after the job finishes (and after any check). */
export function pauseWindow(setup: LeaseSetup): Window | null {
  if (setup.pauseMs <= 0) return null;
  const from = setup.pauseAt === 'job' ? PAUSE_JOB_FROM_MS : (workDoneAt(setup) ?? PAUSE_JOB_FROM_MS) + PAUSE_AFTER_WORK_MS;
  return { from, to: from + setup.pauseMs };
}

export function leaseCluster(setup: LeaseSetup): LeaseCluster {
  return assemble(setup, pauseWindow(setup));
}

/* ---------- invariants (ground truth: epochs) ---------- */

const storeOf = (snap: { nodes: Record<string, { state?: LeaseState }> }) => snap.nodes[STORE].state as Extract<LeaseState, { role: 'store' }>;
const lockOf = (snap: { nodes: Record<string, { state?: LeaseState }> }) => snap.nodes[LOCK].state as Extract<LeaseState, { role: 'lock' }>;

/** F1: the store never applies a write from an older lease after one from a newer lease. */
export const f1NoOlderAfterNewer: Safety<LeaseState> = (snap) => {
  let newest = 0;
  for (const e of storeOf(snap).log) {
    if (!e.applied) continue;
    if (e.epoch < newest) return `a write from lease ${e.epoch} (token ${e.token}) was applied after one from lease ${newest}`;
    newest = e.epoch;
  }
  return null;
};

/** F2: the stored value comes from the newest lease whose write has reached the store. */
export const f2ValueIsNewest: Safety<LeaseState> = (snap) => {
  const s = storeOf(snap);
  const newest = s.log.reduce((m, e) => Math.max(m, e.epoch), 0);
  return s.valueEpoch < newest ? `the stored value is from lease ${s.valueEpoch} but a write from lease ${newest} has already arrived` : null;
};

/** F3: the lock hands out strictly increasing tokens, restarts included. */
export const f3TokensIncrease: Safety<LeaseState> = (snap) => {
  const g = lockOf(snap).grants;
  for (let i = 1; i < g.length; i++) {
    if (g[i].token <= g[i - 1].token) return `lease ${g[i].epoch} got token ${g[i].token}, not above lease ${g[i - 1].epoch}'s ${g[i - 1].token}`;
  }
  return null;
};

export const SAFETY: readonly Safety<LeaseState>[] = [f1NoOlderAfterNewer, f2ValueIsNewest, f3TokensIncrease];
/** What a stale write breaks: the two rules about the data (F3 is the lock's own promise). */
export const DATA_SAFETY: readonly Safety<LeaseState>[] = [f1NoOlderAfterNewer, f2ValueIsNewest];
export const RULE_NAME = ['F1', 'F2', 'F3'] as const;

/* ---------- seeded fault schedules ---------- */

const pickFrom = (rnd: () => number, lo: number, hi: number, step: number) => lo + step * Math.floor(rnd() * ((hi - lo) / step + 1));

/**
 * The setup the sweep draws for a seed: a pause (length and where it lands), A's clock offset and
 * drift, message loss and duplication, a lock restart, and a TTL. Every value sits on its control's
 * grid, so "load this seed" puts the sliders exactly where the sweep ran.
 */
export function sweepSetup(seed: number, mode: FenceMode): LeaseSetup {
  const rnd = mulberry32(seed ^ SWEEP_STREAM);
  return {
    ...DEFAULT_SETUP,
    seed,
    mode,
    ttlMs: pickFrom(rnd, 5_000, 15_000, 1_000),
    pauseMs: pickFrom(rnd, 0, 20_000, 500),
    pauseAt: rnd() < 0.5 ? 'job' : 'write',
    aOffsetMs: pickFrom(rnd, -10_000, 10_000, 1_000),
    aDriftPpm: pickFrom(rnd, -25_000, 25_000, 5_000),
    loss: 0.05 * Math.floor(rnd() * 4),
    duplicate: 0.05 * Math.floor(rnd() * 4),
    lockCrash: rnd() < 0.3,
  };
}

export const sweepScenario = (mode: FenceMode) => (seed: number): LeaseCluster => leaseCluster(sweepSetup(seed, mode));

/** Pinned: the lowest seed of forSeeds(0..199) on which `mode` breaks a safety rule (a test recomputes each). */
export const PINNED_SEED: Record<FenceMode, number | null> = { none: 1, check: 1, fence: null, 'fence-random': 0 };

/* ---------- reading a run ---------- */

export interface Pause {
  from: number;
  to: number | null;
}

export interface LeaseRun {
  setup: LeaseSetup;
  cluster: LeaseCluster;
  grants: Grant[];
  store: StoreEntry[];
  /** True ms of the last event of the run (the replay's end). */
  end: number;
  pause: Pause | null;
  /** Clients that stopped before writing, and when. */
  abandoned: { node: string; at: number; why: Abandon['why'] }[];
}

export function runLease(setup: LeaseSetup): LeaseRun {
  const cluster = leaseCluster(setup);
  cluster.run({ until: HORIZON_MS });
  const snap = cluster.snapshot();
  const pauseRows = cluster.trace.filter((r) => r.kind === 'pause' || r.kind === 'resume');
  const from = pauseRows.find((r) => r.kind === 'pause');
  const to = pauseRows.find((r) => r.kind === 'resume');
  const abandoned = [CLIENT_A, CLIENT_B].flatMap((node) => {
    const st = snap.nodes[node].state;
    return st?.role === 'client' && st.abandon ? [{ node, ...st.abandon }] : [];
  });
  return {
    setup,
    cluster,
    grants: lockOf(snap).grants,
    store: storeOf(snap).log,
    end: cluster.trace.length ? cluster.trace[cluster.trace.length - 1].t : 0,
    pause: from ? { from: from.t, to: to?.t ?? null } : null,
    abandoned,
  };
}

export interface LeaseStats {
  applied: number;
  /** Writes the store refused, right or wrong. */
  rejected: number;
  /** Of those, refused although they came from the newest lease so far (only a store whose tokens do not grow does this). */
  refusedNewest: number;
  /** Writes applied although a newer lease's write had already arrived. */
  staleApplied: number;
  highestToken: number;
}

export function statsAt(run: LeaseRun, until: number): LeaseStats {
  const rows = run.store.filter((e) => e.at <= until);
  return {
    applied: rows.filter((e) => e.applied).length,
    rejected: rows.filter((e) => !e.applied).length,
    refusedNewest: rows.filter((e) => e.refusedNewest).length,
    staleApplied: rows.filter((e) => e.stale).length,
    highestToken: rows.filter((e) => e.applied).reduce((m, e) => Math.max(m, e.token), 0),
  };
}

export type RuleName = (typeof RULE_NAME)[number];

export interface Verdict {
  rule: RuleName;
  message: string;
  step: number;
  time: number;
}

/** The three invariants over one setup, event by event: the first violation, or null when the whole run held. */
export function verdictOf(setup: LeaseSetup): Verdict | null {
  const r = checkInvariants(leaseCluster(setup), SAFETY, { until: HORIZON_MS });
  return r.ok ? null : { rule: RULE_NAME[r.rule], message: r.message, step: r.step, time: r.time };
}
