import { describe, expect, it } from 'vitest';
import { captionText, expectCaption } from '../../core/testing/captions';
import { pctText, sig } from '../distributions/fmt';
import { FRAME_STEPS, fanoutCaption, hedgeFrames, hedgeIntro, hedgeSummary, hurtCaption, msText, timelineEnd, touchText } from './frames';
import lesson from './index';
import {
  BACKEND_DEFAULT, FANOUT_DEFAULT, FANOUT_STEPS, HEDGE_BACKEND, HEDGE_DEFAULT, MM1, MM1_DEFAULT_RHO, MM1_RHO, P99, SAMPLE_REQUESTS, callQuantile, callSurvival, crossoverRho,
  extraLoad, fanoutReport, fanoutRun, hedgeReport, hedgeRun, hedgedQuantile, hedgingHurts, medianSlowWidth, mm1Hedging, p95DelayMs, touchesSlow, type Hedge,
} from './model';

const text = (node: Parameters<typeof captionText>[0]) => expectCaption(node);

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: at the defaults N = 100 with 1% slow calls reads 63.4%, and N = 1 and N = 1,000 read 1.0% and 99.996%', () => {
    expect(BACKEND_DEFAULT).toMatchObject({ slowProb: 0.01 });
    expect(FANOUT_DEFAULT).toBe(100);
    const at = (n: number) => text(fanoutCaption(BACKEND_DEFAULT, fanoutReport(BACKEND_DEFAULT, n, fanoutRun(BACKEND_DEFAULT, n, 1))));
    expect(at(FANOUT_DEFAULT)).toContain('63.4% of requests touch a slow one');
    expect(at(1)).toContain('1.0% of requests touch a slow one');
    expect(at(1000)).toContain('99.996% of requests touch a slow one');
    expect(lesson.tryThis[0]).toContain('63.4% of requests');
  });

  it('try-this 2: at N = 69 more than half of requests wait on a slow call, and one step lower on the slider ladder they do not', () => {
    expect(FANOUT_STEPS).toContain(69);
    const at = (n: number) => text(fanoutCaption(BACKEND_DEFAULT, fanoutReport(BACKEND_DEFAULT, n, fanoutRun(BACKEND_DEFAULT, n, 1))));
    expect(medianSlowWidth(BACKEND_DEFAULT.slowProb)).toBe(69);
    expect(at(69)).toContain('At 69 backends more than half of requests wait on a slow call');
    const lower = FANOUT_STEPS[FANOUT_STEPS.indexOf(69) - 1];
    expect(touchesSlow(0.01, lower)).toBeLessThan(0.5);
    expect(at(lower)).toContain('It takes 69 backends before more than half of requests wait on a slow call');
    expect(at(lower)).not.toContain('At 69');
  });

  it('try-this 3: at the default delay about 5% of requests send a second copy and the p99 falls, in the formula and in the run', () => {
    expect(HEDGE_DEFAULT).toMatchObject({ replicas: 2, correlation: 0, delay: p95DelayMs(HEDGE_BACKEND) });
    const run = hedgeRun(HEDGE_BACKEND, HEDGE_DEFAULT, 1);
    const r = hedgeReport(HEDGE_BACKEND, HEDGE_DEFAULT, run);
    expect(run.samples).toHaveLength(6);
    expect(run.samples.filter((s) => s.sentAt.length > 1)).toHaveLength(3);
    expect(r.hedgedP99).toBeLessThan(r.plainP99);
    expect(r.hedgedP99Sim).toBeLessThan(r.plainP99Sim);
    expect(r.extra).toBeGreaterThan(0.045);
    expect(r.extra).toBeLessThan(0.055);
    const c = text(hedgeSummary(HEDGE_DEFAULT, r));
    expect(c).toContain(`from ${msText(r.plainP99)} to ${msText(r.hedgedP99)} for ${pctText(r.extra, 1)} extra requests`);
    expect(lesson.tryThis[2]).toContain(`${msText(r.plainP99)} to ${msText(r.hedgedP99)} for ${pctText(r.extra, 1)} extra`);
  });

  it('try-this 4: with shared fate at 100% the hedged p99 equals the plain p99 and the extra load is still paid', () => {
    const shared: Hedge = { ...HEDGE_DEFAULT, correlation: 1 };
    const run = hedgeRun(HEDGE_BACKEND, shared, 1);
    const r = hedgeReport(HEDGE_BACKEND, shared, run);
    expect(r.hedgedP99).toBeCloseTo(r.plainP99, 6);
    expect(r.hedgedP99Sim).toBe(r.plainP99Sim);
    expect(r.extra).toBeGreaterThan(0.045);
    expect(r.extraSim).toBeGreaterThan(0.04);
  });

  it('try-this 5: a hedge helps at the default ρ, stops paying at the crossover, and overloads the backend at 70%', () => {
    expect(hedgingHurts(mm1Hedging(MM1_DEFAULT_RHO))).toBe(false);
    const cross = crossoverRho()!;
    expect(hedgingHurts(mm1Hedging(cross))).toBe(true);
    expect(hedgingHurts(mm1Hedging(Math.round((cross - 0.01) * 100) / 100))).toBe(false);
    expect(mm1Hedging(0.7).hedgedP99).toBeNull();
    expect(lesson.tryThis[4]).toContain(`Drag ρ to ${pctText(cross, 0)}`);
    expect(text(hurtCaption(mm1Hedging(MM1_DEFAULT_RHO)))).toContain('hedging helps here');
    expect(text(hurtCaption(mm1Hedging(0.7)))).toContain('overloaded');
  });
});

