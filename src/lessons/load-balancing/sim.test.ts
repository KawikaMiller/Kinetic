import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { mulberry32 } from '../../core/random';
import { fleetCaption } from './captions';
import {
  advance, capacityPerSec, createWorld, DEFAULT_RATE, evenSplitLimit, HEALTH_DELAY, PRESETS, QUEUE_CAP, QUEUE_WARN, RATE_RANGE, setFleet, Sim, snapshot, spike, SPIKE, takeInsight, toggleServer,
  type Phase, type PresetId, type Req, type World,
} from './sim';
import { STRATEGIES, type StrategyId } from './strategies';

const DT = 0.05;
const SEEDS = [1, 2, 3, 4, 5];
const ids = STRATEGIES.map((s) => s.id);

/** A request in a given phase on a given server. */
const req = (id: number, server: number, phase: Phase): Req => ({ id, client: 0, work: 0.2, server, phase, tLB: 0, tPhase: 0, tEnd: 1 });

/**
 * Give server `i` exactly `loads[i]` requests in flight: one being processed, then queued ones, with a few still
 * travelling to it, so every term of "connections" is exercised.
 */
function injectLoads(sim: Sim, loads: readonly number[]) {
  let nextId = 1000;
  loads.forEach((n, i) => {
    const travelling = n % 3;
    const processing = n - travelling > 0 ? 1 : 0;
    const queued = n - travelling - processing;
    if (processing) sim.servers[i].current = req(nextId++, i, 'processing');
    for (let k = 0; k < queued; k++) sim.servers[i].queue.push(req(nextId++, i, 'queued'));
    for (let k = 0; k < travelling; k++) sim.reqs.push(req(nextId++, i, 'toServer'));
  });
}

const spec = { id: 1, client: 0, work: 0.2 };
const routeOne = (sim: Sim) => {
  sim.arrive({ ...spec, id: sim.reqs.length + 500 }, 0);
  return sim.reqs[sim.reqs.length - 1].server;
};

const equalSpeeds = PRESETS.equal.speeds;

describe('each strategy picks what its definition says', () => {
  it('round robin takes the servers in order, one each, and skips the ones the balancer thinks are down', () => {
    const sim = new Sim('rr', equalSpeeds);
    expect(Array.from({ length: 12 }, () => routeOne(sim))).toEqual([0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1]);

    const skipping = new Sim('rr', equalSpeeds);
    skipping.servers[2].healthy = false;
    expect(Array.from({ length: 9 }, () => routeOne(skipping))).toEqual([0, 1, 3, 4, 0, 1, 3, 4, 0]);
  });

  it('random is a uniform draw over the healthy servers, using one draw per request', () => {
    const sim = new Sim('random', equalSpeeds, mulberry32(11));
    sim.servers[1].healthy = false;
    const pool = [0, 2, 3, 4];
    const reference = mulberry32(11);
    for (let i = 0; i < 200; i++) expect(routeOne(sim)).toBe(pool[Math.floor(reference() * pool.length)]);
  });

  it('least connections picks the server with the fewest in flight (queued, processing or travelling), the first on a tie', () => {
    const gen = mulberry32(21);
    for (let trial = 0; trial < 200; trial++) {
      const loads = Array.from({ length: 5 }, () => Math.floor(gen() * 6));
      const sim = new Sim('least', equalSpeeds);
      injectLoads(sim, loads);
      expect(routeOne(sim), loads.join(',')).toBe(loads.indexOf(Math.min(...loads)));
    }
  });

  it('least connections only considers servers the balancer thinks are healthy', () => {
    const sim = new Sim('least', equalSpeeds);
    injectLoads(sim, [3, 0, 4, 5, 2]);
    sim.servers[1].healthy = false;
    expect(routeOne(sim)).toBe(4);
  });

  it('power of two choices compares two random servers and takes the one with fewer in flight, the first draw on a tie', () => {
    const gen = mulberry32(33);
    const pickRef = mulberry32(44);
    const sim = new Sim('p2c', equalSpeeds, mulberry32(44));
    for (let trial = 0; trial < 200; trial++) {
      const loads = Array.from({ length: 5 }, () => Math.floor(gen() * 6));
      sim.servers.forEach((s) => {
        s.queue = [];
        s.current = null;
      });
      sim.reqs = [];
      injectLoads(sim, loads);
      const a = Math.floor(pickRef() * 5);
      const b = Math.floor(pickRef() * 5);
      expect(routeOne(sim), loads.join(',')).toBe(loads[a] <= loads[b] ? a : b);
    }
  });

  it('weighted round robin gives each server turns in proportion to its speed (a full cycle of 17 picks, 5 times)', () => {
    const sim = new Sim('wrr', PRESETS.slow.speeds);
    const counts = [0, 0, 0, 0, 0];
    for (let i = 0; i < 85; i++) counts[routeOne(sim)]++;
    // speeds 1, 1, 1, 1, 0.25 are weights 4, 4, 4, 4, 1 out of 17 per cycle
    expect(counts).toEqual([20, 20, 20, 20, 5]);
  });

  it('weighted round robin interleaves like nginx smooth weighted round robin (an independent implementation)', () => {
    const weights = [...PRESETS.mixed.speeds];
    const current = weights.map(() => 0);
    const total = weights.reduce((a, b) => a + b, 0);
    const reference = () => {
      weights.forEach((w, i) => (current[i] += w));
      const best = current.indexOf(Math.max(...current));
      current[best] -= total;
      return best;
    };
    const sim = new Sim('wrr', PRESETS.mixed.speeds);
    for (let i = 0; i < 100; i++) expect(routeOne(sim)).toBe(reference());
  });
});

