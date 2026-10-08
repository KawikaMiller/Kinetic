import { describe, expect, it } from 'vitest';
import {
  ALERT_RATE, ALERT_WINDOW, ANALYSIS_THRESHOLD_PCT, BOOT_TICKS, CANARY_WEIGHTS, DEFAULTS, DEPLOY_START, DROP_PER_SERVER, HORIZON, REPLICAS, REQ_PER_TICK, STRATEGIES,
  analysisFails, analysisWindow, canarySchedule, detectAfter, expectedHit, forwardTicks, hitBy, resolveFenceposts, rollbackAfter, sampleRequests, served, simulate, tally,
  type Config, type Strategy,
} from './model';

const cfg = (patch: Partial<Config> = {}): Config => ({ ...DEFAULTS, ...patch });
const SEEDS = [1, 2, 3, 4, 5, 6];

describe('maxSurge and maxUnavailable percentages', () => {
  // Independent reference: the smallest n with n/replicas >= pct (rounding up) and the largest with n/replicas <= pct (rounding down).
  const smallestAtLeast = (replicas: number, pct: number) => {
    let n = 0;
    while (n * 100 < pct * replicas) n++;
    return n;
  };
  const largestAtMost = (replicas: number, pct: number) => {
    let n = 0;
    while ((n + 1) * 100 <= pct * replicas) n++;
    return n;
  };

  it('round surge up and unavailable down, for every percentage and fleet size', () => {
    for (let replicas = 1; replicas <= 60; replicas++) {
      for (let pct = 0; pct <= 100; pct++) {
        const f = resolveFenceposts(replicas, pct, pct);
        const surge = smallestAtLeast(replicas, pct);
        const unavailable = largestAtMost(replicas, pct);
        expect(f.surge).toBe(surge);
        expect(f.unavailable).toBe(surge === 0 && unavailable === 0 ? 1 : unavailable);
      }
    }
  });

  it('matches hand-worked cases on 20 replicas', () => {
    expect(resolveFenceposts(20, 25, 25)).toEqual({ surge: 5, unavailable: 5, apiRejects: false });
    expect(resolveFenceposts(20, 33, 33)).toEqual({ surge: 7, unavailable: 6, apiRejects: false });
    expect(resolveFenceposts(20, 5, 5)).toEqual({ surge: 1, unavailable: 1, apiRejects: false });
    expect(resolveFenceposts(20, 100, 0)).toEqual({ surge: 20, unavailable: 0, apiRejects: false });
    expect(resolveFenceposts(10, 15, 15)).toEqual({ surge: 2, unavailable: 1, apiRejects: false });
  });

  it('runs with maxUnavailable 1 when both come out as 0, and says the API would reject 0% and 0%', () => {
    expect(resolveFenceposts(20, 0, 0)).toEqual({ surge: 0, unavailable: 1, apiRejects: true });
    expect(resolveFenceposts(3, 0, 20)).toEqual({ surge: 0, unavailable: 1, apiRejects: false });
  });
});