describe('captions are computed from the model', () => {
  it('the fan-out caption quotes the exact numbers of the stat row at both families and the slider extremes', () => {
    for (const family of ['lognormal', 'exponential'] as const) {
      for (const slowProb of [0, 0.005, 0.01, 0.1]) {
        for (const n of [1, 69, 1000]) {
          const b = { family, slowProb, slowFactor: 10 };
          const report = fanoutReport(b, n, fanoutRun(b, n, 2));
          const c = text(fanoutCaption(b, report));
          expect(c, `${family} p=${slowProb} N=${n}`).toContain(`${touchText(report.touchSlow)} of requests touch a slow one`);
          expect(c).toContain(`One call's p99 is ${msText(report.singleP99)}`);
          expect(c).toContain(`the request's p99 is ${msText(report.slowestP99)}`);
          expect(c.includes('more than half'), `${family} p=${slowProb} N=${n}`).toBe(slowProb > 0);
          if (slowProb > 0 && n >= medianSlowWidth(slowProb)) expect(c).toContain(`At ${n} backends more than half`);
          expect(c.includes('No call is slow here'), `${family} p=${slowProb} N=${n}`).toBe(slowProb === 0);
          if (slowProb > 0) expect(c).toContain(`Each call is slow 1 time in ${sig(1 / slowProb, 3)}`);
        }
      }
    }
  });

  it('the hedge frames: an intro, a summary quoting the report, and a milestone caption at each hedge sent and each request finished', () => {
    for (const replicas of [1, 2, 3] as const) {
      for (const correlation of [0, 1]) {
        const hedge: Hedge = { delay: 48, replicas, correlation };
        const run = hedgeRun(HEDGE_BACKEND, hedge, 3);
        const report = hedgeReport(HEDGE_BACKEND, hedge, run);
        const frames = hedgeFrames(run.samples, hedge, report);
        const hedgesSent = run.samples.reduce((s, r) => s + r.sentAt.length - 1, 0);
        expect(frames).toHaveLength(1 + FRAME_STEPS + hedgesSent + SAMPLE_REQUESTS + 1);
        expect(text(frames[0].say)).toBe(text(hedgeIntro(hedge)));
        expect(text(frames[frames.length - 1].say)).toContain(`from ${msText(report.plainP99)} to ${msText(report.hedgedP99)}`);
        expect(frames[frames.length - 1].now).toBe(timelineEnd(run.samples));
        run.samples.forEach((r, i) => {
          const finishFrame = frames.find((f) => f.say !== undefined && text(f.say).startsWith(`Request ${i + 1} `) && Math.abs(f.now - r.latency) < 1e-9);
          expect(finishFrame, `request ${i + 1} finish`).toBeDefined();
          const c = text(finishFrame!.say);
          if (r.sentAt.length === 1) expect(c).toContain('no second copy was ever sent');
          else expect(c).toContain(`finished at ${msText(r.latency)}`);
        });
      }
    }
  });

  it('the hurt caption quotes the crossover, and says "overloaded" exactly where there is no steady state', () => {
    const cross = crossoverRho()!;
    for (let rho = MM1_RHO.min; rho <= MM1_RHO.max + 1e-9; rho += MM1_RHO.step) {
      const r = mm1Hedging(Math.round(rho * 100) / 100);
      const c = text(hurtCaption(r));
      expect(c).toContain(`${pctText(cross, 0)}`);
      expect(c.includes('overloaded'), `ρ = ${r.rho}`).toBe(r.loadedRho === null);
      if (r.loadedRho !== null) {
        expect(c).toContain(`hedging ${r.hedgedP99! < r.plainP99 ? 'helps' : 'hurts'} here`);
        expect(c).toContain(`ρ′ = ${pctText(r.loadedRho, 1)}`);
      }
    }
  });
});

