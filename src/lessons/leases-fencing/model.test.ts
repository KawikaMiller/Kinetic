import { describe, expect, it } from 'vitest';
import { checkInvariants, forSeeds } from '../../core/distSim';
import {
  ACQUIRE_RETRY_CAP_MS, CLIENT_A, CLIENT_B, DATA_SAFETY, DEFAULT_SETUP, FENCE_MODES, FIRST_TOKEN, GAP_MS, HORIZON_MS, LEASE_BROKEN_SEED, LOCK, PINNED_SEED, RULE_NAME, SAFETY, STORE, TTL_DEFAULT_MS, TTL_RANGE,
  f1NoOlderAfterNewer, f2ValueIsNewest, f3TokensIncrease, leaseCluster, pauseWindow, runLease, statsAt, sweepScenario, sweepSetup, verdictOf, workDoneAt,
  type FenceMode, type LeaseSetup,
} from './model';

const SEEDS = 200;
const setup = (over: Partial<LeaseSetup>): LeaseSetup => ({ ...DEFAULT_SETUP, ...over });
const lowestFailing = (mode: FenceMode, rules = DATA_SAFETY) => {
  const v = forSeeds(SEEDS, sweepScenario(mode), rules, { until: HORIZON_MS });
  return v.ok ? null : v.seed;
};

describe('the hand-built schedule: TTL 10 s, client A paused 12 s, B writes 34, A writes 33', () => {
  it('without fencing the stale write is applied after the newer one, and the first rule it breaks is F1', () => {
    const run = runLease(setup({}));
    expect(run.grants.map((g) => [g.to, g.token, g.epoch])).toEqual([[CLIENT_A, FIRST_TOKEN, 1], [CLIENT_B, FIRST_TOKEN + 1, 2]]);
    expect(run.grants[0].endedBy).toBe('expiry');
    expect(run.store.map((e) => [e.from, e.token, e.applied, e.stale])).toEqual([[CLIENT_B, 34, true, false], [CLIENT_A, 33, true, true]]);
    const v = verdictOf(setup({}));
    expect(v?.rule).toBe('F1');
    expect(v?.message).toContain('lease 1 (token 33) was applied after one from lease 2');
  });

  it('the lease lapsed by the lock service\'s clock (10 s after the grant) while A was still frozen, and A wrote only after it woke', () => {
    const run = runLease(setup({}));
    const lapse = run.grants[0].endedAt!;
    expect(lapse).toBeCloseTo(run.grants[0].at + TTL_DEFAULT_MS, 6);
    expect(run.pause).toEqual({ from: 2_000, to: 14_000 });
    const aWrite = run.store.find((e) => e.from === CLIENT_A)!;
    const sent = run.cluster.trace.find((r) => r.kind === 'send' && r.from === CLIENT_A && r.to === STORE)!;
    expect(sent.t).toBeGreaterThanOrEqual(14_000);
    expect(lapse).toBeLessThan(14_000);
    expect(aWrite.at).toBeGreaterThan(14_000);
  });

  it('with fencing tokens storage rejects the stale write and says why; nothing breaks', () => {
    const run = runLease(setup({ mode: 'fence' }));
    expect(run.store.map((e) => [e.from, e.token, e.applied])).toEqual([[CLIENT_B, 34, true], [CLIENT_A, 33, false]]);
    expect(run.store[1].highestBefore).toBe(34);
    expect(verdictOf(setup({ mode: 'fence' }))).toBeNull();
    expect(statsAt(run, Infinity)).toMatchObject({ applied: 1, rejected: 1, staleApplied: 0, highestToken: 34 });
  });

  it('checking the lease first catches a pause that lands during the job: A sees the lapse on waking and stops', () => {
    const run = runLease(setup({ mode: 'check' }));
    expect(run.abandoned.map((a) => [a.node, a.why])).toEqual([[CLIENT_A, 'check']]);
    expect(run.store.map((e) => e.from)).toEqual([CLIENT_B]);
    expect(verdictOf(setup({ mode: 'check' }))).toBeNull();
  });

  it('but a pause that lands between the check and the write is not caught: the check passed, the write goes out stale', () => {
    const s = setup({ mode: 'check', pauseAt: 'write' });
    const run = runLease(s);
    expect(run.abandoned).toEqual([]);
    expect(run.store.map((e) => [e.from, e.stale])).toEqual([[CLIENT_B, false], [CLIENT_A, true]]);
    expect(verdictOf(s)?.rule).toBe('F1');
  });

  it('the pause really starts after the check and before the write leaves (between the job-done timer and the send timer)', () => {
    const s = setup({ mode: 'check', pauseAt: 'write' });
    const w = pauseWindow(s)!;
    const done = workDoneAt(s)!;
    expect(w.from).toBeGreaterThan(done);
    expect(w.from).toBeLessThan(done + GAP_MS);
    const trace = leaseCluster(s);
    trace.run({ until: HORIZON_MS });
    const rows = trace.trace;
    const work = rows.findIndex((r) => r.kind === 'timer' && r.node === CLIENT_A && r.detail === 'work');
    const pause = rows.findIndex((r) => r.kind === 'pause' && r.node === CLIENT_A);
    const send = rows.findIndex((r) => r.kind === 'timer' && r.node === CLIENT_A && r.detail === 'send');
    expect(work).toBeLessThan(pause);
    expect(pause).toBeLessThan(send);
  });

  it('a slow clock fools the check too: with A\'s clock 5 s behind, A wakes believing 9.0 s of a 10 s lease have passed and writes', () => {
    const s = setup({ mode: 'check', aOffsetMs: -5_000 });
    const run = runLease(s);
    expect(run.abandoned).toEqual([]);
    expect(run.store.at(-1)).toMatchObject({ from: CLIENT_A, stale: true });
    // The same clock with a pause too short to matter changes nothing: the offset alone is not a fault.
    expect(verdictOf(setup({ mode: 'check', aOffsetMs: -5_000, pauseMs: 0 }))).toBeNull();
  });

  it('a longer TTL does not close the window: a pause longer than the TTL lapses it at any TTL on the slider', () => {
    for (const ttlMs of [TTL_RANGE.min, 10_000, TTL_RANGE.max]) {
      const pauseMs = ttlMs + 2_000;
      const run = runLease(setup({ ttlMs, pauseMs }));
      expect(run.grants[0].endedBy, `ttl ${ttlMs}`).toBe('expiry');
      expect(verdictOf(setup({ ttlMs, pauseMs }))?.rule, `ttl ${ttlMs}`).toBe('F1');
      // and a pause shorter than the lease, with fencing off, is survived
      expect(verdictOf(setup({ ttlMs, pauseMs: 0 })), `ttl ${ttlMs}`).toBeNull();
    }
  });
});

