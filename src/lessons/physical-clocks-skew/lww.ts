/**
 * physical-clocks-skew, scenes 2 and 3: last-write-wins replicas that stamp writes with their own clocks, run on distSim.
 *
 * Two replicas, A and B, each keep (value, stamp) and keep the write with the larger stamp (ties go to the higher node id).
 * One client writes x=1 through A and, once A has acknowledged, writes x=2 through B after `GAP_MS`. The safety property:
 * "if write 2 starts after write 1 was acknowledged, write 2 wins at every replica once it has seen both writes".
 *
 * Two modes:
 * - `raw`: a write is stamped with the replica's clock reading.
 * - `commit-wait`: a write is stamped now + epsilon (the latest the true time can be, if every clock is within epsilon of
 *   true time), and acknowledged only after the replica's clock has passed stamp + epsilon, a wait of 2 epsilon.
 *   Any write that starts after the acknowledgement then gets a larger stamp, as long as every clock really is within epsilon.
 */
import { createCluster, type Cluster, type DistNode, type Safety } from '../../core/distSim';
import { mulberry32 } from '../../core/random';

export type LwwMode = 'raw' | 'commit-wait';
export type LwwMsg =
  | { type: 'write'; id: 1 | 2; value: number }
  | { type: 'ack'; id: 1 | 2 }
  | { type: 'replicate'; id: 1 | 2; value: number; stamp: number; from: string };

export interface LwwState {
  value: number;
  stamp: number;
  /** Which writes (1 and 2) this replica has received, directly or by replication. */
  seen: number[];
}
export type LwwCluster = Cluster<LwwMsg, LwwState>;

export const REPLICA_A = 'A';
export const REPLICA_B = 'B';
export const CLIENT_NODE = 'c';
/** True time of the first write, ms: 100.0 s, as in the lesson's example. */
export const FIRST_WRITE_AT = 100_000;
/** The client's wait between the first acknowledgement and starting the second write, ms. */
export const GAP_MS = 1;
export const LWW_LATENCY = { min: 1, max: 15 } as const;
/** Largest clock offset the raw-mode scenario draws, ms. */
export const RAW_SKEW_MAX = 8000;
/** The lowest seed on which raw stamping breaks `writeTwoWins` when each replica's offset is drawn within RAW_SKEW_MAX (a test searches for it). */
export const BROKEN_SEED = 0;

const ties = (stampA: number, fromA: string, stampB: number, fromB: string) => (stampA !== stampB ? stampA > stampB : fromA > fromB);

function replicaNode(mode: LwwMode, epsilonMs: number): DistNode<LwwMsg, LwwState> {
  let value = 0;
  let stamp = -Infinity;
  let holder = '';
  const seen = new Set<number>();
  const handled = new Set<number>();
  const adopt = (v: number, s: number, from: string) => {
    if (ties(s, from, stamp, holder)) {
      value = v;
      stamp = s;
      holder = from;
    }
  };
  return {
    init: () => {},
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'write') {
        if (handled.has(m.id)) return;
        handled.add(m.id);
        seen.add(m.id);
        const s = ctx.now() + (mode === 'commit-wait' ? epsilonMs : 0);
        adopt(m.value, s, ctx.id);
        for (const p of ctx.peers) if (p !== ctx.id && p !== CLIENT_NODE) ctx.send(p, { type: 'replicate', id: m.id, value: m.value, stamp: s, from: ctx.id });
        if (mode === 'commit-wait' && epsilonMs > 0) ctx.setTimer(`ack${m.id}`, 2 * epsilonMs);
        else ctx.send(CLIENT_NODE, { type: 'ack', id: m.id });
      } else if (m.type === 'replicate') {
        seen.add(m.id);
        adopt(m.value, m.stamp, m.from);
      }
    },
    onTimer: (ctx, timerId) => ctx.send(CLIENT_NODE, { type: 'ack', id: timerId === 'ack1' ? 1 : 2 }),
    snapshot: () => ({ value, stamp, seen: [...seen].sort() }),
  };
}

function clientNode(): DistNode<LwwMsg, LwwState> {
  let acked = false;
  return {
    init: (ctx) => ctx.setTimer('first', FIRST_WRITE_AT),
    onTimer: (ctx, timerId) => {
      if (timerId === 'first') ctx.send(REPLICA_A, { type: 'write', id: 1, value: 1 });
      else ctx.send(REPLICA_B, { type: 'write', id: 2, value: 2 });
    },
    onMessage: (ctx, msg) => {
      if (msg.payload.type !== 'ack' || msg.payload.id !== 1 || acked) return;
      acked = true;
      ctx.setTimer('second', GAP_MS);
    },
    snapshot: () => ({ value: 0, stamp: 0, seen: acked ? [1] : [] }),
  };
}

