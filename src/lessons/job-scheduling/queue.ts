/**
 * Scene 2: a job queue with a visibility timeout, two workers and an effects store, on distSim.
 *
 * The queue hands a job to an idle worker and hides it for `visibilityMs`; an ack inside that window finishes it.
 * No ack in time (a worker died, or the job simply ran longer than the window) and the job becomes visible again and
 * goes to someone else: at-least-once. A job that fails is retried after a backoff delay (`min(cap, base * 2^n)`,
 * or a random share of it with full jitter) up to `maxAttempts` attempts, then lands in the dead-letter queue.
 * A worker applies a job's effect to the effects store and acks only once the store has confirmed it, so "done" means
 * the effect happened. With an idempotency key the store ignores a second effect for the same job.
 */
import { createCluster, type Cluster, type DistNode, type NodeCtx, type Safety } from '../../core/distSim';
import { mulberry32, type Rnd } from '../../core/random';

export const QUEUE = 'queue';
export const W1 = 'w1';
export const W2 = 'w2';
export const FX = 'effects';
export const JOBS = 4;
export const POISON_JOB = 4;
export const LONG_JOB = 2;
const BASE_RUN_MS = [2_000, 3_000, 2_500, 2_000];
export const LATENCY_MS = { min: 5, max: 40 } as const;
export const HORIZON_MS = 60_000;
export const KILL_AT_MS = 1_000;
export const RESTART_AFTER_MS = 3_000;
const READY_EVERY_MS = 5_000;
const EFFECT_RETRY_MS = 1_500;
const JITTER_STREAM = 0x3c6ef372;

export const VISIBILITY_RANGE = { min: 1_000, max: 10_000, step: 1_000 } as const;
export const LONG_RANGE = { min: 1_000, max: 12_000, step: 1_000 } as const;
export const ATTEMPTS_RANGE = { min: 1, max: 6, step: 1 } as const;
export const BASE_RANGE = { min: 500, max: 4_000, step: 500 } as const;
export const CAP_RANGE = { min: 2_000, max: 30_000, step: 1_000 } as const;
export const NET_RANGE = { min: 0, max: 0.3, step: 0.05 } as const;

export type QMsg =
  | { type: 'ready' }
  | { type: 'job'; job: number; attempt: number }
  | { type: 'effect'; job: number; attempt: number; key: string | null }
  | { type: 'effected'; job: number; attempt: number; applied: boolean; repeat: boolean }
  | { type: 'done'; job: number; attempt: number }
  | { type: 'failed'; job: number; attempt: number };

export type JobState = 'waiting' | 'running' | 'done' | 'dlq' | 'lost';
export interface QueueJob {
  id: number;
  state: JobState;
  attempts: number;
}
export type QueueEventKind = 'dispatch' | 'visible' | 'retry' | 'dlq' | 'done';
export interface QueueEvent {
  at: number;
  kind: QueueEventKind;
  job: number;
  attempt: number;
  /** retry: the backoff delay chosen, ms. */
  delayMs?: number;
}
export type RunOutcome = 'running' | 'ok' | 'dup' | 'noop' | 'failed' | 'killed';
export interface Run {
  job: number;
  attempt: number;
  worker: string;
  start: number;
  end: number | null;
  outcome: RunOutcome;
}
export interface Effect {
  id: number;
  at: number;
  job: number;
  by: string;
  applied: boolean;
  repeat: boolean;
}

export type QState =
  | { role: 'queue'; jobs: QueueJob[]; events: QueueEvent[] }
  | { role: 'worker'; runs: Run[] }
  | { role: 'effects'; log: Effect[] };
export type QCluster = Cluster<QMsg, QState>;

export interface QueueSetup {
  seed: number;
  visibilityMs: number;
  /** How long job 2 runs; the others take their usual 2 to 3 s. */
  longJobMs: number;
  killW1: boolean;
  idempotent: boolean;
  maxAttempts: number;
  baseMs: number;
  capMs: number;
  jitter: boolean;
  /** Job 4 fails every time it runs. */
  poison: boolean;
  loss: number;
  duplicate: number;
  /** Test only (no control sets it): the queue forgets a job whose visibility window ends. */
  dropOnExpiry: boolean;
}

export const QUEUE_BROKEN_SEED = 1;
export const DEFAULT_QUEUE: QueueSetup = {
  seed: QUEUE_BROKEN_SEED,
  visibilityMs: 4_000,
  longJobMs: 6_000,
  killW1: false,
  idempotent: false,
  maxAttempts: 4,
  baseMs: 1_000,
  capMs: 8_000,
  jitter: true,
  poison: true,
  loss: 0,
  duplicate: 0,
  dropOnExpiry: false,
};

