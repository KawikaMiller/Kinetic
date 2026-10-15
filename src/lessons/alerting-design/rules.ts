/**
 * Alert rules over the synthetic week, pure. A rule is "the value is above `threshold` for `forMinutes`
 * consecutive minutes"; it fires once when the condition has held that long and stays firing until the
 * condition clears, so each firing episode is one page. A for-duration of 0 or 1 fires at the first minute.
 */
import { DISK_FULL_AT, INCIDENTS, incidentEnd, type Incident } from './week';

export type Metric = 'errors' | 'cpu';
export const METRIC_LABEL: Record<Metric, string> = { errors: 'Checkout error ratio', cpu: 'CPU' };
export const METRIC_UNIT = '%';
/** Slider ranges per metric: the error ratio tops out at 40%, CPU at 100%. */
export const THRESHOLD_RANGE: Record<Metric, { min: number; max: number; step: number }> = {
  errors: { min: 0, max: 40, step: 0.1 },
  cpu: { min: 0, max: 100, step: 1 },
};
export const FOR_MAX = 30;

/** The minutes at which a page fires, found by walking the runs of minutes above the threshold. */
export function pageMinutes(series: readonly number[], threshold: number, forMinutes: number): number[] {
  const need = Math.max(1, forMinutes);
  const fires: number[] = [];
  let t = 0;
  while (t < series.length) {
    if (series[t] <= threshold) {
      t++;
      continue;
    }
    const start = t;
    while (t < series.length && series[t] > threshold) t++;
    if (t - start >= need) fires.push(start + need - 1);
  }
  return fires;
}

export interface Verdict {
  pages: number;
  /** Pages that fired inside an incident window. */
  useful: number;
  /** Pages that fired with no incident under way. */
  falsePages: number;
  /** The incidents that no page fired inside. */
  missed: Incident[];
  /** Per incident: minutes from its start to the first page inside it, or null when none. */
  timeToPage: (number | null)[];
}

export const incidentAt = (minute: number): Incident | undefined => INCIDENTS.find((i) => minute >= i.start && minute < incidentEnd(i));

/** Score a list of page minutes against the authored incidents. */
export function judge(fires: readonly number[]): Verdict {
  const useful = fires.filter((f) => incidentAt(f)).length;
  const timeToPage = INCIDENTS.map((i) => {
    const first = fires.filter((f) => f >= i.start && f < incidentEnd(i)).sort((a, b) => a - b)[0];
    return first === undefined ? null : first - i.start;
  });
  return {
    pages: fires.length,
    useful,
    falsePages: fires.length - useful,
    missed: INCIDENTS.filter((_, k) => timeToPage[k] === null),
    timeToPage,
  };
}

/** True when the condition holds for every minute of the week: one page, and it never clears. */
export const neverClears = (series: readonly number[], threshold: number): boolean => series.every((v) => v > threshold);

/** True when nothing in the week is above the threshold, so no rule on it can page. */
export const neverFires = (series: readonly number[], threshold: number): boolean => series.every((v) => v <= threshold);

// ── Scene 2: the cause alerts, the symptom alert and the honest cause alert ───────────────────────

/** The symptom alert in scene 2 is pinned: this threshold (percent) for this many minutes. */
export const SYMPTOM_THRESHOLD = 1;
export const SYMPTOM_FOR = 3;
export const CPU_CAUSE_THRESHOLD = 80;
export const DISK_CAUSE_THRESHOLD = 70;
/** The disk-full prediction: extrapolate the last window's trend, and ticket when it fills within the horizon. */
export const PREDICT_WINDOW = 360;
export const PREDICT_HORIZON = 240;

/** Least-squares slope of `series[from..to]`, per minute. */
function slope(series: readonly number[], from: number, to: number): number {
  const n = to - from + 1;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let t = from; t <= to; t++) {
    const x = t - from;
    sx += x;
    sy += series[t];
    sxy += x * series[t];
    sxx += x * x;
  }
  return (n * sxy - sx * sy) / (n * sxx - sx * sx);
}

/** Minutes until the disk fills at minute `t` if the last window's trend continued; Infinity while it is not rising. */
export function minutesToFull(disk: readonly number[], t: number): number {
  if (t < PREDICT_WINDOW) return Infinity;
  const rate = slope(disk, t - PREDICT_WINDOW + 1, t);
  return rate > 0 ? (100 - disk[t]) / rate : Infinity;
}

/** The first minute the prediction says "fills within the horizon", per firing episode of that condition. */
export function predictionFires(disk: readonly number[]): number[] {
  const flags = Array.from({ length: disk.length }, (_, t) => minutesToFull(disk, t) < PREDICT_HORIZON);
  const fires: number[] = [];
  flags.forEach((on, t) => {
    if (on && !flags[t - 1]) fires.push(t);
  });
  return fires;
}

/** Minutes between a ticket at `fire` and the disk actually filling (negative when it was late). */
export const leadTime = (fire: number): number => DISK_FULL_AT - fire;