export interface LwwSetup {
  seed: number;
  mode: LwwMode;
  epsilonMs?: number;
  /** Each node's clock offset from true time, ms: A, B (the client's clock is perfect). */
  offsets: readonly [number, number];
  /** Fixed one-way delay in ms instead of the seeded range (hand-built schedules). */
  fixedLatencyMs?: number;
  /** Loss, duplication and one random partition, crash and pause. */
  faults?: boolean;
}

/** Fault settings of the 500-seed tests: 10% loss, 15% duplication, a partition, a crash and a pause near the writes. */
export const LWW_FAULTS = { loss: 0.1, duplicate: 0.15, horizonMs: FIRST_WRITE_AT + 200 } as const;

export function lwwCluster(s: LwwSetup): LwwCluster {
  const eps = s.epsilonMs ?? 0;
  const c = createCluster<LwwMsg, LwwState>({
    seed: s.seed,
    nodes: { [REPLICA_A]: replicaNode(s.mode, eps), [REPLICA_B]: replicaNode(s.mode, eps), [CLIENT_NODE]: clientNode() },
    latency: (rnd) => s.fixedLatencyMs ?? Math.round(LWW_LATENCY.min + rnd() * (LWW_LATENCY.max - LWW_LATENCY.min)),
    clocks: [{ offsetMs: s.offsets[0] }, { offsetMs: s.offsets[1] }, {}],
    ...(s.faults ? { loss: LWW_FAULTS.loss, duplicate: LWW_FAULTS.duplicate } : {}),
  });
  if (s.faults) c.randomFaults({ horizonMs: LWW_FAULTS.horizonMs, partitions: 1, crashes: 1, pauses: 1 });
  return c;
}

/** The safety property, after every event. */
export const writeTwoWins: Safety<LwwState> = (snap) => {
  for (const [id, n] of Object.entries(snap.nodes)) {
    if (n.state && n.state.seen.includes(1) && n.state.seen.includes(2) && n.state.value !== 2) {
      return `replica ${id} has received both writes but holds x=${n.state.value}: write 2 started after write 1 was acknowledged and lost`;
    }
  }
  return null;
};

/** A seeded scenario for `forSeeds`: offsets drawn from the seed, each within `within` ms of true time. */
export const lwwScenario = (mode: LwwMode, o: { epsilonMs?: number; within: number; faults?: boolean }) => (seed: number): LwwCluster => {
  const rnd = mulberry32(seed ^ 0x2545f491);
  const draw = () => (rnd() * 2 - 1) * o.within;
  return lwwCluster({ seed, mode, epsilonMs: o.epsilonMs, offsets: [draw(), draw()], faults: o.faults });
};

export interface LwwRun {
  finals: Record<string, LwwState>;
  /** The stamps the replicas gave writes 1 and 2 (from the replication messages), ms of the stamping replica's clock. */
  stamps: Partial<Record<1 | 2, number>>;
  /** True ms from the write reaching its replica to its acknowledgement leaving: the commit wait. */
  commitWaitMs: number | null;
  ackAt: number | null;
  secondStartAt: number | null;
  trace: LwwCluster['trace'];
}

export function runLww(s: LwwSetup): LwwRun {
  const c = lwwCluster(s);
  c.run();
  const snap = c.snapshot();
  const trace = c.trace;
  const stamps: LwwRun['stamps'] = {};
  for (const r of trace) if (r.kind === 'send' && r.payload?.type === 'replicate') stamps[r.payload.id] = r.payload.stamp;
  const handled = trace.find((r) => r.kind === 'deliver' && r.payload?.type === 'write' && r.payload.id === 1);
  const ackSent = trace.find((r) => r.kind === 'send' && r.payload?.type === 'ack' && r.payload.id === 1);
  const second = trace.find((r) => r.kind === 'send' && r.payload?.type === 'write' && r.payload.id === 2);
  return {
    finals: Object.fromEntries([REPLICA_A, REPLICA_B].map((id) => [id, snap.nodes[id].state!])),
    stamps,
    commitWaitMs: handled && ackSent ? ackSent.t - handled.t : null,
    ackAt: ackSent ? ackSent.t : null,
    secondStartAt: second ? second.t : null,
    trace,
  };
}