describe('quiz answers, from independent oracles', () => {
  it('Q1: 100 backends at 1% slow: 63% touch a slow one; the distractors are 1%, 1 + 1 + … = 100% and the complement 37%', () => {
    expect(1 - 0.99 ** 100).toBeCloseTo(0.634, 3);
    expect(0.99 ** 100).toBeCloseTo(0.366, 3);
    expect(touchesSlow(0.01, 100)).toBeCloseTo(1 - 0.99 ** 100, 12);
    expect(lesson.quiz[0].options[lesson.quiz[0].answer]).toContain('63%');
  });

  it('Q2: hedging at a lower delay adds more load, not less; a copy on an independent replica helps; and near saturation it hurts', () => {
    expect(extraLoad(HEDGE_BACKEND, { delay: 10, replicas: 2, correlation: 0 })).toBeGreaterThan(extraLoad(HEDGE_BACKEND, { delay: 100, replicas: 2, correlation: 0 }));
    expect(hedgedQuantile(HEDGE_BACKEND, HEDGE_DEFAULT, P99)).toBeLessThan(callQuantile(HEDGE_BACKEND, P99));
    expect(hedgingHurts(mm1Hedging(0.95))).toBe(true);
  });

  it('Q3: the smallest fan-out with more than half of requests slow is 69, found by scanning, and 100 is not the smallest', () => {
    let n = 1;
    while (1 - 0.99 ** n <= 0.5) n++;
    expect(n).toBe(69);
    expect(lesson.quiz[2].options[lesson.quiz[2].answer]).toContain('About 69');
    expect(Math.log(0.5) / Math.log(0.99)).toBeCloseTo(68.97, 2);
  });

  it('Q4: with a shared dependency (shared fate 100%) hedging does not move the p99, and the survival of one call is untouched', () => {
    const shared: Hedge = { delay: 48, replicas: 2, correlation: 1 };
    expect(hedgedQuantile(HEDGE_BACKEND, shared, P99)).toBeCloseTo(callQuantile(HEDGE_BACKEND, P99), 6);
    expect(callSurvival(HEDGE_BACKEND, callQuantile(HEDGE_BACKEND, P99))).toBeCloseTo(0.01, 9);
  });
});

describe('hidden controls do not feed numbers', () => {
  it('scene 2 has its own fixed backend: its numbers are the scene-1 default, whatever scene 1 was set to', () => {
    expect(HEDGE_BACKEND).toEqual(BACKEND_DEFAULT);
    const a = hedgeReport(HEDGE_BACKEND, HEDGE_DEFAULT, hedgeRun(HEDGE_BACKEND, HEDGE_DEFAULT, 1));
    const b = hedgeReport(HEDGE_BACKEND, HEDGE_DEFAULT, hedgeRun(HEDGE_BACKEND, HEDGE_DEFAULT, 1));
    expect(a).toEqual(b);
  });

  it('with one copy, the hedge delay and shared fate change nothing in the run, the formulas or the load', () => {
    const base: Hedge = { delay: 10, replicas: 1, correlation: 0 };
    const other: Hedge = { delay: 200, replicas: 1, correlation: 0.9 };
    const a = hedgeRun(HEDGE_BACKEND, base, 5);
    const b = hedgeRun(HEDGE_BACKEND, other, 5);
    expect(Array.from(a.hedged.subarray(0, 500))).toEqual(Array.from(b.hedged.subarray(0, 500)));
    expect(hedgedQuantile(HEDGE_BACKEND, base, P99)).toBeCloseTo(hedgedQuantile(HEDGE_BACKEND, other, P99), 9);
    expect(extraLoad(HEDGE_BACKEND, base)).toBe(0);
    expect(extraLoad(HEDGE_BACKEND, other)).toBe(0);
    expect(hedgedQuantile(HEDGE_BACKEND, base, P99)).toBeCloseTo(callQuantile(HEDGE_BACKEND, P99), 6);
  });

  it('the M/M/1 scene reads only ρ: its numbers are the same function of ρ every time', () => {
    expect(mm1Hedging(0.4)).toEqual(mm1Hedging(0.4));
    expect(MM1.hedgeAfterMs).toBeGreaterThan(0);
  });
});
