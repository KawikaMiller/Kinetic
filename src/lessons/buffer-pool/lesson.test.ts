import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { poolCaption, scanCaption } from './captions';
import {
  DEFAULT_SEED, DISK_PAGES, KNEE_SHARE, MEASURE, POLICIES, SKEW, checkpoint, hitRatio, knee, newPool, request, run, scanAverage, scanExperiment, sizeCurve, take, togglePin, workload, writeBacks, type Policy, type Pool,
} from './pool';
import { BATCH } from './usePoolState';
import lesson from './index';

const served = (policy: Policy, n: number): Pool => run(newPool(policy), take(workload(DEFAULT_SEED, SKEW.initial), n));

describe('try-this entries, from the default state (LRU, seed 7, skew 1.1), as written', () => {
  it('try-this 1: four presses of Run 50 serve 200 requests at the hit ratio the lesson quotes', () => {
    const pool = served('lru', 4 * BATCH);
    expect(pool.count.requests).toBe(200);
    const pct = `${(hitRatio(pool.count)! * 100).toFixed(1)}%`;
    expect(lesson.tryThis[0]).toContain(pct);
    expect(text(poolCaption(pool), { strict: true })).toContain(`(${pct} hit ratio)`);
  });

  it('try-this 2: the table quotes the paired averages and the default seed sample, and the caption quotes the same numbers', () => {
    const rows = POLICIES.map((p) => ({ label: p.label, sample: scanExperiment(p.value, DEFAULT_SEED, SKEW.initial), average: scanAverage(p.value, SKEW.initial) }));
    const [lru, , ring] = rows;
    const p1 = (x: number) => `${(x * 100).toFixed(1)}%`;
    const pts = (x: number) => `${x < 0 ? '-' : '+'}${Math.abs(x * 100).toFixed(1)} points`;
    expect(lesson.tryThis[1]).toContain(`LRU goes from ${p1(lru.average.without)} to ${p1(lru.average.withScan)} (${pts(lru.average.change)})`);
    expect(lesson.tryThis[1]).toContain(`the scan ring from ${p1(ring.average.without)} to ${p1(ring.average.withScan)} (${pts(ring.average.change)})`);
    expect(lesson.tryThis[1]).toContain(`it goes ${(lru.sample.without * 100).toFixed(0)}% to ${(lru.sample.withScan * 100).toFixed(0)}%`);
    const c = text(scanCaption(rows, MEASURE, DEFAULT_SEED), { strict: true });
    for (const r of rows) {
      expect(c).toContain(`${r.label} ${(r.sample.without * 100).toFixed(0)}% to ${(r.sample.withScan * 100).toFixed(0)}%`);
      expect(c).toContain(`${r.label} ${pts(r.average.change)}`);
      expect(c).toContain(`${r.label} on ${r.average.hurt} of 30`);
    }
    expect(c).toContain('on average');
  });

  it('quiz Q1 and Q2 quote the same averages (and never say "mostly misses")', () => {
    const lru = scanAverage('lru', SKEW.initial);
    expect(lesson.quiz[0].why).toContain(`${(Math.abs(lru.change) * 100).toFixed(1)} points`);
    expect(lesson.quiz[0].why).toContain(`${lru.hurt} of 30`);
    expect(lesson.quiz[0].options.join(' ')).not.toMatch(/mostly misses/i);
    expect(lesson.quiz[1].why).toContain('an average, not every seed');
  });

  it('try-this 3: after Run 50, pinning all eight frames makes a request for a page not in the pool fail', () => {
    for (const policy of ['lru', 'clock', 'ring'] as const) {
      let pool = served(policy, BATCH);
      expect(pool.frames.every((f) => f.page !== null)).toBe(true);
      for (let i = 0; i < 8; i++) pool = togglePin(pool, i);
      const missing = [...Array(DISK_PAGES).keys()].find((p) => !pool.frames.some((f) => f.page === p))!;
      const after = request(pool, { page: missing });
      expect(after.last!.result).toBe('failed');
      expect(text(poolCaption(after), { strict: true })).toContain('every frame is pinned');
    }
  });

  it('try-this 4: writing disk page 5 and pressing Checkpoint reads 1 write-back', () => {
    let pool = request(newPool('lru'), { page: 5, write: true });
    expect(pool.frames.filter((f) => f.dirty)).toHaveLength(1);
    pool = checkpoint(pool);
    expect(writeBacks(pool.count)).toBe(1);
    expect(text(poolCaption(pool), { strict: true })).toContain('1 write-back');
  });

  it('try-this 5: LRU reaches 95% of its 16-frame hit ratio at the knee the lesson quotes', () => {
    const curve = sizeCurve('lru', DEFAULT_SEED, SKEW.initial);
    const k = knee(curve);
    expect(lesson.tryThis[4]).toContain(`at ${k} frames`);
    expect(curve.find((p) => p.size === k)!.ratio).toBeGreaterThanOrEqual(KNEE_SHARE * curve.at(-1)!.ratio);
    expect(k === 4 || curve.find((p) => p.size === k - 1)!.ratio < KNEE_SHARE * curve.at(-1)!.ratio).toBe(true);
  });
});

describe('captions follow the counters (AC-0/T3 #14)', () => {
  it('the counts in the caption are the pool\'s own, for every policy and several run lengths, with a scan and a checkpoint mixed in', () => {
    for (const policy of ['lru', 'clock', 'ring'] as const) {
      for (const n of [0, 1, 7, 50, 233]) {
        let pool = served(policy, n);
        if (n > 40) pool = checkpoint(request(pool, { page: 3, write: true }));
        const c = text(poolCaption(pool), { strict: true });
        const k = pool.count;
        expect(c).toContain(`${k.requests} ${k.requests === 1 ? 'request' : 'requests'}, ${k.hits} ${k.hits === 1 ? 'hit' : 'hits'}, ${k.misses} ${k.misses === 1 ? 'miss' : 'misses'}`);
        expect(c.includes('hit ratio)')).toBe(hitRatio(k) !== null);
        expect(c).toContain(`${writeBacks(k)} ${writeBacks(k) === 1 ? 'write-back' : 'write-backs'}`);
      }
    }
  });

  it('the size curve does not depend on the pool size marker: it is a function of seed and skew alone', () => {
    expect(sizeCurve('lru', 7, 1.1)).toEqual(sizeCurve('lru', 7, 1.1));
    expect(sizeCurve('lru', 7, 1.1)).not.toEqual(sizeCurve('lru', 8, 1.1));
  });
});

describe('lesson content', () => {
  it('has five try-this entries and five questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});
