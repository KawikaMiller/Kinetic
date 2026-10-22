import { describe, expect, it } from 'vitest';
import { SEED_MAX } from '../../core/seed';
import {
  CHECK_SEEDS, checkSeeds, crashEveryStep, describeTwoPcCheck, EARLY_COMMIT_SEED, outOfStockOn, stepTimes,
} from './twoPcCheck';
import { atomicity, CHECK_HORIZON_MS, NODE_IDS, PARTICIPANTS, twoPcCluster, type TwoPcMsg, type TwoPcOptions } from './twoPc';
import { consistencyOf, sceneOptions, TWO_PC_CASES, twoPcSteps } from './twoPcSteps';

const clean = (o: Partial<TwoPcOptions> = {}): TwoPcOptions => ({ seed: 1, variant: 'real', outOfStock: false, faults: false, ...o });

const sendsByType = (o: TwoPcOptions) => {
  const cluster = twoPcCluster(o);
  cluster.run({ until: CHECK_HORIZON_MS });
  const counts: Record<string, number> = {};
  for (const r of cluster.trace) if (r.kind === 'send') counts[(r.payload as TwoPcMsg).type] = (counts[(r.payload as TwoPcMsg).type] ?? 0) + 1;
  return counts;
};

describe('real two-phase commit', () => {
  it(`keeps atomicity after every event on all ${CHECK_SEEDS} seeds with loss and duplication`, () => {
    const s = checkSeeds('real');
    expect(s.seeds).toBe(CHECK_SEEDS);
    expect(s.failedRuns).toBe(0);
    expect(s.events).toBeGreaterThan(CHECK_SEEDS * 10);
  });

  it(`keeps atomicity with every node crashed after every step, restarting or staying down, on all ${CHECK_SEEDS} seeds`, () => {
    const s = crashEveryStep('real');
    expect(s.failedRuns).toBe(0);
    // 6 nodes x (1 + steps) crash points x 2 restart choices per seed: far more than one run per seed.
    expect(s.runs).toBeGreaterThan(CHECK_SEEDS * NODE_IDS.length * 2 * 10);
  });

  it('sends exactly the messages a hand count gives, on a clean network', () => {
    // Hand count for one transaction: 1 place + 3 PREPARE + 3 votes + 3 decisions + 3 acks + 1 result = 14.
    const counts = sendsByType(clean());
    expect(counts).toEqual({ place: 1, prepare: 3, vote: 3, commit: 3, ack: 3, result: 1 });
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(14);
    // With Inventory out of stock the coordinator aborts on the NO vote: the same 14 messages, aborts for commits.
    const no = sendsByType(clean({ outOfStock: true }));
    expect(no).toEqual({ place: 1, prepare: 3, vote: 3, abort: 3, ack: 3, result: 1 });
  });

  it('commits when all vote yes and aborts on one NO, on every seed of a clean network', () => {
    for (let seed = 1; seed <= CHECK_SEEDS; seed += 1) {
      const yes = twoPcCluster(clean({ seed }));
      yes.run({ until: CHECK_HORIZON_MS });
      expect(PARTICIPANTS.map((p) => yes.snapshot().nodes[p].state), `seed ${seed}`).toSatisfy((s: unknown[]) => s.every((x) => (x as { phase: string }).phase === 'committed'));
      const no = twoPcCluster(clean({ seed, outOfStock: true }));
      no.run({ until: CHECK_HORIZON_MS });
      expect(atomicity(no.snapshot())).toBeNull();
      expect(consistencyOf(no.snapshot()).label).toBe('consistent ✓ nothing happened');
    }
  });

  it('survives the ends of the seed range and a crash at time 0 or after the horizon', () => {
    for (const seed of [0, SEED_MAX]) {
      for (const at of [0, CHECK_HORIZON_MS * 10]) {
        const c = twoPcCluster(clean({ seed, crash: { node: 'coord', at, restartAt: null } }));
        c.run({ until: CHECK_HORIZON_MS });
        expect(atomicity(c.snapshot())).toBeNull();
      }
    }
    expect(stepTimes([])).toEqual([]);
  });
});

describe('the early-commit bug (the coordinator decides COMMIT after 2 of 3 YES votes)', () => {
  const rows = Array.from({ length: CHECK_SEEDS }, (_, i) => {
    const seed = i + 1;
    const c = twoPcCluster({ seed, variant: 'early-commit', outOfStock: outOfStockOn(seed), faults: true });
    c.run({ until: CHECK_HORIZON_MS });
    return { seed, message: atomicityOver(c) };
  });
  function atomicityOver(c: ReturnType<typeof twoPcCluster>): string | null {
    // The invariant is checked after every event by checkSeeds; here only the final state, which is enough to see the damage.
    return atomicity(c.snapshot());
  }

  it('breaks atomicity on the pinned lowest failing seed, with the stated reason', () => {
    const s = checkSeeds('early-commit');
    expect(s.lowest?.seed).toBe(EARLY_COMMIT_SEED);
    expect(s.lowest?.message).toBe('payments committed but inventory aborted');
  });

  it('fails on some seeds but at most 90% of them, only where Inventory is out of stock', () => {
    const s = checkSeeds('early-commit');
    expect(s.failedSeeds).toBeGreaterThan(0);
    expect(s.failedSeeds).toBeLessThanOrEqual(CHECK_SEEDS * 0.9);
    const failing = rows.filter((r) => r.message).map((r) => r.seed);
    expect(failing.every(outOfStockOn)).toBe(true);
  });

  it('passes the same seeds under the real protocol, including with a crash at every step', () => {
    expect(checkSeeds('real').failedSeeds).toBe(0);
    const crashes = crashEveryStep('early-commit', 10);
    expect(crashes.failedRuns).toBeGreaterThan(0);
    expect(crashEveryStep('real', 10).failedRuns).toBe(0);
  });

  it('prints the numbers the runs produced', () => {
    const text = describeTwoPcCheck(checkSeeds('early-commit'), crashEveryStep('early-commit', 10));
    expect(text).toContain(`Lowest failing seed ${EARLY_COMMIT_SEED}: payments committed but inventory aborted`);
    expect(describeTwoPcCheck(checkSeeds('real'), crashEveryStep('real', 10))).toContain('not a proof');
  });
});

describe('the scenes read their numbers from the run', () => {
  it('builds frames for every case at the seed range ends without throwing, opening with an event-free frame', () => {
    for (const kase of TWO_PC_CASES) {
      for (const seed of [0, 1, SEED_MAX]) {
        for (const faults of [false, true]) {
          const steps = twoPcSteps(sceneOptions(kase, seed, 'real', faults));
          expect(steps[0].row).toBeNull();
          expect(steps.length).toBeGreaterThan(5);
          expect(steps.every((s) => Number.isFinite(s.time) && s.locks >= 0 && s.locks <= PARTICIPANTS.length)).toBe(true);
        }
      }
    }
  });

  it('shows no stall in a clean run and the real wait in a crash run, from the simulated clock', () => {
    expect(twoPcSteps(sceneOptions('happy', 1, 'real', false)).every((s) => s.stallMs === 0)).toBe(true);
    const crash = twoPcSteps(sceneOptions('crash-before', 1, 'real', false));
    expect(Math.max(...crash.map((s) => s.stallMs))).toBeGreaterThan(110_000);
  });
});
