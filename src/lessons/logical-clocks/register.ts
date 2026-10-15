/**
 * logical-clocks, scene 3: a replicated register on distSim, three replicas, written through different replicas.
 *
 * Modes:
 * - `lww`      (broken) each replica keeps ONE version, the one with the larger Lamport stamp, ties broken by replica id.
 * - `siblings` (fixed) each version carries a version vector; a replica drops a version only when another one dominates it and keeps
 *              concurrent versions as siblings, until a client resolves them by writing a version whose vector dominates both.
 *              This is the approach of Dynamo-style stores (from memory; check the Dynamo paper).
 * - `no-prune` (broken) like `siblings` but never drops an ancestor, so the sibling set grows stale versions.
 *
 * The script: write `a` through one replica and `b` through another before any message can arrive (so they are concurrent), then
 * a client resolves through a third (or either) replica: it reads that replica's siblings and writes a version with the joined
 * vector, either the two values merged or one of them picked.
 *
 * Safety (checked after every event, against ground truth carried in every version as `deps`, the writes its writer had read):
 * (1) no write is discarded while it is concurrent with a surviving write; (2) the sibling set holds only maximal versions;
 * (0) a replica that has seen any write holds at least one version.
 *
 * Dotted version vectors, which fix the case of two concurrent writes through the SAME replica, are named in the lesson only: the
 * script never sends concurrent writes to one coordinator.
 */
import { createCluster, type Cluster, type DistNode, type NodeCtx, type Safety, type Snapshot } from '../../core/distSim';
import { mulberry32 } from '../../core/random';

export type RegMode = 'lww' | 'siblings' | 'no-prune';
export type Resolve = 'merge' | 'pick-a' | 'pick-b';
export const REG_MODES: readonly RegMode[] = ['lww', 'siblings', 'no-prune'];
export const REPLICAS = ['r1', 'r2', 'r3'] as const;

export type VV = Record<string, number>;
export interface Version {
  /** The write's id: 'a', 'b', or 'm' for the resolution. */
  id: string;
  value: string;
  vv: VV;
  lamport: number;
  origin: string;
  /** Ground truth: the writes the writer had read when it wrote this (never read by the replicas' logic). */
  deps: string[];
}

export type RegMsg =
  | { type: 'put'; id: string; value: string; ctx: VV; deps: string[] }
  | { type: 'replicate'; version: Version }
  | { type: 'resolve'; how: Resolve };

export interface RegState {
  versions: Version[];
  /** Every write this replica has received, directly or by replication, with its ground-truth deps. */
  seen: Record<string, string[]>;
}
export type RegCluster = Cluster<RegMsg, RegState>;

export const LATENCY_MS = { min: 5, max: 40 } as const;
/** The two concurrent writes are sent within this many ms of each other, which is less than the shortest message delay. */
export const CONCURRENT_WINDOW_MS = 4;
export const RESOLVE_AT_MS = 200;
/** In the counterfactual, b is written this long after a, once a has reached every replica. */
export const SEQUENTIAL_B_AT_MS = 100;
export const FAULT_HORIZON_MS = 300;

const dominates = (x: VV, y: VV): boolean => Object.entries(y).every(([k, v]) => (x[k] ?? 0) >= v);
const join = (vs: readonly VV[]): VV => {
  const out: VV = {};
  for (const v of vs) for (const [k, n] of Object.entries(v)) out[k] = Math.max(out[k] ?? 0, n);
  return out;
};
export const vvText = (vv: VV): string => `[${REPLICAS.map((r) => vv[r] ?? 0).join(',')}]`;

