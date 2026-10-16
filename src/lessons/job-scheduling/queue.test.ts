import { describe, expect, it } from 'vitest';
import { checkInvariants, forSeeds } from '../../core/distSim';
import { mulberry32 } from '../../core/random';
import {
  DEFAULT_QUEUE, HORIZON_MS, JOBS, LONG_JOB, POISON_JOB, QUEUE_BROKEN_SEED, QUEUE_SAFETY, W1, backoffMs, j1AtMostOnce, j3NoJobLost, queueCluster, queueScenario, queueStatsAt, queueSweep, retryTimes,
  runQueue, type QueueSetup,
} from './queue';

const SEEDS = 200;
const setup = (over: Partial<QueueSetup>): QueueSetup => ({ ...DEFAULT_QUEUE, ...over });
const j1 = (c: ReturnType<typeof queueCluster>) => checkInvariants(c, [j1AtMostOnce], { until: HORIZON_MS });

describe('at-least-once: a job that outruns the visibility timeout runs twice', () => {
  it('hand-built: T = 4 s and job 2 takes 6 s: it is handed out again at the end of the window, runs a second time and takes effect twice', () => {
    const run = runQueue(setup({ poison: false }));
    const runs = run.runs.filter((r) => r.job === LONG_JOB);
    expect(runs.map((r) => [r.attempt, r.outcome])).toEqual([[1, 'ok'], [2, 'dup']]);
    const visible = run.events.find((e) => e.kind === 'visible' && e.job === LONG_JOB)!;
    expect(visible.at).toBeGreaterThanOrEqual(DEFAULT_QUEUE.visibilityMs);
    expect(visible.at).toBeLessThan(runs[0].end!);
    expect(run.effects.filter((e) => e.job === LONG_JOB && e.applied)).toHaveLength(2);
    expect(j1(queueCluster(setup({ poison: false }))).ok).toBe(false);
  });

  it('with an idempotency key the second run is a no-op: the store ignores it and J1 holds', () => {
    const s = setup({ poison: false, idempotent: true });
    const run = runQueue(s);
    expect(run.runs.filter((r) => r.job === LONG_JOB).map((r) => r.outcome)).toEqual(['ok', 'noop']);
    expect(run.effects.filter((e) => e.job === LONG_JOB && e.applied)).toHaveLength(1);
    expect(j1(queueCluster(s)).ok).toBe(true);
  });

  it('a bigger timeout is not the real fix: a job that outruns the larger window still runs twice, and the key still catches it', () => {
    const s = setup({ poison: false, visibilityMs: 10_000, longJobMs: 12_000 });
    expect(j1(queueCluster(s)).ok).toBe(false);
    expect(j1(queueCluster({ ...s, idempotent: true })).ok).toBe(true);
  });

  it('killing a worker mid-job makes the job run again from the start, and it takes effect once (the first run never got that far)', () => {
    const run = runQueue(setup({ poison: false, longJobMs: 2_000, killW1: true }));
    const killed = run.runs.filter((r) => r.outcome === 'killed');
    expect(killed.map((r) => r.worker)).toEqual([W1]);
    expect(run.effects.filter((e) => e.job === killed[0].job && e.applied)).toHaveLength(1);
    expect(run.jobs.every((j) => j.state === 'done')).toBe(true);
  });

  it('the poison job is retried with backoff and lands in the dead-letter queue after the last attempt', () => {
    const run = runQueue(setup({ longJobMs: 2_000, visibilityMs: 10_000 }));
    expect(run.jobs.find((j) => j.id === POISON_JOB)).toMatchObject({ state: 'dlq', attempts: DEFAULT_QUEUE.maxAttempts });
    expect(run.events.filter((e) => e.kind === 'retry')).toHaveLength(DEFAULT_QUEUE.maxAttempts - 1);
    const stats = queueStatsAt(run, Infinity);
    expect(stats).toMatchObject({ dlq: 1, retries: 3, done: 3, doubleEffects: 0 });
  });
});

