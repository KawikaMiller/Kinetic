import { describe, expect, it } from 'vitest';
import {
  ABORT_SHARE, ABORT_W, BROKEN_SEED, DEFAULT_FALLBACKS, EDGES, ERROR_SHARES, EXPOSURES, FAULT_FROM, FAULT_TICKS, GAME_ABORT, HYPOTHESIS, INSTANCES, REQUESTS_PER_TICK,
  RUN_TICKS, SERVICES, SWEEP_SEEDS, checkoutWorks, defaultCard, downSet, evaluate, gameDay, longestBadRun, onJourney, radiusOf, runExperiment, successProbability,
  sweepGameDays, violatesRule, withFallbacks, workingFaultSets, type Card, type Fallbacks, type Service,
} from './model';

const card = (over: Partial<Card> = {}): Card => ({ ...defaultCard(), ...over });
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const FALLBACK_MIXES: Fallbacks[] = [withFallbacks(false, false), withFallbacks(false, true), withFallbacks(true, false), withFallbacks(true, true)];

/** The oracle: reverse reachability over the effective hard edges (a soft edge with no fallback counts as hard). */
function downByReachability(faulted: Service[], f: Fallbacks): Set<Service> {
  const hard = EDGES.filter((e) => !e.soft || !f[e.to as 'recs' | 'cache']);
  const down = new Set<Service>(faulted);
  const queue = [...faulted];
  while (queue.length) {
    const s = queue.pop()!;
    for (const e of hard) {
      if (e.to === s && !down.has(e.from)) {
        down.add(e.from);
        queue.push(e.from);
      }
    }
  }
  return down;
}

describe('the down set (all 128 fault sets x 4 fallback settings, against reverse reachability)', () => {
  it('the fixed point equals the second implementation on every one of the 512 cases', () => {
    for (const f of FALLBACK_MIXES) {
      for (let mask = 0; mask < 2 ** SERVICES.length; mask++) {
        const faulted = SERVICES.filter((_, i) => (mask >> i) & 1);
        expect([...downSet(faulted, f)].sort(), `${mask} ${JSON.stringify(f)}`).toEqual([...downByReachability(faulted, f)].sort());
      }
    }
  });

  it('hand vectors: killing recs takes {recs, api, web} with the flaw and only {recs} with a fallback; db takes four; cache one', () => {
    expect([...downSet(['recs'], DEFAULT_FALLBACKS)].sort()).toEqual(['api', 'recs', 'web']);
    expect([...downSet(['db'], DEFAULT_FALLBACKS)].sort()).toEqual(['api', 'catalog', 'db', 'web']);
    expect([...downSet(['cache'], DEFAULT_FALLBACKS)]).toEqual(['cache']);
    expect([...downSet(['recs'], withFallbacks(true, true))]).toEqual(['recs']);
    expect(checkoutWorks(downSet(['cache'], DEFAULT_FALLBACKS))).toBe(true);
    expect(checkoutWorks(downSet(['recs'], DEFAULT_FALLBACKS))).toBe(false);
  });

  it('the blast radius table: web 1, api 2, auth 3, catalog 3, db 4, recs 3 (1 with a fallback), cache 1', () => {
    expect(SERVICES.map((s) => radiusOf(s, DEFAULT_FALLBACKS))).toEqual([1, 2, 3, 3, 4, 1, 3]);
    expect(radiusOf('recs', withFallbacks(true, true))).toBe(1);
  });

  it('the count of fault sets that leave checkout working is 2 of 128 with the flaw, 4 with the fallback, 1 with neither (the free services are the soft ones with fallbacks)', () => {
    expect(workingFaultSets(DEFAULT_FALLBACKS)).toBe(2);
    expect(workingFaultSets(withFallbacks(true, true))).toBe(4);
    expect(workingFaultSets(withFallbacks(false, false))).toBe(1);
    expect(workingFaultSets(withFallbacks(true, false))).toBe(2);
  });

  it('on the journey means losing it takes checkout down', () => {
    expect(SERVICES.filter((s) => onJourney(s, DEFAULT_FALLBACKS))).toEqual(['web', 'api', 'auth', 'catalog', 'db', 'recs']);
    expect(SERVICES.filter((s) => onJourney(s, withFallbacks(true, true)))).toEqual(['web', 'api', 'auth', 'catalog', 'db']);
  });
});