/** Run a world for `seconds` and note, per request, which server the strategy sent it to and when. */
function runWorld(strategy: StrategyId, seed: number, seconds: number, opts: { rate?: number; preset?: PresetId; world?: World } = {}) {
  const w = opts.world ?? createWorld(strategy, opts.rate ?? 11, seed);
  if (!opts.world) setFleet(w, opts.preset ?? 'slow');
  const maxQueue = [0, 0, 0, 0, 0];
  const routed: { id: number; server: number; at: number }[] = [];
  const seen = new Set<number>();
  const end = w.now + seconds;
  while (w.now < end - 1e-9) {
    advance(w, DT);
    const sim = w.sims[strategy];
    sim.servers.forEach((s, i) => (maxQueue[i] = Math.max(maxQueue[i], s.queue.length)));
    for (const r of sim.reqs) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        routed.push({ id: r.id, server: r.server, at: r.tLB });
      }
    }
  }
  return { w, maxQueue, routed, stats: w.sims[strategy].stats(w.now) };
}

describe('on the same seeded traffic', () => {
  it('every strategy is sent exactly the same requests', () => {
    const w = createWorld('rr', 11, 9);
    const logs = new Map<StrategyId, string[]>(ids.map((id) => [id, []]));
    for (let t = 0; t < 30; t += DT) {
      advance(w, DT);
      for (const id of ids) for (const r of w.sims[id].reqs) logs.get(id)!.push(`${r.id}:${r.client}:${r.work}`);
    }
    const unique = (id: StrategyId) => [...new Set(logs.get(id))].sort();
    for (const id of ids) expect(unique(id)).toEqual(unique('rr'));
    expect(unique('rr').length).toBeGreaterThan(200);
  });

  it('is deterministic: the same seed gives the same stats, and switching the displayed strategy changes nothing else', () => {
    const a = runWorld('rr', 4, 40).stats;
    expect(runWorld('rr', 4, 40).stats).toEqual(a);
    const shown = createWorld('rr', 11, 4);
    const other = createWorld('least', 11, 4);
    for (let t = 0; t < 40; t += DT) {
      advance(shown, DT);
      advance(other, DT);
    }
    expect(snapshot(shown).history).toEqual(snapshot(other).history);
  });

  it('p50 and p99 are the 50th and 99th percentile of the completed latencies in the last 10 s', () => {
    const { w } = runWorld('random', 2, 40);
    const sim = w.sims.random;
    const lats = sim.done.map((d) => d.lat).sort((a, b) => a - b);
    expect(lats.length).toBeGreaterThan(50);
    const stats = sim.stats(w.now);
    expect(stats.p50).toBe(lats[Math.floor(lats.length * 0.5)]);
    expect(stats.p99).toBe(lats[Math.floor(lats.length * 0.99)]);
    expect(sim.done.every((d) => w.now - d.t <= 10)).toBe(true);
  });
});

