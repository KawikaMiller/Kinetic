import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { percentile } from '../../core/sim';
import lesson from './index';
import { poolFrames, rowCaption, STEP } from './frames';
import {
  arrivals, costs, DEFAULT_CONFIG, functionCost, HANDLER_S, HORIZON, MONTH_S, peakDemand, PRICE_PER_BILLED_SECOND, PRICE_PER_PROVISIONED_SECOND,
  PRICE_PER_REQUEST, PRICE_VM_PER_SECOND, PROVISION_S, RUNTIME_S, simulate, stateAt, summaryAt, VM_SLOTS, type Config, type Profile, type Run,
} from './model';
import { COLUMNS, ownerCounts, ROWS } from './spectrum';
import { laneCount, poolBars, slotsAt, windowAt } from './view';

const PROFILES: Profile[] = ['spiky', 'steady', 'batch'];
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const cfgOf = (patch: Partial<Config>): Config => ({ ...DEFAULT_CONFIG, ...patch });

/**
 * An independent check of every decision in a run, rebuilt from the instances' own schedules:
 * at each arrival, which instances exist, are not reaped and are not working on another request.
 */
function checkDecisions(run: Run) {
  const { limit } = run.config;
  for (const r of run.requests) {
    const exists = run.instances.filter(
      (i) => i.id !== r.instance && i.createdAt <= r.at && (i.createdAt < r.at || !i.segments.some((s) => s.request === r.id)) && (i.reapedAt === null || i.reapedAt > r.at),
    );
    const busy = (i: Run['instances'][number]) => i.segments.some((s) => s.kind !== 'idle' && s.request !== r.id && s.start <= r.at && r.at < s.end);
    const idle = exists.filter((i) => !busy(i));
    const own = r.instance === null ? null : run.instances[r.instance];
    if (r.outcome === 'warm') {
      // A free warm instance existed, and the request took the lowest-numbered slot among those (or the one it took was among them).
      const pool = [...idle, ...(own && own.createdAt <= r.at && !busy(own) ? [own] : [])];
      expect(pool.length).toBeGreaterThan(0);
      expect(own?.slot).toBe(Math.min(...pool.map((i) => i.slot)));
    } else if (r.outcome === 'cold') {
      expect(idle).toEqual([]);
      expect(exists.length).toBeLessThan(limit);
    } else {
      expect(idle).toEqual([]);
      expect(exists.length).toBeGreaterThanOrEqual(limit);
    }
  }
}

describe('arrivals', () => {
  it('are sorted, inside the run, and repeat exactly for a seed', () => {
    for (const profile of PROFILES) {
      const a = arrivals(cfgOf({ profile }));
      expect(a).toEqual(arrivals(cfgOf({ profile })));
      expect([...a].sort((x, y) => x - y)).toEqual(a);
      expect(a.every((t) => t >= 0 && t < HORIZON)).toBe(true);
      expect(a.length).toBeGreaterThan(10);
    }
  });

  it('batch traffic arrives only inside its burst window', () => {
    for (const seed of SEEDS) {
      const a = arrivals(cfgOf({ profile: 'batch', seed }));
      expect(a.every((t) => t >= 8 && t < 16)).toBe(true);
    }
  });
});

