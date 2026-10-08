// A simplified app, connection pool and database, stepped in fixed ticks from a seed. Pure: no
// React, no clock. The numbers (connect cost, query cost, cores) are illustrative.
import { expSample, mulberry32, randRange, type Rnd } from '../../core/random';
import { percentile } from '../../core/sim';

export const TICK_MS = 5;
/** Queries the database runs truly in parallel; more than this share its cores (processor sharing). */
export const CORES = 8;
/** Extra cost per query when the database holds its maximum number of connections: 1 + OVERHEAD at the limit. */
export const OVERHEAD = 1;
/** The share of requests that take a connection and never give it back, when the leak is switched on. */
export const LEAK_RATE = 0.05;
/** A connection held longer than this is flagged by leak detection. */
export const LEAK_FLAG_MS = 2000;
/** A slot the database refused is tried again after this long. */
export const RETRY_MS = 2000;
export const ACQUIRE_TIMEOUT_MS = 1000;
/** Parts of opening a connection, each a range in ms: TCP handshake, TLS handshake, authentication. 20 to 50 ms in all. */
export const CONNECT_PARTS = { tcp: [5, 10], tls: [10, 25], auth: [5, 15] } as const;
export const SEED = 11;
const LATENCY_WINDOW = 400;
const HISTORY_EVERY_MS = 250;
export const HISTORY_LENGTH = 60;
/** How far back the measured mean of connections in use looks, so it follows a change of rate instead of averaging the whole run. */
export const MEAN_WINDOW_MS = 10_000;
/** A query shorter than one tick still holds its connection for a whole tick, so this is the shortest hold the model can show. */
export const effectiveHoldMs = (queryMs: number) => Math.max(queryMs, TICK_MS);

export interface Config {
  /** Requests a second, spread over every app instance. */
  rate: number;
  instances: number;
  /** Connections each instance's pool holds (a fixed-size pool, opened at start). */
  poolSize: number;
  /** Connections the database accepts. */
  dbMax: number;
  queryMs: number;
  /** With no pool every request opens, uses and closes its own connection. */
  usePool: boolean;
  leak: boolean;
}

/** The settings that change the shape of the world: changing one starts a fresh run. */
export const shapeKey = (c: Config) => `${c.usePool}|${c.instances}|${c.poolSize}|${c.dbMax}`;

export type SlotState = 'idle' | 'opening' | 'busy' | 'leaked' | 'failed';

export interface Slot {
  state: SlotState;
  /** Ms left of the handshake (opening) or of the query's work (busy). */
  left: number;
  /** When the request using it arrived, in ms. */
  arrivedAt: number;
  /** This request will never give the connection back. */
  leaks: boolean;
  /** Ms since the request started using it. */
  heldMs: number;
  retryAt: number;
}

export interface Pool {
  slots: Slot[];
  /** Arrival times of requests waiting for a slot, oldest first. */
  queue: number[];
}

export interface World {
  rnd: Rnd;
  time: number;
  carry: number;
  nextArrival: number;
  pools: Pool[];
  /** With no pool: the connections in flight, each carrying one request. */
  direct: Slot[];
  arrived: number;
  served: number;
  timedOut: number;
  /** Requests turned away because the database was at its maximum (no pool). */
  refusedRequests: number;
  /** Times a pool's attempt to open a connection was refused by the database. */
  refusedOpens: number;
  /** The shortest and longest a request waited when it timed out. */
  timeoutWaits: { min: number; max: number };
  latencies: number[];
  connects: { count: number; tcp: number; tls: number; auth: number };
  /** Connections in use summed over the ticks of the bucket being filled. */
  inUseSum: number;
  /** Ticks in that bucket. */
  ticks: number;
  /** Finished buckets of the last MEAN_WINDOW_MS, oldest first. */
  inUseWindow: { sum: number; ticks: number }[];
  sinceHistory: number;
  /** Longest wait of any queued request now, sampled every 250 ms. */
  waitHistory: number[];
}

const newSlot = (state: SlotState): Slot => ({ state, left: 0, arrivedAt: 0, leaks: false, heldMs: 0, retryAt: 0 });

function sampleConnect(w: World) {
  const [t0, t1] = CONNECT_PARTS.tcp;
  const [s0, s1] = CONNECT_PARTS.tls;
  const [a0, a1] = CONNECT_PARTS.auth;
  const tcp = randRange(t0, t1, w.rnd);
  const tls = randRange(s0, s1, w.rnd);
  const auth = randRange(a0, a1, w.rnd);
  w.connects.count += 1;
  w.connects.tcp += tcp;
  w.connects.tls += tls;
  w.connects.auth += auth;
  return tcp + tls + auth;
}

/** Connections the database holds: every pool slot it accepted (idle or not), or every direct connection. */
export function openCount(w: World): number {
  return w.direct.length + w.pools.reduce((n, p) => n + p.slots.filter((s) => s.state !== 'failed').length, 0);
}

function tryOpen(w: World, slot: Slot, dbMax: number) {
  if (openCount(w) >= dbMax) {
    slot.state = 'failed';
    slot.retryAt = w.time + RETRY_MS;
    w.refusedOpens += 1;
    return;
  }
  slot.state = 'opening';
  slot.left = sampleConnect(w);
}

