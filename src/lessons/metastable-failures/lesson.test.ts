import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import {
  STEP_TICKS, anyMitigation, backlogAtTriggerEnd, effectiveFor, fixCaption, fixParams, initialFix, initialLoop, loopCaption, phaseText, sustainText,
} from './init';
import lesson from './index';
import { BROKEN_SEED, CAPACITY, FIX_RUN_TICKS, LONG_OUTAGE, RUN_TICKS, TRIGGER_START, collapseMechanism, collapseShare, defaultParams, phaseOf, runMeta } from './model';

const base = { ...defaultParams(), seed: BROKEN_SEED };

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: the defaults collapse, wasted work sits at 100 and arrivals near 280', () => {
    const s = initialLoop();
    expect([s.params.lambda, s.params.timeout, s.params.retries, s.params.trigger, s.params.seed, s.shown]).toEqual([70, 4, 3, 10, BROKEN_SEED, 0]);
    const run = runMeta(s.params);
    expect(phaseOf(run).phase).toBe('collapsed');
    const m = collapseMechanism(run);
    expect(m.wastedShare).toBeGreaterThanOrEqual(0.95);
    expect(lesson.tryThis[0]).toContain('"still collapsed at tick 200"');
    expect(lesson.tryThis[0]).toContain(`near ${Math.round(m.arrivals)}`);
    expect(lesson.tryThis[0]).toContain('70 x 4 = 280');
  });

  it('try-this 2: d = 5 recovers on this seed (and on all of them); d = 6 and 7 are the seed\'s own phases', () => {
    const at = (trigger: number) => phaseOf(runMeta({ ...base, trigger }));
    expect(at(5).phase).toBe('recovered');
    expect(collapseShare(defaultParams(), 5)).toBe(0);
    expect(lesson.tryThis[1]).toContain(`recovers at tick ${at(5).recoveredAt}`);
    expect(lesson.tryThis[1]).toContain(`"${phaseText(at(6).phase, null)}" at 6`);
    expect(lesson.tryThis[1]).toContain(`"${phaseText(at(7).phase, null)}" at 7`);
    expect(at(7).phase).toBe('collapsed');
  });

  it('try-this 3: with R = 0 the run recovers and the sustain panel says the queue drains on its own; R = 3 brings the loop back', () => {
    const none = phaseOf(runMeta({ ...base, retries: 0 }));
    expect(none.phase).toBe('recovered');
    expect(sustainText({ lambda: 70, retries: 0 })).toContain('the queue drains on its own');
    expect(sustainText({ lambda: 70, retries: 3 })).toContain('the loop can sustain itself');
    expect(lesson.tryThis[2]).toContain(`recovered at tick ${none.recoveredAt}`);
    expect(phaseOf(runMeta(base)).phase).toBe('collapsed');
  });

  it('try-this 4: skipping abandoned work recovers; backoff alone (J = 4) is still collapsed', () => {
    const s = initialFix();
    expect(anyMitigation(s)).toBe(false);
    const cancel = phaseOf(runMeta(fixParams({ ...s, cancel: true })));
    expect(cancel.phase).toBe('recovered');
    expect(lesson.tryThis[3]).toContain(`recovered at tick ${cancel.recoveredAt}`);
    const run = runMeta(fixParams({ ...s, cancel: true }));
    const after = run.stats.slice(-30);
    expect(after.reduce((a, x) => a + x.goodput, 0) / 30).toBeGreaterThan(60);
    expect(phaseOf(runMeta(fixParams({ ...s, jitterOn: true }))).phase).toBe('collapsed');
    expect(lesson.tryThis[3]).toContain('still collapsed');
  });

  it('try-this 5: a 60-tick outage with a 10% budget recovers about 130 ticks after the trigger, and the caption prints the formula', () => {
    const p = fixParams({ ...initialFix(), long: true, budgetOn: true });
    expect(p.trigger).toBe(LONG_OUTAGE);
    const run = runMeta(p, FIX_RUN_TICKS);
    const { phase, recoveredAt } = phaseOf(run);
    expect(phase).toBe('recovered');
    const after = recoveredAt! - (TRIGGER_START + LONG_OUTAGE);
    expect(Math.abs(after - 130)).toBeLessThan(15);
    expect(lesson.tryThis[4]).toContain(`${after} ticks after the trigger`);
    const text = captionText(fixCaption(p, run, phase, recoveredAt));
    expect(text).toContain('to drain');
    expect(text).toContain(`(${CAPACITY} - 77)`);
    expect(backlogAtTriggerEnd(run)).toBeGreaterThan(3000);
  });
});

describe('captions and panels come from the model', () => {
  it('the opening caption, a mid-run caption and a finished caption', () => {
    const s = initialLoop();
    expect(captionText(loopCaption(s.params, 0, 'collapsed', null))).toContain('Press Run 200 ticks');
    expect(captionText(loopCaption(s.params, STEP_TICKS, 'collapsed', null))).toContain(`Tick ${STEP_TICKS} of 200`);
    expect(captionText(loopCaption(s.params, RUN_TICKS, 'collapsed', null))).toContain('still collapsed at tick 200');
  });

  it('the effective load depends on the mitigations: cancel counts only live load, shedding has no formula, a budget adds its capped retries', () => {
    const f = initialFix();
    expect(effectiveFor(fixParams(f))).toBe(280);
    expect(effectiveFor(fixParams({ ...f, cancel: true }))).toBe(70);
    expect(effectiveFor(fixParams({ ...f, budgetOn: true }))).toBeCloseTo(77, 12);
    expect(effectiveFor(fixParams({ ...f, shedOn: true }))).toBeNull();
  });

  it('every control of the fix scene reaches the params, and the preset sets d = 60', () => {
    const f = initialFix();
    expect(fixParams({ ...f, ratio: 0.5, budgetOn: false }).budget).toBeNull();
    expect(fixParams({ ...f, ratio: 0.5, budgetOn: true }).budget).toBe(0.5);
    expect(fixParams({ ...f, jitter: 8, jitterOn: true }).jitter).toBe(8);
    expect(fixParams({ ...f, qmax: 1000, shedOn: true }).shed).toBe(1000);
    expect(fixParams({ ...f, long: true }).trigger).toBe(60);
    expect(fixParams({ ...f, qmax: 1000 }).shed).toBeNull();
  });
});

describe('quiz balance', () => {
  it('the correct option is strictly the longest in at most one question of five', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(1);
  });
});
