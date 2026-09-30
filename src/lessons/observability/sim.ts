// A tiny checkout system that emits all three pillars for every request:
// logs (with a trace id), metrics (derived from spans) and a trace (spans).

import { randRange } from '../../core/random';
import { percentile } from '../../core/sim';

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

const hex = () => Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');

export function makeRequest(id: number, t: number, incident: Incident): Req {
  const trace = hex();
  const logs: LogLine[] = [];
  const log = (svc: Svc, level: LogLine['level'], msg: string) => logs.push({ id: `${id}.${logs.length}`, trace, svc, level, msg });

  const invFails = incident === 'errors' && Math.random() < 0.3;
  const poolStarved = incident === 'slow' && Math.random() < 0.35;

  const inv = invFails ? randRange(2, 4) : randRange(6, 12);
  const invStart = 2;
  const spans: Span[] = [];
  let end: number;

  if (invFails) {
    log('inventory', 'ERROR', `SELECT stock FROM items failed: connection refused replica-2 (10.0.3.7:5432)`);
    log('orders', 'ERROR', `inventory returned 503 for order ${id}; aborting checkout`);
    end = invStart + inv + 1;
    spans.push({ svc: 'inventory', start: invStart, dur: inv, depth: 2, error: true });
  } else {
    const wait = poolStarved ? randRange(300, 900) : 0;
    const fraud = randRange(8, 14) + wait;
    const payStart = invStart + inv + 0.5;
    const pay = fraud + randRange(4, 8);
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
  p50: number;
  p99: number;
}

/** Metrics are just aggregates of the same spans, over a rolling window. */
export function metrics(reqs: Req[], now: number, window = 12): SvcMetrics[] {
  const recent = reqs.filter((q) => q.t > now - window);
  return SERVICES.map((svc) => {
    const spans = recent.flatMap((q) => q.spans.filter((s) => s.svc === svc));
    const durs = spans.map((s) => s.dur).sort((a, b) => a - b);
    const errs = spans.filter((s) => s.error).length;
    return {
      svc,
      rps: spans.length / Math.min(window, Math.max(1, now)),
      errPct: spans.length ? (errs / spans.length) * 100 : 0,
      p50: percentile(durs, 0.5),
      p99: percentile(durs, 0.99),
    };
  });
}

export const health = (m: SvcMetrics): 'ok' | 'slow' | 'bad' => (m.errPct >= ERROR_PCT ? 'bad' : m.p99 >= SLOW_P99_MS ? 'slow' : 'ok');