export function createWorld(cfg: Config, seed = SEED): World {
  const rnd = mulberry32(seed);
  const w: World = {
    rnd, time: 0, carry: 0, nextArrival: Infinity, pools: [], direct: [], arrived: 0, served: 0, timedOut: 0, refusedRequests: 0, refusedOpens: 0,
    timeoutWaits: { min: Infinity, max: 0 }, latencies: [], connects: { count: 0, tcp: 0, tls: 0, auth: 0 }, inUseSum: 0, ticks: 0, inUseWindow: [], sinceHistory: 0, waitHistory: [],
  };
  if (cfg.usePool) {
    for (let i = 0; i < cfg.instances; i++) {
      const pool: Pool = { slots: [], queue: [] };
      w.pools.push(pool);
      for (let k = 0; k < cfg.poolSize; k++) {
        const slot = newSlot('failed');
        pool.slots.push(slot);
        tryOpen(w, slot, cfg.dbMax);
      }
    }
  }
  w.nextArrival = cfg.rate > 0 ? expSample(1000 / cfg.rate, rnd) : Infinity;
  return w;
}

const isBusy = (s: Slot) => s.state === 'busy';

/** Queries the database is running now (a leaked connection is held but idle). */
const busyCount = (w: World) => w.direct.filter(isBusy).length + w.pools.reduce((n, p) => n + p.slots.filter(isBusy).length, 0);

/** How many times slower each running query is: cores shared past CORES, plus the cost of holding many connections. */
export function slowdown(w: World, cfg: Config): number {
  const busy = busyCount(w);
  const fullness = Math.min(1, openCount(w) / cfg.dbMax);
  return Math.max(1, busy / CORES) * (1 + OVERHEAD * fullness * fullness);
}

function startWork(w: World, cfg: Config, slot: Slot, arrivedAt: number) {
  slot.state = 'busy';
  slot.left = cfg.queryMs;
  slot.arrivedAt = arrivedAt;
  slot.heldMs = 0;
  slot.leaks = cfg.leak && w.rnd() < LEAK_RATE;
}

function recordServed(w: World, slot: Slot) {
  w.served += 1;
  w.latencies.push(w.time - slot.arrivedAt);
  if (w.latencies.length > LATENCY_WINDOW) w.latencies.shift();
}

/** Work is done in whole ticks, so a query counts as finished when under half a tick of it is left. */
const finished = (s: Slot) => s.left <= TICK_MS / 2;

function progress(w: World, cfg: Config) {
  const work = TICK_MS / slowdown(w, cfg);
  for (const pool of w.pools) {
    for (const s of pool.slots) {
      if (s.state === 'opening') {
        s.left -= TICK_MS;
        if (s.left <= 0) s.state = 'idle';
      } else if (s.state === 'busy' || s.state === 'leaked') {
        s.heldMs += TICK_MS;
        if (s.state === 'busy') {
          s.left -= work;
          if (finished(s)) {
            recordServed(w, s);
            s.state = s.leaks ? 'leaked' : 'idle';
          }
        }
      } else if (s.state === 'failed' && w.time >= s.retryAt) tryOpen(w, s, cfg.dbMax);
    }
  }
  for (const s of w.direct) {
    if (s.state === 'opening') {
      s.left -= TICK_MS;
      if (s.left <= 0) {
        s.state = 'busy';
        s.left = cfg.queryMs;
      }
    } else {
      s.left -= work;
    }
  }
  for (let i = w.direct.length - 1; i >= 0; i--) {
    if (w.direct[i].state === 'busy' && finished(w.direct[i])) {
      recordServed(w, w.direct[i]);
      w.direct.splice(i, 1);
    }
  }
}

function arrive(w: World, cfg: Config) {
  w.arrived += 1;
  if (cfg.usePool) {
    w.pools[Math.floor(w.rnd() * w.pools.length)].queue.push(w.time);
    return;
  }
  if (openCount(w) >= cfg.dbMax) {
    w.refusedRequests += 1;
    return;
  }
  const slot = newSlot('opening');
  slot.arrivedAt = w.time;
  slot.left = sampleConnect(w);
  w.direct.push(slot);
}

function serveQueues(w: World, cfg: Config) {
  for (const pool of w.pools) {
    for (const s of pool.slots) {
      if (s.state === 'idle' && pool.queue.length) startWork(w, cfg, s, pool.queue.shift()!);
    }
    while (pool.queue.length && w.time - pool.queue[0] >= ACQUIRE_TIMEOUT_MS) {
      const waited = w.time - pool.queue.shift()!;
      w.timedOut += 1;
      w.timeoutWaits.min = Math.min(w.timeoutWaits.min, waited);
      w.timeoutWaits.max = Math.max(w.timeoutWaits.max, waited);
    }
  }
}

