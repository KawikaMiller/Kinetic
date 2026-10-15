// A tiny checkout system that emits all three pillars for every request:
// logs (with a trace id), metrics (derived from spans) and a trace (spans).

import { randRange, type Rnd } from '../../core/random';
import { mean, percentile } from '../../core/sim';

export type Svc = 'gateway' | 'orders' | 'inventory' | 'payments' | 'fraud';
export type Incident = 'healthy' | 'slow' | 'errors';

export const SERVICES: Svc[] = ['gateway', 'orders', 'inventory', 'payments', 'fraud'];

export const SVC_COLOR: Record<Svc, string> = {
  gateway: 'var(--sky)',
  orders: 'var(--violet)',
  inventory: 'var(--ok)',
  payments: 'var(--amber)',
  fraud: 'var(--orange)',
};

/** A service is "slow" when its p99 reaches this, and "erroring" at this error rate. */
export const SLOW_P99_MS = 200;
export const ERROR_PCT = 5;

/** The share of requests that hit the failing replica ("errors") or wait on a starved connection pool ("slow"). Illustrative. */
export const INVENTORY_FAIL_SHARE = 0.3;
export const POOL_STARVED_SHARE = 0.2;
/** The seed of the lesson's traffic: every load of the lesson sees the same requests. */
export const TRAFFIC_SEED = 11;
/** A span doing at least this much work itself (not waiting on its children) is outlined in the trace. */
export const LONG_SELF_MS = 100;
/** How far back "Slowest recent" and "Latest error" look, in requests. */
export const TRACE_LOOKBACK = 60;

/** Label values behind the metric-series count the lesson shows (service × route × status). Route and status counts are illustrative. */
export const SERIES_LABELS: Record<string, number> = { service: SERVICES.length, route: 4, status: 5 };
/** The extra label whose values are one per user. */
export const USER_ID_VALUES = 1_000_000;

/** The most series a metric can have: the product of its labels' value counts (only combinations that occur get a series). */
export const seriesBound = (labelValues: readonly number[]): number => labelValues.reduce((a, b) => a * b, 1);

export interface Span {
  svc: Svc;
  start: number; // ms from request start
  dur: number;
  depth: number;
  error?: boolean;
}

export interface LogLine {
  /** Unique across requests: '<request id>.<line>'. */
  id: string;
  trace: string;
  svc: Svc;
  level: 'INFO' | 'WARN' | 'ERROR';
  msg: string;
}

export interface Req {
  id: number;
  t: number; // seconds since start
  trace: string;
  spans: Span[];
  total: number;
  error: boolean;
  slow: boolean;
  logs: LogLine[];
}

const hex = (rnd: Rnd) => Math.floor(rnd() * 0xffffff).toString(16).padStart(6, '0');

export function makeRequest(id: number, t: number, incident: Incident, rnd: Rnd = Math.random): Req {
  const trace = hex(rnd);
  const logs: LogLine[] = [];
  const log = (svc: Svc, level: LogLine['level'], msg: string) => logs.push({ id: `${id}.${logs.length}`, trace, svc, level, msg });

  const invFails = incident === 'errors' && rnd() < INVENTORY_FAIL_SHARE;
  const poolStarved = incident === 'slow' && rnd() < POOL_STARVED_SHARE;

  const inv = invFails ? randRange(2, 4, rnd) : randRange(6, 12, rnd);
  const invStart = 2;
  const spans: Span[] = [];
  let end: number;

  if (invFails) {
    log('inventory', 'ERROR', `SELECT stock FROM items failed: connection refused replica-2 (10.0.3.7:5432)`);
    log('orders', 'ERROR', `inventory returned 503 for order ${id}; aborting checkout`);
    end = invStart + inv + 1;
    spans.push({ svc: 'inventory', start: invStart, dur: inv, depth: 2, error: true });
  } else {
    const wait = poolStarved ? randRange(300, 900, rnd) : 0;
    const fraud = randRange(8, 14, rnd) + wait;
    const payStart = invStart + inv + 0.5;
    const pay = fraud + randRange(4, 8, rnd);
    spans.push({ svc: 'inventory', start: invStart, dur: inv, depth: 2 });
    spans.push({ svc: 'payments', start: payStart, dur: pay, depth: 2 });
    spans.push({ svc: 'fraud', start: payStart + 1.5, dur: fraud, depth: 3 });
    if (poolStarved) {
      log('payments', 'WARN', `fraud-api: waited ${Math.round(wait)}ms for a connection (pool 50/50 in use)`);
    }
    log('payments', 'INFO', `charge authorised for order ${id}`);
    end = payStart + pay + 1;
  }

  const total = end + 1;
  spans.unshift({ svc: 'orders', start: 1, dur: end - 1, depth: 1, error: invFails });
  spans.unshift({ svc: 'gateway', start: 0, dur: total, depth: 0, error: invFails });
  log('gateway', invFails ? 'ERROR' : 'INFO', `POST /checkout ${invFails ? 500 : 200} ${Math.round(total)}ms`);

  return { id, t, trace, spans, total, error: invFails, slow: total > SLOW_P99_MS, logs };
}

