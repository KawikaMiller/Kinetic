import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import {
  STEP_TICKS, anyMitigation, backlogAtTriggerEnd, effectiveFor, fixCaption, fixParams, initialFix, initialLoop, loopCaption, phaseText, shedText, sustainText, sweepDrainNote,
  tippingText,
} from './init';
import lesson from './index';
import {
  BROKEN_SEED, CAPACITY, FIX_RUN_TICKS, LOAD, LONG_OUTAGE, RUN_TICKS, TRIGGER_START, collapseMechanism, collapseShare, crossoverLoad, defaultParams, isCollapsed, phaseOf, runMeta,
  backlogAfter, shedCrossover, sustainVerdict,
} from './model';

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
    expect(at(6).phase).toBe('recovered');
    expect(typeof at(6).recoveredAt).toBe('number');
    expect(lesson.tryThis[1]).toContain(`"${phaseText(at(6).phase, at(6).recoveredAt)}" at 6`);
    expect(lesson.tryThis[1]).not.toContain('tick null');
    expect(lesson.tryThis[1]).toContain(`"${phaseText(at(7).phase, at(7).recoveredAt)}" at 7`);
    expect(at(7).phase).toBe('collapsed');
  });

  it('try-this 3: with R = 0 the run recovers and the sustain panel says the queue drains on its own; R = 3 brings the loop back', () => {
    const none = phaseOf(runMeta({ ...base, retries: 0 }));
    expect(none.phase).toBe('recovered');
    expect(sustainText({ lambda: 70, retries: 0 })).toContain('the queue drains on its own');
    expect(sustainText({ lambda: 70, retries: 3 })).toContain('the loop can sustain itself');
    expect(sustainText({ lambda: 70, retries: 0 })).toContain('on average');
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

describe('on-screen claims come from the model (review fixes)', () => {
  it('no try-this prints "null" or "undefined"', () => {
    for (const t of lesson.tryThis) expect(t).not.toMatch(/\bnull\b|undefined/);
  });

  it('the sustain text agrees with what runs do: "drains" never collapses eventually, "sustains" collapses on nearly every seed, and the noise band is named', () => {
    const eventually = (lambda: number, retries: number) => {
      let bad = 0;
      for (let seed = 1; seed <= 20; seed++) if (isCollapsed(runMeta({ ...defaultParams(), lambda, retries, trigger: 30, seed }, 400))) bad += 1;
      return bad / 20;
    };
    for (const retries of [0, 1, 3, 5]) {
      for (const lambda of [25, 35, 45, 55, 65, 75, 85, 95]) {
        const verdict = sustainVerdict(lambda, retries);
        const text = sustainText({ lambda, retries });
        if (verdict === 'drains') {
          expect(text, `${lambda}/${retries}`).toContain('drains on its own');
          expect(eventually(lambda, retries), `drains ${lambda}/${retries}`).toBeLessThanOrEqual(0.1);
        } else if (verdict === 'sustains') {
          expect(text).toContain('can sustain itself');
          // A 30-tick trigger only starts the loop where its backlog reaches capacity x timeout (the first-order tipping condition).
          if (backlogAfter(lambda, 30) < CAPACITY * defaultParams().timeout) continue;
          expect(eventually(lambda, retries), `sustains ${lambda}/${retries}`).toBeGreaterThanOrEqual(0.9);
        } else {
          expect(text).toContain('noise decides');
        }
      }
    }
    // The review's counterexample: load 24, 3 retries, seed 50 ends collapsed while the old text said the queue drains on its own.
    expect(isCollapsed(runMeta({ ...defaultParams(), lambda: 24, retries: 3, trigger: 30, seed: 50 }))).toBe(true);
    expect(sustainText({ lambda: 24, retries: 3 })).not.toContain('drains on its own');
  });

  it('with no retries the sweep dots above zero are slow drains: the note says so and a long run recovers them (independent of the 60-tick criterion)', () => {
    const points = [60, 80, 95].map((lambda) => ({ lambda, share: collapseShare({ ...defaultParams(), retries: 0, lambda }, 30, 40) }));
    expect(points[1]!.share).toBeGreaterThan(0.9);
    const note = sweepDrainNote(points, 0, 30);
    expect(note).toContain('slow drains');
    expect(note).toContain('load 80 (backlog 1800, about 90 ticks to drain)');
    expect(note).toContain('no crossover in this range at R = 0');
    // Backlog 30 x (80 - 20) = 1800 drains at 100 - 80 = 20 a tick: recovered well inside 400 ticks, so it is not the loop.
    for (const seed of [1, 2, 3]) expect(phaseOf(runMeta({ ...defaultParams(), retries: 0, lambda: 80, trigger: 30, seed }, 400)).phase).toBe('recovered');
    expect(crossoverLoad(0)).toBeGreaterThan(LOAD.max);
  });

  it('the tipping text prints the first-order estimate (8) next to the measured crossing (6)', () => {
    const points = [4, 5, 6, 7, 8].map((trigger) => ({ trigger, none: collapseShare(defaultParams(), trigger, 100) }));
    expect(tippingText(points)).toContain('= 8 ticks');
    expect(tippingText(points)).toContain('crosses 50% at d = 6');
    expect(tippingText(null)).toContain('Measure to see');
  });

  it('shedding: the measured crossover sits between 440 and 460 on the page, a limit of 1000 stays collapsed, and the caption says so instead of "keeps the backlog bounded"', () => {
    const share = (q: number) => collapseShare({ ...defaultParams(), shed: q }, defaultParams().trigger, 100);
    for (const q of [300, 400, 440]) expect(share(q)).toBeLessThan(0.5);
    for (const q of [460, 600, 1000]) expect(share(q)).toBeGreaterThanOrEqual(0.5);
    expect(shedCrossover()).toBeGreaterThan(440);
    expect(shedCrossover()).toBeLessThanOrEqual(460);
    expect(shedText()).toContain(`about ${shedCrossover()}`);
    expect(shedText()).toContain('capacity x timeout = 400');
    const p = fixParams({ ...initialFix(), shedOn: true, qmax: 1000 });
    const run = runMeta(p, FIX_RUN_TICKS);
    const { phase, recoveredAt } = phaseOf(run);
    expect(phase).toBe('collapsed');
    const text = captionText(fixCaption(p, run, phase, recoveredAt));
    expect(text).not.toContain('keeps the backlog bounded');
    expect(text).toContain('did not keep the queue short enough');
    expect(lesson.keyIdeas[2]).toContain(`about ${shedCrossover()}`);
    const ok = fixParams({ ...initialFix(), shedOn: true, qmax: 300 });
    const okRun = runMeta(ok, FIX_RUN_TICKS);
    expect(phaseOf(okRun).phase).toBe('recovered');
    expect(captionText(fixCaption(ok, okRun, 'recovered', phaseOf(okRun).recoveredAt))).toContain('Shedding bounds the queue itself');
  });

  it('the long-outage caption says it is not metastable, and a one-tick recovery says "1 tick"', () => {
    const p = fixParams({ ...initialFix(), long: true, budgetOn: true });
    const run = runMeta(p, FIX_RUN_TICKS);
    const { phase, recoveredAt } = phaseOf(run);
    const text = captionText(fixCaption(p, run, phase, recoveredAt));
    expect(text).toContain('not a metastable failure');
    expect(text).toContain('first-order estimate');
    const cancel = fixParams({ ...initialFix(), cancel: true });
    const cancelRun = runMeta(cancel, FIX_RUN_TICKS);
    const one = captionText(fixCaption(cancel, cancelRun, 'recovered', TRIGGER_START + cancel.trigger + 1));
    expect(one).toContain('recovered 1 tick after');
    expect(one).not.toContain('1 ticks');
  });
});

describe('quiz balance', () => {
  it('the correct option is strictly the longest in at most one question of five', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(1);
  });
});
