/**
 * quorums, scene 3 (and the sims behind scene 2): a leaderless replicated register on distSim.
 *
 * N home replicas A, B, C... hold one register as a version number. One writer writes versions 1, 2, 3 (so there are no conflicts to
 * resolve; concurrent writers need version vectors, which the previous clocks lesson covers). A coordinator sends a write to every
 * home replica and acknowledges when W distinct replicas have stored it; it sends a read to every home replica and returns the
 * highest version among the first R distinct replies. Optional read repair writes that version back to the stale repliers.
 * Any node could coordinate; here the coordinators are separate nodes, W for writes and X and Y for reads, so a scripted schedule
 * can give each its own links.
 *
 * Sloppy quorum (Dynamo-style hinted handoff; from memory, check the Dynamo paper): when a write has fewer than W acks after
 * `SLOPPY_WAIT_MS`, the coordinator also stores it on stand-in nodes S1, S2 and counts their acks. A stand-in keeps the
 * version as a hint and hands it to the home replica when it can. Reads still ask only the home replicas.
 *
 * No loss is assumed by the liveness claim; with loss or a partition an operation that gathers no quorum ends "no quorum" at `TIMEOUT_MS`.
 * Replicas keep their version across a crash (durable).
 */
import {
  createCluster, historyOf, settleOp,
  type Cluster, type DistNode, type Latency, type NodeCtx, type OpRecord, type RegisterOp, type Safety, type Snapshot,
} from '../../core/distSim';
import { mulberry32 } from '../../core/random';

export const HOMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
export const STAND_INS = ['S1', 'S2'] as const;
export const WRITE_COORD = 'W';
export const READ_COORDS = ['X', 'Y'] as const;
export const TIMEOUT_MS = 150;
export const SLOPPY_WAIT_MS = 20;
export const HANDOFF_MS = 30;
export const LATENCY_MS = { min: 5, max: 40 } as const;
export const WRITE_TIMES = [0, 60, 120] as const;
export const READS_PER_RUN = 6;
export const READ_WINDOW_MS = 200;
export const FAULT_HORIZON_MS = 250;
const SCRIPT_STREAM = 0x6a09e667;

export type StoreMsg =
  | { type: 'write'; op: number; version: number }
  | { type: 'read'; op: number }
  | { type: 'store'; op: number; version: number; hintFor?: string }
  | { type: 'stored'; op: number; from: string }
  | { type: 'fetch'; op: number }
  | { type: 'value'; op: number; from: string; version: number }
  | { type: 'repair'; version: number };

export type StoreOp = OpRecord<number>;
export type StoreState = { role: 'replica'; version: number; hints: Record<string, number> } | { role: 'coordinator'; ops: StoreOp[] };
export type StoreCluster = Cluster<StoreMsg, StoreState>;

export interface StoreConfig {
  n: number;
  w: number;
  r: number;
  sloppy: boolean;
  repair: boolean;
}

export const homesOf = (n: number): string[] => HOMES.slice(0, n);

function replicaNode(): DistNode<StoreMsg, StoreState> {
  let version = 0;
  const hints: Record<string, number> = {};
  const rearm = (ctx: NodeCtx<StoreMsg>) => {
    if (Object.keys(hints).length > 0) ctx.setTimer('handoff', HANDOFF_MS);
  };
  return {
    init: (ctx) => rearm(ctx),
    onTimer: (ctx) => {
      for (const [home, v] of Object.entries(hints)) ctx.send(home, { type: 'store', op: -1, version: v });
      rearm(ctx);
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'store') {
        if (m.hintFor) {
          hints[m.hintFor] = Math.max(hints[m.hintFor] ?? 0, m.version);
          rearm(ctx);
        } else version = Math.max(version, m.version);
        ctx.send(msg.from, { type: 'stored', op: m.op, from: ctx.id });
      } else if (m.type === 'stored') {
        if (m.op === -1) delete hints[m.from];
      } else if (m.type === 'fetch') ctx.send(msg.from, { type: 'value', op: m.op, from: ctx.id, version });
      else if (m.type === 'repair') version = Math.max(version, m.version);
    },
    snapshot: () => ({ role: 'replica', version, hints: { ...hints } }),
  };
}

interface Pending {
  acks: Set<string>;
  replies: Map<string, number>;
  done: boolean;
}

