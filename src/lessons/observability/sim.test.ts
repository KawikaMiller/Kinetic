import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { captionText } from '../../core/testing/captions';
import { causeLine, logsFiltered, possessive, rowClicked, traceOpened } from './captions';
import lesson from './index';
import {
  ERROR_PCT, health, isProblemRequest, LONG_SELF_MS, makeRequest, METRICS_WINDOW_S, metrics, outlinedSpans, pickTrace, selfTime, SERIES_LABELS,
  seriesBound, SERVICES, SLOW_P99_MS, TRACE_LOOKBACK, TRAFFIC_SEED, USER_ID_VALUES, type Incident, type Req, type Svc, type SvcMetrics,
} from './sim';

const TICK_S = 0.4;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/** Requests as the stage makes them: one per tick, from one seeded stream, switching incident at given times. */
function traffic(phases: readonly { incident: Incident; seconds: number }[], seed: number): Req[] {
  const rnd = mulberry32(seed);
  const reqs: Req[] = [];
  let now = 0;
  for (const { incident, seconds } of phases) {
    for (let t = 0; t < seconds - 1e-9; t += TICK_S) {
      now += TICK_S;
      reqs.push(makeRequest(reqs.length + 1, now, incident, rnd));
    }
  }
  return reqs;
}

/** An independent reading of the metrics table: plain loops over the raw spans. */
function referenceMetrics(reqs: readonly Req[], now: number) {
  return SERVICES.map((svc) => {
    const durs: number[] = [];
    let errors = 0;
    for (const r of reqs) {
      if (!(r.t > now - METRICS_WINDOW_S)) continue;
      for (const s of r.spans) {
        if (s.svc !== svc) continue;
        durs.push(s.dur);
        if (s.error) errors++;
      }
    }
    durs.sort((a, b) => a - b);
    const at = (p: number) => (durs.length ? durs[Math.min(durs.length - 1, Math.floor(durs.length * p))] : 0);
    return {
      svc,
      rps: durs.length / Math.min(METRICS_WINDOW_S, Math.max(1, now)),
      errPct: durs.length ? (100 * errors) / durs.length : 0,
      mean: durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0,
      p50: at(0.5),
      p99: at(0.99),
    };
  });
}

describe('one request leaves a trace, logs and metric inputs that agree', () => {
  it('has spans nested inside their parents, the gateway span covering the whole request, and 6-digit hex trace ids', () => {
    for (const incident of ['healthy', 'slow', 'errors'] as const) {
      for (const r of traffic([{ incident, seconds: 40 }], 3)) {
        const [gateway, ...rest] = r.spans;
        expect(gateway.svc).toBe('gateway');
        expect(gateway.start).toBe(0);
        expect(gateway.dur).toBe(r.total);
        for (const s of rest) {
          const parent = r.spans.filter((p) => p.depth === s.depth - 1 && p.start <= s.start && p.start + p.dur >= s.start + s.dur - 1e-9);
          expect(parent.length, `${incident} ${s.svc}`).toBeGreaterThan(0);
        }
        expect(r.trace).toMatch(/^[0-9a-f]{6}$/);
      }
    }
  });

  it('puts the request\'s trace id and a unique id on every one of its log lines', () => {
    const reqs = traffic([{ incident: 'errors', seconds: 60 }], 5);
    const ids = new Set<string>();
    for (const r of reqs) {
      expect(r.logs.length).toBeGreaterThan(0);
      for (const l of r.logs) {
        expect(l.trace).toBe(r.trace);
        expect(ids.has(l.id)).toBe(false);
        ids.add(l.id);
      }
    }
  });

  it('flags the request as an error exactly when its inventory span failed, and as slow when it took over the threshold', () => {
    for (const r of traffic([{ incident: 'errors', seconds: 60 }], 5)) {
      expect(r.error).toBe(r.spans.some((s) => s.svc === 'inventory' && s.error));
      expect(r.spans.some((s) => s.svc === 'gateway' && s.error)).toBe(r.error);
    }
    for (const r of traffic([{ incident: 'slow', seconds: 60 }], 5)) expect(r.slow).toBe(r.total > SLOW_P99_MS);
  });

  it('is deterministic for a seed', () => {
    expect(traffic([{ incident: 'slow', seconds: 20 }], TRAFFIC_SEED)).toEqual(traffic([{ incident: 'slow', seconds: 20 }], TRAFFIC_SEED));
  });
});