/** Retry delay before retry number `n` (0 for the first retry): `min(cap, base * 2^n)`, or a random share of it with full jitter. */
export function backoffMs(n: number, o: { baseMs: number; capMs: number; jitter: boolean }, rnd: Rnd): number {
  const ceiling = Math.min(o.capMs, o.baseMs * 2 ** n);
  return o.jitter ? Math.round(rnd() * ceiling) : ceiling;
}

const runMs = (s: QueueSetup, job: number) => (job === LONG_JOB ? s.longJobMs : BASE_RUN_MS[job - 1]);

function queueNode(s: QueueSetup): DistNode<QMsg, QState> {
  const jobs: QueueJob[] = Array.from({ length: JOBS }, (_, i) => ({ id: i + 1, state: 'waiting', attempts: 0 }));
  const readyAt = new Map<number, number>();
  const events: QueueEvent[] = [];
  let idle: string[] = [];
  let running = new Map<number, number>();
  const jitter = mulberry32(s.seed ^ JITTER_STREAM);
  const log = (ctx: NodeCtx<QMsg>, kind: QueueEventKind, job: number, attempt: number, delayMs?: number) =>
    events.push({ at: ctx.trueNow, kind, job, attempt, ...(delayMs === undefined ? {} : { delayMs }) });

  const dispatch = (ctx: NodeCtx<QMsg>) => {
    while (idle.length > 0) {
      const next = jobs.find((j) => j.state === 'waiting' && (readyAt.get(j.id) ?? 0) <= ctx.now());
      if (!next) return;
      const worker = idle.shift()!;
      next.state = 'running';
      next.attempts++;
      running.set(next.id, next.attempts);
      ctx.setTimer(`vis:${next.id}:${next.attempts}`, s.visibilityMs);
      log(ctx, 'dispatch', next.id, next.attempts);
      ctx.send(worker, { type: 'job', job: next.id, attempt: next.attempts });
    }
  };
  const giveUp = (ctx: NodeCtx<QMsg>, job: QueueJob) => {
    job.state = 'dlq';
    running.delete(job.id);
    log(ctx, 'dlq', job.id, job.attempts);
  };

  return {
    init: (ctx) => {
      idle = [];
      running = new Map([...running]);
      dispatch(ctx);
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'ready') {
        if (!idle.includes(msg.from)) idle.push(msg.from);
        dispatch(ctx);
      } else if (m.type === 'done') {
        const job = jobs[m.job - 1];
        if (job.state === 'done' || job.state === 'dlq') return;
        job.state = 'done';
        running.delete(job.id);
        log(ctx, 'done', job.id, m.attempt);
      } else if (m.type === 'failed') {
        const job = jobs[m.job - 1];
        if (job.state !== 'running' || running.get(job.id) !== m.attempt) return;
        running.delete(job.id);
        if (job.attempts >= s.maxAttempts) return giveUp(ctx, job);
        const delayMs = backoffMs(job.attempts - 1, s, jitter);
        job.state = 'waiting';
        readyAt.set(job.id, ctx.now() + delayMs);
        ctx.setTimer(`retry:${job.id}`, delayMs);
        log(ctx, 'retry', job.id, job.attempts, delayMs);
      }
    },
    onTimer: (ctx, timerId) => {
      const [kind, id, attempt] = timerId.split(':');
      if (kind === 'retry') {
        dispatch(ctx);
        return;
      }
      const job = jobs[Number(id) - 1];
      if (job.state !== 'running' || running.get(job.id) !== Number(attempt)) return;
      log(ctx, 'visible', job.id, Number(attempt));
      running.delete(job.id);
      if (s.dropOnExpiry) job.state = 'lost';
      else if (job.attempts >= s.maxAttempts) giveUp(ctx, job);
      else job.state = 'waiting';
      dispatch(ctx);
    },
    snapshot: () => ({ role: 'queue', jobs: jobs.map((j) => ({ ...j })), events: [...events] }),
  };
}

