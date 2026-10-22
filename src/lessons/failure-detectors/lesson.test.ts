import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { DEFAULT_DECIDE_AT, crashPauseCaption, initialCrashPause, initialPhi, initialSwim, initialTimeout, swimCaption, timeoutCaption } from './init';
import lesson from './index';
import {
  BROKEN_SEED, defaultSetup, detectionMean, detectionTime, expectedFalseInRun, falseSuspicions, judge, runDetector, runSwim, setupFor, swimEnumerated,
  swimFalseSuspicions, twinRuns,
} from './model';

const fmt = (x: number, dp: number) => x.toFixed(dp);

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: the defaults (T = 185, jitter 20, seed 5) raise a false suspicion in a 10 s run; the closed form expects 0.7', () => {
    const s = initialTimeout();
    expect([s.controls.timeoutMs, s.controls.jitterMs, s.controls.seed, s.controls.rule]).toEqual([185, 20, BROKEN_SEED, 'fixed']);
    const d = runDetector(setupFor(s.controls, 'quiet'), 10_000);
    const n = falseSuspicions(d).length;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(lesson.tryThis[0]).toContain(`raises ${n} false suspicion`);
    expect(lesson.tryThis[0]).toContain(`expects ${fmt(expectedFalseInRun(185, 20, 10_000), 1)} per 10 s`);
  });

  it('try-this 2: T = 400 on the same seed has no false suspicion; the closed-form detection time moves from 156 ms to 371 ms', () => {
    const s = initialTimeout();
    const d = runDetector(setupFor({ ...s.controls, timeoutMs: 400 }, 'quiet'), 10_000);
    expect(falseSuspicions(d)).toEqual([]);
    const crash = runDetector(setupFor({ ...s.controls, timeoutMs: 400 }, 'crash'), 10_000);
    expect(detectionTime(crash)).not.toBeNull();
    expect([detectionMean(185, 20), detectionMean(400, 20)]).toEqual([156, 371]);
    expect(lesson.tryThis[1]).toContain('from 156 ms to 371 ms');
  });

  it('try-this 3: the runs part after 5,400 ms, so saying "paused" there is refused as a guess because run A is dead', () => {
    const s = initialCrashPause();
    expect([s.pauseMs, s.decideAt, s.seed]).toEqual([600, DEFAULT_DECIDE_AT, BROKEN_SEED]);
    const twin = twinRuns(s.seed, s.pauseMs);
    expect(twin.partsAt!).toBeGreaterThan(s.decideAt);
    const v = judge(twin, s.decideAt, 'paused');
    expect(v.indistinguishable).toBe(true);
    expect(v.text).toContain('In run A the peer is dead');
    expect(lesson.tryThis[2]).toContain(`about ${Math.round(twin.partsAt!)} ms`);
    expect(lesson.tryThis[2]).toContain('5,400 ms');
  });

  it('try-this 4: SWIM at the defaults is wrong in 19.00% of periods with k = 0 and 0.77% with k = 3', () => {
    const s = initialSwim();
    expect([s.loss, s.k, s.cut]).toEqual([0.1, 0, 'none']);
    expect(swimEnumerated(0.1, 0, 'none')).toBeCloseTo(0.19, 12);
    expect(swimEnumerated(0.1, 3, 'none')).toBeCloseTo(0.0077277, 7);
    expect(lesson.tryThis[3]).toContain('19.00%');
    expect(lesson.tryThis[3]).toContain('0.77%');
  });

  it('try-this 5: with the link cut both ways and no loss, k = 0 suspects B every period and k = 1 stops it', () => {
    const base = { ...initialSwim(), loss: 0, cut: 'both' as const };
    expect(swimFalseSuspicions(runSwim({ ...base, k: 0 }))).toBe(base.periods);
    expect(swimFalseSuspicions(runSwim({ ...base, k: 1 }))).toBe(0);
    expect(lesson.tryThis[4]).toContain('"M and B cut both ways"');
  });
});

describe('every scene opens from a pure state, and its caption is built from the model', () => {
  it('the four opening states are independent values', () => {
    expect(initialTimeout()).not.toBe(initialTimeout());
    expect(initialTimeout().controls).toEqual(defaultSetup());
    expect(initialPhi()).toEqual({ seed: BROKEN_SEED, jitterMs: 20, phi: 8 });
    expect(initialSwim().periods).toBe(2_000);
    expect(initialCrashPause().answered).toBeNull();
  });

  it('captions carry numbers the model produced', () => {
    const s = initialTimeout();
    expect(captionText(timeoutCaption(s, null))).toContain('Press Run 10 s');
    expect(captionText(timeoutCaption({ ...s, ran: 'quiet' }, 2))).toContain('2 false suspicions');
    const twin = twinRuns(BROKEN_SEED, 600);
    expect(crashPauseCaption(twin, initialCrashPause())).toContain(`${Math.round(twin.partsAt!)} ms`);
    expect(crashPauseCaption(twin, { ...initialCrashPause(), answered: { guess: 'paused', decideAt: 5_400 } })).toContain('this answer was a guess');
    expect(swimCaption(initialSwim(), swimEnumerated(0.1, 0, 'none'))).toContain('19.00%');
  });
});

describe('quiz balance', () => {
  it('the correct option is strictly the longest in at most one question of five', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(1);
  });
});