describe('metrics are aggregates of the same spans', () => {
  it('match an independent aggregation of the raw spans, for every service, incident and moment', () => {
    for (const incident of ['healthy', 'slow', 'errors'] as const) {
      const reqs = traffic([{ incident, seconds: 60 }], 2);
      for (let k = 5; k < reqs.length; k += 7) {
        const now = reqs[k].t;
        const seen = reqs.slice(0, k + 1);
        const got = metrics(seen, now);
        const want = referenceMetrics(seen, now);
        for (let i = 0; i < SERVICES.length; i++) {
          const label = `${incident} t=${now} ${SERVICES[i]}`;
          expect(got[i].svc, label).toBe(want[i].svc);
          for (const field of ['rps', 'errPct', 'mean', 'p50', 'p99'] as const) expect(got[i][field], `${label} ${field}`).toBeCloseTo(want[i][field], 9);
        }
      }
    }
  });

  it('p99 is the 99th-percentile span duration, which in a 12 s window of about 30 requests is the slowest one', () => {
    const reqs = traffic([{ incident: 'slow', seconds: 60 }], 4);
    const now = reqs[reqs.length - 1].t;
    const window = reqs.filter((r) => r.t > now - METRICS_WINDOW_S);
    expect(window.length).toBeGreaterThanOrEqual(29);
    const gateway = metrics(reqs, now)[0];
    expect(gateway.p99).toBe(Math.max(...window.map((r) => r.total)));
  });
});

describe('the incidents show up the way the lesson says', () => {
  const afterWarmup = (incident: Incident, seed: number) => {
    const reqs = traffic([{ incident, seconds: 80 }], seed);
    return reqs.filter((r) => r.t > 20).map((r) => metrics(reqs.filter((q) => q.t <= r.t), r.t));
  };

  it('healthy: no service is ever slow or erroring', () => {
    for (const seed of SEEDS) for (const table of afterWarmup('healthy', seed)) for (const m of table) expect(health(m), `seed ${seed}`).toBe('ok');
  });

  it('slow: gateway, orders, payments and fraud all look slow while inventory does not, so metrics alone cannot name the culprit', () => {
    for (const seed of SEEDS) {
      const tables = afterWarmup('slow', seed);
      const slowShare = (svc: string) => tables.filter((t) => health(t.find((m) => m.svc === svc)!) === 'slow').length / tables.length;
      for (const svc of ['gateway', 'orders', 'payments', 'fraud']) expect(slowShare(svc), `seed ${seed} ${svc}`).toBeGreaterThan(0.97);
      expect(slowShare('inventory'), `seed ${seed}`).toBe(0);
    }
  });

  it('slow: the p99 is several times the mean (a minority of slow requests barely moves the mean but sets the p99)', () => {
    for (const seed of SEEDS) {
      const gateways = afterWarmup('slow', seed).map((table) => table[0]);
      const ratio = gateways.filter((g) => g.p99 > 2.5 * g.mean).length / gateways.length;
      expect(ratio, `seed ${seed}`).toBeGreaterThan(0.97);
    }
  });

  it('errors: gateway, orders and inventory exceed the error rate; payments and fraud do not', () => {
    for (const seed of SEEDS) {
      const tables = afterWarmup('errors', seed);
      const share = (svc: string) => tables.filter((t) => t.find((m) => m.svc === svc)!.errPct >= ERROR_PCT).length / tables.length;
      for (const svc of ['gateway', 'orders', 'inventory']) expect(share(svc), `seed ${seed} ${svc}`).toBeGreaterThan(0.97);
      for (const svc of ['payments', 'fraud']) expect(share(svc), `seed ${seed} ${svc}`).toBe(0);
    }
  });
});