function workerNode(id: string, s: QueueSetup): DistNode<QMsg, QState> {
  const runs: Run[] = [];
  let busy: { job: number; attempt: number } | null = null;
  const sendEffect = (ctx: NodeCtx<QMsg>, b: { job: number; attempt: number }) => {
    ctx.send(FX, { type: 'effect', job: b.job, attempt: b.attempt, key: s.idempotent ? `job-${b.job}` : null });
    ctx.setTimer('fxwait', EFFECT_RETRY_MS);
  };
  const ready = (ctx: NodeCtx<QMsg>) => {
    ctx.send(QUEUE, { type: 'ready' });
    ctx.setTimer('idle', READY_EVERY_MS);
  };
  const last = () => runs[runs.length - 1];

  return {
    init: (ctx) => {
      busy = null;
      for (const r of runs) {
        if (r.outcome === 'running') {
          r.outcome = 'killed';
          r.end = ctx.trueNow;
        }
      }
      ready(ctx);
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'job') {
        busy = { job: m.job, attempt: m.attempt };
        runs.push({ job: m.job, attempt: m.attempt, worker: id, start: ctx.trueNow, end: null, outcome: 'running' });
        ctx.cancelTimer('idle');
        ctx.setTimer('work', runMs(s, m.job));
      } else if (m.type === 'effected') {
        if (!busy || busy.job !== m.job) return;
        ctx.cancelTimer('fxwait');
        last().outcome = m.applied ? (m.repeat ? 'dup' : 'ok') : 'noop';
        ctx.send(QUEUE, { type: 'done', job: m.job, attempt: busy.attempt });
        busy = null;
        ready(ctx);
      }
    },
    onTimer: (ctx, timerId) => {
      if (timerId === 'work' && busy) {
        last().end = ctx.trueNow;
        if (s.poison && busy.job === POISON_JOB) {
          last().outcome = 'failed';
          ctx.send(QUEUE, { type: 'failed', job: busy.job, attempt: busy.attempt });
          busy = null;
          ready(ctx);
        } else {
          sendEffect(ctx, busy);
        }
      } else if (timerId === 'fxwait' && busy) {
        sendEffect(ctx, busy);
      } else if (timerId === 'idle' && !busy) {
        ready(ctx);
      }
    },
    snapshot: () => ({ role: 'worker', runs: runs.map((r) => ({ ...r })) }),
  };
}

function effectsNode(): DistNode<QMsg, QState> {
  const log: Effect[] = [];
  const keys = new Set<string>();
  return {
    init: () => {},
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type !== 'effect') return;
      const repeat = log.some((e) => e.job === m.job && e.applied);
      const applied = !(m.key !== null && keys.has(m.key));
      if (m.key !== null) keys.add(m.key);
      log.push({ id: log.length, at: ctx.trueNow, job: m.job, by: msg.from, applied, repeat });
      ctx.send(msg.from, { type: 'effected', job: m.job, attempt: m.attempt, applied, repeat });
    },
    onTimer: () => {},
    snapshot: () => ({ role: 'effects', log: [...log] }),
  };
}

export function queueCluster(s: QueueSetup): QCluster {
  const c = createCluster<QMsg, QState>({
    seed: s.seed,
    nodes: { [QUEUE]: queueNode(s), [W1]: workerNode(W1, s), [W2]: workerNode(W2, s), [FX]: effectsNode() },
    latency: (rnd) => Math.round(LATENCY_MS.min + rnd() * (LATENCY_MS.max - LATENCY_MS.min)),
    loss: s.loss,
    duplicate: s.duplicate,
  });
  if (s.killW1) {
    c.crash(W1, KILL_AT_MS);
    c.restart(W1, KILL_AT_MS + RESTART_AFTER_MS);
  }
  return c;
}

/* ---------- invariants ---------- */

type SnapLike = { nodes: Record<string, { state?: QState }> };
const queueOf = (snap: SnapLike) => snap.nodes[QUEUE].state as Extract<QState, { role: 'queue' }>;
const effectsOf = (snap: SnapLike) => snap.nodes[FX].state as Extract<QState, { role: 'effects' }>;

/** J1: every job takes effect at most once. */
export const j1AtMostOnce: Safety<QState> = (snap) => {
  const counts = new Map<number, number>();
  for (const e of effectsOf(snap).log) if (e.applied) counts.set(e.job, (counts.get(e.job) ?? 0) + 1);
  for (const [job, n] of counts) if (n > 1) return `job ${job} took effect ${n} times`;
  return null;
};

