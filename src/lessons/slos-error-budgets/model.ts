// Error-budget maths for a 30-day rolling SLO window.
// Traffic is assumed uniform, so "bad minutes" = minutes of total outage
// that would burn the same number of failed requests.

export const WINDOW_DAYS = 30;
export const WINDOW_MIN = WINDOW_DAYS * 24 * 60; // 43,200

export const SLOS = [99, 99.5, 99.9, 99.95, 99.99] as const;
export type Slo = (typeof SLOS)[number];

export const budgetMinutes = (slo: number) => WINDOW_MIN * (1 - slo / 100);

/** Always-on background error rate: 0.01% of requests fail even on a good day. */
export const BACKGROUND = 0.0001;

export interface Incident {
  id: string;
  name: string;
  start: number; // day (fractional)
  durMin: number;
  err: number; // fraction of requests failing during it
  color: string;
}

export const INCIDENTS: Incident[] = [
  { id: 'deploy', name: 'Bad deploy', start: 4 + 9 / 24, durMin: 25, err: 0.2, color: '#f7b538' },
  { id: 'failover', name: 'Database failover', start: 11 + 14 / 24, durMin: 8, err: 1, color: '#ff5d8f' },
  { id: 'leak', name: 'Slow memory leak', start: 17, durMin: 60 * 60, err: 0.0015, color: '#a78bfa' },
  { id: 'region', name: 'Region outage', start: 23 + 2 / 24, durMin: 45, err: 0.6, color: '#ff5d6c' },
];

const overlapMin = (inc: Incident, tDays: number) => {
  const start = inc.start * 1440;
  return Math.max(0, Math.min(tDays * 1440, start + inc.durMin) - start);
};

/** Bad minutes spent from day 0 up to day t. */
export function badMinutes(tDays: number) {
  let bad = BACKGROUND * tDays * 1440;
  for (const inc of INCIDENTS) bad += inc.err * overlapMin(inc, tDays);
  return bad;
}

export const incidentBadMinutes = (inc: Incident) => inc.err * inc.durMin;

export type AlertKind = 'page' | 'ticket' | null;

/**
 * Multiwindow burn-rate alerting (Google SRE Workbook, 30-day SLO):
 *   page   if burn ≥ 14.4 over 1 h   (2% of budget in an hour)
 *   page   if burn ≥ 6    over 6 h   (5% of budget in 6 hours)
 *   ticket if burn ≥ 1    over 3 days (10% of budget in 3 days)
 * Burn rate = observed error rate / error rate the SLO allows.
 */
export function alertFor(inc: Incident, slo: number): { kind: AlertKind; burn1h: number; burn6h: number; burn3d: number } {
  const allowed = 1 - slo / 100;
  const avg = (windowMin: number) => (inc.err * Math.min(inc.durMin, windowMin) + BACKGROUND * windowMin) / windowMin / allowed;
  const burn1h = avg(60);
  const burn6h = avg(360);
  const burn3d = avg(3 * 1440);
  const kind: AlertKind = burn1h >= 14.4 || burn6h >= 6 ? 'page' : burn3d >= 1 ? 'ticket' : null;
  return { kind, burn1h, burn6h, burn3d };
}

// Rounded so float noise (99.99 / 100 = 0.99989999…) can't turn an exact 1× burn into 0.9999999×.
export const backgroundBurn = (slo: number) => Math.round((BACKGROUND / (1 - slo / 100)) * 1e6) / 1e6;

export function fmtMinutes(min: number) {
  const abs = Math.abs(min);
  if (abs >= 60) return `${+(min / 60).toFixed(2)} h`;
  return `${+min.toFixed(2)} min`;
}

export type Policy = 'ship' | 'care' | 'freeze';
export const policyFor = (remainingPct: number): Policy => (remainingPct <= 0 ? 'freeze' : remainingPct <= 50 ? 'care' : 'ship');
