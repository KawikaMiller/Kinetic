/**
 * consistency-models, scene 3: a replicated register run on the distSim harness, three designs, one seeded schedule.
 *
 * Three replicas (r1 is the leader) hold one register `x` with a version number; three clients (c1 to c3) each run a short
 * script of reads and writes, one outstanding operation at a time. Every client records, in true simulated milliseconds,
 * when it sent each operation and when the answer came back, so the recorded history is exactly what a Jepsen-style
 * checker would be handed. The history goes to the same checkers as scene 1.
 *
 * The designs differ only in routing and in what the client does with an answer:
 * - `leader`   every read and write goes to r1, which applies them in the order they reach it.
 * - `follower` writes go to r1, which acknowledges at once and copies to the followers LATER; reads go to a follower.
 * - `session`  like `follower`, but each client remembers the newest version it has seen (its own writes included)
 *              and never answers a read with anything older.
 *
 * The scene has no message loss and no timeouts (an operation that never answers is an indeterminate operation, which is out of
 * scope). Requests and answers can be duplicated and delayed; a replica answers a duplicate write from its record
 * of the first, and a client ignores a second answer to an operation it has already finished.
 */
import {
  createCluster, historyOf, settleOp,
  type Cluster, type DistNode, type Latency, type OpRecord, type Safety, type Snapshot, type TraceRow,
} from '../../core/distSim';
import { mulberry32, type Rnd } from '../../core/random';
import { INITIAL_VALUE, orderVerdict, type Op, type OrderModel } from './model';

export type Design = 'leader' | 'follower' | 'session';
export const DESIGNS: readonly { id: Design; label: string }[] = [
  { id: 'leader', label: 'One leader serves everything' },
  { id: 'follower', label: 'Async copies, reads from a follower' },
  { id: 'session', label: 'Session cache on the client' },
];
export const DESIGN_NAME: Record<Design, string> = { leader: 'one leader', follower: 'follower reads', session: 'session cache' };

export const REPLICAS = ['r1', 'r2', 'r3'] as const;
export const SERVICE_CLIENTS = ['c1', 'c2', 'c3'] as const;
export const LEADER = 'r1';
export const OPS_PER_CLIENT = 4;
export const SERVICE_OPS = OPS_PER_CLIENT * SERVICE_CLIENTS.length;
/** Latency ranges, ms (uniform): a client talking to a replica, and the leader copying to a follower (slower, on purpose). */
export const CLIENT_LINK_MS = { min: 2, max: 8 } as const;
export const COPY_LINK_MS = { min: 10, max: 40 } as const;
/** How long a client waits before its first operation and between operations, ms. */
export const START_MS = { min: 0, max: 20 } as const;
export const THINK_MS = { min: 2, max: 30 } as const;
/** Chance that a message is delivered twice. */
export const DUPLICATE_P = 0.15;
const SCRIPT_STREAM = 0x5bd1e995;
const WRITE_P = 0.4;

export type Msg =
  | { type: 'request'; op: number; kind: 'write' | 'read'; value?: number }
  | { type: 'reply'; op: number; value: number; version: number }
  | { type: 'replicate'; value: number; version: number };

export type ServiceOp = OpRecord<number>;
export type ServiceState = { role: 'replica'; value: number; version: number } | { role: 'client'; ops: ServiceOp[] };
export type ServiceCluster = Cluster<Msg, ServiceState>;

export interface ScriptStep {
  op: number;
  kind: 'write' | 'read';
  /** A write's value (distinct across the whole run). */
  value: number | null;
  /** Where the request goes. */
  node: string;
  /** Wait before sending, ms. */
  thinkMs: number;
}

const isReplica = (id: string) => (REPLICAS as readonly string[]).includes(id);
const between = (rnd: Rnd, r: { min: number; max: number }) => Math.round(r.min + rnd() * (r.max - r.min));

/** Every client's script for this seed and design: the same kinds, values and think times whatever the design, so designs compare on one schedule. */
export function scriptsFor(seed: number, design: Design): ScriptStep[][] {
  const rnd = mulberry32(seed ^ SCRIPT_STREAM);
  let nextValue = 1;
  let nextOp = 0;
  return SERVICE_CLIENTS.map(() => {
    const mustWrite = Math.floor(rnd() * OPS_PER_CLIENT);
    return Array.from({ length: OPS_PER_CLIENT }, (_, i): ScriptStep => {
      const kind = i === mustWrite || rnd() < WRITE_P ? 'write' : 'read';
      const follower = REPLICAS[1 + Math.floor(rnd() * (REPLICAS.length - 1))];
      const thinkMs = between(rnd, i === 0 ? START_MS : THINK_MS);
      return {
        op: nextOp++,
        kind,
        value: kind === 'write' ? nextValue++ : null,
        node: kind === 'write' || design === 'leader' ? LEADER : follower,
        thinkMs,
      };
    });
  });
}