describe('simulate: warm or cold, decided by whether a warm instance is free', () => {
  it('every decision matches an independent rebuild, over profiles, seeds and settings', () => {
    for (const profile of PROFILES) {
      for (const seed of SEEDS) {
        for (const [provisioned, limit, idleReap] of [[0, 10, 8], [0, 2, 3], [3, 6, 30], [2, 20, 2]]) {
          checkDecisions(simulate(cfgOf({ profile, seed, provisioned, limit, idleReap, peakRate: 10 })));
        }
      }
    }
  });

  it('a cold request waits for provision, runtime and init before the handler; a warm one runs at once', () => {
    const run = simulate(cfgOf({ initS: 0.8 }), [1, 1.05, 5]);
    const [first, second, third] = run.requests;
    expect(first.outcome).toBe('cold');
    expect(first.handlerStart).toBeCloseTo(1 + PROVISION_S + RUNTIME_S + 0.8);
    expect(first.end! - first.at).toBeCloseTo(PROVISION_S + RUNTIME_S + 0.8 + HANDLER_S);
    // The second arrives while the first instance is still starting: no warm instance, so a second cold start.
    expect(second.outcome).toBe('cold');
    // By t = 5 both instances are idle: warm, on the lowest slot.
    expect(third.outcome).toBe('warm');
    expect(third.handlerStart).toBe(5);
    expect(run.instances[third.instance!].slot).toBe(0);
  });

  it('cold-start phases are contiguous and ordered', () => {
    const run = simulate(cfgOf({ initS: 1.1 }), [2]);
    const kinds = run.instances[0].segments.map((s) => s.kind);
    expect(kinds).toEqual(['provision', 'runtime', 'init', 'handler', 'idle']);
    const segs = run.instances[0].segments;
    segs.slice(1).forEach((s, i) => expect(s.start).toBe(segs[i].end));
  });

  it('an idle instance is reaped exactly idleReap after it finished, and a request at that instant misses it', () => {
    const cfg = cfgOf({ idleReap: 5, initS: 0 });
    const warm = simulate(cfg, [1, 1 + PROVISION_S + RUNTIME_S + HANDLER_S + 4.99]);
    expect(warm.requests[1].outcome).toBe('warm');
    const end = warm.instances[0].segments.find((s) => s.kind === 'handler')!.end;
    const reaped = simulate(cfg, [1, end + 5]);
    expect(reaped.instances[0].reapedAt).toBeCloseTo(end + 5);
    expect(reaped.requests[1].outcome).toBe('cold');
  });

  it('reaped instances free their slot, and the lowest free slot is reused', () => {
    const run = simulate(cfgOf({ idleReap: 2, initS: 0 }), [0, 0.1, 20]);
    expect(run.instances.map((i) => i.slot)).toEqual([0, 1, 0]);
  });

  it('reuse is limited to one request at a time: overlapping requests never share an instance', () => {
    for (const seed of SEEDS) {
      const run = simulate(cfgOf({ seed, peakRate: 12, limit: 20 }));
      for (const inst of run.instances) {
        const work = inst.segments.filter((s) => s.kind !== 'idle');
        work.slice(1).forEach((s, i) => expect(s.start).toBeGreaterThanOrEqual(work[i].end));
      }
    }
  });
});

