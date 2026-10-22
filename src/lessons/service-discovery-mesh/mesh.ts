/**
 * The service-mesh half of the lesson, as small pure models: the extra hop, the traffic split, retries
 * that stack, and short-lived certificates with a control plane that can go away. Every time and
 * percentage is a named constant and illustrative; products differ.
 */
import { mulberry32 } from '../../core/random';

// ── The extra hop ─────────────────────────────────────────────────────────────

export const APP_CALL_MS = 20;
export const SIDECAR_HOP_MS = 2;
/** A call through a mesh passes the caller's sidecar and the callee's. */
export const SIDECAR_TRAVERSALS = 2;

export const extraHopMs = (mesh: boolean): number => (mesh ? SIDECAR_TRAVERSALS * SIDECAR_HOP_MS : 0);
export const callMs = (mesh: boolean): number => APP_CALL_MS + extraHopMs(mesh);

// ── Traffic splitting ─────────────────────────────────────────────────────────

export const SPLIT_REQUESTS = 10_000;
export const CANARY_RANGE = { min: 0, max: 50, step: 5, default: 10 } as const;

export interface Split {
  canary: number;
  stable: number;
  /** The canary's observed share of the requests, percent. */
  observedPct: number;
  /** The configured share, percent. */
  expectedPct: number;
  /** Three standard errors of an observed share at this weight and sample size, percentage points. */
  threeSePct: number;
}

/** Route `n` seeded requests by weight and report what was observed against what was set. */
export function observedSplit(seed: number, canaryPct: number, n = SPLIT_REQUESTS): Split {
  const rnd = mulberry32(seed);
  let canary = 0;
  for (let i = 0; i < n; i++) if (rnd() * 100 < canaryPct) canary++;
  const p = canaryPct / 100;
  return { canary, stable: n - canary, observedPct: (canary / n) * 100, expectedPct: canaryPct, threeSePct: 3 * Math.sqrt((p * (1 - p)) / n) * 100 };
}

// ── Retries that stack ────────────────────────────────────────────────────────

export const RETRY_RANGE = { min: 0, max: 4, default: 2 } as const;
export const FAIL_RATE_RANGE = { min: 0, max: 1, step: 0.1, default: 0.5 } as const;

export interface Attempts {
  /** Expected calls to the backend per user request, when each attempt fails with the given probability. */
  expected: number;
  /** Calls to the backend when every attempt fails. */
  worst: number;
}

/**
 * An app that retries `appRetries` times, each of its calls going through a mesh that retries
 * `meshRetries` times. A mesh call fails only if all its attempts fail; the app retries on that.
 */
export function attempts(failProb: number, appRetries: number, meshRetries: number): Attempts {
  const meshCalls = Array.from({ length: meshRetries + 1 }, (_, i) => failProb ** i).reduce((a, b) => a + b, 0);
  const meshFails = failProb ** (meshRetries + 1);
  const appCalls = Array.from({ length: appRetries + 1 }, (_, i) => meshFails ** i).reduce((a, b) => a + b, 0);
  return { expected: appCalls * meshCalls, worst: (appRetries + 1) * (meshRetries + 1) };
}

// ── Certificates and the control plane ────────────────────────────────────────

export const WORKLOADS = ['orders', 'payments', 'search'] as const;
export type Workload = (typeof WORKLOADS)[number];
export const LIFETIME_RANGE = { min: 30, max: 240, step: 30, default: 120 } as const;
export const RENEW_FRACTION = 0.5;
export const RETRY_MIN = 5;
/** When each workload's first certificate was issued, minutes (spread out, as they would be). */
export const FIRST_ISSUE_MIN: Record<Workload, number> = { orders: 0, payments: 20, search: 40 };
export const HORIZON_MIN = 480;
export const OUTAGE_RANGE = { startMin: 0, startMax: 240, startDefault: 30, lenMin: 0, lenMax: 240, lenStep: 15, lenDefault: 150 } as const;
/** A new instance appears this far in, which the control plane would normally push to the proxies. */
export const NEW_INSTANCE_MIN = 60;
export const BASE_ENDPOINTS = 3;

export interface Outage {
  start: number;
  length: number;
}

export const inOutage = (o: Outage, t: number): boolean => t >= o.start && t < o.start + o.length;

export interface Cert {
  workload: Workload;
  issuedAt: number;
  expiresAt: number;
}

export interface Gap {
  workload: Workload;
  from: number;
  to: number;
}

export interface CertRun {
  certs: Cert[];
  /** Times a workload had no valid certificate: its mTLS calls fail. */
  gaps: Gap[];
  /** Renewals that were due while the control plane was away. */
  stalled: { workload: Workload; due: number; renewedAt: number }[];
}

/**
 * Each workload gets a certificate of `lifetimeMin` from the control plane's CA and renews at half
 * its life, retrying every few minutes while the control plane is away. A certificate stops being
 * valid at `issuedAt + lifetime` exactly; a renewal that lands later leaves a gap.
 */
export function certTimeline(lifetimeMin: number, outage: Outage, horizon = HORIZON_MIN): CertRun {
  const certs: Cert[] = [];
  const gaps: Gap[] = [];
  const stalled: CertRun['stalled'] = [];
  for (const workload of WORKLOADS) {
    let issuedAt = FIRST_ISSUE_MIN[workload];
    certs.push({ workload, issuedAt, expiresAt: issuedAt + lifetimeMin });
    for (;;) {
      const expiresAt = issuedAt + lifetimeMin;
      const due = issuedAt + lifetimeMin * RENEW_FRACTION;
      if (due > horizon) break;
      let attempt = due;
      while (inOutage(outage, attempt)) attempt += RETRY_MIN;
      if (attempt > horizon) {
        if (expiresAt < horizon) gaps.push({ workload, from: expiresAt, to: horizon });
        if (attempt > due) stalled.push({ workload, due, renewedAt: attempt });
        break;
      }
      if (attempt > due) stalled.push({ workload, due, renewedAt: attempt });
      if (attempt > expiresAt) gaps.push({ workload, from: expiresAt, to: attempt });
      issuedAt = attempt;
      certs.push({ workload, issuedAt, expiresAt: issuedAt + lifetimeMin });
    }
  }
  return { certs, gaps, stalled };
}

export const certValidAt = (run: CertRun, workload: Workload, t: number): boolean => run.certs.some((c) => c.workload === workload && c.issuedAt <= t && t < c.expiresAt);

/** Workloads whose calls fail at time `t`. */
export const failingAt = (run: CertRun, t: number): Workload[] => WORKLOADS.filter((w) => t >= FIRST_ISSUE_MIN[w] && !certValidAt(run, w, t));

/** Endpoints that really exist at `t`: three, and a fourth once the new instance is up. */
export const actualEndpoints = (t: number): number => BASE_ENDPOINTS + (t >= NEW_INSTANCE_MIN ? 1 : 0);

/**
 * Endpoints a proxy knows at `t`. The control plane pushes changes while it is up; a proxy keeps the last
 * configuration it was given while it is away (a fail-static design, as many meshes describe: from memory).
 */
export function knownEndpoints(outage: Outage, t: number): number {
  const lastPush = inOutage(outage, t) ? outage.start : t;
  return actualEndpoints(lastPush);
}