export interface SvcMetrics {
  svc: Svc;
  rps: number;
  errPct: number;
  mean: number;
  p50: number;
  p99: number;
}

/** Metrics are just aggregates of the same spans, over a rolling window. */
/** How far back the metrics look, in seconds. */
export const METRICS_WINDOW_S = 12;

export function metrics(reqs: Req[], now: number, window = METRICS_WINDOW_S): SvcMetrics[] {
  const recent = reqs.filter((q) => q.t > now - window);
  return SERVICES.map((svc) => {
    const spans = recent.flatMap((q) => q.spans.filter((s) => s.svc === svc));
    const durs = spans.map((s) => s.dur).sort((a, b) => a - b);
    const errs = spans.filter((s) => s.error).length;
    return {
      svc,
      rps: spans.length / Math.min(window, Math.max(1, now)),
      errPct: spans.length ? (errs / spans.length) * 100 : 0,
      mean: mean(durs),
      p50: percentile(durs, 0.5),
      p99: percentile(durs, 0.99),
    };
  });
}

/** A span's own time, excluding time spent waiting on its child spans. */
export function selfTime(req: Req, i: number): number {
  const s = req.spans[i];
  const kids = req.spans.filter((c) => c.depth === s.depth + 1 && c.start >= s.start && c.start < s.start + s.dur);
  return s.dur - kids.reduce((sum, c) => sum + c.dur, 0);
}

/** The spans of a trace that are outlined: those that did at least LONG_SELF_MS of their own work. */
export const outlinedSpans = (req: Req): Span[] => req.spans.filter((_, i) => selfTime(req, i) >= LONG_SELF_MS);

/** The trace "Slowest recent" or "Latest error" opens: from the last TRACE_LOOKBACK requests, or null if there is none. */
export function pickTrace(reqs: readonly Req[], kind: 'slowest' | 'error'): Req | null {
  const recent = reqs.slice(-TRACE_LOOKBACK);
  if (kind === 'slowest') return recent.reduce<Req | null>((a, b) => (!a || b.total > a.total ? b : a), null);
  return [...recent].reverse().find((r) => r.error) ?? null;
}

export const health = (m: SvcMetrics): 'ok' | 'slow' | 'bad' => (m.errPct >= ERROR_PCT ? 'bad' : m.p99 >= SLOW_P99_MS ? 'slow' : 'ok');

/** The three steps of the investigation the lesson walks through, ticked off as the learner completes them. */
export interface Checks {
  metrics: boolean;
  trace: boolean;
  logs: boolean;
}
export const NO_CHECKS: Checks = { metrics: false, trace: false, logs: false };

/** Whether a request is the kind of evidence the incident leaves behind (a slow one, a failed one). */
export const isProblemRequest = (incident: Incident, q: Req): boolean => (incident === 'slow' && q.slow) || (incident === 'errors' && q.error);