function replicaNode(mode: RegMode): DistNode<RegMsg, RegState> {
  let versions: Version[] = [];
  let seen: Record<string, string[]> = {};
  let lamport = 0;
  // Replicas keep what they hold across a restart (durable), so a crash only costs the messages it missed.
  const insert = (v: Version) => {
    seen[v.id] = v.deps;
    if (mode === 'lww') {
      lamport = Math.max(lamport, v.lamport) + 1;
      const cur = versions[0];
      if (!cur || v.lamport > cur.lamport || (v.lamport === cur.lamport && v.origin > cur.origin)) versions = [v];
      return;
    }
    if (versions.some((w) => w.id === v.id)) return;
    if (mode === 'siblings') {
      if (versions.some((w) => dominates(w.vv, v.vv))) return;
      versions = [...versions.filter((w) => !dominates(v.vv, w.vv)), v];
    } else {
      versions = [...versions, v];
    }
  };
  const create = (ctx: NodeCtx<RegMsg>, self: string, id: string, value: string, vv: VV, deps: string[]) => {
    lamport += 1;
    const own = Math.max(vv[self] ?? 0, ...versions.map((w) => w.vv[self] ?? 0)) + 1;
    const v: Version = { id, value, vv: { ...vv, [self]: own }, lamport, origin: self, deps };
    insert(v);
    for (const p of ctx.peers) if (p !== self) ctx.send(p, { type: 'replicate', version: v });
  };
  return {
    init: () => {},
    onTimer: () => {},
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'put') {
        if (seen[m.id] === undefined) create(ctx, ctx.id, m.id, m.value, m.ctx, m.deps);
      } else if (m.type === 'replicate') insert(m.version);
      else if (mode !== 'lww' && versions.length > 0 && seen.m === undefined) {
        const chosen = m.how === 'merge' ? versions : versions.filter((v) => v.id === (m.how === 'pick-a' ? 'a' : 'b'));
        const from = chosen.length > 0 ? chosen : versions.slice(0, 1);
        const value = m.how === 'merge' ? [...from].map((v) => v.value).sort().join('+') : from[0].value;
        create(ctx, ctx.id, 'm', value, join(versions.map((v) => v.vv)), versions.map((v) => v.id));
      }
    },
    snapshot: () => ({ versions: versions.map((v) => ({ ...v, vv: { ...v.vv } })), seen: { ...seen } }),
  };
}

export interface RegSetup {
  seed: number;
  mode: RegMode;
  resolve: Resolve;
  faults?: boolean;
  /** Replicas receiving the writes a and b and the resolve; the default draws them from the seed. */
  places?: { a: string; b: string; resolver: string };
  /** A counterfactual: the client writing b first read a (it writes later, with a as its context), so b is not concurrent with a. */
  sequential?: boolean;
  fixedLatencyMs?: number;
}

export const placesFor = (seed: number): { a: string; b: string; resolver: string } => {
  const rnd = mulberry32(seed ^ 0x7f4a7c15);
  const a = REPLICAS[Math.floor(rnd() * REPLICAS.length)];
  const others = REPLICAS.filter((r) => r !== a);
  return { a, b: others[Math.floor(rnd() * others.length)], resolver: REPLICAS[Math.floor(rnd() * REPLICAS.length)] };
};

export function registerCluster(s: RegSetup): RegCluster {
  const places = s.places ?? placesFor(s.seed);
  const rnd = mulberry32(s.seed ^ 0x1b873593);
  const c = createCluster<RegMsg, RegState>({
    seed: s.seed,
    nodes: Object.fromEntries(REPLICAS.map((r) => [r, replicaNode(s.mode)])),
    latency: (net) => s.fixedLatencyMs ?? Math.round(LATENCY_MS.min + net() * (LATENCY_MS.max - LATENCY_MS.min)),
    ...(s.faults ? { loss: 0.1, duplicate: 0.15 } : {}),
  });
  c.inject(0, places.a, { type: 'put', id: 'a', value: 'a', ctx: {}, deps: [] });
  if (s.sequential) c.inject(SEQUENTIAL_B_AT_MS, places.b, { type: 'put', id: 'b', value: 'b', ctx: { [places.a]: 1 }, deps: ['a'] });
  else c.inject(Math.round(rnd() * CONCURRENT_WINDOW_MS), places.b, { type: 'put', id: 'b', value: 'b', ctx: {}, deps: [] });
  c.inject(RESOLVE_AT_MS, places.resolver, { type: 'resolve', how: s.resolve });
  if (s.faults) c.randomFaults({ horizonMs: FAULT_HORIZON_MS, partitions: 1, crashes: 1, pauses: 1 });
  return c;
}

/** `registerCluster` as a `forSeeds` scenario. */
export const registerScenario = (mode: RegMode, resolve: Resolve, faults = false) => (seed: number): RegCluster => registerCluster({ seed, mode, resolve, faults });

/* ---------- ground truth and the invariants ---------- */

