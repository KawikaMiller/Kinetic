/**
 * Scene 3: twelve authored alerts and a stated rubric. The rubric is common practice, not a standard:
 * page when a human must act now and a user is hurt now; ticket when a human must act, but not yet;
 * otherwise show it on a dashboard. Fire counts and the night share are invented.
 */
export type Route = 'page' | 'ticket' | 'dashboard';
export const ROUTES: readonly Route[] = ['page', 'ticket', 'dashboard'];
export const ROUTE_LABEL: Record<Route, string> = { page: 'Page', ticket: 'Ticket', dashboard: 'Dashboard only' };

/** When a human has to act: now, soon (hours to days), or not at all. */
export type Urgency = 'now' | 'soon' | 'none';

export interface TriageAlert {
  id: string;
  text: string;
  urgency: Urgency;
  /** Is there a step a person can take that the alert points at? */
  clearAction: boolean;
  /** Is a user failing right now? */
  userHurt: boolean;
  /** Does it link a runbook? */
  runbook: boolean;
  /** How many times it fires in a week, invented. */
  firesPerWeek: number;
}

export const ALERTS: readonly TriageAlert[] = [
  { id: 'cpu-batch', text: 'CPU high on batch-7', urgency: 'none', clearAction: false, userHurt: false, runbook: false, firesPerWeek: 20 },
  { id: 'errors-checkout', text: 'Error ratio high on checkout', urgency: 'now', clearAction: true, userHurt: true, runbook: true, firesPerWeek: 3 },
  { id: 'cert-expiry', text: 'Certificate expires in 6 days', urgency: 'soon', clearAction: true, userHurt: false, runbook: true, firesPerWeek: 1 },
  { id: 'disk-prediction', text: 'Disk predicted full in under 4 hours', urgency: 'soon', clearAction: true, userHurt: false, runbook: true, firesPerWeek: 1 },
  { id: 'pod-restart', text: 'A pod restarted once', urgency: 'none', clearAction: false, userHurt: false, runbook: false, firesPerWeek: 12 },
  { id: 'replica-lag', text: 'Replica lag high on the reporting database', urgency: 'soon', clearAction: true, userHurt: false, runbook: false, firesPerWeek: 4 },
  { id: 'latency-checkout', text: 'Checkout p99 latency above target for 10 minutes', urgency: 'now', clearAction: true, userHurt: true, runbook: false, firesPerWeek: 6 },
  { id: 'queue-depth', text: 'Email queue depth growing for an hour', urgency: 'soon', clearAction: true, userHurt: false, runbook: true, firesPerWeek: 3 },
  { id: 'db-down', text: 'Primary database unreachable', urgency: 'now', clearAction: true, userHurt: true, runbook: true, firesPerWeek: 3 },
  { id: 'cache-memory', text: 'Memory at 85% on one cache node', urgency: 'none', clearAction: false, userHurt: false, runbook: false, firesPerWeek: 9 },
  { id: 'pipeline-slow', text: 'Deploy pipeline slower than usual', urgency: 'none', clearAction: false, userHurt: false, runbook: false, firesPerWeek: 5 },
  { id: 'login-failures', text: 'Login failures spiking', urgency: 'now', clearAction: true, userHurt: true, runbook: true, firesPerWeek: 3 },
];

/** The assumed share of firings that land in the small hours, when a page wakes someone. Illustrative. */
export const NIGHT_SHARE = 1 / 3;

/** The rubric's route, and the reason it gives. */
export function rubricRoute(a: TriageAlert): { route: Route; because: string } {
  if (a.urgency === 'now' && a.userHurt) return { route: 'page', because: 'a human must act now and a user is hurt now' };
  if (a.urgency === 'now') return { route: 'ticket', because: 'a human must act, but no user is hurt yet' };
  if (a.urgency === 'soon') return { route: 'ticket', because: 'a human must act, but not yet: it can wait for working hours' };
  return { route: 'dashboard', because: 'no human needs to act on it' };
}

export type Routing = Readonly<Record<string, Route>>;

export interface Totals {
  /** Alerts routed to page, and the pages per week they cause. */
  paging: number;
  pagesPerWeek: number;
  /** Of those pages, how many land at night at the assumed share. */
  nightPages: number;
  /** Alerts routed against the rubric. */
  mismatches: number;
  /** Alerts routed to page that have no runbook. */
  pagesWithoutRunbook: string[];
}

export function totals(routing: Routing): Totals {
  const paged = ALERTS.filter((a) => routing[a.id] === 'page');
  const pagesPerWeek = paged.reduce((n, a) => n + a.firesPerWeek, 0);
  return {
    paging: paged.length,
    pagesPerWeek,
    nightPages: pagesPerWeek * NIGHT_SHARE,
    mismatches: ALERTS.filter((a) => routing[a.id] !== undefined && routing[a.id] !== rubricRoute(a).route).length,
    pagesWithoutRunbook: paged.filter((a) => !a.runbook).map((a) => a.id),
  };
}

export const allTo = (route: Route): Routing => Object.fromEntries(ALERTS.map((a) => [a.id, route]));
export const byRubric = (): Routing => Object.fromEntries(ALERTS.map((a) => [a.id, rubricRoute(a).route]));
