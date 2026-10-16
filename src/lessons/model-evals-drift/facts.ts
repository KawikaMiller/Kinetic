/** The numbers the try-this entries, captions and quiz explanations quote, each computed from the model. */
import { cleanReadings, falseAlarmRate, ksFivePercent } from './falseAlarm';
import { TEST_SIZES, evaluate, gate } from './gate';
import { leakExperiment } from './leak';
import { DELAY_DEFAULT, DELAY_SHIFT, DRIFT_DEFAULT, DRIFT_LABEL_DELAY, FALSE_DEFAULT, GATE_DEFAULT } from './settings';
import { alarms, shiftDayOf, simulate, type DriftSetting, type Stream } from './stream';
import { meanOf } from './gate';

export const driftSetting = (over: Partial<DriftSetting> = {}): DriftSetting => ({
  kind: DRIFT_DEFAULT.kind, day: DRIFT_DEFAULT.day, sizePct: DRIFT_DEFAULT.sizePct, seed: DRIFT_DEFAULT.seed, labelDelay: DRIFT_LABEL_DELAY, ...over,
});

export const delaySetting = (over: Partial<DriftSetting> = {}): DriftSetting => ({
  kind: DELAY_DEFAULT.kind, day: DELAY_SHIFT.day, sizePct: DELAY_SHIFT.sizePct, seed: DELAY_DEFAULT.seed, labelDelay: DELAY_DEFAULT.delay, ...over,
});

/** Mean accuracy of the days before the shift and from it on. */
export const accuracySplit = (stream: Stream, shiftDay: number) => ({
  before: meanOf(stream.days.filter((d) => d.day < shiftDay).map((d) => d.accuracy)),
  after: meanOf(stream.days.filter((d) => d.day >= shiftDay).map((d) => d.accuracy)),
});

export function driftFacts() {
  const setting = driftSetting();
  const stream = simulate(setting);
  const conceptStream = simulate(driftSetting({ kind: 'concept' }));
  return {
    setting, stream, ...accuracySplit(stream, setting.day), alarms: alarms(stream, setting.labelDelay, shiftDayOf(setting)),
    concept: { ...accuracySplit(conceptStream, setting.day), alarms: alarms(conceptStream, setting.labelDelay, shiftDayOf(setting)) },
  };
}

export function delayFacts() {
  const concept = delaySetting();
  const stream = simulate(concept);
  const covariate = simulate(delaySetting({ kind: 'covariate' }));
  return {
    stream,
    ...accuracySplit(stream, concept.day),
    seven: alarms(stream, 7, concept.day),
    zero: alarms(stream, 0, concept.day),
    covariate: alarms(covariate, 7, concept.day),
  };
}

/** The slider step nearest the 5% critical value. */
export const KS_STEP_NEAR_CRITICAL = 0.11;

export function falseFacts() {
  const c = cleanReadings();
  const ks = ksFivePercent(c.baselineSize);
  const start = falseAlarmRate(c, FALSE_DEFAULT.metric, FALSE_DEFAULT.threshold);
  return { start, ks, ksRate: falseAlarmRate(c, 'ks', ks), ksAt011: falseAlarmRate(c, 'ks', KS_STEP_NEAR_CRITICAL), psiWatch: falseAlarmRate(c, 'psi', 0.1), psiAlert: falseAlarmRate(c, 'psi', 0.25), days: 40 * start };
}

export function gateFacts() {
  const open = evaluate(TEST_SIZES[GATE_DEFAULT.sizeIndex]);
  const big = evaluate(TEST_SIZES[TEST_SIZES.length - 1]);
  return {
    open,
    big,
    overall: gate(open, 'overall'),
    slices: gate(open, 'slices'),
    bigSlices: gate(big, 'slices'),
    sliceDrop: (e: typeof open) => (e.slice.B.accuracy.v1 - e.slice.B.accuracy.v2) * 100,
  };
}

export const leakFacts = () => ({ off: leakExperiment(false), on: leakExperiment(true) });
