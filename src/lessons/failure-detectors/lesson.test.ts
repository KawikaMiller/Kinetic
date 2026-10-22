import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import {
  CUT_NAMES, DEFAULT_DECIDE_AT, closedFormNote, crashPauseCaption, dotRatios, initialCrashPause, initialPhi, initialSwim, initialTimeout, phiMeasuredSub, phiTailHint, seedSweepText,
  swimCaption, swimExactSub, timeoutCaption,
} from './init';
import lesson from './index';
import {
  BROKEN_SEED, SWEEP_SEEDS, SWEEP_TIMEOUTS, defaultSetup, detectionMean, detectionTime, expectedFalseInRun, failingSeeds, falseSuspicions, judge, measurePoint, phiReadout,
  runDetector, runSwim, setupFor, swimEnumerated, swimFalseSuspicions, twinRuns, waitAtFirstFalse,
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

describe('on-screen claims are computed from the model (review fixes)', () => {
  const bad = (timeoutMs: number, jitterMs: number, rule: 'fixed' | 'phi' = 'fixed', phi = 8) => {
    const out: number[] = [];
    for (let seed = 1; seed <= SWEEP_SEEDS; seed++) {
      if (falseSuspicions(runDetector({ ...defaultSetup(), seed, timeoutMs, jitterMs, rule, phi }, 10_000)).length > 0) out.push(seed);
    }
    return out;
  };

  it('the seed-sweep line prints k of 200, the lowest failing seed and the sampled label, counted by a second route (end-of-run suspicions)', () => {
    const c = defaultSetup();
    const text = seedSweepText(c, failingSeeds(c));
    const own = bad(c.timeoutMs, c.jitterMs);
    expect(text).toContain(`fails on ${own.length} of 200 seeds`);
    expect(text).toContain(`lowest failing seed ${own[0]}`);
    expect(own[0]).toBe(BROKEN_SEED);
    expect(text).toContain('Sampled over seeds 1 to 200, not exhaustive');
    const calm = { ...c, timeoutMs: 400 };
    expect(seedSweepText(calm, failingSeeds(calm))).toContain('fails on 0 of 200 seeds');
    const phiSetup = { ...c, rule: 'phi' as const, phi: 3 };
    expect(seedSweepText(phiSetup, failingSeeds(phiSetup))).toContain(`fails on ${bad(c.timeoutMs, c.jitterMs, 'phi', 3).length} of 200 seeds`);
  });

  it('the closed-form note states the measured ratios (not "a few per cent") and they match the dots', () => {
    const points = SWEEP_TIMEOUTS.map((t) => measurePoint(defaultSetup(), t));
    const note = closedFormNote(points, 20);
    expect(note).not.toContain('a few per cent');
    const r = dotRatios(points, 20)!;
    expect(note).toContain(`${Math.round(r.to.ratio * 100)}% at T = ${r.to.timeoutMs} ms`);
    expect(r.from.ratio).toBeGreaterThan(0.9);
    expect(r.to.ratio).toBeLessThan(0.1);
    expect(closedFormNote(null, 20)).toContain('Measure to see');
  });

  it('the phi hint says above, below or equal from the closed form: below at phi 1, above at phi 8', () => {
    const lowPhi = phiReadout(BROKEN_SEED, 20, 1);
    const highPhi = phiReadout(BROKEN_SEED, 20, 8);
    expect(phiTailHint(lowPhi, 1)).toContain('below the model');
    expect(phiTailHint(highPhi, 8)).toContain('above the model');
    expect(phiTailHint(highPhi, 8)).not.toContain('far above');
    // Measured phi 1 is under 10% (review: 5.86%), so "below" is what the learner's own number shows.
    expect(lowPhi.exceeded / lowPhi.gaps).toBeLessThan(0.1);
  });

  it('the measured phi stat sub reports the expected count and says when there are too few events to compare', () => {
    const highPhi = phiReadout(BROKEN_SEED, 20, 8);
    expect(phiMeasuredSub(highPhi)).toContain('too few to compare');
    const midPhi = phiReadout(BROKEN_SEED, 20, 3);
    expect(phiMeasuredSub(midPhi)).toMatch(/so arrival order gives \d+% of it/);
  });

  it('phi mode: the wait at the first false suspicion is the silence M actually waited, and it is named in the caption', () => {
    const setup = { ...defaultSetup(), rule: 'phi' as const, phi: 1 };
    const d = runDetector(setup, 10_000);
    const n = falseSuspicions(d).length;
    expect(n).toBeGreaterThan(0);
    const first = falseSuspicions(d)[0]!;
    const lastArrival = d.monitor.arrivals.filter((a) => a < first).at(-1) ?? 0;
    expect(waitAtFirstFalse(d)).toBe(first - lastArrival);
    const caption = timeoutCaption({ ...initialTimeout(), controls: setup, ran: 'quiet' }, n, waitAtFirstFalse(d));
    expect(caption).toContain(`after only ${Math.round(first - lastArrival)} ms of silence`);
  });

  it('the swim caption names the cut that is on, and the exact stat says the direct messages cannot succeed under a cut', () => {
    for (const cut of ['both', 'm-to-b', 'b-to-m'] as const) {
      const s = { ...initialSwim(), cut };
      expect(swimCaption(s, swimEnumerated(s.loss, s.k, cut))).toContain(CUT_NAMES[cut]);
      expect(swimExactSub(s, 4)).toContain('cannot succeed');
    }
    expect(swimCaption(initialSwim(), 0.19)).not.toContain('cut');
    expect(swimExactSub(initialSwim(), 4)).not.toContain('cannot succeed');
  });

  it('after the runs part, "crashed" and "paused" get different verdicts, each naming the run it is right in', () => {
    const twin = twinRuns(BROKEN_SEED, 600);
    const late = twin.partsAt! + 100;
    const c = judge(twin, late, 'crashed');
    const p = judge(twin, late, 'paused');
    expect(c.indistinguishable).toBe(false);
    expect(c.scope).toContain('right in run A only');
    expect(p.scope).toContain('right in run B only');
    expect(c.scope).not.toBe(p.scope);
  });

  it('quiz: the correct option is the longest (ties included) in at most one question', () => {
    const tied = lesson.quiz.filter((q) => {
      const len = q.options.map((o) => o.length);
      return len[q.answer] === Math.max(...len);
    }).length;
    expect(tied).toBeLessThanOrEqual(1);
  });

  it('no try-this prints "null" or "undefined"', () => {
    for (const t of lesson.tryThis) expect(t).not.toMatch(/\bnull\b|undefined/);
  });
});
