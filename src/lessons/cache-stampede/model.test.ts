import { describe, expect, it } from 'vitest';
import {
  BETAS, BROKEN_SEED, DB_CAPACITY, KEYS, NO_MITIGATION, TICK_MS, WRITE_GAP_MS, busiestSecond, createStampedeSim, dbKeepsUp, expiryCounts, littleEstimate,
  lowestViolatingSeed, runStampede, waitShare, SIM_TICKS, type Mitigations, type StampedeConfig,
} from './model';

const cfg = (over: Partial<StampedeConfig> & { m?: Partial<Mitigations> } = {}): StampedeConfig => ({
  seed: over.seed ?? 0,
  lambda: over.lambda ?? 500,
  recomputeMs: over.recomputeMs ?? 500,
  mitigations: { ...NO_MITIGATION, ...over.m },
});

describe('the run is deterministic and conserves requests', () => {
  it('the same seed gives the same run, and a different seed a different one', () => {
    const a = runStampede(cfg({ seed: 4 }));
    expect(runStampede(cfg({ seed: 4 })).summary).toEqual(a.summary);
    expect(runStampede(cfg({ seed: 5 })).summary).not.toEqual(a.summary);
  });

  it('every request is either resolved with one outcome or still waiting at the end', () => {
    for (const m of [{}, { coalesce: true }, { stale: true }, { lock: true }, { beta: 1 }] as Partial<Mitigations>[]) {
      const run = runStampede(cfg({ m }));
      const resolved = Object.values(run.summary.outcomes).reduce((a, b) => a + b, 0);
      expect(resolved).toBeLessThanOrEqual(run.summary.requests);
      expect(run.summary.requests - resolved).toBeLessThan(run.summary.requests * 0.05);
    }
  });

  it('before the key expires every request is a hit and the database is idle', () => {
    const run = runStampede(cfg(), 300);
    expect(run.summary.queries).toBe(0);
    expect(run.summary.outcomes.hit).toBe(run.summary.requests);
  });
});

describe("Little's law: about lambda x R recomputes pile up before the first one finishes", () => {
  const cases: [number, number][] = [[500, 100], [1000, 50], [200, 300], [400, 150]];
  for (const [lambda, recomputeMs] of cases) {
    it(`lambda ${lambda}, R ${recomputeMs} ms: the mean herd over 50 seeds is within 10% of ${littleEstimate(lambda, recomputeMs)}`, () => {
      expect(dbKeepsUp(lambda, recomputeMs)).toBe(true);
      let total = 0;
      for (let seed = 0; seed < 50; seed++) total += runStampede(cfg({ seed, lambda, recomputeMs }), 600).summary.herd;
      const mean = total / 50;
      const expected = littleEstimate(lambda, recomputeMs);
      expect(Math.abs(mean - expected) / expected).toBeLessThan(0.1);
    });
  }

  it('when the database is overloaded the herd is larger than lambda x R, because every query slows down', () => {
    const lambda = 500;
    const recomputeMs = 500;
    expect(dbKeepsUp(lambda, recomputeMs)).toBe(false);
    const herd = runStampede(cfg({ lambda, recomputeMs })).summary.herd;
    expect(herd).toBeGreaterThan(littleEstimate(lambda, recomputeMs) * 1.3);
    expect(runStampede(cfg({ lambda, recomputeMs })).summary.peakDb).toBeGreaterThan(DB_CAPACITY);
  });

  it('a hand check of the overloaded herd: progress 0.2 s + 0.2 ln(T / 0.2) = R reaches 0.5 s at T = 0.896 s, so about 448 queries start', () => {
    const T = 0.2 * Math.exp((0.5 - 0.2) / 0.2);
    expect(T).toBeCloseTo(0.896, 3);
    let total = 0;
    for (let seed = 0; seed < 30; seed++) total += runStampede(cfg({ seed })).summary.herd;
    expect(Math.abs(total / 30 - 500 * T) / (500 * T)).toBeLessThan(0.1);
  });

  it('a flood the database cannot digest never finishes its first recompute inside the run, and timeouts add retries', () => {
    const run = runStampede(cfg({ lambda: 2000, recomputeMs: 2000 }));
    expect(run.summary.firstWriteMs).toBeNull();
    expect(run.summary.outcomes.timeout).toBeGreaterThan(0);
    expect(run.summary.retries).toBeGreaterThan(0);
    expect(run.summary.queries).toBeGreaterThan(run.summary.requests - run.summary.retries - 1);
  });
});

describe('the mitigations, each on the same seed', () => {
  const base = runStampede(cfg());
  it('unmitigated: one query for every miss, and clients wait and time out', () => {
    expect(base.summary.queries).toBe(base.summary.outcomes.recomputed + base.summary.outcomes.timeout + (base.summary.requests - Object.values(base.summary.outcomes).reduce((a, b) => a + b, 0)));
    expect(base.summary.waited).toBeGreaterThan(0);
  });

  it('coalescing sends exactly one query, and the waiters share its wait', () => {
    const run = runStampede(cfg({ m: { coalesce: true } }));
    expect(run.summary.queries).toBe(1);
    expect(run.summary.outcomes.coalesced).toBeGreaterThan(0);
    expect(run.summary.p99Ms).toBeLessThan(base.summary.p99Ms);
  });

  it('serving stale while revalidating makes no request wait, and sends one query', () => {
    const run = runStampede(cfg({ m: { stale: true } }));
    expect(run.summary.queries).toBe(1);
    expect(run.summary.waited).toBe(0);
    expect(run.summary.outcomes.stale).toBeGreaterThan(0);
  });

  it('a lock with a timeout sends one query and returns the default after the lock timeout', () => {
    const run = runStampede(cfg({ m: { lock: true } }));
    expect(run.summary.queries).toBe(1);
    expect(run.summary.outcomes.default).toBeGreaterThan(0);
  });

  it('early refresh at a high beta refreshes before the expiry, so nobody waits, and a higher beta buys that with more queries', () => {
    const run = runStampede(cfg({ m: { beta: 4 } }));
    expect(run.summary.waited).toBe(0);
    expect(run.bars[0].kind).toBe('early');
    expect(run.bars[0].startMs).toBeLessThan(2000);
    expect(run.summary.queries).toBeGreaterThan(runStampede(cfg({ m: { beta: 1 } })).summary.queries);
  });

  it('the share of expiries on which someone waits falls as beta grows, from 100% with no early refresh (30 seeds each)', () => {
    const shares = BETAS.map((b) => waitShare(b, 500, 500));
    expect(shares[0]).toBe(1);
    for (let i = 1; i < shares.length; i++) expect(shares[i]).toBeLessThanOrEqual(shares[i - 1]);
    expect(shares[shares.length - 1]).toBeLessThan(shares[0]);
  });
});