function coordinatorNode(cfg: StoreConfig): DistNode<StoreMsg, StoreState> {
  const ops: StoreOp[] = [];
  const pending = new Map<number, Pending>();
  const homes = homesOf(cfg.n);
  const find = (op: number) => ops.find((o) => o.op === op);
  return {
    init: () => {},
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'write') {
        ops.push({ op: m.op, kind: 'write', client: 'writer', node: ctx.id, invoke: ctx.trueNow, response: null, outcome: 'open', value: m.version });
        pending.set(m.op, { acks: new Set(), replies: new Map(), done: false });
        for (const h of homes) ctx.send(h, { type: 'store', op: m.op, version: m.version });
        ctx.setTimer(`timeout:${m.op}`, TIMEOUT_MS);
        if (cfg.sloppy) ctx.setTimer(`sloppy:${m.op}`, SLOPPY_WAIT_MS);
      } else if (m.type === 'read') {
        ops.push({ op: m.op, kind: 'read', client: 'reader', node: ctx.id, invoke: ctx.trueNow, response: null, outcome: 'open', value: null });
        pending.set(m.op, { acks: new Set(), replies: new Map(), done: false });
        for (const h of homes) ctx.send(h, { type: 'fetch', op: m.op });
        ctx.setTimer(`timeout:${m.op}`, TIMEOUT_MS);
      } else if (m.type === 'stored') {
        const p = pending.get(m.op);
        const rec = find(m.op);
        if (!p || p.done || !rec) return;
        p.acks.add(m.from);
        if (p.acks.size >= cfg.w) {
          p.done = true;
          settleOp(rec, ctx.trueNow, 'ok');
        }
      } else if (m.type === 'value') {
        const p = pending.get(m.op);
        const rec = find(m.op);
        if (!p || p.done || !rec) return;
        p.replies.set(m.from, m.version);
        if (p.replies.size >= cfg.r) {
          p.done = true;
          const newest = Math.max(...p.replies.values());
          settleOp(rec, ctx.trueNow, 'ok', newest);
          if (cfg.repair) for (const [id, v] of p.replies) if (v < newest) ctx.send(id, { type: 'repair', version: newest });
        }
      }
    },
    onTimer: (ctx, timerId) => {
      const [kind, id] = timerId.split(':');
      const op = Number(id);
      const p = pending.get(op);
      const rec = find(op);
      if (!p || p.done || !rec) return;
      if (kind === 'sloppy') {
        const missing = homes.filter((h) => !p.acks.has(h));
        missing.slice(0, STAND_INS.length).forEach((home, i) => ctx.send(STAND_INS[i], { type: 'store', op, version: rec.value!, hintFor: home }));
      } else {
        p.done = true;
        settleOp(rec, ctx.trueNow, 'refused');
      }
    },
    snapshot: () => ({ role: 'coordinator', ops: ops.map((o) => ({ ...o })) }),
  };
}

export interface ReadPlan {
  at: number;
  /** Which coordinator takes the read (default: X). */
  via?: (typeof READ_COORDS)[number];
}

export interface StoreSetup {
  seed: number;
  config: StoreConfig;
  /** The reads to issue; the default is READS_PER_RUN seeded times on X. */
  reads?: readonly ReadPlan[];
  writes?: readonly number[];
  latency?: Latency;
  faults?: { loss?: number; duplicate?: number; chaos?: boolean };
  /** A partition to schedule: groups of node ids and its window. */
  partition?: { a: readonly string[]; b: readonly string[]; from: number; to: number };
  /** Home replicas to crash from time 0 (scene 2). */
  down?: readonly string[];
}

export const seededReads = (seed: number): ReadPlan[] => {
  const rnd = mulberry32(seed ^ SCRIPT_STREAM);
  return Array.from({ length: READS_PER_RUN }, () => ({ at: Math.round(rnd() * READ_WINDOW_MS) })).sort((a, b) => a.at - b.at);
};

export function storeCluster(s: StoreSetup): StoreCluster {
  const cfg = s.config;
  const nodes: Record<string, DistNode<StoreMsg, StoreState>> = {};
  for (const h of homesOf(cfg.n)) nodes[h] = replicaNode();
  for (const si of STAND_INS) nodes[si] = replicaNode();
  nodes[WRITE_COORD] = coordinatorNode(cfg);
  for (const x of READ_COORDS) nodes[x] = coordinatorNode(cfg);
  const c = createCluster<StoreMsg, StoreState>({
    seed: s.seed,
    nodes,
    latency: s.latency ?? ((rnd) => Math.round(LATENCY_MS.min + rnd() * (LATENCY_MS.max - LATENCY_MS.min))),
    loss: s.faults?.loss ?? 0,
    duplicate: s.faults?.duplicate ?? 0,
  });
  (s.writes ?? WRITE_TIMES).forEach((at, i) => c.inject(at, WRITE_COORD, { type: 'write', op: i, version: i + 1 }));
  const writes = (s.writes ?? WRITE_TIMES).length;
  (s.reads ?? seededReads(s.seed)).forEach((r, i) => c.inject(r.at, r.via ?? 'X', { type: 'read', op: writes + i }));
  if (s.partition) c.partition(s.partition.a, s.partition.b, s.partition.from, s.partition.to);
  for (const d of s.down ?? []) c.crash(d, 0);
  if (s.faults?.chaos) c.randomFaults({ horizonMs: FAULT_HORIZON_MS, partitions: 1, crashes: 1, pauses: 1 });
  return c;
}

export const storeScenario = (config: StoreConfig, faults: StoreSetup['faults'] = {}) => (seed: number): StoreCluster => storeCluster({ seed, config, faults });

/* ---------- history and invariants ---------- */

export const opsOf = (snap: Snapshot<StoreState>): StoreOp[] =>
  Object.values(snap.nodes)
    .flatMap((n) => (n.state?.role === 'coordinator' ? n.state.ops : []))
    .sort((a, b) => a.op - b.op);

export const historyFor = (ops: readonly StoreOp[]): RegisterOp<number>[] => historyOf(ops);

/** Safety: every read that begins after a write was acknowledged returns that write's version or a newer one. */
export const readsSeeAcknowledgedWrites: Safety<StoreState> = (snap) => {
  const ops = opsOf(snap);
  for (const r of ops) {
    if (r.kind !== 'read' || r.outcome !== 'ok' || r.value === null) continue;
    const stale = ops.find((w) => w.kind === 'write' && w.outcome === 'ok' && w.response !== null && w.response < r.invoke && w.value! > r.value!);
    if (stale) return `the read that began at ${r.invoke} ms returned version ${r.value}, but write ${stale.value} was acknowledged at ${stale.response} ms`;
  }
  return null;
};

/** A fixed 5 ms on every link, for runs that must not depend on a seed (scene 2's availability outcomes). */
export const STORE_FIXED_LATENCY: Latency = () => 5;

export const BROKEN_SEED_NO_OVERLAP = 5;
export const BROKEN_SEED_SLOPPY = 18;
