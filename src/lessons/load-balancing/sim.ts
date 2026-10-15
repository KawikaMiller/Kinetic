// A small discrete load-balancer simulation. Several copies run side by side
// (one per strategy) on identical traffic, so the chart compares them fairly.
import { expSample, mulberry32, pick, randInt, type Rnd } from '../../core/random';
import { createCooldown, createSampler, percentile, trimWindow } from '../../core/sim';
import { STRATEGIES, type StrategyId } from './strategies';

export type { StrategyId } from './strategies';

export const TRAVEL_IN = 0.4; // client → LB (s)
export const TRAVEL_OUT = 0.35; // LB → server (s)
export const TRAVEL_BACK = 0.5; // server → client (s)
export const FAIL_FADE = 0.8; // how long a failed/dropped request stays on screen (s)
export const HEALTH_DELAY = 1.4; // how long before the LB notices a change (s)
export const QUEUE_CAP = 12;
/** A queue this close to full counts as "choking" (drawn red, narrated). */
export const QUEUE_WARN = QUEUE_CAP - 2;
const STATS_WINDOW = 10; // latency percentiles over the last 10 s
const THROUGHPUT_WINDOW = 5;

export interface Spec {
  id: number;
  client: number;
  work: number; // seconds of work at 1× speed
}

export type Phase = 'toServer' | 'queued' | 'processing' | 'back' | 'failed' | 'dropped';

export interface Req extends Spec {
  server: number; // -1 = rejected at the LB
  phase: Phase;
  tLB: number;
  tPhase: number;
  tEnd: number;
}

export interface Srv {
  speed: number;
  alive: boolean;
  healthy: boolean; // what the LB believes
  healthAt: number | null;
  queue: Req[];
  current: Req | null;
  util: number;
  wrr: number;
}

export class Sim {
  servers: Srv[];
  reqs: Req[] = [];
  done: { t: number; lat: number }[] = [];
  failed = 0;
  dropped = 0;
  private rr = 0;
  readonly strategy: StrategyId;
  private readonly rnd: Rnd;

  constructor(strategy: StrategyId, speeds: readonly number[], rnd: Rnd = Math.random) {
    this.rnd = rnd;
    this.strategy = strategy;
    this.servers = speeds.map((speed) => ({
      speed, alive: true, healthy: true, healthAt: null, queue: [], current: null, util: 0, wrr: 0,
    }));
  }

  setSpeeds(speeds: readonly number[]) {
    this.servers.forEach((s, i) => (s.speed = speeds[i]));
  }

  kill(i: number, now: number) {
    const s = this.servers[i];
    if (!s.alive) return;
    s.alive = false;
    s.healthAt = now + HEALTH_DELAY;
    for (const r of [...s.queue, ...(s.current ? [s.current] : [])]) this.fail(r, now);
    s.queue = [];
    s.current = null;
  }

  revive(i: number, now: number) {
    const s = this.servers[i];
    if (s.alive) return;
    s.alive = true;
    s.healthAt = now + HEALTH_DELAY;
  }

  load(i: number) {
    const s = this.servers[i];
    return s.queue.length + (s.current ? 1 : 0) + this.reqs.filter((r) => r.server === i && r.phase === 'toServer').length;
  }

  private pick(): number {
    const pool = this.servers.map((s, i) => (s.healthy ? i : -1)).filter((i) => i >= 0);
    if (!pool.length) return -1;
    switch (this.strategy) {
      case 'rr': {
        // walk the ring, skipping servers the LB considers unhealthy
        for (let k = 0; k < this.servers.length; k++) {
          const i = this.rr++ % this.servers.length;
          if (this.servers[i].healthy) return i;
        }
        return -1;
      }
      case 'random':
        return pick(pool, this.rnd);
      case 'least':
        return pool.reduce((best, i) => (this.load(i) < this.load(best) ? i : best), pool[0]);
      case 'p2c': {
        const a = pick(pool, this.rnd);
        const b = pick(pool, this.rnd);
        return this.load(a) <= this.load(b) ? a : b;
      }
      case 'wrr': {
        // nginx-style smooth weighted round robin, weight = speed
        let total = 0;
        let best = pool[0];
        for (const i of pool) {
          const s = this.servers[i];
          s.wrr += s.speed;
          total += s.speed;
          if (s.wrr > this.servers[best].wrr) best = i;
        }
        this.servers[best].wrr -= total;
        return best;
      }
    }
  }

  private fail(r: Req, now: number) {
    r.phase = 'failed';
    r.tPhase = now;
    this.failed++;
  }

  arrive(spec: Spec, now: number) {
    const server = this.pick();
    const r: Req = { ...spec, server, phase: 'toServer', tLB: now, tPhase: now, tEnd: 0 };
    this.reqs.push(r);
    if (server < 0) this.fail(r, now); // 503: nothing healthy
  }