/** Happened-before among writes from the deps every replica has recorded: `before(x, y)` when x is a transitive dependency of y. */
export function causality(snap: Snapshot<RegState>): { before: (x: string, y: string) => boolean; concurrent: (x: string, y: string) => boolean } {
  const deps: Record<string, string[]> = {};
  for (const n of Object.values(snap.nodes)) Object.assign(deps, n.state?.seen);
  const before = (x: string, y: string, guard = new Set<string>()): boolean => {
    if (guard.has(y)) return false;
    guard.add(y);
    return (deps[y] ?? []).some((d) => d === x || before(x, d, guard));
  };
  return { before: (x, y) => before(x, y), concurrent: (x, y) => x !== y && !before(x, y) && !before(y, x) };
}

export const replicaStates = (snap: Snapshot<RegState>): [string, RegState][] => Object.entries(snap.nodes).flatMap(([id, n]) => (n.state ? [[id, n.state] as [string, RegState]] : []));

/**
 * (0) and (1): a replica that has seen a write holds something, and a write is discarded only when a surviving write came after it
 * (is a causal descendant). A write that is merely concurrent with a survivor must be kept as a sibling, not thrown away.
 */
export const noConcurrentWriteDiscarded: Safety<RegState> = (snap) => {
  const { before, concurrent } = causality(snap);
  for (const [id, st] of replicaStates(snap)) {
    const held = new Set(st.versions.map((v) => v.id));
    if (Object.keys(st.seen).length > 0 && held.size === 0) return `${id} has seen writes but holds none`;
    for (const w of Object.keys(st.seen)) {
      if (held.has(w) || [...held].some((u) => before(w, u))) continue;
      const rival = [...held].find((u) => concurrent(w, u));
      return `${id} discarded write ${w} although no surviving write came after it${rival ? `: it is concurrent with ${rival}` : ''}`;
    }
  }
  return null;
};

/** (2): the sibling set holds only maximal versions, so no version is a causal ancestor of another one held. */
export const siblingsAreMaximal: Safety<RegState> = (snap) => {
  const { before } = causality(snap);
  for (const [id, st] of replicaStates(snap)) {
    for (const u of st.versions) {
      const descendant = st.versions.find((v) => before(u.id, v.id));
      if (descendant) return `${id} still holds write ${u.id}, an ancestor of ${descendant.id}`;
    }
  }
  return null;
};

/** Every (replica, write) where the write was seen, is not held, and no surviving write came after it. */
export function lostWrites(snap: Snapshot<RegState>): { replica: string; write: string }[] {
  const { before } = causality(snap);
  return replicaStates(snap).flatMap(([replica, st]) => {
    const held = new Set(st.versions.map((v) => v.id));
    return Object.keys(st.seen)
      .filter((w) => !held.has(w) && ![...held].some((u) => before(w, u)))
      .map((write) => ({ replica, write }));
  });
}

export const REGISTER_SAFETY: Safety<RegState>[] = [noConcurrentWriteDiscarded, siblingsAreMaximal];

/** The lowest seed on which raw Lamport last-write-wins breaks (1) (a test searches for it). */
export const BROKEN_SEED = 0;
/** The lowest seed on which never pruning breaks (2) (a test searches for it). */
export const NO_PRUNE_SEED = 0;

export interface Frame {
  t: number;
  /** The replicas' versions after this event. */
  replicas: Record<string, Version[]>;
  /** Writes a replica has seen and thrown away although nothing that survives came after them: silently lost writes. */
  lost: { replica: string; write: string }[];
  violation: string | null;
}

/** Run to completion, keeping each replica's versions after every event. */
export function runRegister(s: RegSetup): { frames: Frame[]; trace: RegCluster['trace']; end: number; widest: number } {
  const c = registerCluster(s);
  c.start();
  const frames: Frame[] = [];
  const capture = () => {
    const snap = c.snapshot();
    const replicas = Object.fromEntries(replicaStates(snap).map(([id, st]) => [id, st.versions]));
    const violation = REGISTER_SAFETY.map((f) => f(snap)).find((m) => m !== null) ?? null;
    frames.push({ t: c.time, replicas, lost: lostWrites(snap), violation });
  };
  capture();
  while (c.step()) capture();
  const widest = Math.max(0, ...frames.flatMap((f) => Object.values(f.replicas).flatMap((vs) => vs.map((v) => Object.keys(v.vv).length))));
  return { frames, trace: c.trace, end: c.time, widest };
}