describe('traces and logs find the cause', () => {
  const slowReqs = () => traffic([{ incident: 'slow', seconds: 60 }], TRAFFIC_SEED);
  const failingReqs = () => traffic([{ incident: 'errors', seconds: 60 }], TRAFFIC_SEED);

  it('a self-time of a span excludes its children, and only the fraud span of a starved request is outlined', () => {
    const slow = slowReqs().filter((r) => r.slow);
    expect(slow.length).toBeGreaterThan(5);
    for (const r of slow) {
      const fraud = r.spans.findIndex((s) => s.svc === 'fraud');
      expect(selfTime(r, fraud)).toBe(r.spans[fraud].dur);
      expect(outlinedSpans(r).map((s) => s.svc)).toEqual(['fraud']);
      expect(selfTime(r, r.spans.findIndex((s) => s.svc === 'payments'))).toBeLessThan(LONG_SELF_MS);
    }
    for (const r of traffic([{ incident: 'healthy', seconds: 60 }], TRAFFIC_SEED)) expect(outlinedSpans(r)).toEqual([]);
    for (const r of failingReqs()) expect(outlinedSpans(r)).toEqual([]);
  });

  it('"Slowest recent" opens the slowest of the last requests, and "Latest error" the most recent failing one', () => {
    const reqs = slowReqs();
    const slowest = pickTrace(reqs, 'slowest')!;
    const recent = reqs.slice(-TRACE_LOOKBACK);
    expect(slowest.total).toBe(Math.max(...recent.map((r) => r.total)));
    expect(pickTrace(reqs, 'error')).toBeNull();
    const failing = failingReqs();
    const latest = pickTrace(failing, 'error')!;
    expect(latest.error).toBe(true);
    expect(failing.slice(failing.indexOf(latest) + 1).some((r) => r.error)).toBe(false);
  });

  it('the log line that explains the slowdown is the payments WARN in the slow trace, and the failure the inventory ERROR', () => {
    const slow = pickTrace(slowReqs(), 'slowest')!;
    expect(causeLine('slow', slow)).toMatchObject({ svc: 'payments', level: 'WARN' });
    expect(causeLine('slow', slow)?.msg).toMatch(/waited \d+ms for a connection \(pool 50\/50 in use\)/);
    const failing = pickTrace(failingReqs(), 'error')!;
    expect(causeLine('errors', failing)).toMatchObject({ svc: 'inventory', level: 'ERROR' });
    expect(causeLine('errors', failing)?.msg).toContain('connection refused');
  });

  it('captions quote the line and the numbers on screen, and name how many services look sick', () => {
    const reqs = slowReqs();
    const now = reqs[reqs.length - 1].t;
    const rows = metrics(reqs, now);
    const click = rowClicked('slow', rows, 'payments');
    expect(click.check).toBe('metrics');
    const sick = rows.filter((m) => m.p99 >= SLOW_P99_MS || m.errPct >= ERROR_PCT);
    expect(captionText(click.caption, { strict: true })).toContain(`${sick.length} services look sick`);
    expect(captionText(click.caption)).toContain(`p99 is ${Math.round(rows[3].p99)} ms`);
    expect(rowClicked('slow', rows, 'inventory').check).toBeUndefined();
    expect(rowClicked('healthy', rows, 'payments').check).toBeUndefined();

    const trace = pickTrace(reqs, 'slowest')!;
    const opened = traceOpened('slow', 'slowest', trace);
    expect(opened.check).toBe('trace');
    expect(captionText(opened.caption, { strict: true })).toContain(`takes ${Math.round(trace.spans.find((s) => s.svc === 'fraud')!.dur)} ms`);
    expect(traceOpened('slow', 'error', null).check).toBeUndefined();

    const logs = logsFiltered('slow', trace, true)!;
    expect(logs.check).toBe('logs');
    expect(captionText(logs.caption, { strict: true })).toContain(causeLine('slow', trace)!.msg);
    expect(logsFiltered('slow', trace, false)).toBeNull();
    expect(logsFiltered('healthy', trace, true)).toBeNull();
  });
});

describe('metric series are the product of the label values', () => {
  it('multiplies value counts, checked against enumerating every combination', () => {
    const count = (sizes: number[]) => {
      let n = 0;
      const walk = (i: number) => {
        if (i === sizes.length) n++;
        else for (let v = 0; v < sizes[i]; v++) walk(i + 1);
      };
      walk(0);
      return n;
    };
    for (const sizes of [[2, 3], [5, 4, 5], [3, 1, 4, 2], [7]]) expect(seriesBound(sizes)).toBe(count(sizes));
  });

  it('is 100 for service × route × status, and a million times that with a user_id label', () => {
    expect(SERIES_LABELS.service).toBe(SERVICES.length);
    const base = seriesBound(Object.values(SERIES_LABELS));
    expect(base).toBe(100);
    expect(seriesBound([...Object.values(SERIES_LABELS), USER_ID_VALUES])).toBe(base * 1_000_000);
  });
});