/** Advance the world one tick. */
export function tick(w: World, cfg: Config) {
  w.time += TICK_MS;
  progress(w, cfg);
  while (w.nextArrival <= w.time) {
    arrive(w, cfg);
    w.nextArrival += cfg.rate > 0 ? expSample(1000 / cfg.rate, w.rnd) : Infinity;
  }
  serveQueues(w, cfg);
  const g = gauges(w);
  w.inUseSum += g.inUse;
  w.ticks += 1;
  w.sinceHistory += TICK_MS;
  if (w.sinceHistory >= HISTORY_EVERY_MS) {
    w.sinceHistory = 0;
    w.inUseWindow.push({ sum: w.inUseSum, ticks: w.ticks });
    if (w.inUseWindow.length > MEAN_WINDOW_MS / HISTORY_EVERY_MS) w.inUseWindow.shift();
    w.inUseSum = 0;
    w.ticks = 0;
    w.waitHistory.push(g.longestWait);
    if (w.waitHistory.length > HISTORY_LENGTH) w.waitHistory.shift();
  }
}

/** Advance by `seconds`, in whole ticks (the remainder carries over). */
export function advance(w: World, cfg: Config, seconds: number) {
  w.carry += seconds * 1000;
  while (w.carry >= TICK_MS) {
    w.carry -= TICK_MS;
    tick(w, cfg);
  }
}

export interface Gauges {
  /** Connections handed to a request: running a query, or leaked; with no pool, every connection a request has opened. */
  inUse: number;
  idle: number;
  opening: number;
  /** Slots the database refused, waiting to retry. */
  failed: number;
  leaked: number;
  /** Leaked connections held long enough for leak detection to flag them. */
  flagged: number;
  waiting: number;
  longestWait: number;
  /** Slots in all (pools) or connections open (no pool). */
  slots: number;
  open: number;
}

export function gauges(w: World): Gauges {
  const all = w.direct.concat(...w.pools.map((p) => p.slots));
  const count = (state: SlotState) => all.filter((s) => s.state === state).length;
  const leaked = count('leaked');
  const oldest = w.pools.reduce((m, p) => (p.queue.length ? Math.max(m, w.time - p.queue[0]) : m), 0);
  return {
    inUse: w.direct.length + w.pools.reduce((n, p) => n + p.slots.filter((s) => s.state === 'busy' || s.state === 'leaked').length, 0),
    idle: count('idle'),
    opening: count('opening'),
    failed: count('failed'),
    leaked,
    flagged: all.filter((s) => s.state === 'leaked' && s.heldMs > LEAK_FLAG_MS).length,
    waiting: w.pools.reduce((n, p) => n + p.queue.length, 0),
    longestWait: oldest,
    slots: all.length,
    open: openCount(w),
  };
}

/** Requests that are in the system right now: queued, handshaking or running a query. */
export function inFlight(w: World): number {
  const queued = w.pools.reduce((n, p) => n + p.queue.length, 0);
  const running = w.pools.reduce((n, p) => n + p.slots.filter(isBusy).length, 0);
  return queued + running + w.direct.length;
}

export interface Summary extends Gauges {
  arrived: number;
  served: number;
  timedOut: number;
  /** Slots the database refuses right now (pool), or requests it turned away (no pool). Each is counted once, however often it retries. */
  refused: number;
  /** Every refusal so far, a slot's retries included. */
  refusedAttempts: number;
  p50: number;
  p95: number;
  /** In use, averaged over the last MEAN_WINDOW_MS of the run. */
  meanInUse: number;
  slowdown: number;
  /** The database's load, 0 to 1 (illustrative): busy cores plus the cost of holding many connections. */
  cpu: number;
  /** Mean ms of each part of opening a connection so far. */
  connectMean: { tcp: number; tls: number; auth: number };
}

export function summarize(w: World, cfg: Config): Summary {
  const sorted = [...w.latencies].sort((a, b) => a - b);
  const g = gauges(w);
  const busy = busyCount(w);
  const fullness = Math.min(1, g.open / cfg.dbMax);
  const n = Math.max(1, w.connects.count);
  return {
    ...g,
    arrived: w.arrived,
    served: w.served,
    timedOut: w.timedOut,
    refused: cfg.usePool ? g.failed : w.refusedRequests,
    refusedAttempts: w.refusedRequests + w.refusedOpens,
    p50: sorted.length ? percentile(sorted, 0.5) : 0,
    p95: sorted.length ? percentile(sorted, 0.95) : 0,
    meanInUse: meanInUse(w),
    slowdown: slowdown(w, cfg),
    cpu: Math.min(1, 0.7 * Math.min(1, busy / CORES) + 0.3 * fullness * fullness),
    connectMean: { tcp: w.connects.tcp / n, tls: w.connects.tls / n, auth: w.connects.auth / n },
  };
}

/** Little's law: connections in use on average = arrival rate x time each is held. */
export const littlesLaw = (rate: number, holdMs: number) => (rate * holdMs) / 1000;

function meanInUse(w: World): number {
  const sum = w.inUseWindow.reduce((n, b) => n + b.sum, w.inUseSum);
  const ticks = w.inUseWindow.reduce((n, b) => n + b.ticks, w.ticks);
  return ticks ? sum / ticks : 0;
}
