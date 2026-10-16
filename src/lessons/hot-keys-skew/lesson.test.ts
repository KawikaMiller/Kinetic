import { describe, expect, it } from 'vitest';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import {
  BURST_KEYS, BURST_M, STREAM_SEED, burstView, detectView, initialBurst, initialDetect, initialMelt, initialMitigate, mitigateView,
} from './init';
import lesson from './index';
import { FILL_TICKS, SKEW, UTILISATION, fillSim, hottestShare, saturationAt, summarise } from './skew';
import { loadFractions } from './shardMath';

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: at the defaults the hottest key carries about 13%, the first shard saturates below 60%, and the hottest shard ends past its capacity at 70% utilisation; uniform keys saturate above 80%', () => {
    const s = initialMelt();
    expect([s.skew, s.util, s.seed]).toEqual([1, 0.7, STREAM_SEED]);
    expect(hottestShare(1)).toBeCloseTo(0.1336, 3);
    const sim = fillSim(s.seed, s.skew);
    sim.run(FILL_TICKS);
    const final = sim.at(FILL_TICKS)!;
    const shares = final.loads.map((x) => x / final.requests);
    expect(saturationAt(shares)).toBeLessThan(0.6);
    expect(Math.max(...loadFractions(final.loads, s.util, final.requests))).toBeGreaterThan(1);
    const uniform = fillSim(s.seed, 0);
    uniform.run(FILL_TICKS);
    const u = uniform.at(FILL_TICKS)!;
    expect(saturationAt(u.loads.map((x) => x / u.requests))).toBeGreaterThan(0.8);
    expect(lesson.tryThis[0]).toContain('below 60%');
    expect(lesson.tryThis[0]).toContain('above 80%');
  });

  it('try-this 2: salting at 20% reads lowers the hottest shard and adds gather work; with no reads the extra work is 0; at 90% reads it is worse than no mitigation', () => {
    const s = initialMitigate();
    expect([s.kind, s.m, s.readShare]).toEqual(['salt', 4, 0.2]);
    const v = mitigateView(s);
    expect(v.nowSummary.maxOverMean).toBeLessThan(v.withoutSummary.maxOverMean);
    expect(v.now.extra).toBeGreaterThan(0);
    expect(mitigateView({ ...s, readShare: 0 }).now.extra).toBe(0);
    const readHeavy = mitigateView({ ...s, readShare: 0.9 });
    expect(readHeavy.nowSummary.hottestLoad).toBeGreaterThan(readHeavy.withoutSummary.hottestLoad);
    expect(v.nowSummary.hottestLoad).toBeLessThan(v.withoutSummary.hottestLoad);
  });

  it('try-this 3: with a cache and no reads the hottest shard is exactly the no-mitigation figure; with all reads it falls', () => {
    const s = { ...initialMitigate(), kind: 'cache' as const };
    const none = mitigateView({ ...s, readShare: 0 });
    expect(none.nowSummary.maxOverMean).toBe(none.withoutSummary.maxOverMean);
    expect(none.now.absorbed).toBe(0);
    const all = mitigateView({ ...s, readShare: 1 });
    expect(all.nowSummary.maxOverMean).toBeLessThan(all.withoutSummary.maxOverMean);
  });

  it('try-this 4: the 32-counter sketch at the default hash seed misses user:4 and flags 3 keys that are not hot; the widest sketch flags the four hot keys and misses none', () => {
    const s = initialDetect();
    const d = detectView(s).detection;
    expect([s.width, d.cells]).toEqual([8, 32]);
    expect(d.missed).toEqual([4]);
    expect(d.falseAlarms).toHaveLength(3);
    const wide = detectView({ ...s, width: 512 }).detection;
    expect(wide.flagged).toEqual([1, 2, 3, 4]);
    expect(wide.missed).toEqual([]);
    expect(detectView(s).flaggedLoads.maxOverMean).toBeGreaterThan(detectView(s).trueLoads.maxOverMean);
  });

  it('try-this 5: with the salting fixed at the start the second half is more unbalanced than the first; following the hot keys brings it back', () => {
    const s = initialBurst();
    expect(s).toEqual({ burst: true, adaptive: false });
    const util = UTILISATION.default;
    const stale = burstView(s);
    expect(summarise(stale.second, util).maxOverMean).toBeGreaterThan(summarise(stale.first, util).maxOverMean);
    const follow = burstView({ ...s, adaptive: true });
    expect(summarise(follow.second, util).maxOverMean).toBeLessThan(summarise(stale.second, util).maxOverMean);
    expect([BURST_KEYS, BURST_M]).toEqual([12, 8]);
  });
});

describe('every scene opens in a state of its own, and a hidden control cannot reach a number', () => {
  it('fresh objects each call; switching through all scenes leaves them unchanged', () => {
    expect(initialMelt()).not.toBe(initialMelt());
    const before = [initialMelt(), initialMitigate(), initialDetect(), initialBurst()];
    for (const make of [initialBurst, initialDetect, initialMitigate, initialMelt, initialMitigate]) make();
    expect([initialMelt(), initialMitigate(), initialDetect(), initialBurst()]).toEqual(before);
  });

  it('the salting count does not change a cache run and the hit ratio does not change a salting run (each control is shown only for its mitigation)', () => {
    const cache = initialMitigate();
    const a = mitigateView({ ...cache, kind: 'cache', m: 2 }).now.loads;
    expect(mitigateView({ ...cache, kind: 'cache', m: 8 }).now.loads).toEqual(a);
    const salt = initialMitigate();
    const b = mitigateView({ ...salt, hit: 0 }).now.loads;
    expect(mitigateView({ ...salt, hit: 0.9 }).now.loads).toEqual(b);
    const none = mitigateView({ ...salt, kind: 'none', m: 2, hit: 0 }).now.loads;
    expect(mitigateView({ ...salt, kind: 'none', m: 8, hit: 0.9 }).now.loads).toEqual(none);
  });

  it('the slider ranges include the uniform end and the stated hot-key defaults', () => {
    expect([SKEW.min, SKEW.default]).toEqual([0, 1]);
  });
});

describe('lesson content', () => {
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
  it('has five try-this entries and five questions with answers spread over the positions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
    expect(new Set(lesson.quiz.map((q) => q.answer)).size).toBeGreaterThan(2);
  });
});