describe(`${SEEDS} seeded schedules: worker kills, long jobs, short windows`, () => {
  it('with the idempotency key J1 and J3 hold at every step, with and without lost and duplicated messages', () => {
    expect(forSeeds(SEEDS, queueScenario(true, false), QUEUE_SAFETY, { until: HORIZON_MS })).toEqual({ ok: true, seeds: SEEDS });
    expect(forSeeds(SEEDS, queueScenario(true, true), QUEUE_SAFETY, { until: HORIZON_MS })).toEqual({ ok: true, seeds: SEEDS });
  });

  it('without the key J1 breaks, and the lowest failing seed is the pinned one', () => {
    const v = forSeeds(SEEDS, queueScenario(false, false), QUEUE_SAFETY, { until: HORIZON_MS });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.seed).toBe(QUEUE_BROKEN_SEED);
      expect(v.rule).toBe(0);
    }
    expect(DEFAULT_QUEUE.seed).toBe(QUEUE_BROKEN_SEED);
  });

  it('pinned seed: job 2 outruns the window, the queue hands it out again while the first run is still going (traced), and each counterfactual removes the failure', () => {
    const s = queueSweep(QUEUE_BROKEN_SEED, false);
    const run = runQueue(s);
    const double = run.effects.filter((e) => e.repeat && e.applied)[0];
    const job = double.job;
    const runs = run.runs.filter((r) => r.job === job);
    expect(runs.length).toBeGreaterThanOrEqual(2);
    const visible = run.events.find((e) => e.kind === 'visible' && e.job === job)!;
    expect(visible.at).toBeGreaterThanOrEqual(s.visibilityMs);
    expect(runs[0].end! - runs[0].start).toBeGreaterThan(s.visibilityMs);
    expect(runs[1].start).toBeGreaterThanOrEqual(visible.at);
    expect(runs[1].start).toBeLessThan(runs[0].end! + 200);
    expect(j1(queueCluster(s)).ok).toBe(false);
    expect(j1(queueCluster({ ...s, idempotent: true })).ok).toBe(true);
    expect(j1(queueCluster({ ...s, visibilityMs: 10_000, longJobMs: 3_000 })).ok).toBe(true);
    expect(j1(queueCluster({ ...s, longJobMs: s.visibilityMs - 1_000 })).ok).toBe(true);
  });

  it('J3 can fail: a queue that forgets a job when its window ends (test-only flag) leaves the job in no state, and J3 says so', () => {
    const c = queueCluster(setup({ poison: false, dropOnExpiry: true }));
    const r = checkInvariants(c, [j3NoJobLost], { until: HORIZON_MS });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('has been lost');
    expect(checkInvariants(queueCluster(setup({ poison: false })), [j3NoJobLost], { until: HORIZON_MS }).ok).toBe(true);
  });

  it('liveness, apart from safety: with no message loss every job ends done or in the dead-letter queue by the end of the run', () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const run = runQueue(queueSweep(seed, true, false));
      expect(run.jobs.length).toBe(JOBS);
      for (const j of run.jobs) expect(['done', 'dlq'], `seed ${seed} job ${j.id}`).toContain(j.state);
      // a dead-lettered job used up its attempts; a done job has an effect
      for (const j of run.jobs) {
        if (j.state === 'dlq') expect(j.attempts).toBeGreaterThanOrEqual(queueSweep(seed, true).maxAttempts);
        if (j.state === 'done') expect(run.effects.some((e) => e.job === j.id && e.applied)).toBe(true);
      }
    }
  });

  it('the numbers on screen equal an independent reading of the effects log', () => {
    for (let seed = 0; seed < 60; seed++) {
      const run = runQueue(queueSweep(seed, false, true));
      const perJob = new Map<number, number>();
      for (const e of run.effects) if (e.applied) perJob.set(e.job, (perJob.get(e.job) ?? 0) + 1);
      const extra = [...perJob.values()].reduce((sum, n) => sum + Math.max(0, n - 1), 0);
      expect(queueStatsAt(run, Infinity).doubleEffects, `seed ${seed}`).toBe(extra);
    }
  });

  it('same seed, same trace', () => {
    expect(runQueue(queueSweep(5, false, true)).cluster.trace).toEqual(runQueue(queueSweep(5, false, true)).cluster.trace);
  });
});

describe('retry delays: min(cap, base * 2^n), or a random share of it with full jitter', () => {
  it('without jitter the delays follow the closed form: 1, 2, 4, 8 s then the 8 s cap', () => {
    const o = { baseMs: 1_000, capMs: 8_000, jitter: false };
    expect([0, 1, 2, 3, 4, 5].map((n) => backoffMs(n, o, mulberry32(1)))).toEqual([1_000, 2_000, 4_000, 8_000, 8_000, 8_000]);
  });

  it('with full jitter each delay lies in [0, ceiling] and its mean is about half the ceiling (10,000 seeded draws)', () => {
    const o = { baseMs: 1_000, capMs: 8_000, jitter: true };
    const rnd = mulberry32(7);
    for (const n of [0, 1, 2, 3, 6]) {
      const ceiling = Math.min(8_000, 1_000 * 2 ** n);
      const draws = Array.from({ length: 10_000 }, () => backoffMs(n, o, rnd));
      expect(Math.min(...draws)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...draws)).toBeLessThanOrEqual(ceiling);
      const mean = draws.reduce((a, b) => a + b, 0) / draws.length;
      expect(Math.abs(mean - ceiling / 2)).toBeLessThan(ceiling * 0.02);
    }
  });

  it('thirty jobs failing together retry in lockstep without jitter, and spread out with it', () => {
    const base = { jobs: 30, retries: 3, baseMs: 1_000, capMs: 8_000, seed: 3 };
    const peak = (times: number[]) => Math.max(...Array.from(times.reduce((m, t) => m.set(Math.floor(t / 250), (m.get(Math.floor(t / 250)) ?? 0) + 1), new Map<number, number>()).values()));
    const lock = retryTimes({ ...base, jitter: false });
    const spread = retryTimes({ ...base, jitter: true });
    expect(new Set(lock).size).toBe(3);
    expect(peak(lock)).toBe(30);
    expect(peak(spread)).toBeLessThan(0.7 * peak(lock));
    expect(lock).toHaveLength(90);
    expect(spread).toHaveLength(90);
  });
});