  step(now: number, dt: number) {
    for (const s of this.servers) {
      if (s.healthAt !== null && now >= s.healthAt) {
        s.healthy = s.alive;
        s.healthAt = null;
      }
    }

    for (const r of this.reqs) {
      if (r.phase !== 'toServer' || now - r.tPhase < TRAVEL_OUT) continue;
      const s = this.servers[r.server];
      if (!s.alive) this.fail(r, now);
      else if (s.queue.length >= QUEUE_CAP) {
        r.phase = 'dropped';
        r.tPhase = now;
        this.dropped++;
      } else {
        r.phase = 'queued';
        r.tPhase = now;
        s.queue.push(r);
      }
    }

    this.servers.forEach((s) => {
      if (!s.alive) {
        s.util += (0 - s.util) * Math.min(1, dt * 3);
        return;
      }
      if (s.current && now >= s.current.tEnd) {
        const r = s.current;
        r.phase = 'back';
        r.tPhase = now;
        this.done.push({ t: now, lat: now - r.tLB });
        s.current = null;
      }
      if (!s.current && s.queue.length) {
        const r = s.queue.shift()!;
        r.phase = 'processing';
        r.tPhase = now;
        r.tEnd = now + r.work / s.speed;
        s.current = r;
      }
      s.util += ((s.current ? 1 : 0) - s.util) * Math.min(1, dt * 1.5);
    });

    this.reqs = this.reqs.filter((r) => {
      if (r.phase === 'back') return now - r.tPhase < TRAVEL_BACK;
      if (r.phase === 'failed' || r.phase === 'dropped') return now - r.tPhase < FAIL_FADE;
      return true;
    });
    trimWindow(this.done, now, STATS_WINDOW, (d) => d.t);
  }

  /** Rolling stats over the last 10 s. */
  stats(now: number) {
    const lats = this.done.map((d) => d.lat).sort((a, b) => a - b);
    const recent = this.done.filter((d) => now - d.t <= THROUGHPUT_WINDOW).length;
    return {
      p50: percentile(lats, 0.5),
      p99: percentile(lats, 0.99),
      throughput: recent / THROUGHPUT_WINDOW,
      failed: this.failed,
      dropped: this.dropped,
    };
  }
}

export type SimStats = ReturnType<Sim['stats']>;

/* ─── The lesson's world: shared traffic feeding one sim per strategy ─── */

export const SERVER_COUNT = 5;
export const CLIENT_COUNT = 3;
export const HISTORY = 60; // p99 samples at 0.5 s = 30 s
const SAMPLE_EVERY = 0.5;
export const SPIKE = { factor: 3, seconds: 4 };
export const INSIGHT_COOLDOWN = 9;
/** The seed of the lesson's traffic: every load of the lesson sees the same requests. */
export const TRAFFIC_SEED = 7;
const BURSTINESS = { min: 0.4, spread: 1.2 }; // arrivals jitter between 0.4× and 1.6× the rate
const WORK = { base: 0.1, mean: 0.15 }; // seconds of work per request at 1× speed

export const PRESETS = {
  equal: { label: 'All equal', speeds: [1, 1, 1, 1, 1] },
  slow: { label: 'One slow server', speeds: [1, 1, 1, 1, 0.25] },
  mixed: { label: 'Mixed fleet', speeds: [1.6, 1.2, 1, 0.6, 0.35] },
} as const;
export type PresetId = keyof typeof PRESETS;

/** The request rate the slider starts at (req/s). */
export const DEFAULT_RATE = 11;
/** The slider's range (req/s). */
export const RATE_RANGE = { min: 2, max: 24 } as const;

/** Mean seconds of work a request needs at 1x speed. */
const MEAN_WORK_S = WORK.base + WORK.mean;
/** Requests per second a fleet can finish in total if its servers were never idle or overloaded. */
export const capacityPerSec = (speeds: readonly number[]) => speeds.reduce((a, b) => a + b, 0) / MEAN_WORK_S;
/** The rate above which an even split (round robin, random) hands the slowest server more than it can finish. */
export const evenSplitLimit = (speeds: readonly number[]) => (speeds.length * Math.min(...speeds)) / MEAN_WORK_S;

export const serverName = (i: number) => `api-${i + 1}`;

type Sampler = ReturnType<typeof createSampler<number>>;

/** All mutable sim state; the canvas reads it every frame without re-rendering React. */
export interface World {
  now: number;
  acc: number;
  nextId: number;
  spikeUntil: number;
  prevHealthy: boolean[];
  pending: { spec: Spec; t0: number }[];
  sims: Record<StrategyId, Sim>;
  history: Record<StrategyId, Sampler>;
  strategy: StrategyId;
  rate: number;
  insight: ReturnType<typeof createCooldown>;
  /** The traffic's random stream: the same seed gives the same requests. */
  rnd: Rnd;
  seed: number;
}

