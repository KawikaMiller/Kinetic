import { describe, expect, it } from 'vitest';
import { TOPICS } from '../../core/curriculum';
import { lintLesson } from '../../core/lessonContent';
import { unscopedAbsolutes } from '../../core/lessonContentT3';
import { expectCaption } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { delayCaption, driftCaption, falseCaption, gateCaption, leakCaption } from './captions';
import { THRESHOLDS, cleanReadings, falseAlarmRate, streamSpread } from './falseAlarm';
import { KS_STEP_NEAR_CRITICAL, accuracySplit, delayFacts, delaySetting, driftFacts, driftSetting, falseFacts, gateFacts, leakFacts } from './facts';
import { TEST_SIZES, evaluate, gate } from './gate';
import lesson from './index';
import { DELAY_DEFAULT, DELAY_SHIFT, DRIFT_DEFAULT, DRIFT_LABEL_DELAY, FALSE_DEFAULT, GATE_DEFAULT, LEAK_DEFAULT } from './settings';
import { alarms, shiftDayOf, simulate } from './stream';

describe('scene switches', () => {
  it('every scene is its own keyed component', () => {
    expect(sceneElements('model-evals-drift')).toHaveLength(5);
    expect(sharedSceneComponents('model-evals-drift')).toEqual([]);
    expect(sceneElements('model-evals-drift').every((e) => e.keyed)).toBe(true);
  });

  it('each scene opens on the state its try-this assumes', () => {
    expect(DRIFT_DEFAULT).toEqual({ kind: 'covariate', day: 20, sizePct: 80, seed: 5, shownDay: 25 });
    expect(DELAY_DEFAULT).toEqual({ kind: 'concept', delay: 7, seed: 5 });
    expect(DELAY_SHIFT).toEqual({ day: 20, sizePct: 60 });
    expect(FALSE_DEFAULT).toEqual({ metric: 'ks', threshold: 0.08 });
    expect(GATE_DEFAULT).toEqual({ sizeIndex: 2, rule: 'overall' });
    expect(TEST_SIZES[GATE_DEFAULT.sizeIndex]).toBe(300);
    expect(LEAK_DEFAULT).toEqual({ leaked: false });
  });
});

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: covariate shift trips the input monitors on day 20 and lowers accuracy; concept drift lowers it with silent monitors', () => {
    const f = driftFacts();
    expect(f.alarms.input).toBe(20);
    expect(f.before).toBeGreaterThan(f.after);
    expect(f.concept.alarms.input).toBeNull();
    expect(f.concept.after).toBeLessThan(f.after);
    expect(lesson.tryThis[0]).toContain('the input monitors fire on day 20');
    expect(lesson.tryThis[0]).toContain('stay silent');
  });

  it('try-this 2: a 7-day delay puts the accuracy alarm on day 27, no delay on day 20, and a covariate shift trips the inputs', () => {
    const f = delayFacts();
    expect(f.seven.input).toBeNull();
    expect([f.seven.accuracy, f.zero.accuracy, f.covariate.input]).toEqual([27, 20, 20]);
    expect(lesson.tryThis[1]).toContain('day 27');
  });

  it('try-this 3: a KS threshold of 0.08 alerts on over a quarter of clean days, the 5% critical value on about 5%, PSI 0.10 on about a tenth', () => {
    const f = falseFacts();
    expect(f.start).toBeGreaterThan(0.25);
    expect(f.ksAt011).toBeGreaterThan(0.03);
    expect(f.ksAt011).toBeLessThan(0.07);
    expect(KS_STEP_NEAR_CRITICAL).toBeCloseTo(f.ks, 2);
    expect(f.psiWatch).toBeGreaterThan(0.05);
    expect(f.psiAlert).toBeLessThan(0.005);
    const c = cleanReadings();
    expect(f.start).toBe(c.readings.filter((r) => r.ks > 0.08).length / c.readings.length);
  });

  it('try-this 4: at 300 examples v2 is within noise and the strict gate blocks; at 5,000 the interval excludes 0 and it still blocks', () => {
    const f = gateFacts();
    expect(f.open.n).toBe(300);
    expect(f.overall.ship).toBe(true);
    expect(f.slices.ship).toBe(false);
    expect(f.open.interval.lo).toBeLessThan(0);
    expect(f.big.interval.lo).toBeGreaterThan(0);
    expect(f.bigSlices.ship).toBe(false);
    expect(lesson.tryThis[3]).toContain('which includes 0');
  });

  it('try-this 5: leaking the test items takes the memoriser to 100% on them and leaves fresh data lower', () => {
    const f = leakFacts();
    expect(f.on.memoriser.test).toBe(1);
    expect(f.off.memoriser.test).toBeLessThan(1);
    expect(f.on.memoriser.fresh).toBeLessThan(f.on.memoriser.test);
    expect(lesson.tryThis[4]).toContain('100.0% on the test set');
  });
});

