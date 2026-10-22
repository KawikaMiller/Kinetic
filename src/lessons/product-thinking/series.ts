/**
 * Scene 2: a release observed week by week. INVENTED seeded series: signups (a vanity metric) rise after the
 * release while the outcome metrics stay flat, and pushing signups hard degrades the guardrail metrics (Goodhart's law).
 */
import { normal } from '../../core/distributions';
import { mulberry32 } from '../../core/random';

export const WEEKS = 20;
export const RELEASE_WEEK = 8;
export const SERIES_SEED = 21;
const NOISE = 0.025;

export type MetricId = 'signups' | 'active' | 'retention' | 'tickets' | 'latency';
export type MetricKind = 'vanity' | 'outcome' | 'guardrail';

export interface Metric {
  id: MetricId;
  label: string;
  kind: MetricKind;
  unit: string;
  baseline: number;
  /** Change per week after the release without pushing signups, and with it. */
  drift: { calm: number; pushed: number };
}

export const METRICS: readonly Metric[] = [
  { id: 'signups', label: 'Signups', kind: 'vanity', unit: ' a week', baseline: 100, drift: { calm: 4, pushed: 9 } },
  { id: 'active', label: 'Weekly active teams', kind: 'outcome', unit: ' teams', baseline: 200, drift: { calm: 0, pushed: 0 } },
  { id: 'retention', label: 'Retention after 4 weeks', kind: 'outcome', unit: '%', baseline: 40, drift: { calm: 0, pushed: 0 } },
  { id: 'tickets', label: 'Support tickets', kind: 'guardrail', unit: ' a week', baseline: 50, drift: { calm: 0.3, pushed: 3 } },
  { id: 'latency', label: 'Page latency', kind: 'guardrail', unit: ' ms', baseline: 300, drift: { calm: 1, pushed: 14 } },
];

export const KIND_WORD: Record<MetricKind, string> = { vanity: 'vanity metric', outcome: 'outcome metric', guardrail: 'guardrail metric' };

export type Series = Record<MetricId, number[]>;

/** Weeks 1 to WEEKS: baseline with 2.5% noise, then the weekly drift from the release week on. */
export function generateSeries(seed: number, pushed: boolean): Series {
  const rnd = mulberry32(seed);
  const out = {} as Series;
  for (const m of METRICS) {
    out[m.id] = Array.from({ length: WEEKS }, (_, i) => {
      const week = i + 1;
      const trend = week >= RELEASE_WEEK ? (pushed ? m.drift.pushed : m.drift.calm) * (week - RELEASE_WEEK + 1) : 0;
      return (m.baseline + trend) * (1 + NOISE * normal(rnd));
    });
  }
  return out;
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Mean after the release against mean before it, as a share (0.2 is +20%). */
export function change(series: readonly number[]): number {
  const before = mean(series.slice(0, RELEASE_WEEK - 1));
  const after = mean(series.slice(RELEASE_WEEK - 1));
  return after / before - 1;
}

export interface Guardrails {
  tickets: number;
  latency: number;
}
export const GUARDRAIL_DEFAULT: Guardrails = { tickets: 65, latency: 400 };
export const GUARDRAIL_RANGES = {
  tickets: { min: 55, max: 120, step: 5 },
  latency: { min: 320, max: 700, step: 20 },
};

export interface Breach {
  metric: 'tickets' | 'latency';
  week: number;
}

/** The first guardrail crossing after the release, or null. */
export function firstBreach(series: Series, g: Guardrails): Breach | null {
  const found: Breach[] = [];
  for (const metric of ['tickets', 'latency'] as const) {
    const i = series[metric].findIndex((v, k) => k + 1 >= RELEASE_WEEK && v > g[metric]);
    if (i >= 0) found.push({ metric, week: i + 1 });
  }
  return found.sort((a, b) => a.week - b.week)[0] ?? null;
}