describe('provisioned concurrency', () => {
  it('N at or above the peak load gives zero cold starts (every preset, many seeds)', () => {
    for (const profile of PROFILES) {
      for (const seed of SEEDS) {
        const times = arrivals(cfgOf({ profile, seed, peakRate: 12 }));
        const peak = peakDemand(times);
        for (const extra of [0, 1, 3]) {
          const run = simulate(cfgOf({ profile, seed, peakRate: 12, provisioned: peak + extra, limit: 30 }), times);
          expect(summaryAt(run, HORIZON).cold).toBe(0);
          expect(summaryAt(run, HORIZON).throttled).toBe(0);
        }
      }
    }
  });

  it('N below the peak load cold-starts at least once when the limit allows more instances', () => {
    for (const profile of PROFILES) {
      for (const seed of SEEDS) {
        const times = arrivals(cfgOf({ profile, seed, peakRate: 12 }));
        const peak = peakDemand(times);
        if (peak < 2) continue;
        const run = simulate(cfgOf({ profile, seed, peakRate: 12, provisioned: peak - 1, limit: 30 }), times);
        expect(summaryAt(run, HORIZON).cold).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('is capped at the concurrency limit, and provisioned instances are never reaped', () => {
    const run = simulate(cfgOf({ provisioned: 9, limit: 4, idleReap: 2 }), []);
    expect(run.provisionedInstances).toBe(4);
    expect(run.instances.every((i) => i.provisioned && i.reapedAt === null)).toBe(true);
    expect(stateAt(run.instances[0], HORIZON)).toBe('idle');
  });
});

describe('concurrency limit: throttle, never queue', () => {
  it('requests over the limit are throttled with no handler time; nothing is ever delayed beyond a cold start', () => {
    for (const profile of PROFILES) {
      for (const seed of SEEDS) {
        const cfg = cfgOf({ profile, seed, peakRate: 12, limit: 3 });
        const run = simulate(cfg);
        expect(run.requests.some((r) => r.outcome === 'throttled')).toBe(true);
        for (const r of run.requests) {
          if (r.outcome === 'throttled') {
            expect(r.handlerStart).toBeNull();
            expect(r.end).toBeNull();
          } else {
            const delay = r.handlerStart! - r.at;
            expect(delay).toBeCloseTo(r.outcome === 'warm' ? 0 : PROVISION_S + RUNTIME_S + cfg.initS);
          }
        }
        // At no moment are more than `limit` instances working.
        for (const r of run.requests) {
          const working = run.instances.filter((i) => i.segments.some((s) => s.kind !== 'idle' && s.start <= r.at && r.at < s.end));
          expect(working.length).toBeLessThanOrEqual(cfg.limit);
        }
      }
    }
  });

  it('a limit of 1 serves one request at a time and throttles every overlap', () => {
    const run = simulate(cfgOf({ limit: 1, initS: 0 }), [0, 0.2, 3]);
    expect(run.requests.map((r) => r.outcome)).toEqual(['cold', 'throttled', 'warm']);
  });
});

describe('cost model', () => {
  it('matches a hand-worked case', () => {
    // 10 requests, 5 billed seconds, 2 provisioned instances for 40 s = 80 instance-seconds.
    const dollars = functionCost({ requests: 10, billedSeconds: 5, provisionedInstanceSeconds: 80 });
    expect(dollars).toBeCloseTo(10 * 0.0000004 + 5 * 0.0000083 + 80 * 0.0000021, 12);
    expect(dollars).toBeCloseTo(0.000004 + 0.0000415 + 0.000168, 12);
  });

  it('is linear in requests, billed time and provisioned time', () => {
    const base = { requests: 7, billedSeconds: 3.5, provisionedInstanceSeconds: 20 };
    const one = functionCost(base);
    for (const k of [2, 5, 10]) {
      expect(functionCost({ requests: base.requests * k, billedSeconds: base.billedSeconds * k, provisionedInstanceSeconds: base.provisionedInstanceSeconds * k })).toBeCloseTo(one * k, 12);
    }
    expect(functionCost({ requests: 0, billedSeconds: 0, provisionedInstanceSeconds: 0 })).toBe(0);
    expect(functionCost({ ...base, requests: base.requests + 1 }) - one).toBeCloseTo(PRICE_PER_REQUEST, 12);
    expect(functionCost({ ...base, billedSeconds: base.billedSeconds + 1 }) - one).toBeCloseTo(PRICE_PER_BILLED_SECOND, 12);
    expect(functionCost({ ...base, provisionedInstanceSeconds: base.provisionedInstanceSeconds + 1 }) - one).toBeCloseTo(PRICE_PER_PROVISIONED_SECOND, 12);
  });

  it('bills handler time for every served request, plus init for cold starts, and nothing for throttled ones', () => {
    const run = simulate(cfgOf({ limit: 1, initS: 0.5 }), [0, 0.2, 5]);
    // cold (0.5 init + 0.3 handler), throttled, warm (0.3)
    expect(run.billedSeconds).toBeCloseTo(0.8 + 0.3);
  });

  it('scales the run to a month and sizes the VM fleet to the offered load', () => {
    const times = [0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08];
    const run = simulate(cfgOf({ limit: 30 }), times);
    const c = costs(run, times);
    expect(peakDemand(times)).toBe(9);
    expect(c.vms).toBe(Math.ceil(9 / VM_SLOTS));
    expect(c.vms).toBe(2);
    expect(c.vm).toBeCloseTo(2 * MONTH_S * PRICE_VM_PER_SECOND, 6);
    expect(c.functions).toBeCloseTo(functionCost({ requests: 9, billedSeconds: run.billedSeconds, provisionedInstanceSeconds: 0 }) * (MONTH_S / HORIZON), 6);
  });

  it('at the default sliders: spiky and batch favour functions, steady favours the VM', () => {
    const verdict = (profile: Profile) => {
      const cfg = cfgOf({ profile });
      const times = arrivals(cfg);
      const c = costs(simulate(cfg, times), times);
      return c.functions < c.vm ? 'functions' : 'vm';
    };
    expect(verdict('spiky')).toBe('functions');
    expect(verdict('batch')).toBe('functions');
    expect(verdict('steady')).toBe('vm');
  });
});

describe('the try-this prompts, run from the default state', () => {
  const at = (patch: Partial<Config>) => {
    const cfg = cfgOf(patch);
    const times = arrivals(cfg);
    const run = simulate(cfg, times);
    return { run, sum: summaryAt(run, HORIZON), cost: costs(run, times) };
  };

  it('defaults: cold starts set the tail while the median stays at the handler time', () => {
    const { sum } = at({});
    const sorted = [...sum.latencies].sort((a, b) => a - b);
    expect(sum.cold).toBeGreaterThan(0);
    expect(percentile(sorted, 0.5)).toBeCloseTo(HANDLER_S);
    expect(percentile(sorted, 0.99)).toBeCloseTo(PROVISION_S + RUNTIME_S + 0.8 + HANDLER_S);
  });

  it('init work of 3 s stretches p99 by exactly the extra init', () => {
    const base = summaryAt(simulate(cfgOf({})), HORIZON).latencies.sort((a, b) => a - b);
    const heavy = at({ initS: 3 }).sum.latencies.sort((a, b) => a - b);
    expect(percentile(heavy, 0.99) - percentile(base, 0.99)).toBeCloseTo(3 - 0.8);
  });

  it('provisioned 7: no cold starts, and the VM becomes the cheaper option', () => {
    const { sum, cost } = at({ provisioned: 7 });
    expect(sum.cold).toBe(0);
    expect(cost.vm).toBeLessThan(cost.functions);
  });

  it('steady traffic: the VM is cheaper', () => {
    const { cost } = at({ profile: 'steady' });
    expect(cost.vm).toBeLessThan(cost.functions);
  });

  it('limit 3: bursts are throttled', () => {
    expect(at({ limit: 3 }).sum.throttled).toBeGreaterThan(0);
  });

  it('quiz: five simultaneous requests with 3 provisioned instances leave two cold starts', () => {
    const run = simulate(cfgOf({ provisioned: 3, limit: 10 }), [1, 1.001, 1.002, 1.003, 1.004]);
    expect(summaryAt(run, HORIZON).cold).toBe(2);
    expect(summaryAt(run, HORIZON).warm).toBe(3);
    expect(lesson.quiz[2].options[lesson.quiz[2].answer]).toBe('Two of the five');
  });
});

describe('view', () => {
  it('bars are cut at now, stay inside the window, and never show the future', () => {
    const run = simulate(cfgOf({}));
    for (const now of [0, 3.5, 12, 25, HORIZON]) {
      const [lo, hi] = windowAt(now);
      for (const b of poolBars(run, now)) {
        expect(b.start).toBeGreaterThanOrEqual(lo);
        expect(b.end).toBeLessThanOrEqual(Math.min(hi, now) + 1e-9);
        expect(b.end).toBeGreaterThan(b.start);
      }
    }
  });

  it('the scene slot states agree with the instances: cold phases, busy, warm, reaped', () => {
    const run = simulate(cfgOf({ initS: 0.5, idleReap: 3 }), [1]);
    const stateAtT = (t: number) => slotsAt(run, t, 1)[0].state;
    expect(stateAtT(0.5)).toBeNull();
    expect(stateAtT(1.1)).toBe('provision');
    expect(stateAtT(1.5)).toBe('runtime');
    expect(stateAtT(1.9)).toBe('init');
    expect(stateAtT(2.4)).toBe('handler');
    expect(stateAtT(3)).toBe('idle');
    const reapAt = run.instances[0].reapedAt!;
    expect(stateAtT(reapAt + 0.1)).toBe('reaped');
    expect(stateAtT(reapAt + 5)).toBeNull();
    expect(laneCount(run)).toBe(1);
  });
});

describe('captions', () => {
  it('every frame of every combination has a glue-free caption that agrees with the run', () => {
    for (const profile of PROFILES) {
      for (const provisioned of [0, 3, 7]) {
        for (const limit of [2, 10]) {
          const run = simulate(cfgOf({ profile, provisioned, limit }));
          const frames = poolFrames(run);
          expect(frames.length).toBe(Math.round(HORIZON / STEP) + 2);
          frames.forEach((f, i) => {
            const text = expectCaption(f.say);
            if (i === 0 || i === frames.length - 1) return;
            const arrived = run.requests.filter((r) => r.at > f.now - STEP && r.at <= f.now);
            const n = (o: string) => arrived.filter((r) => r.outcome === o).length;
            expect(text.includes('cold start')).toBe(n('cold') > 0);
            expect(text.includes('warm hit')).toBe(n('warm') > 0);
            expect(text.includes('throttled')).toBe(n('throttled') > 0);
            expect(f.fresh).toEqual(arrived.map((r) => r.id));
          });
        }
      }
    }
  });

  it('the closing caption counts what the run did', () => {
    const run = simulate(cfgOf({}));
    const s = summaryAt(run, HORIZON);
    const last = expectCaption(poolFrames(run).at(-1)!.say);
    expect(last).toContain(`${s.cold} cold start`);
    expect(last).toContain(`${s.throttled} throttled`);
  });
});

describe('spectrum', () => {
  it('every row has one cell per column, and a row caption counts exactly its columns', () => {
    for (const row of ROWS) {
      expect(row.cells).toHaveLength(COLUMNS.length);
      const c = ownerCounts(row);
      expect(c.you.length + c.split.length + c.provider.length).toBe(COLUMNS.length);
      const text = expectCaption(rowCaption(row));
      expect(text).toContain(row.title);
      expect(text).toContain(`on you in ${c.you.length} column`);
    }
  });

  it('functions put the OS on the provider and a VM puts it on you', () => {
    const patching = ROWS.find((r) => r.id === 'patching')!;
    expect(patching.cells[0].owner).toBe('you');
    expect(patching.cells[3].owner).toBe('provider');
  });
});