describe('rolling update', () => {
  it('follows the controller by hand on the default 25% / 25% (5 and 5)', () => {
    // Worked from the Kubernetes rules, one minute at a time: a pod started in minute s is ready in minute s + 2.
    const expected: [t: number, v1: number, v2: number, starting: number, weight: number][] = [
      [0, 20, 0, 0, 0],
      [1, 15, 0, 5, 0],
      [2, 15, 0, 10, 0],
      [3, 10, 5, 5, 5 / 15],
      [4, 5, 10, 5, 10 / 15],
      [5, 5, 10, 10, 10 / 15],
      [6, 0, 15, 5, 1],
      [7, 0, 20, 0, 1],
    ];
    const ticks = forwardTicks(cfg({ strategy: 'rolling', bugRate: 0 }));
    for (const [t, v1, v2, starting, weight] of expected) {
      expect([t, ticks[t].v1, ticks[t].v2, ticks[t].startingV2, ticks[t].weight]).toEqual([t, v1, v2, starting, weight]);
    }
    expect(ticks[7].phase).toBe('done');
    expect(ticks[6].retired + ticks[5].retired + ticks[4].retired + ticks[3].retired + ticks[1].retired).toBe(REPLICAS);
  });

  it('never has fewer than replicas - maxUnavailable servers serving, nor more than replicas + maxSurge running, forward or back', () => {
    for (let surgePct = 0; surgePct <= 100; surgePct += 5) {
      for (let unavailablePct = 0; unavailablePct <= 100; unavailablePct += 5) {
        const base = cfg({ strategy: 'rolling', surgePct, unavailablePct, bugRate: 0.1 });
        const f = resolveFenceposts(REPLICAS, surgePct, unavailablePct);
        // bug 10% so that the alert fires part-way and the run covers the rollback too
        for (const c of [base, { ...base, bugRate: 0 }]) {
          const run = simulate(c);
          for (const tick of run.ticks.slice(DEPLOY_START)) {
            expect(tick.v1 + tick.v2, `${surgePct}/${unavailablePct} minute ${tick.t}`).toBeGreaterThanOrEqual(REPLICAS - f.unavailable);
            expect(tick.v1 + tick.v2 + tick.startingV1 + tick.startingV2, `${surgePct}/${unavailablePct} minute ${tick.t}`).toBeLessThanOrEqual(REPLICAS + f.surge);
          }
        }
        const clean = simulate({ ...base, bugRate: 0 });
        const v2 = clean.ticks.map((t) => t.v2);
        expect(v2, `${surgePct}/${unavailablePct} only ever moves forward`).toEqual([...v2].sort((a, b) => a - b));
        // one server at a time (0 surge, 1 unavailable) needs about three minutes per server: too slow for this window
        if (f.surge + f.unavailable >= 2) {
          expect(clean.completedAt, `${surgePct}/${unavailablePct} completes`).not.toBeNull();
          expect(clean.ticks.at(-1)).toMatchObject({ v1: 0, v2: REPLICAS });
        }
      }
    }
  });

  it('the undo is another rolling update: v2 servers keep serving, stepwise, until the last is gone (hand trace)', () => {
    const run = simulate(cfg({ strategy: 'rolling' }));
    expect(run.trigger).toMatchObject({ kind: 'alert', tick: 7, blocked: false });
    // minutes 8..13: v2 servers left after each step of the undo, worked out by hand
    expect([8, 9, 10, 11, 12, 13].map((t) => run.ticks[t].v2)).toEqual([15, 15, 10, 5, 5, 0]);
    expect(run.rolledBackAt).toBe(13);
    expect(rollbackAfter(run)).toBe(6);
  });
});

describe('the other strategies', () => {
  it('recreate: nothing serves for BOOT_TICKS minutes, then everyone is on v2', () => {
    const ticks = forwardTicks(cfg({ strategy: 'recreate' }));
    for (let t = DEPLOY_START; t < DEPLOY_START + BOOT_TICKS; t++) expect(served(ticks[t])).toBe(false);
    expect(ticks[DEPLOY_START + BOOT_TICKS]).toMatchObject({ v2: REPLICAS, weight: 1, v1: 0 });
    expect(ticks[DEPLOY_START].retired).toBe(REPLICAS);
  });

  it('blue-green: a second fleet starts, then the whole load switches at once and blue stays as standby', () => {
    const ticks = forwardTicks(cfg({ strategy: 'bluegreen' }));
    const run = simulate(cfg({ strategy: 'bluegreen', bugRate: 0 }));
    expect(ticks[DEPLOY_START]).toMatchObject({ v1: REPLICAS, startingV2: REPLICAS, weight: 0 });
    expect(ticks[DEPLOY_START + BOOT_TICKS]).toMatchObject({ v1: 0, v2: REPLICAS, standby: REPLICAS, weight: 1 });
    expect(run.peakPods).toBe(2 * REPLICAS);
  });

  it('canary: stages are 1%, 10%, 50%, 100% on 1, 2, 10 and 20 servers, each with its bake window', () => {
    expect(CANARY_WEIGHTS).toEqual([0.01, 0.1, 0.5, 1]);
    const stages = canarySchedule(8);
    expect(stages.map((s) => s.pods)).toEqual([1, 2, 10, 20]);
    expect(stages.map((s) => [s.start, s.ready, s.bakeEnd])).toEqual([[1, 3, 10], [11, 13, 20], [21, 23, 30], [31, 33, null]]);
    const ticks = forwardTicks(cfg({ strategy: 'canary', bakeTicks: 8 }));
    expect(ticks[3]).toMatchObject({ v2: 1, v1: 19, weight: 0.01 });
    expect(ticks[10]).toMatchObject({ v2: 1, weight: 0.01 });
    expect(ticks[13]).toMatchObject({ v2: 2, v1: 18, weight: 0.1 });
    expect(ticks[23]).toMatchObject({ v2: 10, v1: 10, weight: 0.5 });
    expect(ticks[33]).toMatchObject({ v2: 20, v1: 0, weight: 1, phase: 'done' });
    expect(ticks[32]).toMatchObject({ v2: 10, startingV2: 10, weight: 0.5 });
  });

  it('peak servers: recreate 20, rolling 20 + surge, blue-green 40, a finished canary 30', () => {
    const peak = (strategy: Strategy) => simulate(cfg({ strategy, bugRate: 0 })).peakPods;
    expect(peak('recreate')).toBe(20);
    expect(peak('rolling')).toBe(25);
    expect(peak('bluegreen')).toBe(40);
    expect(peak('canary')).toBe(30);
  });
});

