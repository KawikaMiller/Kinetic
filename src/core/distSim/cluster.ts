/**
 * distSim: a deterministic, seeded simulation of nodes that talk over an unreliable network.
 *
 * This is the engine behind every distributed-systems lesson (AC-0/T3 rule 20): the lesson's
 * protocol runs here, faults are injected here, and the invariants in ./invariants.ts are
 * checked against what really happened, rather than a storyline the lesson scripted.
 *
 * The model, in full:
 * - Time is simulated milliseconds ("true time"). Nothing reads the wall clock or Math.random.
 * - A node is `{ init, onMessage, onTimer, snapshot? }`. It sees the world only through its
 *   `ctx`: `send`, `setTimer`/`cancelTimer`, `now()` (its own, possibly skewed, clock) and
 *   `peers`. `ctx.trueNow` is for tests and for drawing, never for protocol logic.
 * - Events are processed in `(time, seq)` order, `seq` being creation order, so ties are
 *   deterministic. Same seed, same config, same faults: same trace, row for row.
 * - Randomness comes from two independent streams derived from the seed: the network
 *   (loss, duplication, latency) and `randomFaults`. Adding a fault or
 *   changing a node's behaviour therefore never reshuffles another message's latency.
 * - Node state lives in the node's own closure. A node that must survive a crash keeps that
 *   state outside `init`; `init` runs again on restart, so what it resets is volatile.
 *
 * Fault semantics (all decided at send time, so they are exact and reproducible):
 * - `loss`, `duplicate`: per-message probabilities. A duplicate is a second delivery with its
 *   own latency.
 * - `partition(a, b, from, to)`: a message between the two groups is dropped when it was in
 *   flight at any moment of [from, to]: sent before `to` and delivered at or after `from`.
 *   Messages inside a group, and ones that cleared the link before `from`, are untouched.
 * - `dropNext(pred)`: drops the next message sent that matches, once.
 * - `crash(node, at)` / `restart(node, at)`: a crashed node handles nothing; deliveries to it
 *   are dropped ("down"), its timers are gone, and `init` runs again at restart.
 * - `pause(node, from, to)`: a stalled node (a GC pause, a VM freeze). It neither sends nor
 *   handles messages or timers in [from, to); what arrives meanwhile is held and handled in
 *   order at `to`. Its clock keeps running, so `now()` jumps when it resumes.
 *
 * Out of scope on purpose (Phase 2 requests): nodes needing more than send/setTimer/now,
 * disk models, byzantine behaviour, link-level reordering knobs (latency already reorders).
 */
import { mulberry32, shuffle, type Rnd } from '../random';
import type { DropReason, TraceRow } from './trace';

export interface Message<M> {
  /** Unique per message (a duplicate copy shares it). */
  id: number;
  from: string;
  to: string;
  payload: M;
}

export interface NodeCtx<M> {
  readonly id: string;
  /** Every node id in the cluster, in declaration order (including this one). */
  readonly peers: readonly string[];
  /** Hand a message to the network. It may be delayed, lost, duplicated or cut by a partition. */
  send: (to: string, payload: M) => void;
  /** Fire `onTimer(timerId)` after `delayMs` of this node's *local* time; re-arming an id replaces it. */
  setTimer: (timerId: string, delayMs: number) => void;
  cancelTimer: (timerId: string) => void;
  /** This node's own clock: true time skewed by its offset and drift. */
  now: () => number;
  /** True simulated time. For tests and for drawing; a protocol that reads it cheats. */
  readonly trueNow: number;
}

export interface DistNode<M = unknown, S = unknown> {
  /** At time 0, and again after each restart. */
  init: (ctx: NodeCtx<M>) => void;
  onMessage: (ctx: NodeCtx<M>, msg: Message<M>) => void;
  onTimer: (ctx: NodeCtx<M>, timerId: string) => void;
  /** Plain data for invariants to inspect (role, term, log...). Called on demand, must not mutate. */
  snapshot?: () => S;
}

export interface ClockSpec {
  /** Constant offset from true time, ms. */
  offsetMs?: number;
  /** Drift in parts per million: +100 gains 100 µs per second. */
  driftPpm?: number;
}

/** A fixed range (uniform, ms) or a function of the network stream and the link, so links can be asymmetric. */
export type Latency = { min: number; max: number } | ((rnd: Rnd, from: string, to: string) => number);

export interface ClusterConfig<M, S> {
  seed: number;
  /** Node id → behaviour. Declaration order is the node order used by `clocks`. */
  nodes: Record<string, DistNode<M, S>>;
  /** Default: uniform 1 to 10 ms. */
  latency?: Latency;
  /** Probability a message is lost, 0..1 (default 0). */
  loss?: number;
  /** Probability a delivered message is delivered twice (default 0). */
  duplicate?: number;
  /** Per node, in declaration order; missing entries are perfect clocks. */
  clocks?: readonly ClockSpec[];
}