const perStrategy = <T>(make: (id: StrategyId) => T) =>
  Object.fromEntries(STRATEGIES.map((s) => [s.id, make(s.id)])) as Record<StrategyId, T>;

export function createWorld(strategy: StrategyId, rate: number, seed = TRAFFIC_SEED): World {
  const insight = createCooldown(INSIGHT_COOLDOWN, { armed: true }); // the first insight can fire right away
  return {
    now: 0,
    acc: 0,
    nextId: 1,
    spikeUntil: -1,
    prevHealthy: Array(SERVER_COUNT).fill(true),
    pending: [],
    sims: perStrategy((id) => new Sim(id, PRESETS.slow.speeds, mulberry32(seed + 1 + STRATEGIES.findIndex((s) => s.id === id)))),
    history: perStrategy(() => createSampler<number>({ every: SAMPLE_EVERY, cap: HISTORY })),
    strategy,
    rate,
    insight,
    rnd: mulberry32(seed),
    seed,
  };
}

const allSims = (w: World) => Object.values(w.sims);

export interface HealthChange {
  server: number;
  healthy: boolean;
}

/** Advance by dt: new traffic, routing in every sim, chart samples. Returns health-check transitions. */
export function advance(w: World, dt: number): HealthChange[] {
  w.now += dt;
  const now = w.now;
  const spiking = now < w.spikeUntil;

  // new requests leave the clients
  w.acc += w.rate * (spiking ? SPIKE.factor : 1) * dt * (BURSTINESS.min + w.rnd() * BURSTINESS.spread);
  while (w.acc >= 1) {
    w.acc -= 1;
    const client = randInt(0, CLIENT_COUNT - 1, w.rnd);
    const spec: Spec = { id: w.nextId++, client, work: WORK.base + expSample(WORK.mean, w.rnd) };
    w.pending.push({ spec, t0: now });
  }
  // ...and reach the LB, where every strategy's sim routes the same request
  while (w.pending.length && now - w.pending[0].t0 >= TRAVEL_IN) {
    const { spec } = w.pending.shift()!;
    for (const sim of allSims(w)) sim.arrive(spec, now);
  }
  for (const sim of allSims(w)) sim.step(now, dt);

  // health-check transitions are identical across sims
  const changes: HealthChange[] = [];
  w.sims.rr.servers.forEach((srv, i) => {
    if (srv.healthy === w.prevHealthy[i]) return;
    w.prevHealthy[i] = srv.healthy;
    changes.push({ server: i, healthy: srv.healthy });
  });

  for (const sim of allSims(w)) w.history[sim.strategy].tick(now, () => sim.stats(now).p99);
  return changes;
}

export type Insight = { kind: 'lying' | 'choking'; server: number };

/** An insight worth narrating right now, if the cooldown allows one. Firing it re-arms the cooldown. */
export function takeInsight(w: World): Insight | null {
  if (!w.insight.ready(w.now)) return null;
  const sim = w.sims[w.strategy];
  const choking = sim.servers.findIndex((srv) => srv.alive && srv.queue.length >= QUEUE_WARN);
  const lying = sim.servers.findIndex((srv) => !srv.alive && srv.healthy);
  let insight: Insight | null = null;
  if (lying >= 0 && w.strategy === 'least') insight = { kind: 'lying', server: lying };
  else if (choking >= 0 && w.strategy !== 'least' && w.strategy !== 'p2c') insight = { kind: 'choking', server: choking };
  if (insight) w.insight.fire(w.now);
  return insight;
}

export function spike(w: World) {
  w.spikeUntil = w.now + SPIKE.seconds;
}

/** Kill a live server or revive a dead one, in every sim. Returns whether it's alive now. */
export function toggleServer(w: World, i: number): boolean {
  const alive = w.sims.rr.servers[i].alive;
  for (const sim of allSims(w)) {
    if (alive) sim.kill(i, w.now);
    else sim.revive(i, w.now);
  }
  return !alive;
}

export function setFleet(w: World, preset: PresetId) {
  for (const sim of allSims(w)) sim.setSpeeds(PRESETS[preset].speeds);
}

/** What React renders: the visible strategy's stats and every strategy's p99 history. */
export function snapshot(w: World) {
  return {
    stats: w.sims[w.strategy].stats(w.now),
    alive: w.sims[w.strategy].servers.map((s) => s.alive),
    history: perStrategy((id) => [...w.history[id].values]),
  };
}

export type Snapshot = ReturnType<typeof snapshot>;