describe('users hit', () => {
  /** Independent closed form: sum over minutes of share exposed x error rate x request rate (+ the other failure kinds). */
  function closedForm(c: Config): number {
    const run = simulate(c);
    let total = 0;
    for (const tick of run.ticks) {
      const broken = c.schema === 'breaking' && tick.t >= DEPLOY_START;
      if (tick.v1 + tick.v2 === 0) total += REQ_PER_TICK;
      else total += REQ_PER_TICK * (tick.weight * c.bugRate + (1 - tick.weight) * (broken ? 1 : 0));
      if (!c.drain) total += tick.retired * DROP_PER_SERVER;
    }
    return total;
  }

  it('expected users hit equals the closed form for every strategy, bug, schema, drain setting and seed', () => {
    for (const strategy of STRATEGIES) {
      for (const bugRate of [0, 0.01, 0.05, 0.2]) {
        for (const schema of ['compatible', 'breaking'] as const) {
          for (const drain of [true, false]) {
            for (const analysis of [true, false]) {
              for (const seed of SEEDS) {
                const c = cfg({ strategy, bugRate, schema, drain, analysis, seed });
                expect(simulate(c).expectedHit, JSON.stringify(c)).toBeCloseTo(closedForm(c), 9);
              }
            }
          }
        }
      }
    }
  });

  it('matches hand-worked totals: blue-green is exposed to everyone for exactly the alert window', () => {
    const run = simulate(cfg({ strategy: 'bluegreen' }));
    // switch at minute 3; the alert needs ALERT_WINDOW minutes at 100%; the undo takes a minute and v2 serves no one afterwards
    expect(run.expectedHit).toBeCloseTo(REQ_PER_TICK * 0.05 * ALERT_WINDOW, 9);
    expect(run.trigger?.tick).toBe(DEPLOY_START + BOOT_TICKS + ALERT_WINDOW - 1);
    expect(detectAfter(run)).toBe(ALERT_WINDOW - 1);
    expect(rollbackAfter(run)).toBe(1);
  });

  it('recreate pays for its planned outage twice when it has to roll back: once going out, once coming back', () => {
    const run = simulate(cfg({ strategy: 'recreate' }));
    const outage = BOOT_TICKS * REQ_PER_TICK;
    expect(run.expectedHit).toBeCloseTo(2 * outage + REQ_PER_TICK * 0.05 * ALERT_WINDOW, 9);
  });

  it('killing servers without draining costs DROP_PER_SERVER requests per server killed', () => {
    for (const strategy of STRATEGIES) {
      const drained = simulate(cfg({ strategy, drain: true, seed: 2 }));
      const killed = simulate(cfg({ strategy, drain: false, seed: 2 }));
      const retired = killed.ticks.reduce((n, t) => n + t.retired, 0);
      expect(killed.expectedHit - drained.expectedHit).toBeCloseTo(retired * DROP_PER_SERVER, 9);
    }
    // blue-green keeps blue standing: it kills nothing
    expect(simulate(cfg({ strategy: 'bluegreen', drain: false })).ticks.every((t) => t.retired === 0)).toBe(true);
  });

  it('the sampled count stays within 5 standard deviations of the expectation', () => {
    for (const strategy of STRATEGIES) {
      for (const bugRate of [0.02, 0.05, 0.2]) {
        for (const seed of SEEDS) {
          const run = simulate(cfg({ strategy, bugRate, seed }));
          let variance = 0;
          for (const tick of run.ticks) {
            const p = served(tick) ? tick.weight * bugRate : 1;
            variance += REQ_PER_TICK * p * (1 - p);
          }
          expect(Math.abs(run.sampledHit - run.expectedHit), `${strategy} ${bugRate} seed ${seed}`).toBeLessThanOrEqual(5 * Math.sqrt(variance) + 1);
        }
      }
    }
  });

  it('with no bug, a compatible schema and draining, nothing but the planned outage costs users', () => {
    for (const strategy of STRATEGIES) {
      const run = simulate(cfg({ strategy, bugRate: 0 }));
      expect(run.trigger).toBeNull();
      expect(run.expectedHit).toBe(strategy === 'recreate' ? BOOT_TICKS * REQ_PER_TICK : 0);
    }
  });
});