export interface NodeSnapshot<S> {
  up: boolean;
  /** Inside a `pause` window right now. */
  paused: boolean;
  /** The node's own `snapshot()`, or undefined when it has none. */
  state: S | undefined;
}

export interface Snapshot<S> {
  /** True time of the last processed event. */
  time: number;
  /** Events processed so far. */
  step: number;
  nodes: Record<string, NodeSnapshot<S>>;
  /** Messages sent and not yet delivered or dropped. */
  inFlight: number;
}

export interface RandomFaultOptions {
  /** Faults start within [0, horizonMs). */
  horizonMs: number;
  partitions?: number;
  crashes?: number;
  pauses?: number;
  /** Longest fault, ms (default horizon / 4); each lasts between a quarter of this and all of it. */
  maxDurationMs?: number;
}

export interface Cluster<M, S> {
  readonly seed: number;
  readonly nodeIds: readonly string[];
  /** True time of the last processed event. */
  readonly time: number;
  readonly trace: readonly TraceRow<M>[];
  /** True time of the next event, or Infinity when the queue is empty. */
  nextTime: () => number;
  /** Events waiting in the queue. */
  readonly queued: number;
  /** Cut every link between group `a` and group `b` (a node id or a list) from `from` to `to`. */
  partition: (a: string | readonly string[], b: string | readonly string[], from: number, to: number) => void;
  crash: (node: string, at: number) => void;
  restart: (node: string, at: number) => void;
  /** Stall `node` over [from, to). */
  pause: (node: string, from: number, to: number) => void;
  /** Drop the next message sent that satisfies `pred`, once. */
  dropNext: (pred: (msg: Message<M>) => boolean) => void;
  /** Deliver `payload` to `to` at time `at` from outside the cluster (a client request); faults on the network don't apply. */
  inject: (at: number, to: string, payload: M, from?: string) => void;
  /** Schedule seeded random partitions, crashes (each followed by a restart) and pauses. */
  randomFaults: (o: RandomFaultOptions) => void;
  /** Run every node's `init` (done by the first `step`/`run` anyway). Idempotent. */
  start: () => void;
  /** Process one event; false when the queue is empty. */
  step: () => boolean;
  /** Process events up to and including true time `until` (default: until the queue is empty), at most `maxEvents`. Returns events processed. */
  run: (o?: { until?: number; maxEvents?: number }) => number;
  snapshot: () => Snapshot<S>;
  /** The local time `node` reads at true time `t` (default now). */
  localTime: (node: string, t?: number) => number;
}

/** Latency used when the config gives none. */
const DEFAULT_LATENCY = { min: 1, max: 10 } as const;
/** Seed offsets that give the clusters' random streams their independence. */
const FAULT_STREAM = 0x9e3779b9;
const MIN_FAULT_FRACTION = 0.25;
/** Safety valve for `run()` with no bounds: a protocol that retransmits forever. */
const DEFAULT_MAX_EVENTS = 1_000_000;

type Event<M> =
  | { time: number; seq: number; kind: 'deliver'; msg: Message<M>; dup: boolean }
  | { time: number; seq: number; kind: 'timer'; node: string; timerId: string; gen: number }
  | { time: number; seq: number; kind: 'crash' | 'restart' | 'pause' | 'resume'; node: string }
  | { time: number; seq: number; kind: 'partition' | 'heal'; label: string };

/** An event before it is given its creation order. */
type Draft<E> = E extends unknown ? Omit<E, 'seq'> : never;

interface Cut {
  a: ReadonlySet<string>;
  b: ReadonlySet<string>;
  from: number;
  to: number;
}

const asSet = (g: string | readonly string[]): ReadonlySet<string> => new Set(typeof g === 'string' ? [g] : g);

