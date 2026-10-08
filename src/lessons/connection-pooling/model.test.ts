import { describe, expect, it } from 'vitest';
import { ACQUIRE_TIMEOUT_MS, advance, CONNECT_PARTS, createWorld, gauges, inFlight, LEAK_FLAG_MS, littlesLaw, summarize, tick, TICK_MS, type Config, type World } from './model';
import { SCENARIOS, scenarioConfig } from './scenarios';

const base: Config = { rate: 300, instances: 2, poolSize: 6, dbMax: 100, queryMs: 20, usePool: true, leak: false };

/** Run `seconds`, calling `check` after every tick. */
function run(cfg: Config, seconds: number, check: (w: World) => void, seed?: number): World {
  const w = createWorld(cfg, seed);
  for (let i = 0; i < (seconds * 1000) / TICK_MS; i++) {
    tick(w, cfg);
    check(w);
  }
  return w;
}

describe('requests are never lost or invented', () => {
  it('arrived = served + timed out + refused + in flight, on every tick, for every preset', () => {
    for (const s of SCENARIOS) {
      run(s.config, 8, (w) => {
        expect(w.arrived, s.id).toBe(w.served + w.timedOut + w.refusedRequests + inFlight(w));
      });
    }
  });
  it('is deterministic: the same seed gives the same run', () => {
    const a = summarize(run(base, 5, () => {}, 3), base);
    const b = summarize(run(base, 5, () => {}, 3), base);
    expect(a).toEqual(b);
  });
});

describe('the pool', () => {
  it('never has more connections in use than it has slots, per pool and in all', () => {
    for (const s of SCENARIOS.filter((x) => x.config.usePool)) {
      run(s.config, 8, (w) => {
        const g = gauges(w);
        expect(g.inUse, s.id).toBeLessThanOrEqual(s.config.instances * s.config.poolSize);
        for (const p of w.pools) expect(p.slots.filter((x) => x.state === 'busy' || x.state === 'leaked').length).toBeLessThanOrEqual(s.config.poolSize);
      });
    }
  });
  it('the database never holds more than its maximum; slots it refuses are counted', () => {
    const cfg = { ...base, instances: 20, poolSize: 50, dbMax: 500 };
    let most = 0;
    const w = run(cfg, 6, (x) => {
      most = Math.max(most, gauges(x).open);
      expect(gauges(x).open).toBeLessThanOrEqual(500);
    });
    expect(most).toBe(500);
    // 20 x 50 = 1,000 slots asked for, 500 accepted: the other 500 are refused at start and again each retry
    expect(gauges(w).failed).toBe(500);
    expect(w.refusedOpens).toBeGreaterThanOrEqual(500);
  });
  it('total connections at the database = the sum of the pools\' slots the database accepted', () => {
    const w = run({ ...base, instances: 5, poolSize: 7 }, 3, () => {});
    const sum = w.pools.reduce((n, p) => n + p.slots.filter((s) => s.state !== 'failed').length, 0);
    expect(gauges(w).open).toBe(sum);
    expect(sum).toBe(35);
  });
  it('a request that queues either gets a slot or fails at exactly the acquire timeout (within one tick)', () => {
    const cfg = scenarioConfig('small');
    const w = run(cfg, 10, () => {});
    expect(w.timedOut).toBeGreaterThan(0);
    expect(w.timeoutWaits.min).toBeGreaterThanOrEqual(ACQUIRE_TIMEOUT_MS);
    expect(w.timeoutWaits.max).toBeLessThan(ACQUIRE_TIMEOUT_MS + TICK_MS);
    for (const p of w.pools) for (const t of p.queue) expect(w.time - t).toBeLessThan(ACQUIRE_TIMEOUT_MS);
  });
  it('a pool big enough for the load never times anything out', () => {
    const w = run(scenarioConfig('right'), 20, () => {});
    expect(w.timedOut).toBe(0);
    expect(w.served).toBeGreaterThan(4500);
  });
});