describe('requests', () => {
  it('are a pure function of seed and minute', () => {
    const run = simulate(cfg());
    expect(sampleRequests(run.cfg, run.ticks[5])).toEqual(sampleRequests(run.cfg, run.ticks[5]));
    expect(sampleRequests({ ...run.cfg, seed: 2 }, run.ticks[5])).not.toEqual(sampleRequests(run.cfg, run.ticks[5]));
    expect(sampleRequests(run.cfg, run.ticks[5])).toHaveLength(REQ_PER_TICK);
  });

  it('every request is one outcome, and the tally agrees with the requests', () => {
    const run = simulate(cfg({ strategy: 'canary', bugRate: 0.2, schema: 'breaking' }));
    for (const tick of run.ticks) {
      const reqs = sampleRequests(run.cfg, tick);
      const t = tally(run.cfg, tick, reqs);
      expect(t.n1 + t.n2 + t.outage).toBe(REQ_PER_TICK);
      expect(t.failed1 + t.failed2 + t.outage).toBe(reqs.filter((r) => r.outcome !== 'ok').length);
      expect(t.bug + t.schema + t.outage + t.natural).toBe(reqs.filter((r) => r.outcome !== 'ok').length);
      expect(hitBy(t)).toBe(t.bug + t.schema + t.outage + t.dropped);
    }
  });

  it('an outage minute fails everything, and a minute with no bug sends nothing to the bug', () => {
    const run = simulate(cfg({ strategy: 'recreate', bugRate: 0 }));
    expect(sampleRequests(run.cfg, run.ticks[DEPLOY_START]).every((r) => r.outcome === 'outage')).toBe(true);
    for (const tick of run.ticks) expect(sampleRequests(run.cfg, tick).some((r) => r.outcome === 'bug')).toBe(false);
  });
});