describe('invariant: with correct singleflight, at most one recompute per key is in flight at any step', () => {
  it('holds on all 200 seeds, for coalescing, a lock and stale-while-revalidate, checked every tick by the sim and again from the ledger', () => {
    for (const m of [{ coalesce: true }, { lock: true }, { stale: true }, { coalesce: true, beta: 1 }] as Partial<Mitigations>[]) {
      for (let seed = 0; seed < 200; seed++) {
        const run = runStampede(cfg({ seed, m }));
        expect(run.violation, `${JSON.stringify(m)} seed ${seed}`).toBeNull();
        expect(run.summary.peakInFlight).toBeLessThanOrEqual(1);
        const L = run.state.ledger;
        const spans = L.qStartTick.map((s, q) => [s, L.qWriteTick[q] >= 0 ? L.qWriteTick[q] : Infinity] as const);
        for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1]);
      }
    }
  });

  it('is only checked for a configuration that claims it: unmitigated misses start many at once without a violation being reported', () => {
    const run = runStampede(cfg());
    expect(run.violation).toBeNull();
    expect(run.summary.peakInFlight).toBeGreaterThan(1);
  });
});

describe('broken mode: the marker released before the value is written', () => {
  const broken: Omit<StampedeConfig, 'seed'> = { lambda: 500, recomputeMs: 500, mitigations: { ...NO_MITIGATION, coalesce: true, releaseEarly: true } };

  it('violates the invariant exactly on the seeds where an arrival lands in the write gap (an independent recount of arrivals)', () => {
    let violating = 0;
    for (let seed = 0; seed < 200; seed++) {
      const run = runStampede({ ...broken, seed });
      const L = run.state.ledger;
      const done = L.qDoneTick[0];
      const gapTicks = WRITE_GAP_MS / TICK_MS;
      const arrivalInGap = L.rArrive.some((t) => t >= done && t < done + gapTicks);
      expect(run.violation !== null, `seed ${seed}`).toBe(arrivalInGap);
      if (run.violation) violating++;
    }
    expect(violating).toBeGreaterThan(190);
  });

  it('the lowest violating seed is the pinned BROKEN_SEED, and its log shows a second recompute starting while the first value was still being written', () => {
    const found = lowestViolatingSeed(broken, 200);
    expect(found).not.toBeNull();
    expect(found?.seed).toBe(BROKEN_SEED);
    const kinds = found?.run.log.map((e) => e.kind) ?? [];
    expect(kinds).toContain('second');
    expect(kinds.indexOf('released')).toBeLessThan(kinds.indexOf('second'));
    const L = found?.run.state.ledger;
    const second = found?.run.log.find((e) => e.kind === 'second');
    expect(L?.qWriteTick[0] ?? 0).toBeGreaterThan((second?.atMs ?? Infinity) / TICK_MS);
    expect(kinds).not.toContain('written');
  });

  it('with the marker released after the write, the same seed has no violation', () => {
    const fixed = runStampede({ ...broken, seed: BROKEN_SEED, mitigations: { ...broken.mitigations, releaseEarly: false } });
    expect(fixed.violation).toBeNull();
  });

  it('the sim stops at the first violation, with the counterexample kept', () => {
    const sim = createStampedeSim({ ...broken, seed: BROKEN_SEED });
    sim.run(SIM_TICKS);
    expect(sim.violation?.message).toContain('2 recomputes in flight');
    expect(sim.ticks).toBeLessThan(SIM_TICKS);
  });
});

describe('TTL jitter on 1,000 keys', () => {
  it('without jitter every key expires in the same second; every key is counted once', () => {
    const counts = expiryCounts(1, 0);
    expect(busiestSecond(counts)).toBe(KEYS);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(KEYS);
  });

  it('with +-20% jitter the busiest second is lower than without, on 50 seeds, and close to the uniform expectation', () => {
    for (let seed = 0; seed < 50; seed++) {
      const jittered = busiestSecond(expiryCounts(seed, 20));
      expect(jittered).toBeLessThan(busiestSecond(expiryCounts(seed, 0)));
      expect(jittered).toBeLessThan(100);
      expect(expiryCounts(seed, 20).reduce((a, b) => a + b, 0)).toBe(KEYS);
    }
    expect(expiryCounts(1, 20).length).toBeGreaterThanOrEqual(72);
  });

  it('a wider spread flattens it further, on average', () => {
    const mean = (j: number) => Array.from({ length: 30 }, (_, s) => busiestSecond(expiryCounts(s, j))).reduce((a, b) => a + b, 0) / 30;
    expect(mean(40)).toBeLessThan(mean(20));
    expect(mean(20)).toBeLessThan(mean(5));
  });
});