describe(`${SEEDS} seeded fault schedules: pauses, clock skew, delayed, lost and duplicated messages, a lock restart`, () => {
  it('with fencing on, F1, F2 and F3 hold at every step of 300 schedules', () => {
    expect(forSeeds(300, sweepScenario('fence'), SAFETY, { until: HORIZON_MS })).toEqual({ ok: true, seeds: 300 });
  });

  it('the other three modes keep F3 (the lock service\'s own promise) except random tokens', () => {
    for (const mode of ['none', 'check', 'fence'] as const) {
      expect(forSeeds(SEEDS, sweepScenario(mode), [f3TokensIncrease], { until: HORIZON_MS }), mode).toEqual({ ok: true, seeds: SEEDS });
    }
    const random = forSeeds(SEEDS, sweepScenario('fence-random'), [f3TokensIncrease], { until: HORIZON_MS });
    expect(random.ok).toBe(false);
  });

  it('PINNED_SEED is the lowest seed of forSeeds(0..199) that breaks F1 or F2 in each broken mode, and there is none with fencing', () => {
    for (const mode of FENCE_MODES) expect(lowestFailing(mode), mode).toBe(PINNED_SEED[mode]);
    expect(PINNED_SEED.none).toBe(LEASE_BROKEN_SEED);
    expect(DEFAULT_SETUP.seed).toBe(LEASE_BROKEN_SEED);
  });

  it('no fencing, pinned seed: the stale write arrives after a lease lapsed during A\'s pause (traced), and removing the pause removes the failure (counterfactual)', () => {
    const seed = PINNED_SEED.none!;
    const s = sweepSetup(seed, 'none');
    const run = runLease(s);
    const stale = run.store.find((e) => e.stale)!;
    expect(stale).toBeDefined();
    const newer = run.store.find((e) => e.epoch > stale.epoch)!;
    expect(newer.at).toBeLessThan(stale.at);
    const staleLease = run.grants.find((g) => g.epoch === stale.epoch)!;
    expect(staleLease.endedBy).toBe('expiry');
    expect(staleLease.endedAt!).toBeLessThan(newer.at);
    const holder = staleLease.to;
    const pauseNode = run.cluster.trace.find((r) => r.kind === 'pause')!.node;
    expect(holder).toBe(pauseNode);
    expect(run.pause!.to! - run.pause!.from).toBeGreaterThan(s.ttlMs - run.pause!.from + 0);
    // counterfactuals: no pause, or fencing, or a TTL that outlasts the pause, and the same seed passes
    expect(verdictOf({ ...s, pauseMs: 0 })).toBeNull();
    expect(verdictOf({ ...s, mode: 'fence' })).toBeNull();
    expect(verdictOf({ ...s, ttlMs: s.ttlMs + s.pauseMs })).toBeNull();
  });

  it('check mode, pinned seed: the pause lands after the check (A passed it and did not stop), and moving the pause earlier lets the check catch it', () => {
    const seed = PINNED_SEED.check!;
    const s = sweepSetup(seed, 'check');
    expect(s.pauseAt).toBe('write');
    const run = runLease(s);
    expect(run.abandoned).toEqual([]);
    expect(run.store.some((e) => e.stale)).toBe(true);
    expect(verdictOf({ ...s, pauseMs: 0 })).toBeNull();
    expect(verdictOf({ ...s, mode: 'fence' })).toBeNull();
    expect(verdictOf({ ...s, pauseAt: 'job' })).toBeNull();
  });

  it('random tokens, pinned seed: the older lease drew the higher token, so storage turned away the newest lease write (a real comparison on real tokens)', () => {
    const seed = PINNED_SEED['fence-random']!;
    const s = sweepSetup(seed, 'fence-random');
    const run = runLease(s);
    const [first, second] = run.grants;
    expect(first.token).toBeGreaterThan(second.token);
    const refused = run.store.find((e) => e.refusedNewest)!;
    expect(refused.epoch).toBe(second.epoch);
    expect(refused.token).toBe(second.token);
    expect(refused.highestBefore).toBe(first.token);
    expect(statsAt(run, Infinity)).toMatchObject({ refusedNewest: 1, staleApplied: 0 });
    // the same schedule with counting tokens: nothing is refused
    expect(verdictOf({ ...s, mode: 'fence' })).toBeNull();
    // the lock service's own promise breaks first (the second grant is not above the first), then the data rule
    expect(verdictOf(s)?.rule).toBe('F3');
    const data = forSeeds({ from: seed, to: seed + 1 }, sweepScenario('fence-random'), DATA_SAFETY, { until: HORIZON_MS });
    expect(data.ok ? null : RULE_NAME[data.rule]).toBe('F2');
  });

  it('random tokens also let a stale write through on some seeds (the older lease drew the lower token only by luck of the draw going the other way)', () => {
    const stale = Array.from({ length: SEEDS }, (_, seed) => runLease(sweepSetup(seed, 'fence-random'))).filter((r) => r.store.some((e) => e.stale));
    expect(stale.length).toBeGreaterThan(0);
    for (const r of stale) {
      const e = r.store.find((x) => x.stale)!;
      const newer = r.grants.find((g) => g.epoch > e.epoch)!;
      expect(e.token).toBeGreaterThanOrEqual(newer.token);
    }
  });

  it('F3 can fail for the lock service itself: one that forgets its counter on restart hands token 33 out twice (hand-built, test-only flag)', () => {
    const s = setup({ mode: 'fence', lockCrash: true, lockAmnesia: true });
    const run = runLease(s);
    expect(run.grants.map((g) => g.token)).toEqual([33, 33]);
    const r = checkInvariants(leaseCluster(s), [f3TokensIncrease], { until: HORIZON_MS });
    expect(r.ok).toBe(false);
    // the honest lock service survives the same restart without reusing a token
    expect(runLease({ ...s, lockAmnesia: false }).grants.map((g) => g.token)).toEqual([33, 34]);
  });

  it('F1 and F2 are not the same check: a hand-built store log can break one and not the other', () => {
    const fake = (log: { epoch: number; applied: boolean }[], valueEpoch: number) => ({
      time: 0, step: 0, inFlight: 0,
      nodes: { [STORE]: { up: true, paused: false, state: { role: 'store' as const, value: null, valueEpoch, highestToken: 0, log: log.map((e, id) => ({ id, at: id, from: 'A', value: 'v', token: 0, stale: false, highestBefore: 0, ...e })) } } },
    });
    // A newer write was rejected and the older one stays: F2 breaks, F1 holds.
    const rejectedNewest = fake([{ epoch: 1, applied: true }, { epoch: 2, applied: false }], 1);
    expect(f1NoOlderAfterNewer(rejectedNewest as never)).toBeNull();
    expect(f2ValueIsNewest(rejectedNewest as never)).toContain('lease 1');
    // An older write applied after a newer one, with the newer one's value kept in `valueEpoch`: F1 breaks.
    const overwrite = fake([{ epoch: 2, applied: true }, { epoch: 1, applied: true }], 2);
    expect(f1NoOlderAfterNewer(overwrite as never)).toContain('lease 1');
  });

  it('liveness, stated apart from safety: if the holder crashes, another client is granted the lock once the TTL has passed (no loss, so a fair schedule), on every seed', () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const s = setup({ seed, mode: 'fence', pauseMs: 0, duplicate: 0.15 });
      const c = leaseCluster(s);
      c.crash(CLIENT_A, 1_000);
      c.run({ until: HORIZON_MS });
      const snap = c.snapshot();
      const lock = snap.nodes[LOCK].state;
      if (lock?.role !== 'lock') throw new Error('lock state');
      const b = lock.grants.find((g) => g.to === CLIENT_B);
      expect(b, `seed ${seed}`).toBeDefined();
      expect(b!.at, `seed ${seed}`).toBeGreaterThanOrEqual(lock.grants[0].endedAt!);
      expect(b!.at, `seed ${seed}`).toBeLessThan(lock.grants[0].at + s.ttlMs + ACQUIRE_RETRY_CAP_MS);
    }
  });
});