describe('try-this, from the lesson as it loads (Healthy, live traffic from seed 11)', () => {
  /** Load the lesson, switch to the incident straight away and let it run `seconds`. */
  const afterSwitch = (incident: Incident, seconds: number, seed = TRAFFIC_SEED) => {
    const reqs = traffic([{ incident, seconds }], seed);
    return { reqs, now: reqs[reqs.length - 1].t };
  };

  it('try-this 1: after Checkout is slow and a few seconds, the sick rows complete the metrics step and the slowest trace the trace step', () => {
    const { reqs, now } = afterSwitch('slow', 12);
    const rows = metrics(reqs, now);
    const wrong = rows.filter((m) => health(m) !== 'ok').map((m) => m.svc);
    expect(wrong).toEqual(['gateway', 'orders', 'payments', 'fraud']);
    for (const svc of wrong) expect(rowClicked('slow', rows, svc).check, svc).toBe('metrics');
    const trace = pickTrace(reqs, 'slowest')!;
    expect(isProblemRequest('slow', trace)).toBe(true);
    expect(traceOpened('slow', 'slowest', trace).check).toBe('trace');
    expect(lesson.tryThis[0]).toContain('wait');
  });

  it('try-this 2: filtering to that trace shows the WARN line, and it is the root cause', () => {
    const { reqs } = afterSwitch('slow', 12);
    const trace = pickTrace(reqs, 'slowest')!;
    const step = logsFiltered('slow', trace, true)!;
    expect(step.check).toBe('logs');
    expect(trace.logs.filter((l) => l.level === 'WARN').map((l) => l.msg)).toEqual([causeLine('slow', trace)!.msg]);
  });

  it('try-this 3: with Checkout is failing the red error is in the trace, the logs name the replica, and the metrics rows light up', () => {
    const { reqs, now } = afterSwitch('errors', 12);
    const rows = metrics(reqs, now);
    expect(rows.filter((m) => health(m) === 'bad').map((m) => m.svc)).toEqual(['gateway', 'orders', 'inventory']);
    const trace = pickTrace(reqs, 'error')!;
    expect(trace.spans.filter((s) => s.error).map((s) => s.svc)).toEqual(['gateway', 'orders', 'inventory']);
    expect(traceOpened('errors', 'error', trace).check).toBe('trace');
    expect(causeLine('errors', trace)?.msg).toContain('replica-2');
  });

  it('try-this 4: adding a user_id label takes the series count from 100 to 100,000,000', () => {
    const base = seriesBound(Object.values(SERIES_LABELS));
    expect(base).toBe(100);
    expect(seriesBound([...Object.values(SERIES_LABELS), USER_ID_VALUES])).toBe(100_000_000);
  });

  it('a few seconds after switching to Checkout is slow the gateway looks slow on almost every seed (the try-this says to wait)', () => {
    const slowSeeds = Array.from({ length: 30 }, (_, i) => i + 1).filter((seed) => {
      const { reqs, now } = afterSwitch('slow', 12, seed);
      return health(metrics(reqs, now)[0]) === 'slow';
    });
    expect(slowSeeds.length).toBeGreaterThanOrEqual(28);
  });
});

describe('metrics-row caption wording', () => {
  const row = (svc: Svc, p99: number, errPct: number): SvcMetrics => ({ svc, rps: 10, errPct, mean: 10, p50: 10, p99 });
  const healthyRows = SERVICES.map((s) => row(s, 20, 0));
  const withSick = (sick: Svc[], p99: number, errPct: number) => healthyRows.map((r) => (sick.includes(r.svc) ? row(r.svc, p99, errPct) : r));

  it('uses a correct possessive for a service whose name ends in s', () => {
    expect(possessive('payments')).toBe("payments'");
    expect(possessive('fraud')).toBe("fraud's");
    const text = captionText(rowClicked('slow', withSick(['payments'], 900, 0), 'payments').caption);
    expect(text).toContain("payments' p99 is 900 ms");
    expect(text).not.toContain("payments's");
  });

  it('never says "1 services": a lone sick service gets its own sentence', () => {
    const text = captionText(rowClicked('slow', withSick(['payments'], 900, 0), 'payments').caption);
    expect(text).not.toMatch(/\b1 services\b/);
    expect(text).toContain('only payments looks sick');
  });

  it('for an error incident the explanation is about failures bubbling up, not about time', () => {
    const text = captionText(rowClicked('errors', withSick(['gateway', 'orders', 'inventory'], 20, 40), 'inventory').caption);
    expect(text).toContain('3 services look sick');
    expect(text).toContain('errors include the failures');
    expect(text).not.toContain("service's time includes");
    const slow = captionText(rowClicked('slow', withSick(['gateway', 'orders', 'payments'], 900, 0), 'payments').caption);
    expect(slow).toContain("service's time includes");
  });
});
