/** Scene 3: the rollout laid on a UTC calendar, with each region's traffic-peak window. Pure. */
import type { GanttBar, GanttLane } from '../../components/GanttLanes';
import { REGIONS, regionOf, type Plan, type Result } from './model';

export const MIN_PER_HOUR = 60;
/** Each region's peak, as UTC hours of the day (invented): start and length. */
export const PEAKS: readonly { start: number; hours: number }[] = [
  { start: 14, hours: 4 },
  { start: 17, hours: 4 },
  { start: 8, hours: 4 },
  { start: 3, hours: 4 },
];
export const DAY_HOURS = 24;
export const DEFAULT_START_HOUR = 15;
/** The calendar's day: a fixed Monday, UTC. */
export const calendarStart = (hour: number) => `2026-03-02T${String(hour).padStart(2, '0')}:00:00Z`;

export const scheduleLanes = (): GanttLane[] => REGIONS.flatMap((r) => [{ id: r, label: r }, { id: `${r}-peak`, label: `${r} peak` }]);

/** The peak window of region `r`, in hours from the rollout's start, clipped to [0, domainEnd]; null when it is outside. */
export function peakWindow(r: number, startHour: number, domainEnd: number): [number, number] | null {
  const p = PEAKS[r];
  const offset = (((p.start - startHour) % DAY_HOURS) + DAY_HOURS) % DAY_HOURS;
  for (const from of [offset - DAY_HOURS, offset]) {
    const lo = Math.max(0, from);
    const hi = Math.min(domainEnd, from + p.hours);
    if (hi > lo) return [lo, hi];
  }
  return null;
}

/** The hours the chart spans: the whole run rounded up to a quarter hour, at least half an hour. */
const DOMAIN_STEP_MIN = 15;
const DOMAIN_MIN_HOURS = 0.5;
export const domainHours = (r: Result): number =>
  Math.max(DOMAIN_MIN_HOURS, (Math.ceil(Math.max(0, ...r.stages.map((s) => s.end), r.detectedAt ?? 0, r.revertAt ?? 0) / DOMAIN_STEP_MIN) * DOMAIN_STEP_MIN) / MIN_PER_HOUR);

/** Which regions a stage reaches for the first time. */
function newRegions(plan: Plan, k: number): number[] {
  const from = k === 0 ? 0 : plan.stages[k - 1];
  return [...new Set(Array.from({ length: plan.stages[k] - from }, (_, i) => regionOf(from + i)))];
}

export function scheduleBars(plan: Plan, r: Result, startHour: number): GanttBar[] {
  const end = domainHours(r);
  const bars: GanttBar[] = [];
  r.stages.forEach((s, k) => {
    for (const region of newRegions(plan, k)) {
      const lane = REGIONS[region];
      bars.push({ id: `bake-${k}-${region}`, lane, start: s.start / MIN_PER_HOUR, end: s.end / MIN_PER_HOUR, tone: 'violet', kind: 'wait', label: `stage ${k + 1}` });
      bars.push({ id: `land-${k}-${region}`, lane, start: s.start / MIN_PER_HOUR, end: s.start / MIN_PER_HOUR, tone: 'hi' });
      if (s.outcome === 'passed') bars.push({ id: `pass-${k}-${region}`, lane, start: s.end / MIN_PER_HOUR, end: s.end / MIN_PER_HOUR, tone: 'ok' });
    }
  });
  if (r.detectedAt !== null) {
    const lane = REGIONS[regionOf(Math.max(0, r.reached - 1))];
    bars.push({ id: 'stop', lane, start: r.detectedAt / MIN_PER_HOUR, end: r.detectedAt / MIN_PER_HOUR, tone: 'bad', label: r.detectedBy === 'gate' ? 'gate stops it' : 'a person notices' });
  }
  REGIONS.forEach((name, region) => {
    const w = peakWindow(region, startHour, end);
    if (w) bars.push({ id: `peak-${region}`, lane: `${name}-peak`, start: w[0], end: w[1], tone: 'amber', label: 'peak' });
  });
  return bars;
}

/** The stages that land (at their start minute) inside the peak window of a region they reach: [stage index, region]. */
export function landingsInPeak(plan: Plan, r: Result, startHour: number): { stage: number; region: number }[] {
  const end = domainHours(r);
  return r.stages.flatMap((s, k) =>
    newRegions(plan, k).flatMap((region) => {
      const w = peakWindow(region, startHour, end);
      const at = s.start / MIN_PER_HOUR;
      return w && at >= w[0] && at < w[1] ? [{ stage: k, region }] : [];
    }),
  );
}