function replicaNode(): DistNode<Msg, ServiceState> {
  // This state lives outside init, so a restart keeps it (a durable replica).
  let value = INITIAL_VALUE;
  let version = 0;
  const answered = new Map<string, Msg>();
  return {
    init: () => {},
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'replicate') {
        if (m.version > version) {
          value = m.value;
          version = m.version;
        }
      } else if (m.type === 'request') {
        if (m.kind === 'write') {
          const key = `${msg.from}:${m.op}`;
          let reply = answered.get(key);
          if (!reply) {
            value = m.value!;
            version += 1;
            for (const p of REPLICAS) if (p !== ctx.id) ctx.send(p, { type: 'replicate', value, version });
            reply = { type: 'reply', op: m.op, value, version };
            answered.set(key, reply);
          }
          ctx.send(msg.from, reply);
        } else {
          ctx.send(msg.from, { type: 'reply', op: m.op, value, version });
        }
      }
    },
    onTimer: () => {},
    snapshot: () => ({ role: 'replica', value, version }),
  };
}

function clientNode(script: readonly ScriptStep[], design: Design): DistNode<Msg, ServiceState> {
  const ops: ServiceOp[] = [];
  let next = 0;
  // The newest (value, version) this client has seen: what the session design never goes behind.
  let seen = { value: INITIAL_VALUE, version: 0 };
  const current = (): ServiceOp | undefined => ops.find((o) => o.outcome === 'open');
  return {
    init: (ctx) => {
      if (next < script.length && !current()) ctx.setTimer('issue', script[next].thinkMs);
    },
    onTimer: (ctx) => {
      const step = script[next++];
      // trueNow is for drawing and tests: here it only stamps the history that the checkers read.
      ops.push({ op: step.op, kind: step.kind, client: ctx.id, node: step.node, invoke: ctx.trueNow, response: null, outcome: 'open', value: step.value });
      ctx.send(step.node, { type: 'request', op: step.op, kind: step.kind, value: step.value ?? undefined });
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      const open = current();
      if (m.type !== 'reply' || !open || open.op !== m.op) return;
      let value = m.value;
      if (design === 'session') {
        if (open.kind === 'read' && m.version < seen.version) value = seen.value;
        else seen = { value: m.value, version: m.version };
      }
      settleOp(open, ctx.trueNow, 'ok', open.kind === 'write' ? open.value : value);
      if (next < script.length) ctx.setTimer('issue', script[next].thinkMs);
    },
    snapshot: () => ({ role: 'client', ops: ops.map((o) => ({ ...o })) }),
  };
}

export interface ServiceFaults {
  /** Message loss, 0 to 1 (default 0: the lesson's scene has none). */
  loss?: number;
  /** Chance a message is delivered twice (default DUPLICATE_P). */
  duplicate?: number;
  /** Seeded random partitions, crashes and pauses over this horizon, ms. */
  chaos?: { horizonMs: number; partitions: number; crashes: number; pauses: number };
}

export interface ServiceSetup {
  seed: number;
  design: Design;
  /** Hand-written scripts (the default is `scriptsFor(seed, design)`). */
  scripts?: ScriptStep[][];
  /** A fixed or custom latency (the default is the two link ranges above). */
  latency?: Latency;
  faults?: ServiceFaults;
}

const seededLatency: Latency = (rnd, from, to) => between(rnd, from === LEADER && isReplica(to) ? COPY_LINK_MS : CLIENT_LINK_MS);

/** A fresh cluster, ready to run. */
export function buildService({ seed, design, scripts = scriptsFor(seed, design), latency = seededLatency, faults = {} }: ServiceSetup): ServiceCluster {
  const c = createCluster<Msg, ServiceState>({
    seed,
    nodes: {
      ...Object.fromEntries(REPLICAS.map((id) => [id, replicaNode()])),
      ...Object.fromEntries(SERVICE_CLIENTS.map((id, i) => [id, clientNode(scripts[i], design)])),
    },
    latency,
    loss: faults.loss ?? 0,
    duplicate: faults.duplicate ?? DUPLICATE_P,
  });
  if (faults.chaos) c.randomFaults(faults.chaos);
  return c;
}

