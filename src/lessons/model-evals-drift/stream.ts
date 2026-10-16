/** A monitored stream: 40 daily batches through the trained model, with the input monitors and the delayed accuracy alarm. */
import { makeBaseline, readDay, ksCritical2, PSI_ALERT, type Baseline } from './monitors';
import { BATCH, DAYS, TRAIN_SEED, accuracy, dayBatch, trainModel, type Example, type Model, type Shift } from './world';

export interface DriftSetting extends Shift {
  /** First day (1-based) the shift applies. */
  day: number;
  seed: number;
  /** Days between a batch and the day its labels arrive. */
  labelDelay: number;
}

export interface Day {
  day: number;
  accuracy: number;
  psi: number;
  ks: number;
}

export interface Stream {
  model: Model;
  baseline: Baseline;
  days: Day[];
  ksCritical: number;
}

/** Accuracy below this raises the accuracy alarm. Illustrative. */
export const ACCURACY_ALARM = 0.8;

/** A feature the monitors watch: x1 of each example. */
const feature = (batch: readonly Example[]): number[] => batch.map((e) => e.x[0]);

export type BaselineSource = 'training' | 'post-shift';

const trained = new Map<number, ReturnType<typeof trainModel>>();
const trainedFor = (seed: number) => {
  let t = trained.get(seed);
  if (!t) {
    t = trainModel(seed);
    trained.set(seed, t);
  }
  return t;
};

export function simulate(s: DriftSetting, baselineFrom: BaselineSource = 'training'): Stream {
  const { model, train } = trainedFor(TRAIN_SEED);
  const shiftAt = (day: number): Shift | null => (s.sizePct > 0 && day >= s.day ? { kind: s.kind, sizePct: s.sizePct } : null);
  const batches = Array.from({ length: DAYS }, (_, i) => dayBatch(s.seed, i + 1, shiftAt(i + 1)));
  // The faulty detector sets its baseline from data after the shift, so it compares the shifted world with itself.
  const reference = baselineFrom === 'training' ? train.map((t) => t.x[0]) : batches.slice(s.day - 1).flatMap(feature);
  const baseline = makeBaseline(reference);
  const days = batches.map((batch, i) => ({ day: i + 1, accuracy: accuracy(model, batch), ...readDay(baseline, feature(batch)) }));
  return { model, baseline, days, ksCritical: ksCritical2(BATCH, baseline.sample.length) };
}

export interface Alarms {
  /** First day an input monitor (PSI above its alert band or KS above its critical value) fires, or null. */
  input: number | null;
  /** First day the accuracy alarm fires once labels have arrived, or null. */
  accuracy: number | null;
  psi: number | null;
  ks: number | null;
}

/**
 * Accuracy for day d can be computed on day d + labelDelay, so the alarm for it fires then; the input
 * monitors need no labels and fire on the day of the batch.
 */
export function alarms(stream: Stream, labelDelay: number, horizon = DAYS): Alarms {
  const firstDay = (hit: (d: Day) => boolean, delay = 0): number | null => {
    const d = stream.days.find(hit);
    return d && d.day + delay <= horizon ? d.day + delay : null;
  };
  const psiDay = firstDay((d) => d.psi > PSI_ALERT);
  const ksDay = firstDay((d) => d.ks > stream.ksCritical);
  const input = [psiDay, ksDay].filter((d): d is number => d !== null);
  return {
    psi: psiDay,
    ks: ksDay,
    input: input.length ? Math.min(...input) : null,
    accuracy: firstDay((d) => d.accuracy < ACCURACY_ALARM, labelDelay),
  };
}
