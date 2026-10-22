import { aucPairs, type ScoredExample } from '../../core/rocAuc';
import { logLossGradient, gradientStep, logLoss, sigmoid } from '../../core/fit';
import {
  FIRST_ASOF_DAY, LAST_ASOF_DAY, asOfTime, type EventTable, type PurchaseEvent,
} from './events';

/** A feature log for one user: the value the feature had from each timestamp on. */
export interface LogEntry {
  at: number;
  value: number;
}

export const LOG: readonly LogEntry[] = [{ at: 10, value: 2 }, { at: 20, value: 5 }, { at: 30, value: 9 }];
export const LABEL_TIMES: readonly number[] = [15, 25, 35];

export type JoinKind = 'point-in-time' | 'latest' | 'next';

export const JOIN_LABEL: Record<JoinKind, string> = {
  'point-in-time': 'point-in-time (latest at or before the label)',
  latest: 'leaky: the latest value in the whole log',
  next: 'leaky: the nearest value after the label',
};

/** The latest entry with a timestamp at or before `t`, or null when none exists yet. A linear scan, the reference. */
export function asOf(log: readonly LogEntry[], t: number): LogEntry | null {
  let best: LogEntry | null = null;
  for (const e of log) if (e.at <= t && (best === null || e.at >= best.at)) best = e;
  return best;
}

/** The same lookup by binary search over a log sorted by time. */
export function asOfBinary(log: readonly LogEntry[], t: number): LogEntry | null {
  let lo = 0;
  let hi = log.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (log[mid].at <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? null : log[lo - 1];
}

export interface JoinedRow {
  label: number;
  entry: LogEntry | null;
  /** True when the entry's timestamp is after the label time: the future leaking into the past. */
  leaks: boolean;
}

export function join(log: readonly LogEntry[], labelTimes: readonly number[], kind: JoinKind): JoinedRow[] {
  return labelTimes.map((label) => {
    let entry: LogEntry | null;
    if (kind === 'point-in-time') entry = asOf(log, label);
    else if (kind === 'latest') entry = log.length ? log.reduce((a, b) => (b.at >= a.at ? b : a)) : null;
    else entry = log.filter((e) => e.at > label).reduce<LogEntry | null>((a, b) => (a === null || b.at < a.at ? b : a), null);
    return { label, entry, leaks: entry !== null && entry.at > label };
  });
}

// ---- the measured leak ------------------------------------------------------

export const LABEL_WINDOW_DAYS = 7;
export const LABEL_LAST_DAY = LAST_ASOF_DAY - LABEL_WINDOW_DAYS;
export const FIT_STEPS = 800;
export const FIT_RATE = 0.5;

const countIn = (events: readonly PurchaseEvent[], from: number, to: number, asOfArrival?: number): number =>
  events.filter((e) => e.at > from && e.at <= to && (asOfArrival === undefined || e.arrived <= asOfArrival)).length;

export interface LabelledRow {
  user: number;
  day: number;
  label: 0 | 1;
  /** Honest feature: purchases in (t - 7, t] that had arrived by t. */
  honest: number;
  /** Leaky feature: purchases in (t - 7, t + 7], which contains the label window. */
  leaky: number;
}

/** One row per (user, as-of day) for days where the label window fits inside the stream. */
export function labelledRows(table: EventTable): LabelledRow[] {
  const rows: LabelledRow[] = [];
  for (let user = 0; user < table.users; user += 1) {
    const events = table.byUser[user];
    for (let day = FIRST_ASOF_DAY; day <= LABEL_LAST_DAY; day += 1) {
      const t = asOfTime(day);
      rows.push({
        user,
        day,
        label: countIn(events, t, t + LABEL_WINDOW_DAYS) > 0 ? 1 : 0,
        honest: countIn(events, t - LABEL_WINDOW_DAYS, t, t),
        leaky: countIn(events, t - LABEL_WINDOW_DAYS, t + LABEL_WINDOW_DAYS),
      });
    }
  }
  return rows;
}

export interface Fit {
  weights: number[];
  mean: number;
  scale: number;
  losses: number[];
}

/** A one-feature logistic regression by gradient descent on a standardised feature (core/fit). */
export function fitLogistic(xs: readonly number[], labels: readonly number[]): Fit {
  const mean = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, xs.length));
  const scale = sd === 0 ? 1 : sd;
  const z = xs.map((x) => [(x - mean) / scale]);
  let weights = [0, 0];
  const losses: number[] = [];
  for (let k = 0; k < FIT_STEPS; k += 1) {
    losses.push(logLoss(z.map((x) => sigmoid(weights[0] + weights[1] * x[0])), labels));
    weights = gradientStep(weights, logLossGradient(weights, z, labels), FIT_RATE);
  }
  return { weights, mean, scale, losses };
}

export const predict = (fit: Fit, x: number): number => sigmoid(fit.weights[0] + (fit.weights[1] * (x - fit.mean)) / fit.scale);

const aucOf = (scored: ScoredExample[]): number | null => {
  const positives = scored.filter((e) => e.label === 1).length;
  return positives === 0 || positives === scored.length ? null : aucPairs(scored);
};

export interface LeakResult {
  rows: number;
  positives: number;
  /** AUC of the model trained and scored on the leaky join: an offline number that cannot be reproduced when serving. */
  leakyOffline: number | null;
  /** AUC of the model trained and scored on the correct join. */
  correctOffline: number | null;
  /** AUC of the leaky-trained model served with the features that exist when serving (the honest ones). */
  online: number | null;
  /** The AUC of the honest feature on its own, which `online` must equal for a model with a positive weight. */
  honestFeature: number | null;
  fits: { leaky: Fit; correct: Fit };
}

export function measureLeak(table: EventTable): LeakResult {
  const rows = labelledRows(table);
  const labels = rows.map((r) => r.label);
  const leaky = fitLogistic(rows.map((r) => r.leaky), labels);
  const correct = fitLogistic(rows.map((r) => r.honest), labels);
  const score = (fit: Fit, pick: (r: LabelledRow) => number): ScoredExample[] => rows.map((r) => ({ score: predict(fit, pick(r)), label: r.label }));
  return {
    rows: rows.length,
    positives: labels.reduce<number>((a, b) => a + b, 0),
    leakyOffline: aucOf(score(leaky, (r) => r.leaky)),
    correctOffline: aucOf(score(correct, (r) => r.honest)),
    online: aucOf(score(leaky, (r) => r.honest)),
    honestFeature: aucOf(rows.map((r) => ({ score: r.honest, label: r.label }))),
    fits: { leaky, correct },
  };
}
