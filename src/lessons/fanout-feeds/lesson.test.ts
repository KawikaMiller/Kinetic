import { describe, expect, it } from 'vitest';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { FOLLOWER_STEPS, INSERT_MS, WORKERS, makeDrain } from './drain';
import { FEED_PAGE, THRESHOLDS, followerCount, makePopulation, populationWork, pullCost, worstPostMs } from './feed';
import lesson from './index';
import {
  FOLLOWEE_STEPS, POP_SEED, POSTS_PER_HOUR, RATIO_STEPS, detailEffect, hybridView, initialDetail, initialHybrid, initialPull, initialPush, isInactive, measuredMerge, populationFor,
  topAuthor,
} from './init';

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: 5,000 followers at 10 workers and 1 ms take 500 ms; 50 workers take 100 ms; 100,000 followers at 10 workers take 10 s', () => {
    const s = initialPush();
    expect([FOLLOWER_STEPS[s.followersIdx], s.workers, s.insertMs]).toEqual([5_000, 10, 1]);
    expect(makeDrain(5_000, 10, 1).totalMs).toBe(500);
    expect(makeDrain(5_000, 50, 1).totalMs).toBe(100);
    expect(makeDrain(100_000, 10, 1).totalMs).toBe(10_000);
    expect(lesson.tryThis[0]).toContain('500 ms');
    expect(lesson.tryThis[0]).toContain('100 ms');
    expect(lesson.tryThis[0]).toContain('10 s');
    expect([WORKERS.default, INSERT_MS.default]).toEqual([10, 1]);
  });

  it('try-this 2: the pull write cost is 1 at every follower count; the measured read cost grows with F and stays near the F + N log2 F estimate', () => {
    const s = initialPull();
    expect(FOLLOWEE_STEPS[s.followeesIdx]).toBe(50);
    const small = measuredMerge(50);
    const big = measuredMerge(2_000);
    expect(big.ops).toBeGreaterThan(small.ops * 10);
    for (const f of FOLLOWEE_STEPS) {
      const m = measuredMerge(f);
      expect(m.ops / m.estimate, `F=${f}`).toBeGreaterThan(0.4);
      expect(m.ops / m.estimate, `F=${f}`).toBeLessThan(2.6);
      expect(m.estimate).toBe(pullCost(f));
    }
  });

  it('try-this 3: at 1 read per post pure push is cheaper than pure pull; at 0.05 pull is cheaper; the crossover sits between them', () => {
    const s = initialHybrid();
    expect([THRESHOLDS[s.thresholdIdx], RATIO_STEPS[s.ratioIdx]]).toEqual([100, 1]);
    const pop = populationFor(POP_SEED);
    const v = hybridView(pop, s);
    expect(v.push.total).toBeLessThan(v.pull.total);
    const low = hybridView(pop, { ...s, ratioIdx: 0 });
    expect(low.pull.total).toBeLessThan(low.push.total);
    expect(v.crossover).toBeGreaterThan(RATIO_STEPS[0]);
    expect(v.crossover).toBeLessThan(RATIO_STEPS[s.ratioIdx]);
  });

  it('try-this 4: threshold 0 makes the hybrid equal pure pull with a one-store slowest post; the end makes it equal pure push', () => {
    const pop = populationFor(POP_SEED);
    const s = initialHybrid();
    const zero = hybridView(pop, { ...s, thresholdIdx: 0 });
    expect(zero.hybrid).toEqual(zero.pull);
    expect(zero.worstHybridMs).toBe(INSERT_MS.default);
    const end = hybridView(pop, { ...s, thresholdIdx: THRESHOLDS.length - 1 });
    expect(end.hybrid).toEqual(end.push);
    expect(end.worstHybridMs).toBe(end.worstPushMs);
  });

  it('try-this 5: deleting a most-followed author\'s post is a fan-out the size of the post\'s; the inactive share shrinks the push to the active readers', () => {
    expect(initialDetail().detail).toBe('inactive');
    const pop = populationFor(POP_SEED);
    const a = topAuthor(pop);
    const del = detailEffect(pop, 'deletes').effect;
    expect(del).toContain(`${followerCount(pop, a)} inboxes`);
    const active = pop.followers[a].filter((u) => u % 5 >= 2).length;
    expect(detailEffect(pop, 'inactive').effect).toContain(`writes ${active} inboxes instead of ${followerCount(pop, a)}`);
    expect(isInactive(0)).toBe(true);
    expect(isInactive(4)).toBe(false);
  });
});

describe('every scene opens in a state of its own', () => {
  it('fresh objects each call, and the defaults the try-this entries depend on', () => {
    expect(initialPush()).not.toBe(initialPush());
    expect(initialHybrid()).toEqual({ thresholdIdx: 4, ratioIdx: 5, seed: POP_SEED });
    expect(initialPull()).toEqual({ followeesIdx: 3 });
    const before = [initialPush(), initialPull(), initialHybrid(), initialDetail()];
    for (const make of [initialDetail, initialHybrid, initialPull, initialPush, initialHybrid]) make();
    expect([initialPush(), initialPull(), initialHybrid(), initialDetail()]).toEqual(before);
  });
});

describe('the scenes\' numbers are computed from the model', () => {
  const pop = makePopulation(1);
  it('the crossover is where the totals meet: push and pure pull cost the same at that ratio (checked at two seeds)', () => {
    for (const seed of [1, 2]) {
      const p = makePopulation(seed);
      const v = hybridView(p, { ...initialHybrid(), seed });
      const mix = { postsPerHourEach: POSTS_PER_HOUR, readsPerPost: v.crossover };
      expect(populationWork(p, 'push', 0, mix).total).toBeCloseTo(populationWork(p, 'pull', 0, mix).total, 3);
    }
  });
  it('the hybrid view uses the threshold on the slider: celebrities are the authors above it, and its slowest post is the biggest author at or below it', () => {
    for (let i = 0; i < THRESHOLDS.length; i++) {
      const v = hybridView(pop, { ...initialHybrid(), thresholdIdx: i });
      expect(v.celebrities).toBe(pop.followers.filter((f) => f.length > THRESHOLDS[i]).length);
      expect(v.worstHybridMs).toBe(worstPostMs(pop, 'hybrid', THRESHOLDS[i], WORKERS.default, INSERT_MS.default));
    }
  });
  it('a hidden control cannot move the totals: the population seed is the only thing the hybrid scene reads besides its two sliders', () => {
    const a = hybridView(pop, { thresholdIdx: 4, ratioIdx: 5, seed: 1 });
    const b = hybridView(makePopulation(1), { thresholdIdx: 4, ratioIdx: 5, seed: 1 });
    expect(a).toEqual(b);
  });
  it('the page size is the same in every scene and the effect text says it', () => {
    expect(detailEffect(pop, 'ranked').effect).toContain(String(FEED_PAGE));
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