describe('one server four times slower than the rest (the lesson default)', () => {
  it('round robin and random overload it: its queue fills, requests are dropped, and p99 is many times least connections', () => {
    for (const seed of SEEDS) {
      const least = runWorld('least', seed, 60);
      for (const blind of ['rr', 'random'] as const) {
        const r = runWorld(blind, seed, 60);
        expect(r.maxQueue[4], `${blind} seed ${seed}`).toBe(QUEUE_CAP);
        expect(r.stats.dropped, `${blind} seed ${seed}`).toBeGreaterThan(20);
        expect(r.stats.p99, `${blind} seed ${seed}`).toBeGreaterThan(3 * least.stats.p99);
      }
    }
  });

  it('least connections, power of two and weighted round robin do not: no drops, and the slow server never has a nearly full queue', () => {
    for (const seed of SEEDS) {
      for (const id of ['least', 'p2c', 'wrr'] as const) {
        const r = runWorld(id, seed, 60);
        expect(r.stats.dropped, `${id} seed ${seed}`).toBe(0);
        expect(r.maxQueue[4], `${id} seed ${seed}`).toBeLessThan(QUEUE_WARN);
      }
    }
  });

  it('power of two keeps p99 under half of round robin\'s', () => {
    for (const seed of SEEDS) expect(runWorld('p2c', seed, 60).stats.p99, `seed ${seed}`).toBeLessThan(runWorld('rr', seed, 60).stats.p99 / 2);
  });

  it('p99 shows what the median hides: round robin p99 is many times its p50', () => {
    for (const seed of SEEDS) {
      const { stats } = runWorld('rr', seed, 60);
      expect(stats.p99, `seed ${seed}`).toBeGreaterThan(5 * stats.p50);
    }
  });
});

describe('the other fleets', () => {
  it('with all servers equal no strategy drops anything at the default rate', () => {
    for (const seed of SEEDS) {
      for (const id of ids) expect(runWorld(id, seed, 60, { preset: 'equal' }).stats.dropped, `${id} seed ${seed}`).toBe(0);
    }
  });

  it('on the mixed fleet the blind strategies overload the weak boxes and the load-aware ones do not', () => {
    for (const seed of SEEDS) {
      for (const id of ['rr', 'random'] as const) expect(runWorld(id, seed, 60, { preset: 'mixed' }).stats.dropped, `${id} seed ${seed}`).toBeGreaterThan(0);
      for (const id of ['least', 'wrr'] as const) expect(runWorld(id, seed, 60, { preset: 'mixed' }).stats.dropped, `${id} seed ${seed}`).toBe(0);
    }
  });
});

describe('killing a server', () => {
  /** Kill api-2 after a warm-up and follow the next few seconds. */
  function killAndWatch(strategy: StrategyId, seed: number) {
    const w = createWorld(strategy, 11, seed);
    setFleet(w, 'slow');
    runWorld(strategy, seed, 20, { world: w });
    const killedAt = w.now;
    const failedBefore = w.sims[strategy].failed;
    toggleServer(w, 1);
    const after = runWorld(strategy, seed, HEALTH_DELAY + 2, { world: w });
    const sim = w.sims[strategy];
    const during = after.routed.filter((r) => r.at >= killedAt && r.at < killedAt + HEALTH_DELAY);
    const later = after.routed.filter((r) => r.at >= killedAt + HEALTH_DELAY + 0.1);
    return { w, sim, during, later, failed: sim.failed - failedBefore };
  }

  it('the balancer keeps believing it is healthy for the health-check delay, then stops sending to it', () => {
    for (const id of ids) {
      const { sim, during, later } = killAndWatch(id, 3);
      expect(sim.servers[1].alive).toBe(false);
      expect(sim.servers[1].healthy).toBe(false);
      expect(during.some((r) => r.server === 1), id).toBe(true);
      expect(later.every((r) => r.server !== 1), id).toBe(true);
      expect(later.length).toBeGreaterThan(5);
    }
  });

  it('the requests sent to the dead server in that window fail, and none are sent after it', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { during, failed } = killAndWatch('rr', seed);
      expect(failed, `seed ${seed}`).toBeGreaterThanOrEqual(during.filter((r) => r.server === 1).length);
      expect(failed, `seed ${seed}`).toBeGreaterThan(0);
    }
  });

  it('least connections sends it more than its fair share and more than round robin does, because its count looks low', () => {
    const fairShare = 1 / 5;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const least = killAndWatch('least', seed);
      const rr = killAndWatch('rr', seed);
      const share = (during: typeof least.during) => during.filter((r) => r.server === 1).length / during.length;
      expect(share(least.during), `seed ${seed}`).toBeGreaterThan(fairShare * 1.5);
      expect(share(least.during), `seed ${seed}`).toBeGreaterThan(share(rr.during));
    }
  });

  it('a revived server is trusted only after the same delay', () => {
    const w = createWorld('rr', 11, 1);
    toggleServer(w, 2);
    runWorld('rr', 1, HEALTH_DELAY + 0.5, { world: w });
    expect(w.sims.rr.servers[2].healthy).toBe(false);
    expect(toggleServer(w, 2)).toBe(true);
    runWorld('rr', 1, HEALTH_DELAY - 0.3, { world: w });
    expect(w.sims.rr.servers[2].healthy).toBe(false);
    runWorld('rr', 1, 0.6, { world: w });
    expect(w.sims.rr.servers[2].healthy).toBe(true);
  });

  it('the insight about a dead server that looks idle fires for least connections, and for no other strategy', () => {
    for (const id of ids) {
      const w = createWorld(id, 11, 3);
      runWorld(id, 3, 10, { world: w });
      toggleServer(w, 1);
      const kinds = new Set<string | undefined>();
      for (let t = 0; t < HEALTH_DELAY - 0.2; t += DT) {
        advance(w, DT);
        kinds.add(takeInsight(w)?.kind);
      }
      expect(kinds.has('lying'), id).toBe(id === 'least');
    }
  });
});