describe('the numbers on screen match an independent reading of the trace', () => {
  it('applied, rejected and stale counts equal what the storage server sent back and what arrived, for every mode on 60 sweep seeds', () => {
    for (const mode of FENCE_MODES) {
      for (let seed = 0; seed < 60; seed++) {
        const run = runLease(sweepSetup(seed, mode));
        const rows = run.cluster.trace;
        const sentBack = rows.filter((r) => r.kind === 'send' && r.from === STORE);
        const stored = sentBack.filter((r) => r.payload?.type === 'stored').length;
        const rejected = sentBack.filter((r) => r.payload?.type === 'rejected').length;
        const arrived = rows.filter((r) => r.kind === 'deliver' && r.to === STORE && r.payload?.type === 'write');
        let newest = 0;
        let stale = 0;
        for (const r of arrived) {
          if (r.payload?.type !== 'write') continue;
          if (r.payload.epoch < newest && sentBack.some((b) => b.payload?.type === 'stored' && b.t === r.t && b.to === r.from)) stale++;
          newest = Math.max(newest, r.payload.epoch);
        }
        const s = statsAt(run, Infinity);
        expect([s.applied, s.rejected, s.staleApplied], `${mode} seed ${seed}`).toEqual([stored, rejected, stale]);
        expect(arrived.length).toBe(run.store.length);
      }
    }
  });

  it('same seed and setup give the same trace, row for row', () => {
    const a = runLease(sweepSetup(7, 'check'));
    const b = runLease(sweepSetup(7, 'check'));
    expect(a.cluster.trace).toEqual(b.cluster.trace);
  });

  it('the sweep draws values on the sliders\' grids, so loading a seed puts every control exactly where the sweep ran', () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const s = sweepSetup(seed, 'none');
      expect(s.ttlMs % 1000).toBe(0);
      expect(s.ttlMs).toBeGreaterThanOrEqual(TTL_RANGE.min);
      expect(s.ttlMs).toBeLessThanOrEqual(TTL_RANGE.max);
      expect(s.pauseMs % 500).toBe(0);
      expect(Math.abs(s.aOffsetMs % 1000)).toBe(0);
      expect(Math.abs(s.aDriftPpm % 5000)).toBe(0);
      expect(Math.round(s.loss * 100) % 5).toBe(0);
      expect(Math.round(s.duplicate * 100) % 5).toBe(0);
    }
    expect(RULE_NAME).toEqual(['F1', 'F2', 'F3']);
  });
});
