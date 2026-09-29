// A small discrete load-balancer simulation. Several copies run side by side
// (one per strategy) on identical traffic, so the chart compares them fairly.

export type StrategyId = 'rr' | 'random' | 'least' | 'p2c' | 'wrr';

export const TRAVEL_IN = 0.4; // client → LB (s)
export const TRAVEL_OUT = 0.35; // LB → server (s)
export const TRAVEL_BACK = 0.5; // server → client (s)
export const HEALTH_DELAY = 1.4; // how long before the LB notices a change (s)
export const QUEUE_CAP = 12;

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

  constructor(strategy: StrategyId, speeds: number[]) {
    this.strategy = strategy;
    this.servers = speeds.map((speed) => ({
      speed, alive: true, healthy: true, healthAt: null, queue: [], current: null, util: 0, wrr: 0,
    }));
  }

  setSpeeds(speeds: number[]) {
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
        return pool[Math.floor(Math.random() * pool.length)];
      case 'least':
        return pool.reduce((best, i) => (this.load(i) < this.load(best) ? i : best), pool[0]);
      case 'p2c': {
        const a = pool[Math.floor(Math.random() * pool.length)];
        const b = pool[Math.floor(Math.random() * pool.length)];
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
      if (r.phase === 'failed' || r.phase === 'dropped') return now - r.tPhase < 0.8;
      return true;
    });
    while (this.done.length && now - this.done[0].t > 10) this.done.shift();
  }

  /** Rolling stats over the last 10 s. */
  stats(now: number) {
    const lats = this.done.map((d) => d.lat).sort((a, b) => a - b);
    const q = (p: number) => (lats.length ? lats[Math.min(lats.length - 1, Math.floor(p * lats.length))] : 0);
    const recent = this.done.filter((d) => now - d.t <= 5).length;
    return { p50: q(0.5), p99: q(0.99), throughput: recent / 5, failed: this.failed, dropped: this.dropped };
  }
}