describe('traffic spike', () => {
  it('multiplies the arrival rate by SPIKE.factor for SPIKE.seconds and then stops', () => {
    const count = (w: World) => w.nextId;
    const calm = createWorld('rr', 11, 5);
    const spiking = createWorld('rr', 11, 5);
    spike(spiking);
    for (let t = 0; t < SPIKE.seconds; t += DT) {
      advance(calm, DT);
      advance(spiking, DT);
    }
    const ratio = (count(spiking) - 1) / (count(calm) - 1);
    expect(ratio).toBeGreaterThan(SPIKE.factor * 0.9);
    expect(ratio).toBeLessThan(SPIKE.factor * 1.1);
    const before = count(spiking);
    for (let t = 0; t < 4; t += DT) advance(spiking, DT);
    expect((count(spiking) - before) / (4 * 11)).toBeLessThan(1.3);
  });
});

describe('fleet captions against the rate slider (extremes, not just the default)', () => {
  const dropsAt = (id: StrategyId, preset: PresetId, rate: number, seed: number) => runWorld(id, seed, 60, { preset, rate }).stats.dropped;

  it('the equal-fleet caption: nothing drops at the default and at the bottom of the slider, everything drops at the top, and the stated capacity is the independent sum', () => {
    expect(capacityPerSec(PRESETS.equal.speeds)).toBeCloseTo(5 / 0.25, 9);
    expect(RATE_RANGE.max).toBeGreaterThan(capacityPerSec(PRESETS.equal.speeds));
    for (const seed of SEEDS) {
      for (const id of ids) {
        expect(dropsAt(id, 'equal', DEFAULT_RATE, seed), `${id} default ${seed}`).toBe(0);
        expect(dropsAt(id, 'equal', RATE_RANGE.min, seed), `${id} min ${seed}`).toBe(0);
        expect(dropsAt(id, 'equal', RATE_RANGE.max, seed), `${id} max ${seed}`).toBeGreaterThan(0);
      }
    }
  });

  it('the mixed-fleet caption: the even split only overloads above its stated limit, so the blind strategies are fine at the bottom and overloaded at the default', () => {
    const limit = evenSplitLimit(PRESETS.mixed.speeds);
    expect(limit).toBeCloseTo((5 * 0.35) / 0.25, 9);
    expect(RATE_RANGE.min).toBeLessThan(limit);
    expect(DEFAULT_RATE).toBeGreaterThan(limit);
    for (const seed of SEEDS) {
      for (const id of ['rr', 'random'] as const) {
        expect(dropsAt(id, 'mixed', RATE_RANGE.min, seed), `${id} min ${seed}`).toBe(0);
        expect(dropsAt(id, 'mixed', DEFAULT_RATE, seed), `${id} default ${seed}`).toBeGreaterThan(0);
        expect(dropsAt(id, 'mixed', RATE_RANGE.max, seed), `${id} max ${seed}`).toBeGreaterThan(0);
      }
    }
  });

  it('the captions name the default rate and the numbers the model computes', () => {
    const mixed = captionText(fleetCaption('mixed'));
    const equal = captionText(fleetCaption('equal'));
    expect(equal).toContain(`default ${DEFAULT_RATE} req/s`);
    expect(equal).toContain(`near ${Math.floor(capacityPerSec(PRESETS.equal.speeds))} req/s`);
    expect(mixed).toContain(`about ${Math.floor(evenSplitLimit(PRESETS.mixed.speeds))} req/s`);
  });
});