describe('canary analysis', () => {
  it('fails only when the canary is MORE than the threshold above the baseline, never at exactly the threshold', () => {
    expect(ANALYSIS_THRESHOLD_PCT).toBe(2);
    expect(analysisFails(3, 100, 1, 100)).toBe(false); // 3% vs 1% is exactly 2 points
    expect(analysisFails(4, 100, 1, 100)).toBe(true);
    expect(analysisFails(0, 100, 0, 100)).toBe(false);
    expect(analysisFails(0, 0, 5, 100)).toBe(false); // no canary requests: nothing to judge
    expect(analysisFails(1, 10, 0, 0)).toBe(true);
  });

  it('agrees with floating-point arithmetic away from the boundary, and passes on it', () => {
    for (let cn = 1; cn <= 30; cn++) {
      for (let ce = 0; ce <= cn; ce++) {
        for (const [be, bn] of [[0, 50], [1, 50], [3, 120], [7, 400]] as const) {
          const diff = (100 * ce) / cn - (100 * be) / bn;
          const onBoundary = Math.abs(diff - ANALYSIS_THRESHOLD_PCT) < 1e-9;
          expect(analysisFails(ce, cn, be, bn), `${ce}/${cn} vs ${be}/${bn}`).toBe(onBoundary ? false : diff > ANALYSIS_THRESHOLD_PCT);
        }
      }
    }
  });

  it('on seeded streams, the rollback fires exactly at the first window that exceeds the threshold, recounted from the requests', () => {
    for (const bugRate of [0.03, 0.05, 0.1]) {
      for (const bakeTicks of [1, 3, 8]) {
        for (let seed = 1; seed <= 25; seed++) {
          const c = cfg({ strategy: 'canary', bugRate, bakeTicks, seed, analysis: true });
          const run = simulate(c);
          const forward = forwardTicks(c);
          const windows = canarySchedule(bakeTicks).filter((s) => s.bakeEnd !== null).map((s) => {
            let [ce, cn, be, bn] = [0, 0, 0, 0];
            for (let t = s.ready; t <= s.bakeEnd!; t++) {
              for (const r of sampleRequests(c, forward[t])) {
                if (r.by === 'v2') { cn++; if (r.outcome !== 'ok') ce++; }
                if (r.by === 'v1') { bn++; if (r.outcome !== 'ok') be++; }
              }
            }
            return { end: s.bakeEnd!, fails: !(ce === 0 || (ce * bn - be * cn) * 100 <= ANALYSIS_THRESHOLD_PCT * cn * bn) && cn > 0 };
          });
          const firstFail = windows.find((w) => w.fails);
          const alertTick = (() => {
            let streak = 0;
            for (const tick of forward) {
              const rate = served(tick) ? tick.weight * (bugRate + (1 - bugRate) * 0.005) + (1 - tick.weight) * 0.005 : null;
              streak = rate !== null && rate >= ALERT_RATE ? streak + 1 : 0;
              if (streak >= ALERT_WINDOW) return tick.t;
            }
            return Infinity;
          })();
          const expected = Math.min(firstFail?.end ?? Infinity, alertTick);
          expect(run.trigger?.tick ?? Infinity, `${bugRate} bake ${bakeTicks} seed ${seed}`).toBe(expected);
          if (run.trigger && run.trigger.kind === 'analysis') expect(run.trigger.window?.fails).toBe(true);
        }
      }
    }
  });

  it('the window the run reports is the sum of the minutes it names', () => {
    const run = simulate(cfg({ strategy: 'canary', seed: 2 }));
    const w = run.trigger!.window!;
    expect(analysisWindow(run.tallies, w.from, w.to)).toEqual(w);
    expect(w.to - w.from + 1).toBe(DEFAULTS.bakeTicks);
  });

  it('a short bake lets a low-rate bug slip through to everyone; the long bake catches it on the same traffic (the preset)', () => {
    const short = simulate(cfg({ strategy: 'canary', bugRate: 0.03, bakeTicks: 1, seed: 4 }));
    expect(short.peakExposure).toBe(1);
    expect(short.trigger?.kind).toBe('alert');
    const long = simulate(cfg({ strategy: 'canary', bugRate: 0.03, bakeTicks: 8, seed: 4 }));
    expect(long.trigger?.kind).toBe('analysis');
    expect(long.peakExposure).toBeLessThan(0.2);
    expect(long.expectedHit).toBeLessThan(short.expectedHit / 4);
  });

  it('a bug below the alert line is invisible to the alert: it ships and stays', () => {
    const run = simulate(cfg({ strategy: 'rolling', bugRate: 0.01 }));
    expect(run.trigger).toBeNull();
    expect(run.peakExposure).toBe(1);
  });

  it('a clean canary is not rolled back by noise on the default seed, and finishes', () => {
    const run = simulate(cfg({ strategy: 'canary', bugRate: 0 }));
    expect(run.trigger).toBeNull();
    expect(run.completedAt).toBe(33);
  });

  it('with automated analysis off the canary relies on the alert alone, and exposes more users', () => {
    const on = simulate(cfg({ strategy: 'canary', seed: 2, analysis: true }));
    const off = simulate(cfg({ strategy: 'canary', seed: 2, analysis: false }));
    expect(on.trigger?.kind).toBe('analysis');
    expect(off.trigger?.kind).toBe('alert');
    expect(off.expectedHit).toBeGreaterThan(on.expectedHit);
  });
});

