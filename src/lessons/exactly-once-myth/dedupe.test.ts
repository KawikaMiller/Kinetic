import { describe, expect, it } from 'vitest';
import { checkInvariants, forSeeds } from '../../core/distSim';
import {
  BROKER, CONSUMER, CRASH_POINTS, DEDUPE_BROKEN_SEED, DESIGNS, HORIZON_MS, MESSAGES, STEP_MS, crashTable, dedupeCluster, dedupeScenario, effectAtMostOnce, lowestBreakingSeed,
  runCrashPoint,
} from './dedupe';

const SEEDS = 500;
const bounds = { until: HORIZON_MS };

describe('the 3 crash points x 2 designs, computed by running each', () => {
  it('only a crash between the effect and recording the id applies the effect twice, and only in the separate design', () => {
    const t = crashTable();
    for (const point of CRASH_POINTS) {
      for (const design of DESIGNS) {
        const twice = point === 'gap' && design === 'separate';
        expect(t[point][design], `${point} ${design}`).toEqual({ balance: twice ? 20 : 10, applied: twice ? 2 : 1 });
      }
    }
  });
  it('the crash really falls where the label says: in the gap, after the effect step and before the record step', () => {
    const { cluster } = runCrashPoint('separate', 'gap');
    const consumerTimers = cluster.trace.filter((r) => r.kind === 'timer' && r.node === CONSUMER);
    const crash = cluster.trace.find((r) => r.kind === 'crash')!;
    const step1 = consumerTimers.find((r) => r.detail === 'step1')!;
    expect(step1.t).toBe(5 + STEP_MS);
    expect(crash.t).toBeGreaterThan(step1.t);
    expect(crash.t).toBeLessThan(step1.t + STEP_MS);
    const step2s = consumerTimers.filter((r) => r.detail === 'step2' && r.t < crash.t + 30);
    expect(step2s).toEqual([]);
  });
  it('without a crash each message is applied exactly once, in both designs, and the balance is 10 per message', () => {
    for (const design of DESIGNS) {
      const c = dedupeCluster({ seed: 0, design, fixedLatencyMs: 5 });
      c.run({ until: HORIZON_MS });
      const st = c.snapshot().nodes[CONSUMER].state!;
      expect(st.applied, design).toEqual({ 1: 1, 2: 1, 3: 1 });
      expect(st.balance).toBe(10 * MESSAGES);
      expect(c.snapshot().nodes[BROKER].state!.pending).toEqual([]);
    }
  });
});

describe('the invariant "each message\'s effect is applied at most once" over seeded fault schedules', () => {
  it(`the atomic design holds on ${SEEDS} seeds with loss, duplication, a partition, a crash and a pause, at every step`, () => {
    expect(forSeeds(SEEDS, dedupeScenario('atomic'), [effectAtMostOnce], bounds)).toEqual({ ok: true, seeds: SEEDS });
  });
  it(`DEDUPE_BROKEN_SEED ${DEDUPE_BROKEN_SEED} is the lowest of ${SEEDS} seeds on which the separate design applies an effect twice`, () => {
    expect(lowestBreakingSeed('separate', SEEDS)).toBe(DEDUPE_BROKEN_SEED);
    const verdict = forSeeds(SEEDS, dedupeScenario('separate'), [effectAtMostOnce], bounds);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.seed).toBe(DEDUPE_BROKEN_SEED);
  });
  it('on that seed the cause is a crash in the gap: a consumer crash falls after a step-1 effect with no record step between, the atomic design on the same seed passes, and the same faults without a crash pass', () => {
    const c = dedupeScenario('separate')(DEDUPE_BROKEN_SEED);
    c.run({ until: HORIZON_MS });
    const consumer = c.trace.filter((r) => r.node === CONSUMER && (r.kind === 'timer' || r.kind === 'crash'));
    const gapCrash = consumer.some((r, i) => r.kind === 'crash' && consumer[i - 1]?.kind === 'timer' && consumer[i - 1].detail === 'step1');
    expect(gapCrash).toBe(true);
    expect(checkInvariants(dedupeScenario('atomic')(DEDUPE_BROKEN_SEED), [effectAtMostOnce], bounds).ok).toBe(true);
    expect(checkInvariants(dedupeCluster({ seed: DEDUPE_BROKEN_SEED, design: 'separate', faults: true, crashes: 0 }), [effectAtMostOnce], bounds).ok).toBe(true);
  });
  it(`the separate design with the same faults but no crash holds on ${SEEDS} seeds: the crash in the gap is the only cause`, () => {
    const scenario = (seed: number) => dedupeCluster({ seed, design: 'separate', faults: true, crashes: 0 });
    expect(forSeeds(SEEDS, scenario, [effectAtMostOnce], bounds)).toEqual({ ok: true, seeds: SEEDS });
  });
  it('liveness, apart from safety: with no loss every message is acknowledged and applied once, for both designs, on 100 seeds', () => {
    for (const design of DESIGNS) {
      for (let seed = 0; seed < 100; seed++) {
        const c = dedupeCluster({ seed, design });
        c.run({ until: HORIZON_MS });
        const st = c.snapshot().nodes[CONSUMER].state!;
        expect(Object.values(st.applied), `${design} ${seed}`).toEqual([1, 1, 1]);
      }
    }
  });
});
