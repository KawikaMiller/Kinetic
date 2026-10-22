import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { jitterCaption, logText, mitigationNames, runCaption, runIntro, runMilestones, singleflightCaption } from './captions';
import lesson from './index';
import { SLOW_QUERY_MS, VIRAL_LAMBDA, initialExpiry, initialMitigation, initialSingleflight } from './init';
import {
  BROKEN_SEED, KEYS, LOAD_RANGE, NO_MITIGATION, RECOMPUTE_RANGE, SCAN_TICKS, busiestSecond, expiryCounts, gapView, runStampede, violatingSeeds, type Mitigations,
} from './model';

const text = expectCaption;
const go = (over: Partial<Mitigations> = {}, lambda = 500, recomputeMs = 500, seed = 0) => runStampede({ seed, lambda, recomputeMs, mitigations: { ...NO_MITIGATION, ...over } });

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: at the defaults 553 queries, 553 timeouts, and the first value at 3.02 s', () => {
    const o = initialExpiry();
    expect(o).toEqual({ lambda: 500, recomputeMs: 500, seed: 0 });
    const s = go({}, o.lambda, o.recomputeMs, o.seed).summary;
    expect(s.queries).toBe(553);
    expect(s.outcomes.timeout).toBe(553);
    expect(s.firstWriteMs).toBe(3020);
    expect(s.firstWriteMs).toBeGreaterThan((s.firstTimeoutMs as number) - 1);
    expect(lesson.tryThis[0]).toContain('553 queries reach the database, 553 requests time out');
    expect(lesson.tryThis[0]).toContain('3.02 s');
  });

  it('try-this 2: the viral preset sends 16,138 queries and no value is cached within the run', () => {
    const s = go({}, VIRAL_LAMBDA).summary;
    expect(s.queries).toBe(16138);
    expect(s.firstWriteMs).toBeNull();
    expect(lesson.tryThis[1]).toContain('16,138 queries');
    expect(lesson.tryThis[1]).toContain('no value reaches the cache');
  });

  it('try-this 3: from the default scene 2, coalescing turns 553 queries into 1 and brings p99 from 1 s to 430 ms; stale makes 0 wait; the lock returns 160 defaults', () => {
    const s = initialMitigation();
    expect(s.mitigations).toEqual(NO_MITIGATION);
    const none = go().summary;
    const co = go({ coalesce: true }).summary;
    expect(none.queries).toBe(553);
    expect(co.queries).toBe(1);
    expect(none.p99Ms).toBe(1000);
    expect(co.p99Ms).toBe(430);
    expect(go({ stale: true }).summary.waited).toBe(0);
    expect(go({ lock: true }).summary.outcomes.default).toBe(160);
    for (const part of ['553 queries become 1', 'from 1 s to 430 ms', '0 requests wait', '160 get a default after 200 ms']) expect(lesson.tryThis[2]).toContain(part);
  });

  it('try-this 4: the scene opens at 0% jitter, and 20% takes the busiest second from 1,000 keys to 56', () => {
    const s = initialMitigation();
    expect(s.jitterPct).toBe(0);
    expect(busiestSecond(expiryCounts(s.seed, 0))).toBe(1000);
    expect(busiestSecond(expiryCounts(s.seed, 20))).toBe(56);
    expect(lesson.tryThis[3]).toContain('from 1,000 keys expiring to 56');
  });

  it('try-this 5: the scene opens with the marker released after the write, and releasing it early breaks seed 0 and 200 of 200 seeds', () => {
    const s = initialSingleflight();
    expect(s).toEqual({ lambda: 500, seed: BROKEN_SEED, releaseEarly: false });
    const config = { lambda: 500, recomputeMs: 500, mitigations: { ...NO_MITIGATION, coalesce: true, releaseEarly: false } };
    expect(runStampede({ ...config, seed: BROKEN_SEED }).violation).toBeNull();
    const broken = { ...config, mitigations: { ...config.mitigations, releaseEarly: true } };
    const run = runStampede({ ...broken, seed: BROKEN_SEED });
    expect(run.violation).not.toBeNull();
    expect(gapView(run)?.writeMs).toBe(2510);
    expect((gapView(run)?.writeMs ?? 0) - (gapView(run)?.doneMs ?? 0)).toBe(10);
    expect(violatingSeeds(broken, 200, SCAN_TICKS)).toHaveLength(200);
    expect(lesson.tryThis[4]).toContain('10 ms write gap');
    expect(lesson.tryThis[4]).toContain('200 of 200 seeds');
  });
});