describe('rollbacks', () => {
  it('take one minute for blue-green and a canary (traffic switches back), and longer for rolling and recreate', () => {
    expect(rollbackAfter(simulate(cfg({ strategy: 'bluegreen' })))).toBe(1);
    expect(rollbackAfter(simulate(cfg({ strategy: 'canary' })))).toBe(1);
    expect(rollbackAfter(simulate(cfg({ strategy: 'recreate' })))).toBe(1 + BOOT_TICKS);
    expect(rollbackAfter(simulate(cfg({ strategy: 'rolling' })))).toBeGreaterThan(1 + BOOT_TICKS);
  });

  it('end back on a full v1 fleet with nothing on v2', () => {
    for (const strategy of STRATEGIES) {
      const run = simulate(cfg({ strategy }));
      expect(run.ticks.at(-1)).toMatchObject({ v1: REPLICAS, v2: 0, weight: 0, startingV1: 0, startingV2: 0 });
    }
  });

  it('are blocked by a breaking migration: v1 cannot read the new schema, so the run rolls forward', () => {
    for (const strategy of STRATEGIES) {
      const run = simulate(cfg({ strategy, schema: 'breaking' }));
      expect(run.rolledBackAt).toBeNull();
      expect(rollbackAfter(run)).toBeNull();
      expect(run.ticks.at(-1)).toMatchObject({ v2: REPLICAS, v1: 0 });
    }
  });

  it('a canary promoted to 100% undoes with a rolling update, not an instant switch', () => {
    // 2% is under the alert line until everyone is on v2, so only the promoted fleet trips it
    const run = simulate(cfg({ strategy: 'canary', bugRate: 0.02, analysis: false }));
    expect(run.ticks[run.trigger!.tick]).toMatchObject({ v1: 0, v2: REPLICAS });
    // the same 20-to-0 undo the rolling strategy does from a finished deploy took six minutes by hand
    expect(rollbackAfter(run)).toBe(6);
  });

  it('with the pods sharing traffic equally, the traffic share of v2 is its share of the serving servers', () => {
    for (const strategy of ['recreate', 'rolling', 'bluegreen'] as const) {
      for (const tick of simulate(cfg({ strategy })).ticks.filter(served)) expect(tick.weight).toBeCloseTo(tick.v2 / (tick.v1 + tick.v2), 12);
    }
  });
});

describe('a breaking migration', () => {
  it('breaks the strategies that run v1 and v2 at once, and a canary the longest', () => {
    const hit = (strategy: Strategy) => simulate(cfg({ strategy, bugRate: 0, schema: 'breaking' })).expectedHit;
    expect(hit('rolling')).toBeGreaterThan(hit('recreate'));
    expect(hit('canary')).toBeGreaterThan(hit('rolling'));
    expect(hit('recreate')).toBe(BOOT_TICKS * REQ_PER_TICK);
  });

  it('is still caught by the alert on a rolling update, which then cannot undo it', () => {
    const run = simulate(cfg({ strategy: 'rolling', bugRate: 0, schema: 'breaking' }));
    expect(run.trigger).toMatchObject({ kind: 'alert', blocked: true });
  });
});

describe('determinism', () => {
  it('the same settings give the identical run', () => {
    for (const strategy of STRATEGIES) expect(simulate(cfg({ strategy }))).toEqual(simulate(cfg({ strategy })));
  });

  it('every run is HORIZON minutes with consecutive minute numbers', () => {
    for (const strategy of STRATEGIES) {
      const run = simulate(cfg({ strategy }));
      expect(run.ticks.map((t) => t.t)).toEqual(Array.from({ length: HORIZON }, (_, i) => i));
      expect(run.tallies).toHaveLength(HORIZON);
    }
  });

  it('expectedHit of a single minute with everyone on a good v2 is zero', () => {
    const run = simulate(cfg({ strategy: 'bluegreen', bugRate: 0 }));
    expect(expectedHit(run.cfg, run.ticks.at(-1)!)).toBe(0);
  });
});