const STATES: readonly JobState[] = ['waiting', 'running', 'done', 'dlq'];
/** J3: no job is lost: each is in exactly one of waiting, running, done or the dead-letter queue, and a done job has its effect. */
export const j3NoJobLost: Safety<QState> = (snap) => {
  const jobs = queueOf(snap).jobs;
  if (jobs.length !== JOBS) return `the queue holds ${jobs.length} jobs, not ${JOBS}`;
  const applied = new Set(effectsOf(snap).log.filter((e) => e.applied).map((e) => e.job));
  for (const j of jobs) {
    if (!STATES.includes(j.state)) return `job ${j.id} is in no state: it has been lost`;
    if (j.state === 'done' && !applied.has(j.id)) return `job ${j.id} is marked done but its effect never happened`;
  }
  return null;
};

export const QUEUE_SAFETY: readonly Safety<QState>[] = [j1AtMostOnce, j3NoJobLost];
export const QUEUE_RULE = ['J1', 'J3'] as const;

/* ---------- seeded schedules ---------- */

const pickFrom = (rnd: Rnd, lo: number, hi: number, step: number) => lo + step * Math.floor(rnd() * ((hi - lo) / step + 1));
const SWEEP_STREAM = 0x1b873593;

/** The setup the sweep draws for a seed, every value on its control's grid. */
export function queueSweep(seed: number, idempotent: boolean, network = false): QueueSetup {
  const rnd = mulberry32(seed ^ SWEEP_STREAM);
  return {
    ...DEFAULT_QUEUE,
    seed,
    idempotent,
    visibilityMs: pickFrom(rnd, 1_000, 8_000, 1_000),
    longJobMs: pickFrom(rnd, 1_000, 12_000, 1_000),
    killW1: rnd() < 0.3,
    poison: rnd() < 0.5,
    loss: network ? 0.05 * Math.floor(rnd() * 4) : 0,
    duplicate: network ? 0.05 * Math.floor(rnd() * 4) : 0,
  };
}
/** `network` adds lost and duplicated messages to the draw. */
export const queueScenario = (idempotent: boolean, network = false) => (seed: number) => queueCluster(queueSweep(seed, idempotent, network));

/** Pinned: the lowest seed of forSeeds(0..199) on which the queue without an idempotency key breaks J1 (a test recomputes it). */
export const PINNED_QUEUE_SEED = QUEUE_BROKEN_SEED;

/* ---------- reading a run ---------- */

export interface QueueRun {
  setup: QueueSetup;
  cluster: QCluster;
  jobs: QueueJob[];
  events: QueueEvent[];
  runs: Run[];
  effects: Effect[];
  end: number;
}

export function runQueue(setup: QueueSetup): QueueRun {
  const cluster = queueCluster(setup);
  cluster.run({ until: HORIZON_MS });
  const snap = cluster.snapshot();
  const worker = (id: string) => (snap.nodes[id].state as Extract<QState, { role: 'worker' }>).runs;
  const runs = [...worker(W1), ...worker(W2)].sort((a, b) => a.start - b.start);
  const end = Math.max(1_000, ...runs.map((r) => r.end ?? r.start), ...queueOf(snap).events.map((e) => e.at));
  return { setup, cluster, jobs: queueOf(snap).jobs, events: queueOf(snap).events, runs, effects: effectsOf(snap).log, end };
}

export interface QueueStats {
  duplicateRuns: number;
  retries: number;
  dlq: number;
  done: number;
  /** Times a job's effect was applied beyond its first. */
  doubleEffects: number;
}

export function queueStatsAt(run: QueueRun, until: number): QueueStats {
  const events = run.events.filter((e) => e.at <= until);
  const applied = run.effects.filter((e) => e.at <= until && e.applied);
  return {
    duplicateRuns: run.runs.filter((r) => r.start <= until && (r.outcome === 'dup' || r.outcome === 'noop') && (r.end ?? r.start) <= until).length,
    retries: events.filter((e) => e.kind === 'retry').length,
    dlq: events.filter((e) => e.kind === 'dlq').length,
    done: events.filter((e) => e.kind === 'done').length,
    doubleEffects: applied.filter((e) => e.repeat).length,
  };
}

/** One failing job's retries: the times after the first failure, every job failing together at time 0. */
export function retryTimes(o: { jobs: number; retries: number; baseMs: number; capMs: number; jitter: boolean; seed: number }): number[] {
  const rnd = mulberry32(o.seed);
  const times: number[] = [];
  for (let j = 0; j < o.jobs; j++) {
    let t = 0;
    for (let n = 0; n < o.retries; n++) {
      t += backoffMs(n, o, rnd);
      times.push(t);
    }
  }
  return times;
}