describe('every scene opens in the state its try-this assumes', () => {
  it('the three openings are fresh objects, and the same seed is the pinned failing one', () => {
    const a = initialMitigation();
    a.mitigations.coalesce = true;
    expect(initialMitigation().mitigations.coalesce).toBe(false);
    expect([initialExpiry().seed, initialMitigation().seed, initialSingleflight().seed]).toEqual([BROKEN_SEED, BROKEN_SEED, BROKEN_SEED]);
    expect(SLOW_QUERY_MS).toBe(1500);
  });
});

describe('hidden controls do not feed visible numbers', () => {
  it('the TTL-jitter slider only changes the key histogram: the hot-key run on the same seed is identical at both extremes', () => {
    expect(go().summary).toEqual(go().summary);
    expect(expiryCounts(0, 0)).not.toEqual(expiryCounts(0, 40));
    expect(expiryCounts(0, 40).reduce((a, b) => a + b, 0)).toBe(KEYS);
  });

  it('beta is read only when early refresh is on (beta 0 is the unmitigated run)', () => {
    expect(go({ beta: 0 }).summary).toEqual(go().summary);
  });
});

describe('captions say what the run measured', () => {
  const settings: [number, number][] = [[LOAD_RANGE.min, RECOMPUTE_RANGE.min], [500, 500], [LOAD_RANGE.max, RECOMPUTE_RANGE.max], [1500, 500], [200, 300]];
  const mits: Partial<Mitigations>[] = [{}, { coalesce: true }, { stale: true }, { lock: true }, { beta: 1 }, { coalesce: true, stale: true }];

  it('the run caption states the numbers of its own run, at the slider extremes and for each protection', () => {
    for (const [lambda, recomputeMs] of settings) {
      for (const m of mits) {
        const run = go(m, lambda, recomputeMs);
        const t = text(runCaption(run));
        const s = run.summary;
        expect(t).toContain(`At ${lambda.toLocaleString('en-US')}/s`);
        expect(t.includes('no value reached the cache'), `${lambda} ${recomputeMs} ${JSON.stringify(m)}`).toBe(s.firstWriteMs === null);
        expect(t.includes('No request timed out')).toBe(s.outcomes.timeout === 0);
        if (mitigationNames({ ...NO_MITIGATION, ...m }).length === 0) expect(t).toContain(`${s.herd.toLocaleString('en-US')} started before the first finished`);
        else expect(t).toContain(`${s.queries.toLocaleString('en-US')} ${s.queries === 1 ? 'query reached' : 'queries reached'} the database`);
        text(runIntro(run));
        runMilestones(run).forEach((x) => text(x.say));
      }
    }
  });

  it('milestones sit at the times the model recorded: expiry, first timeout, first value', () => {
    const run = go();
    const ms = runMilestones(run);
    expect(ms.map((m) => m.t)).toEqual([2000, 3000, 3020]);
    expect(text(ms[2].say)).toContain('544 queries had started before the first one finished');
  });

  it('the singleflight caption names the gap times when the run broke, and says the marker is held when it did not', () => {
    const broken = runStampede({ seed: BROKEN_SEED, lambda: 500, recomputeMs: 500, mitigations: { ...NO_MITIGATION, coalesce: true, releaseEarly: true } });
    const g = gapView(broken);
    const t = text(singleflightCaption(broken, BROKEN_SEED, true));
    expect(t).toContain(`finished at 2.5 s`);
    expect(t).toContain('2 recomputes in flight');
    expect(g?.secondMs).not.toBeNull();
    const fine = runStampede({ seed: BROKEN_SEED, lambda: 500, recomputeMs: 500, mitigations: { ...NO_MITIGATION, coalesce: true } });
    expect(text(singleflightCaption(fine, BROKEN_SEED, false))).toContain('the marker is held until the value is cached');
    expect(text(singleflightCaption(fine, BROKEN_SEED, false))).toContain('never more than 1 in flight');
  });

  it('the event log reads in order and says what each step is', () => {
    const run = runStampede({ seed: BROKEN_SEED, lambda: 500, recomputeMs: 500, mitigations: { ...NO_MITIGATION, coalesce: true, releaseEarly: true } });
    const texts = run.log.map(logText);
    expect(texts[0]).toContain('recompute #1 starts');
    expect(texts.some((x) => x.includes('two in flight'))).toBe(true);
    expect(texts.some((x) => x.includes('marker is released'))).toBe(true);
  });

  it('the jitter caption states the busiest second it was given', () => {
    expect(text(jitterCaption(1000, 0))).toContain('1,000 expire in the busiest second');
    expect(text(jitterCaption(56, 20))).toContain('at most 56 of 1,000 keys');
  });
});