describe('the experiment card', () => {
  it('exposure arithmetic, kill 1 of 4 db: 1% gives 0.9975 (holds against 99%), 5% gives 0.9875 (refuted), 25% 0.9375, 100% 0.75', () => {
    const p = (exposure: number) => successProbability(card({ exposure }));
    expect(p(0.01)).toBeCloseTo(0.9975, 12);
    expect(p(0.05)).toBeCloseTo(0.9875, 12);
    expect(p(0.25)).toBeCloseTo(0.9375, 12);
    expect(p(1)).toBeCloseTo(0.75, 12);
  });

  it('the observed mean success over the 60 fault ticks equals a within 3 standard errors, on 200 seeds', () => {
    for (const exposure of [0.05, 0.25, 1]) {
      const a = 1 - exposure * 0.25;
      const se = Math.sqrt((a * (1 - a)) / (REQUESTS_PER_TICK * FAULT_TICKS));
      const means = Array.from({ length: SWEEP_SEEDS }, (_, k) => evaluate(card({ exposure, abort: null, seed: k + 1 })).meanSuccess);
      expect(Math.abs(mean(means) - a)).toBeLessThan((3 * se) / Math.sqrt(SWEEP_SEEDS));
      for (const m of means) expect(Math.abs(m - a)).toBeLessThan(5 * se);
    }
  });

  it('the default card (kill 1 of 4 db at 5%) is refuted, not aborted, on at least 99% of seeds; at 1% exposure it holds', () => {
    const outcomes = (exposure: number) => Array.from({ length: SWEEP_SEEDS }, (_, k) => evaluate(card({ exposure, seed: k + 1 })).outcome.kind);
    expect(outcomes(0.05).filter((o) => o === 'refuted').length).toBeGreaterThanOrEqual(0.99 * SWEEP_SEEDS);
    expect(outcomes(0.05).includes('aborted')).toBe(false);
    expect(outcomes(0.01).filter((o) => o === 'held').length).toBeGreaterThanOrEqual(0.99 * SWEEP_SEEDS);
  });

  it('the abort, hand-run: kill all of api at 100% exposure, A = 95%, w = 2 aborts at tick 21 with 2 bad ticks and 400 failed requests; with no abort 60 bad ticks and 12,000', () => {
    const base = card({ fault: { target: 'api', kind: 'kill', k: 4, p: 1 }, exposure: 1 });
    const aborted = evaluate(base);
    expect(aborted.outcome).toEqual({ kind: 'aborted', tick: FAULT_FROM + 1 });
    expect(aborted.failedTotal).toBe(2 * REQUESTS_PER_TICK);
    expect(aborted.ticks.filter((t) => t.failed > 0).length).toBe(2);
    const none = evaluate({ ...base, abort: null });
    expect(none.failedTotal).toBe(FAULT_TICKS * REQUESTS_PER_TICK);
    expect(none.failedTotal).toBe(12_000);
    expect(longestBadRun(none.ticks, 0.95)).toBe(FAULT_TICKS);
  });

  it('the fault is removed from the tick after the decision, and the first twenty ticks are untouched', () => {
    const e = evaluate(card({ fault: { target: 'api', kind: 'kill', k: 4, p: 1 }, exposure: 1 }));
    expect(e.ticks[FAULT_FROM - 1].faultOn).toBe(true);
    expect(e.ticks[FAULT_FROM].faultOn).toBe(true);
    expect(e.ticks[FAULT_FROM + 1].faultOn).toBe(false);
    expect(e.ticks.slice(0, FAULT_FROM - 1).every((t) => t.failed === 0 && !t.faultOn)).toBe(true);
  });

  it('the same seed draws the same requests with and without the abort until the abort fires (paired runs)', () => {
    const base = card({ fault: { target: 'api', kind: 'kill', k: 4, p: 1 }, exposure: 1 });
    const a = runExperiment(base);
    const b = runExperiment({ ...base, abort: null });
    expect(a.slice(0, FAULT_FROM + 1).map((t) => t.failed)).toEqual(b.slice(0, FAULT_FROM + 1).map((t) => t.failed));
  });
});