/** `buildService` as a `forSeeds` scenario. */
export const serviceScenario = (design: Design, faults: ServiceFaults = {}) => (seed: number): ServiceCluster => buildService({ seed, design, faults });

/** Every operation the clients have recorded in a snapshot, in operation order. */
export const opsInSnapshot = (snap: Snapshot<ServiceState>): ServiceOp[] =>
  Object.values(snap.nodes)
    .flatMap((n) => (n.state?.role === 'client' ? n.state.ops : []))
    .sort((a, b) => a.op - b.op);

/**
 * The operations as scene 1's checkers see them at true time `t` ms: a finished one keeps its times, a write still running counts as
 * never answered (it may already have taken effect), and a read still running is left out (it told its client nothing yet).
 * `historyOf` makes that call; this only carries the ids and client names along.
 */
export function opsUpTo(ops: readonly ServiceOp[], t: number): Op[] {
  return ops
    .filter((o) => o.invoke <= t)
    .map((o): ServiceOp => (o.response !== null && o.response <= t ? o : { ...o, response: null, outcome: 'open', value: o.kind === 'write' ? o.value : null }))
    .flatMap((o) => {
      const [h] = historyOf([o]);
      return h ? [{ id: `op${o.op}`, client: o.client.toUpperCase(), kind: h.kind, value: h.value, invoke: h.invoke, response: h.response }] : [];
    });
}

/** Does the history recorded up to `t` satisfy `model`? null when it does, else what is wrong. */
export function failureAt(model: OrderModel, ops: readonly ServiceOp[], t = Infinity): string | null {
  const verdict = orderVerdict(model, opsUpTo(ops, t));
  return verdict.ok ? null : verdict.message;
}

/**
 * A safety property for `checkInvariants`: after every event, the history the clients have recorded so far satisfies `model`.
 * Results are cached by history, so a run only pays for the steps where a response arrived.
 */
export function historySafety(model: OrderModel): Safety<ServiceState> {
  const cache = new Map<string, string | null>();
  return (snap) => {
    const ops = opsInSnapshot(snap);
    const key = JSON.stringify(opsUpTo(ops, Infinity), (_k, v: unknown) => (v === Infinity ? 'inf' : v));
    if (!cache.has(key)) cache.set(key, failureAt(model, ops));
    return cache.get(key)!;
  };
}

export interface ServiceRun {
  seed: number;
  design: Design;
  ops: ServiceOp[];
  trace: readonly TraceRow<Msg>[];
  /** True time of the last event. */
  end: number;
}

export function runService(design: Design, seed: number, setup: Partial<ServiceSetup> = {}): ServiceRun {
  const cluster = buildService({ seed, design, ...setup });
  cluster.run();
  return { seed, design, ops: opsInSnapshot(cluster.snapshot()), trace: cluster.trace, end: cluster.time };
}

/**
 * The version the leader gave each write, by operation: the k-th distinct write request it handled is version k. Read from the
 * trace, so it is what happened, not what a script intended.
 */
export function writeVersions(trace: readonly TraceRow<Msg>[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const row of trace) {
    const m = row.payload;
    if (row.kind === 'deliver' && row.to === LEADER && m?.type === 'request' && m.kind === 'write' && !out.has(m.op)) out.set(m.op, out.size + 1);
  }
  return out;
}

/** The lowest seed in `[from, to)` whose finished run breaks `model` for `design`, or null. */
export function lowestFailingSeed(design: Design, model: OrderModel, to: number, from = 0): number | null {
  for (let seed = from; seed < to; seed++) {
    if (failureAt(model, runService(design, seed).ops) !== null) return seed;
  }
  return null;
}

/** How many seeds the "find a failing seed" button and the tests that name a seed search. */
export const SEARCH_SEEDS = 500;

/** The design the scene opens on: the broken one, so the first thing the learner sees is a real violation with its trace. */
export const DEFAULT_DESIGN: Design = 'follower';
/** The lowest seed on which design (b), follower reads, is not linearizable: the default seed in that (broken) mode. A test searches for it. */
export const BROKEN_SEED = 0;
/** The lowest seed on which design (b) is not even sequentially consistent (a client misses its own write, or reads go backwards). */
export const FOLLOWER_NOT_SEQUENTIAL_SEED = 1;
/** The lowest seed on which design (c), the session cache, is not linearizable: it is sequential on every seed searched. */
export const SESSION_NOT_LINEARIZABLE_SEED = 0;