export function createCluster<M, S = unknown>(config: ClusterConfig<M, S>): Cluster<M, S> {
  const ids = Object.keys(config.nodes);
  const net = mulberry32(config.seed);
  const faultRnd = mulberry32(config.seed ^ FAULT_STREAM);
  const latency = config.latency ?? DEFAULT_LATENCY;
  const lossP = config.loss ?? 0;
  const dupP = config.duplicate ?? 0;

  const queue: Event<M>[] = [];
  const trace: TraceRow<M>[] = [];
  const up = new Map(ids.map((id) => [id, true]));
  const timers = new Map<string, number>();
  const pauses = new Map<string, { from: number; to: number }[]>(ids.map((id) => [id, []]));
  const cuts: Cut[] = [];
  const dropRules: ((msg: Message<M>) => boolean)[] = [];
  let clock = 0;
  let seq = 0;
  let steps = 0;
  let msgSeq = 0;
  let inFlight = 0;
  let started = false;

  const need = (id: string) => {
    if (!up.has(id)) throw new RangeError(`distSim: unknown node "${id}"`);
  };
  const timerKey = (node: string, timerId: string) => `${node}\u0000${timerId}`;
  const clockOf = (node: string): Required<ClockSpec> => ({ offsetMs: 0, driftPpm: 0, ...config.clocks?.[ids.indexOf(node)] });
  const localTime = (node: string, t = clock) => {
    const { offsetMs, driftPpm } = clockOf(node);
    return t * (1 + driftPpm / 1e6) + offsetMs;
  };

  const push = (e: Draft<Event<M>>) => {
    const ev = { ...e, seq: seq++ } as Event<M>;
    let lo = 0;
    let hi = queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (queue[mid].time < ev.time || (queue[mid].time === ev.time && queue[mid].seq < ev.seq)) lo = mid + 1;
      else hi = mid;
    }
    queue.splice(lo, 0, ev);
  };

  const record = (row: Omit<TraceRow<M>, 'id' | 't'>) => {
    trace.push({ id: trace.length, t: clock, ...row });
  };

  const draw = (from: string, to: string) => {
    const ms = typeof latency === 'function' ? latency(net, from, to) : latency.min + net() * (latency.max - latency.min);
    return Math.max(0, ms);
  };

  const cutAt = (from: string, to: string, sentAt: number, arrivesAt: number) =>
    cuts.some((c) => ((c.a.has(from) && c.b.has(to)) || (c.b.has(from) && c.a.has(to))) && sentAt < c.to && arrivesAt >= c.from);

  /** Put a message on the wire, or drop it; the one place network faults are decided. */
  const route = (msg: Message<M>, dup: boolean, ms: number, loseIt: boolean) => {
    const arrivesAt = clock + ms;
    let reason: DropReason | null = null;
    if (!dup) {
      const i = dropRules.findIndex((pred) => pred(msg));
      if (i >= 0) {
        dropRules.splice(i, 1);
        reason = 'dropNext';
      }
    }
    if (!reason && cutAt(msg.from, msg.to, clock, arrivesAt)) reason = 'partition';
    if (!reason && loseIt) reason = 'loss';
    if (reason) {
      record({ kind: 'drop', from: msg.from, to: msg.to, msgId: msg.id, payload: msg.payload, reason, dup: dup || undefined });
      return;
    }
    inFlight++;
    push({ time: arrivesAt, kind: 'deliver', msg, dup });
  };

  const send = (from: string, to: string, payload: M) => {
    need(to);
    const msg: Message<M> = { id: msgSeq++, from, to, payload };
    // Always draw loss, latency and duplication, so changing `loss` never shifts another message's latency.
    const lost = net() < lossP;
    const ms = draw(from, to);
    const doubled = net() < dupP;
    record({ kind: 'send', from, to, msgId: msg.id, payload });
    route(msg, false, ms, lost);
    if (doubled) route(msg, true, draw(from, to), false);
  };

  const ctxFor = (node: string): NodeCtx<M> => ({
    id: node,
    peers: ids,
    send: (to, payload) => send(node, to, payload),
    setTimer: (timerId, delayMs) => {
      const gen = (timers.get(timerKey(node, timerId)) ?? 0) + 1;
      timers.set(timerKey(node, timerId), gen);
      const trueDelay = Math.max(0, delayMs) / (1 + clockOf(node).driftPpm / 1e6);
      push({ time: clock + trueDelay, kind: 'timer', node, timerId, gen });
    },
    cancelTimer: (timerId) => {
      timers.set(timerKey(node, timerId), (timers.get(timerKey(node, timerId)) ?? 0) + 1);
    },
    now: () => localTime(node),
    get trueNow() {
      return clock;
    },
  });

  const start = () => {
    if (started) return;
    started = true;
    for (const id of ids) config.nodes[id].init(ctxFor(id));
  };

  /** The end of the pause window covering `t` for `node`, or null. */
  const pausedUntil = (node: string, t: number) => pauses.get(node)!.find((w) => t >= w.from && t < w.to)?.to ?? null;

  const handle = (ev: Event<M>) => {
    switch (ev.kind) {
      case 'deliver': {
        const { msg } = ev;
        const resume = pausedUntil(msg.to, ev.time);
        if (resume !== null) {
          push({ ...ev, time: resume });
          return;
        }
        inFlight--;
        if (!up.get(msg.to)) {
          record({ kind: 'drop', from: msg.from, to: msg.to, msgId: msg.id, payload: msg.payload, reason: 'down', dup: ev.dup || undefined });
          return;
        }
        record({ kind: 'deliver', from: msg.from, to: msg.to, msgId: msg.id, payload: msg.payload, dup: ev.dup || undefined });
        config.nodes[msg.to].onMessage(ctxFor(msg.to), msg);
        return;
      }
      case 'timer': {
        if (timers.get(timerKey(ev.node, ev.timerId)) !== ev.gen || !up.get(ev.node)) return;
        const resume = pausedUntil(ev.node, ev.time);
        if (resume !== null) {
          push({ ...ev, time: resume });
          return;
        }
        record({ kind: 'timer', node: ev.node, detail: ev.timerId });
        config.nodes[ev.node].onTimer(ctxFor(ev.node), ev.timerId);
        return;
      }
      case 'crash':
        up.set(ev.node, false);
        for (const key of timers.keys()) if (key.startsWith(`${ev.node}\u0000`)) timers.set(key, (timers.get(key) ?? 0) + 1);
        record({ kind: 'crash', node: ev.node });
        return;
      case 'restart':
        if (up.get(ev.node)) return;
        up.set(ev.node, true);
        record({ kind: 'restart', node: ev.node });
        config.nodes[ev.node].init(ctxFor(ev.node));
        return;
      case 'pause':
      case 'resume':
        record({ kind: ev.kind, node: ev.node });
        return;
      case 'partition':
      case 'heal': {
        const [from, to] = ev.label.split('|');
        record({ kind: ev.kind, from, to });
        return;
      }
    }
  };

  const step = () => {
    start();
    const ev = queue.shift();
    if (!ev) return false;
    clock = ev.time;
    steps++;
    handle(ev);
    return true;
  };

  const schedule = (kind: 'crash' | 'restart', node: string, at: number) => {
    need(node);
    push({ time: at, kind, node });
  };

  const addPartition: Cluster<M, S>['partition'] = (a, b, from, to) => {
    const [ga, gb] = [asSet(a), asSet(b)];
    [...ga, ...gb].forEach(need);
    cuts.push({ a: ga, b: gb, from, to });
    const label = `${[...ga].join('+')}|${[...gb].join('+')}`;
    push({ time: from, kind: 'partition', label });
    push({ time: to, kind: 'heal', label });
  };

  const addPause: Cluster<M, S>['pause'] = (node, from, to) => {
    need(node);
    pauses.get(node)!.push({ from, to });
    push({ time: from, kind: 'pause', node });
    push({ time: to, kind: 'resume', node });
  };

  const randomFaults: Cluster<M, S>['randomFaults'] = (o) => {
    const maxDuration = o.maxDurationMs ?? o.horizonMs / 4;
    const span = () => maxDuration * (MIN_FAULT_FRACTION + (1 - MIN_FAULT_FRACTION) * faultRnd());
    const nodeAt = () => ids[Math.floor(faultRnd() * ids.length)];
    for (let i = 0; i < (o.partitions ?? 0) && ids.length > 1; i++) {
      const order = shuffle(ids, faultRnd);
      const cut = 1 + Math.floor(faultRnd() * (ids.length - 1));
      const from = faultRnd() * o.horizonMs;
      addPartition(order.slice(0, cut), order.slice(cut), from, from + span());
    }
    for (let i = 0; i < (o.crashes ?? 0); i++) {
      const [node, at] = [nodeAt(), faultRnd() * o.horizonMs];
      schedule('crash', node, at);
      schedule('restart', node, at + span());
    }
    for (let i = 0; i < (o.pauses ?? 0); i++) {
      const from = faultRnd() * o.horizonMs;
      addPause(nodeAt(), from, from + span());
    }
  };

  return {
    seed: config.seed,
    nodeIds: ids,
    get time() {
      return clock;
    },
    trace,
    nextTime: () => queue[0]?.time ?? Infinity,
    get queued() {
      return queue.length;
    },
    partition: addPartition,
    crash: (node, at) => schedule('crash', node, at),
    restart: (node, at) => schedule('restart', node, at),
    pause: addPause,
    dropNext: (pred) => {
      dropRules.push(pred);
    },
    inject: (at, to, payload, from = 'client') => {
      need(to);
      inFlight++;
      push({ time: at, kind: 'deliver', msg: { id: msgSeq++, from, to, payload }, dup: false });
    },
    randomFaults,
    start,
    step,
    run: (o = {}) => {
      const limit = o.maxEvents ?? DEFAULT_MAX_EVENTS;
      let n = 0;
      start();
      while (n < limit && queue.length && queue[0].time <= (o.until ?? Infinity)) {
        step();
        n++;
      }
      return n;
    },
    snapshot: () => ({
      time: clock,
      step: steps,
      inFlight,
      nodes: Object.fromEntries(
        ids.map((id) => [id, { up: up.get(id)!, paused: pausedUntil(id, clock) !== null, state: config.nodes[id].snapshot?.() }]),
      ),
    }),
    localTime,
  };
}
