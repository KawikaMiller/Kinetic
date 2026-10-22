// Error-budget maths for a 30-day rolling SLO window.
// Traffic is assumed uniform, so "bad minutes" = minutes of total outage
// that would burn the same number of failed requests.

export const WINDOW_DAYS = 30;
export const MIN_PER_DAY = 24 * 60;
export const WINDOW_MIN = WINDOW_DAYS * MIN_PER_DAY; // 43,200
/** The slow-burn alert window: a ticket fires if the budget burns at 1× or more over this long. */
export const TICKET_WINDOW_DAYS = 3;

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
  /** CSS colour for the incident's bar in the strip. */
  color: string;
}

export const INCIDENTS: Incident[] = [
  { id: 'deploy', name: 'Bad deploy', start: 4 + 9 / 24, durMin: 25, err: 0.2, color: 'var(--amber)' },
  { id: 'failover', name: 'Database failover', start: 11 + 14 / 24, durMin: 8, err: 1, color: 'var(--pink)' },
  { id: 'leak', name: 'Slow memory leak', start: 17, durMin: 60 * 60, err: 0.0015, color: 'var(--violet)' },
  { id: 'region', name: 'Region outage', start: 23 + 2 / 24, durMin: 45, err: 0.6, color: 'var(--orange)' },
];

const overlapMin = (inc: Incident, tDays: number) => {
  const start = inc.start * MIN_PER_DAY;
  return Math.max(0, Math.min(tDays * MIN_PER_DAY, start + inc.durMin) - start);
};

/** Bad minutes spent from day 0 up to day t. */
export function badMinutes(tDays: number) {
  let bad = BACKGROUND * tDays * MIN_PER_DAY;
  for (const inc of INCIDENTS) bad += inc.err * overlapMin(inc, tDays);
  return bad;
}

export const incidentBadMinutes = (inc: Incident) => inc.err * inc.durMin;

export type AlertKind = 'page' | 'ticket' | null;

/**
 * The burn-rate thresholds this lesson uses, from the Google SRE Workbook's 30-day example as recalled from memory.
 * Simplified: the published rules pair each long window with a short one (5 min, 30 min, 6 h) so an alert stops soon
 * after recovery; this model checks the long window only.
 */
export const ALERT_RULES = [
  { kind: 'page', burn: 14.4, windowMin: 60, label: '1 h' },
  { kind: 'page', burn: 6, windowMin: 360, label: '6 h' },
  { kind: 'ticket', burn: 1, windowMin: TICKET_WINDOW_DAYS * MIN_PER_DAY, label: '3 days' },
] as const;
export type AlertRule = (typeof ALERT_RULES)[number];

/** The share of the whole error budget a burn of `rule.burn` spends in `rule.windowMin`: burn × window ÷ SLO window. */
export const budgetShare = (rule: AlertRule) => (rule.burn * rule.windowMin) / WINDOW_MIN;

export interface AlertResult {
  kind: AlertKind;
  burn1h: number;
  burn6h: number;
  burn3d: number;
  /** The first rule that fired, or null. */
  rule: AlertRule | null;
}

/** Observed burn over a window: an incident of length `durMin` at error rate `err` plus the background rate, divided by the rate the SLO allows. */
const windowBurn = (err: number, durMin: number, windowMin: number, slo: number) =>
  (err * Math.min(durMin, windowMin) + BACKGROUND * windowMin) / windowMin / (1 - slo / 100);

/**
 * Burn-rate alerting over three long windows (see ALERT_RULES for what is simplified). Burn rate = observed
 * error rate / error rate the SLO allows. The incident is assumed to sit entirely inside each window.
 */
export function alertFor(inc: Incident, slo: number): AlertResult {
  const [fast, slow, ticket] = ALERT_RULES;
  const burn1h = windowBurn(inc.err, inc.durMin, fast.windowMin, slo);
  const burn6h = windowBurn(inc.err, inc.durMin, slow.windowMin, slo);
  const burn3d = windowBurn(inc.err, inc.durMin, ticket.windowMin, slo);
  const rule = burn1h >= fast.burn ? fast : burn6h >= slow.burn ? slow : burn3d >= ticket.burn ? ticket : null;
  return { kind: rule?.kind ?? null, burn1h, burn6h, burn3d, rule };
}

export const fmtBurn = (b: number) => `${b < 10 ? +b.toFixed(1) : Math.round(b).toLocaleString()}×`;

/** The burn rate `result` measured over the window of `rule`. */
export const burnOver = (result: AlertResult, rule: AlertRule) =>
  rule === ALERT_RULES[0] ? result.burn1h : rule === ALERT_RULES[1] ? result.burn6h : result.burn3d;

/** Why an incident paged, ticketed or stayed quiet, in the numbers the rule compared. */
export function alertReason(result: AlertResult): string {
  if (result.rule) {
    const { rule } = result;
    return `${fmtBurn(burnOver(result, rule))} over ${rule.label} is at or above the ${rule.burn}× ${rule.kind} threshold`;
  }
  const [fast, slow, ticket] = ALERT_RULES;
  return `${fmtBurn(result.burn1h)} over 1 h, ${fmtBurn(result.burn6h)} over 6 h and ${fmtBurn(result.burn3d)} over 3 days stay under ${fast.burn}×, ${slow.burn}× and ${ticket.burn}×`;
}

/** The first moment the budget is gone (day, fractional), or null when the month ends with budget left. badMinutes is monotone, so bisect. */
export function exhaustionDay(slo: number): number | null {
  const budget = budgetMinutes(slo);
  if (badMinutes(WINDOW_DAYS) < budget) return null;
  let lo = 0;
  let hi = WINDOW_DAYS;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (badMinutes(mid) < budget) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** Pages and tickets that have fired by day `t`: incidents that started, plus one ticket once the background rate alone has burned at 1× or more for the ticket window. */
export function alertCounts(slo: number, t: number): { pages: number; tickets: number } {
  const fired = INCIDENTS.filter((inc) => inc.start <= t).map((inc) => alertFor(inc, slo).kind);
  const background = backgroundBurn(slo) >= ALERT_RULES[2].burn && t > TICKET_WINDOW_DAYS ? 1 : 0;
  return { pages: fired.filter((k) => k === 'page').length, tickets: fired.filter((k) => k === 'ticket').length + background };
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
