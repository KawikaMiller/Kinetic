import { describe, expect, it } from 'vitest';
import { forSeeds } from '../../core/distSim';
import {
  DAY_MS, DB, DEFAULT_SCHED, HOUR_MS, KILL_AT_MS, LEASE_TTL_MS, MIN_MS, MISS_AFTER_MS, PAUSE_FROM_MS, PINNED_SCHED_SEED, SCHED_BROKEN_SEED, SCHED_MODES, SWEEP_UNTIL_MS, j1AtMostOncePerFire, runSched, schedCluster,
  schedScenario, schedStatsAt, schedSweep, type SchedMode, type SchedSetup,
} from './sched';

const SEEDS = 200;
const setup = (over: Partial<SchedSetup>): SchedSetup => ({ ...DEFAULT_SCHED, ...over });
const lowest = (mode: SchedMode, extras = {}) => {
  const v = forSeeds(SEEDS, schedScenario(mode, extras), [j1AtMostOncePerFire], { until: SWEEP_UNTIL_MS });
  return v.ok ? null : v.seed;
};

describe('distributed cron: three replicas, one job at the top of the hour (one cron minute is one simulated second)', () => {
  it('hand-built, mode (a): three replicas, one fire time, and the job takes effect three times', () => {
    const run = runSched(setup({ mode: 'every' }), HOUR_MS + MIN_MS);
    expect(run.rows.filter((r) => r.fire === 1 && r.applied).map((r) => r.by).sort()).toEqual(['r1', 'r2', 'r3']);
    expect(schedStatsAt(run, Infinity)).toMatchObject({ applied: 3, repeatedFires: 1, extraRuns: 2 });
    expect(forSeeds(1, () => schedCluster(setup({ mode: 'every' })), [j1AtMostOncePerFire], { until: HOUR_MS + MIN_MS }).ok).toBe(false);
  });

  it('mode (a) breaks J1 on every one of the 200 seeded schedules', () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const v = forSeeds({ from: seed, to: seed + 1 }, schedScenario('every'), [j1AtMostOncePerFire], { until: SWEEP_UNTIL_MS });
      expect(v.ok, `seed ${seed}`).toBe(false);
    }
  });

  it('the dedupe key holds J1 at every step of 200 schedules with a fault, a pause, clock skew, loss AND duplicated messages', () => {
    expect(forSeeds(SEEDS, schedScenario('dedupe', { skew: true, duplicates: true }), [j1AtMostOncePerFire], { until: SWEEP_UNTIL_MS })).toEqual({ ok: true, seeds: SEEDS });
  });

  it('PINNED_SCHED_SEED is the lowest failing seed of the base sweep (pause, kill, loss) for each mode: every 0, leader 0, leader with fencing 118 (lost renewals, no pause); the dedupe key has none', () => {
    for (const mode of SCHED_MODES) expect(lowest(mode), mode).toBe(PINNED_SCHED_SEED[mode]);
    expect(PINNED_SCHED_SEED.every).toBe(SCHED_BROKEN_SEED);
    expect(DEFAULT_SCHED.seed).toBe(SCHED_BROKEN_SEED);
  });

  it('leader by lease, pinned seed: r1 is frozen past its lease, r2 takes over and fires, and r1 fires the same slot when it wakes (traced); without the pause the same seed passes', () => {
    const seed = PINNED_SCHED_SEED.leader!;
    const s = schedSweep(seed, 'leader');
    expect(s.fault).toBe('pause');
    const run = runSched(s, SWEEP_UNTIL_MS);
    const twice = run.rows.filter((r) => r.duplicate)[0];
    expect(twice.by).toBe('r1');
    const first = run.rows.find((r) => r.fire === twice.fire && r.applied)!;
    expect(first.by).not.toBe('r1');
    expect(first.at).toBeLessThan(twice.at);
    expect(run.pause!.to).toBeGreaterThan(twice.fire * HOUR_MS);
    const lease = run.grants.find((g) => g.to === 'r1')!;
    expect(lease.until!).toBeLessThan(run.pause!.from + LEASE_TTL_MS + 1);
    expect(run.grants.find((g) => g.to !== 'r1')!.at).toBeLessThan(twice.fire * HOUR_MS);
    expect(twice.at).toBeGreaterThanOrEqual(run.pause!.to);
    // counterfactuals: no pause, a pause shorter than the lease, fencing, or the dedupe key
    expect(forSeeds({ from: seed, to: seed + 1 }, () => schedCluster({ ...s, fault: 'none' }), [j1AtMostOncePerFire], { until: SWEEP_UNTIL_MS }).ok).toBe(true);
    expect(forSeeds({ from: seed, to: seed + 1 }, () => schedCluster({ ...s, pauseMs: MIN_MS }), [j1AtMostOncePerFire], { until: SWEEP_UNTIL_MS }).ok).toBe(true);
    expect(forSeeds({ from: seed, to: seed + 1 }, () => schedCluster({ ...s, mode: 'leader-fenced' }), [j1AtMostOncePerFire], { until: SWEEP_UNTIL_MS }).ok).toBe(true);
    expect(forSeeds({ from: seed, to: seed + 1 }, () => schedCluster({ ...s, mode: 'dedupe' }), [j1AtMostOncePerFire], { until: SWEEP_UNTIL_MS }).ok).toBe(true);
  });

  it('leader with fencing, pinned seed: r1 loses the lease without hearing of it (lost renewals), fires the same slot, and its lower token lands first; counterfactuals: no loss, dedupe key', () => {
    const seed = PINNED_SCHED_SEED['leader-fenced']!;
    const s = schedSweep(seed, 'leader-fenced');
    expect([s.fault, s.loss > 0]).toEqual(['kill', true]);
    const run = runSched(s, SWEEP_UNTIL_MS);
    const second = run.rows.find((r) => r.duplicate)!;
    const first = run.rows.find((r) => r.fire === second.fire && r.applied && r.id !== second.id)!;
    // the earlier run carries the LOWER token, so the fence has nothing to reject
    expect(first.token).toBeLessThan(second.token);
    expect(first.at).toBeLessThan(second.at);
    // r1 no longer held the lease at the lock service when its run was sent
    const r1Lease = run.grants.find((g) => g.to === first.by && g.token === first.token)!;
    expect(r1Lease.until!).toBeLessThan(first.at);
    const passes = (over: Partial<SchedSetup>) => forSeeds({ from: seed, to: seed + 1 }, () => schedCluster({ ...s, ...over }), [j1AtMostOncePerFire], { until: SWEEP_UNTIL_MS }).ok;
    expect(passes({ loss: 0 })).toBe(true);
    expect(passes({ mode: 'dedupe' })).toBe(true);
  });

  it('a replica that lost the lease contends again: with no fault and 10% loss the leader mode misses far fewer fires than the three first grants allow (40 seeds)', () => {
    let missed = 0;
    for (let seed = 0; seed < 40; seed++) missed += runSched(setup({ mode: 'leader', fault: 'none', loss: 0.1, seed }), DAY_MS + MIN_MS).missed.length;
    // Without re-contending, each replica led once and then nobody did: 14.2 of 24 fires lost per day (measured before the fix; about 2.7 after).
    expect(missed / 40).toBeLessThan(5);
    const clean = runSched(setup({ mode: 'leader', fault: 'none', loss: 0 }), DAY_MS + MIN_MS);
    expect(clean.missed).toEqual([]);
    expect(clean.grants).toHaveLength(1);
  });

  it('with fencing the paused leader\'s late fire is rejected with a stale token, and the row says so', () => {
    const run = runSched(setup({ mode: 'leader-fenced', fault: 'pause' }), 4 * HOUR_MS);
    const late = run.rows.find((r) => r.by === 'r1' && r.reason === 'stale token')!;
    expect(late).toBeDefined();
    expect(late.applied).toBe(false);
    expect(late.token).toBeLessThan(run.rows.find((r) => r.fire === late.fire && r.applied)!.token);
  });

  it('killing the leader leaves a gap: the 03:00 fire is missed, and the next leader runs 04:00 (liveness is not given by a leader)', () => {
    const run = runSched(setup({ mode: 'leader', fault: 'kill' }), 5 * HOUR_MS + MIN_MS);
    expect(run.crashedAt).toBe(KILL_AT_MS);
    expect(run.missed).toEqual([3]);
    expect(run.rows.filter((r) => r.applied).map((r) => r.fire)).toEqual([1, 2, 4, 5]);
    const second = run.grants.find((g) => g.to !== 'r1')!;
    expect(second.at).toBeGreaterThan(3 * HOUR_MS);
    expect(second.at - KILL_AT_MS).toBeLessThanOrEqual(LEASE_TTL_MS + 1_000);
    expect(MISS_AFTER_MS).toBeLessThan(HOUR_MS);
  });

  it('liveness, apart from safety: with the dedupe key and at least one replica up, every fire takes effect at least once, with r1 killed or paused and no loss', () => {
    for (const fault of ['none', 'kill', 'pause'] as const) {
      for (let seed = 0; seed < 40; seed++) {
        const run = runSched(setup({ mode: 'dedupe', fault, seed, duplicate: 0.1 }), 8 * HOUR_MS);
        expect(run.missed, `${fault} seed ${seed}`).toEqual([]);
      }
    }
  });

  it('skew and duplicated messages are second causes that fencing does not stop (one counterexample each, found by the sweep)', () => {
    expect(lowest('leader-fenced', { skew: true })).not.toBeNull();
    expect(lowest('leader-fenced', { duplicates: true })).not.toBeNull();
    const v = lowest('leader-fenced', { duplicates: true })!;
    const run = runSched(schedSweep(v, 'leader-fenced', { duplicates: true }), SWEEP_UNTIL_MS);
    const row = run.rows.find((r) => r.duplicate)!;
    const twin = run.rows.find((r) => r.fire === row.fire && r.applied && r.id !== row.id)!;
    expect([row.by, row.token]).toEqual([twin.by, twin.token]);
  });

  it('the pause and kill land where the cron timeline says (02:55 and 02:58), and a pause longer than the lease frees it', () => {
    expect(PAUSE_FROM_MS).toBe(2 * HOUR_MS + 55 * MIN_MS);
    expect(KILL_AT_MS).toBe(2 * HOUR_MS + 58 * MIN_MS);
    const run = runSched(setup({ mode: 'leader', fault: 'pause' }), 4 * HOUR_MS);
    expect(run.pause).toEqual({ from: PAUSE_FROM_MS, to: PAUSE_FROM_MS + 15 * MIN_MS });
    expect(run.grants.map((g) => g.to)).toEqual(['r1', 'r2']);
  });

  it('a control that is not shown does not reach the numbers: the pause length changes nothing unless the fault is a pause', () => {
    for (const fault of ['none', 'kill'] as const) {
      const a = runSched(setup({ mode: 'leader', fault, pauseMs: MIN_MS }), 5 * HOUR_MS);
      const b = runSched(setup({ mode: 'leader', fault, pauseMs: 30 * MIN_MS }), 5 * HOUR_MS);
      expect(a.cluster.trace).toEqual(b.cluster.trace);
    }
  });

  it('the database is the only node whose log counts: the db id is part of the trace', () => {
    expect(runSched(setup({}), HOUR_MS + MIN_MS).cluster.trace.some((r) => r.to === DB)).toBe(true);
  });
});