describe('rule 0: success is never below the abort share for more than w + 1 consecutive ticks', () => {
  const abort = GAME_ABORT;

  it('broken mode (abort = none): the lowest failing seed is pinned, and 40% to 75% of 200 seeds break the rule, never all', () => {
    const sweep = sweepGameDays(DEFAULT_FALLBACKS);
    expect(sweep.withoutAbort[0]).toBe(BROKEN_SEED);
    expect(sweep.withoutAbort.length).toBeGreaterThan(0.4 * SWEEP_SEEDS);
    expect(sweep.withoutAbort.length).toBeLessThan(0.75 * SWEEP_SEEDS);
    const g = gameDay(BROKEN_SEED, DEFAULT_FALLBACKS);
    expect(longestBadRun(g.withoutAbort.ticks, abort.belowShare)).toBeGreaterThan(abort.w + 1);
  });

  it('fixed mode (abort on) passes all 200 seeds, and on every seed where the unaborted run broke the rule the aborted run has an abort tick', () => {
    const sweep = sweepGameDays(DEFAULT_FALLBACKS);
    expect(sweep.withAbort).toEqual([]);
    for (const seed of sweep.withoutAbort) {
      const g = gameDay(seed, DEFAULT_FALLBACKS);
      expect(g.withAbort.outcome.kind, `seed ${seed}`).toBe('aborted');
    }
  });

  it('with the recs fallback on, fewer seeds break the rule without an abort, but not none (other services still hurt)', () => {
    const flaw = sweepGameDays(DEFAULT_FALLBACKS).withoutAbort.length;
    const fixed = sweepGameDays(withFallbacks(true, true)).withoutAbort.length;
    expect(fixed).toBeLessThan(flaw);
    expect(fixed).toBeGreaterThan(0);
  });

  it('the checker can fail and pass: a synthetic run of bad ticks is flagged, a short one is not', () => {
    const ticks = (n: number) => Array.from({ length: n }, () => ({ success: 0.5, failed: 100, faultOn: true, badStreak: 0, abortedAt: null }));
    expect(violatesRule(ticks(abort.w + 2), abort)).toBe(true);
    expect(violatesRule(ticks(abort.w + 1), abort)).toBe(false);
  });
});

describe('controls at their extremes and one beyond', () => {
  it('H = 90% and 99.9%, A = 80% and 99%, w = 1 and 5, every exposure, k = 1 and 4, p = 20% and 100% all run to finite results', () => {
    const cases: Partial<Card>[] = [
      { hypothesis: HYPOTHESIS.min / 1000 }, { hypothesis: HYPOTHESIS.max / 1000 },
      { abort: { belowShare: ABORT_SHARE.min / 100, w: ABORT_W.max } }, { abort: { belowShare: ABORT_SHARE.max / 100, w: ABORT_W.min } },
      ...EXPOSURES.map((exposure) => ({ exposure })),
      { fault: { target: 'db' as const, kind: 'kill' as const, k: 1, p: 1 } }, { fault: { target: 'db' as const, kind: 'kill' as const, k: INSTANCES, p: 1 } },
      ...ERROR_SHARES.map((p) => ({ fault: { target: 'api' as const, kind: 'errors' as const, k: 1, p } })),
      { abort: { belowShare: 0.99, w: 6 } }, { fault: { target: 'db' as const, kind: 'kill' as const, k: 5, p: 1 } }, { exposure: 1.5 },
    ];
    for (const c of cases) {
      const e = evaluate(card({ ...c, fault: c.fault ?? defaultCard().fault, seed: 2 }));
      expect(Number.isFinite(e.meanSuccess) && e.meanSuccess >= 0 && e.meanSuccess <= 1).toBe(true);
      expect(e.ticks.length).toBe(RUN_TICKS);
    }
  });

  it('a hypothesis below the abort share can never be refuted before the abort fires (the card warns); the two thresholds are independent inputs', () => {
    const e = evaluate(card({ hypothesis: 0.9, fault: { target: 'api', kind: 'kill', k: 4, p: 1 }, exposure: 1 }));
    expect(e.outcome.kind).toBe('aborted');
  });
});