describe('a leak', () => {
  const cfg = scenarioConfig('leak');
  it('leaked connections never come back: the count only ever goes up', () => {
    let last = 0;
    run(cfg, 30, (w) => {
      const n = gauges(w).leaked;
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    });
    expect(last).toBeGreaterThan(0);
  });
  it('leak detection flags a leaked connection only once it has been held past the threshold', () => {
    run(cfg, 30, (w) => {
      const flagged = w.pools.flatMap((p) => p.slots).filter((s) => s.state === 'leaked' && s.heldMs > LEAK_FLAG_MS).length;
      expect(gauges(w).flagged).toBe(flagged);
      expect(gauges(w).flagged).toBeLessThanOrEqual(gauges(w).leaked);
    });
  });
  it('runs the pool dry: every slot leaked, then every new request times out', () => {
    const w = run(cfg, 40, () => {});
    expect(gauges(w).leaked).toBe(cfg.instances * cfg.poolSize);
    const servedThen = w.served;
    const timedThen = w.timedOut;
    advance(w, cfg, 10);
    expect(w.served).toBe(servedThen);
    expect(w.timedOut - timedThen).toBeGreaterThan(500);
    expect(gauges(w).flagged).toBe(cfg.instances * cfg.poolSize);
  });
  it('without the leak the same load keeps every connection', () => {
    const w = run({ ...cfg, leak: false }, 40, () => {});
    expect(gauges(w).leaked).toBe(0);
    expect(w.timedOut).toBe(0);
  });
});

describe('no pool', () => {
  const cfg = scenarioConfig('nopool');
  it('every request pays the whole connect cost: its latency is at least the shortest handshake plus the query', () => {
    const w = run(cfg, 10, () => {});
    const floor = CONNECT_PARTS.tcp[0] + CONNECT_PARTS.tls[0] + CONNECT_PARTS.auth[0] + cfg.queryMs;
    expect(Math.min(...w.latencies)).toBeGreaterThanOrEqual(floor);
    expect(w.connects.count).toBe(w.arrived - w.refusedRequests);
  });
  it('is slower than a pool for the same traffic', () => {
    const pooled = { ...cfg, usePool: true };
    const a = summarize(run(cfg, 20, () => {}), cfg);
    const b = summarize(run(pooled, 20, () => {}), pooled);
    expect(a.p50).toBeGreaterThan(b.p50 + 20);
  });
  it('turns requests away once the database is at its maximum', () => {
    const tiny = { ...cfg, dbMax: 5 };
    const w = run(tiny, 10, (x) => expect(gauges(x).open).toBeLessThanOrEqual(5));
    expect(w.refusedRequests).toBeGreaterThan(0);
  });
});

describe('too many connections slow the database', () => {
  it('the same queries take longer with 1,000 connections asked for than with a pool sized to the load', () => {
    const big = scenarioConfig('toobig');
    const sized: Config = { ...big, instances: 2, poolSize: 8, dbMax: 500 };
    const a = summarize(run(big, 15, () => {}), big);
    const b = summarize(run(sized, 15, () => {}), sized);
    expect(a.slowdown).toBeGreaterThan(b.slowdown);
    expect(a.p50).toBeGreaterThan(b.p50);
  });
});

describe("Little's law", () => {
  it('sizes the pool at rate x hold time: 100/s at 20 ms is 2 connections', () => {
    expect(littlesLaw(100, 20)).toBe(2);
    expect(littlesLaw(400, 20)).toBe(8);
    expect(littlesLaw(0, 20)).toBe(0);
  });
  it('the measured mean in use is within 10% of rate x query time over a long seeded run', () => {
    for (const [rate, queryMs] of [[100, 20], [150, 20], [60, 50]]) {
      const cfg: Config = { rate, instances: 1, poolSize: 50, dbMax: 1000, queryMs, usePool: true, leak: false };
      const w = createWorld(cfg, 21);
      advance(w, cfg, 600);
      const expected = littlesLaw(rate, queryMs);
      expect(Math.abs(summarize(w, cfg).meanInUse - expected) / expected, `${rate}/s ${queryMs} ms`).toBeLessThan(0.1);
    }
  });
});

describe('the try-this steps, from the default preset', () => {
  it('Pool too small queues and times out; raising the pool to 5 stops it', () => {
    const small = scenarioConfig('small');
    const a = run(small, 15, () => {});
    expect(summarize(a, small).timedOut).toBeGreaterThan(0);
    expect(gauges(a).waiting).toBeGreaterThan(0);
    const bigger = { ...small, poolSize: 5 };
    expect(run(bigger, 15, () => {}).timedOut).toBe(0);
  });
});