describe('captions follow the controls', () => {
  it('the drift caption states the alarms it computed, over both kinds and every shift size', () => {
    for (const kind of ['covariate', 'concept'] as const) {
      for (const sizePct of [0, 20, 40, 60, 80, 100]) {
        const setting = driftSetting({ kind, sizePct });
        const stream = simulate(setting);
        const a = alarms(stream, DRIFT_LABEL_DELAY, shiftDayOf(setting));
        const { before, after } = accuracySplit(stream, setting.day);
        const c = expectCaption(driftCaption(kind, setting.day, sizePct, before, after, a));
        if (sizePct === 0) expect(c).toContain('No shift is applied');
        else expect(c).toContain(`input monitors first fire on ${a.input === null ? 'never' : `day ${a.input}`}`);
      }
    }
  });

  it('the delay caption states the gap between the damage and the alarm, over every delay', () => {
    for (const kind of ['covariate', 'concept'] as const) {
      for (const delay of [0, 1, 7, 14]) {
        const stream = simulate(delaySetting({ kind, labelDelay: delay }));
        const a = alarms(stream, delay, DELAY_SHIFT.day);
        const c = expectCaption(delayCaption(kind, delay, DELAY_SHIFT.day, a));
        if (a.accuracy !== null) expect(c).toContain(`${a.accuracy - DELAY_SHIFT.day} day`);
        else expect(c).toContain('does not fire');
        expect(c.includes('inputs look unchanged')).toBe(kind === 'concept');
        expect(c.includes('only the labels reveal')).toBe(kind === 'concept');
        expect(c.includes('ordinary false alarm')).toBe(kind === 'concept' && a.input !== null);
      }
    }
  });

  it('the false-alarm caption prints the measured rate for both monitors at several thresholds', () => {
    const c = cleanReadings();
    for (const [metric, t] of [['ks', 0.04], ['ks', 0.2], ['psi', 0.02], ['psi', 0.3]] as const) {
      const rate = falseAlarmRate(c, metric, t);
      expect(expectCaption(falseCaption(metric, t, rate, streamSpread(c, metric, t)))).toContain(`${(rate * 100).toFixed(1)}%`);
    }
  });

  it('the gate caption says "within noise" exactly when the interval includes 0, over every test size and both rules', () => {
    for (const n of TEST_SIZES) {
      for (const rule of ['overall', 'slices'] as const) {
        const e = evaluate(n);
        const c = expectCaption(gateCaption(e, rule, gate(e, rule)));
        expect(c.includes('within noise'), `${n} ${rule}`).toBe(e.interval.lo <= 0 && e.interval.hi >= 0);
        expect(c.includes('ships v2') || c.includes('blocks v2')).toBe(true);
      }
    }
  });

  it('the leakage caption names the state the toggle is in', () => {
    for (const leaked of [false, true]) {
      const f = leakFacts();
      const c = expectCaption(leakCaption(leaked, leaked ? f.on : f.off));
      expect(c.includes('copied') || c.includes('were added')).toBe(leaked);
      expect(c.includes('held out')).toBe(!leaked);
    }
  });
});

describe('nothing hidden feeds a number', () => {
  it('the drift scene has no label-delay control, so its accuracy alarm uses a delay of 0', () => {
    expect(DRIFT_LABEL_DELAY).toBe(0);
    expect(driftSetting().labelDelay).toBe(0);
    expect(delaySetting().sizePct).toBe(DELAY_SHIFT.sizePct);
    expect(delaySetting().day).toBe(DELAY_SHIFT.day);
  });

  it('the shift-day and seed controls change the stream and nothing else', () => {
    const a = simulate(driftSetting({ day: 20 }));
    const b = simulate(driftSetting({ day: 30 }));
    expect(a.days.slice(0, 19)).toEqual(b.days.slice(0, 19));
    expect(a.days[25]).not.toEqual(b.days[25]);
  });
});

describe('lesson content', () => {
  it('has five try-this entries, five questions, and passes the content lint', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(1);
    expect(lintLesson(lesson, new Set(TOPICS.map((t) => t.id)))).toEqual([]);
    expect(unscopedAbsolutes(lesson.keyIdeas.join(' '))).toEqual([]);
    for (const q of lesson.quiz) expect(unscopedAbsolutes(q.why), q.why).toEqual([]);
  });

  it('quiz 2 says over a quarter of clean days alert at 0.08, which the measurement supports', () => {
    expect(falseFacts().start).toBeGreaterThan(0.25);
    expect(lesson.quiz[1].options[lesson.quiz[1].answer]).toContain('over a quarter');
  });
});

describe('the controls can reach the numbers the text quotes', () => {
  const onGrid = (metric: 'ks' | 'psi', value: number) => {
    const t = THRESHOLDS[metric];
    const steps = (value - t.min) / t.step;
    return value >= t.min && value <= t.max && Math.abs(steps - Math.round(steps)) < 1e-9;
  };

  it('try-this 3: KS 0.08 and 0.11 and PSI 0.10 and 0.25 are all slider positions (M-EV2: PSI 0.25 used to snap to 0.26)', () => {
    expect(onGrid('ks', 0.08)).toBe(true);
    expect(onGrid('ks', KS_STEP_NEAR_CRITICAL)).toBe(true);
    expect(onGrid('psi', 0.1)).toBe(true);
    expect(onGrid('psi', 0.25)).toBe(true);
    expect(lesson.tryThis[2]).toContain('at 0.25');
  });
});

describe('early false alarms are reported apart from detection (M-EV1)', () => {
  it('seed 6, concept drift, 7-day delay: an input alert before the shift is a false alarm, and the caption still says only the labels reveal the damage', () => {
    const setting = delaySetting({ seed: 6 });
    const a = alarms(simulate(setting), setting.labelDelay, DELAY_SHIFT.day);
    expect(a.falseInputDays).toBeGreaterThan(0);
    const c = expectCaption(delayCaption('concept', setting.labelDelay, DELAY_SHIFT.day, a));
    expect(c).toContain('only the labels reveal');
    expect(c).toContain('false alarms on');
    if (a.input !== null) expect(a.input).toBeGreaterThanOrEqual(DELAY_SHIFT.day);
  });

  it('no alert is ever dated before the shift day, over 50 seeds and both kinds', () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (const kind of ['covariate', 'concept'] as const) {
        const setting = driftSetting({ kind, seed });
        const a = alarms(simulate(setting), 0, shiftDayOf(setting));
        for (const day of [a.input, a.psi, a.ks]) if (day !== null) expect(day).toBeGreaterThanOrEqual(setting.day);
      }
    }
  });
});
