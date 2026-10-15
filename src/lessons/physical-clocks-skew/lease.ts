/**
 * physical-clocks-skew, scene 2: a lease that two nodes believe they hold, run on distSim.
 *
 * A lock server (perfect clock) grants the lease to holder H until the absolute server time `LEASE_END_MS`, and, once it has
 * expired by the server's clock plus `GRACE_MS`, grants it to N. H works out how long it has left by reading its OWN clock:
 * `remaining = expiry - now()`, and stops believing `marginMs` early. If H's clock is slow its remaining time is too large, so H
 * believes in the lease after the server has given it to N. Offsets break absolute times, drift breaks durations; both are small
 * and neither is zero. (Pauses and fencing tokens are the next lease lesson's business.)
 *
 * Safety: at most one node believes it holds the lease at any true time.
 */
import { createCluster, type Cluster, type DistNode, type Safety } from '../../core/distSim';
import { mulberry32 } from '../../core/random';
import type { ClockSpec } from './clocks';

export type LeaseMsg = { type: 'lease'; expiry: number };
export interface LeaseState {
  holds: boolean;
}
export type LeaseCluster = Cluster<LeaseMsg, LeaseState>;

export const SERVER_NODE = 'server';
export const HOLDER = 'H';
export const NEXT = 'N';
/** The lease runs to this absolute server time, ms (10 s). */
export const LEASE_END_MS = 10_000;
/** The server waits this long after expiry before granting to the next node, ms. */
export const GRACE_MS = 500;
export const LEASE_LATENCY = { min: 1, max: 15 } as const;
/** The lowest seed on which a holder with no margin breaks `atMostOneHolder` when its offset is drawn within 3 s (a test searches for it). */
export const LEASE_BROKEN_SEED = 3;
export const LEASE_SKEW_BOUND_MS = 3000;

function serverNode(): DistNode<LeaseMsg, LeaseState> {
  return {
    init: (ctx) => {
      ctx.send(HOLDER, { type: 'lease', expiry: LEASE_END_MS });
      ctx.setTimer('next', LEASE_END_MS + GRACE_MS);
    },
    onTimer: (ctx) => ctx.send(NEXT, { type: 'lease', expiry: LEASE_END_MS + 2 * LEASE_END_MS }),
    onMessage: () => {},
  };
}

function leaseHolderNode(marginMs: number): DistNode<LeaseMsg, LeaseState> {
  let holds = false;
  return {
    // A restart forgets the lease: what a node believes is volatile.
    init: () => {
      holds = false;
    },
    onMessage: (ctx, msg) => {
      // By its own clock, how long is left? A lease that is already used up (a late or duplicated message) is ignored.
      const left = msg.payload.expiry - ctx.now() - marginMs;
      if (left <= 0) return;
      holds = true;
      ctx.setTimer('drop', left);
    },
    onTimer: () => {
      holds = false;
    },
    snapshot: () => ({ holds }),
  };
}

export interface LeaseSetup {
  seed: number;
  holderClock: ClockSpec;
  marginMs: number;
  fixedLatencyMs?: number;
  faults?: boolean;
}

export function leaseCluster(s: LeaseSetup): LeaseCluster {
  const c = createCluster<LeaseMsg, LeaseState>({
    seed: s.seed,
    nodes: { [SERVER_NODE]: serverNode(), [HOLDER]: leaseHolderNode(s.marginMs), [NEXT]: leaseHolderNode(0) },
    latency: (rnd) => s.fixedLatencyMs ?? Math.round(LEASE_LATENCY.min + rnd() * (LEASE_LATENCY.max - LEASE_LATENCY.min)),
    clocks: [{}, s.holderClock, {}],
    ...(s.faults ? { loss: 0.1, duplicate: 0.15 } : {}),
  });
  // No pauses: a stalled holder keeps believing after its lease ran out whatever its clock says, which is the next lease lesson's problem.
  if (s.faults) c.randomFaults({ horizonMs: LEASE_END_MS * 2, partitions: 1, crashes: 1 });
  return c;
}

/** Safety: no two nodes believe they hold the lease at once. */
export const atMostOneHolder: Safety<LeaseState> = (snap) => {
  const holders = Object.entries(snap.nodes).filter(([, n]) => n.up && n.state?.holds).map(([id]) => id);
  return holders.length > 1 ? `${holders.join(' and ')} both believe they hold the lease` : null;
};

export interface Belief {
  node: string;
  /** True ms when it started believing, and when it stopped (null: still, at the end of the run). */
  from: number;
  to: number | null;
}

export interface LeaseRun {
  beliefs: Belief[];
  /** The true-time window in which both believed, or null. */
  overlap: { from: number; to: number } | null;
  end: number;
}

/** Run the cluster event by event and write down when each node started and stopped believing. */
export function runLease(s: LeaseSetup): LeaseRun {
  const c = leaseCluster(s);
  const open = new Map<string, Belief>();
  const beliefs: Belief[] = [];
  c.start();
  while (c.queued > 0) {
    c.step();
    const snap = c.snapshot();
    for (const id of [HOLDER, NEXT]) {
      const holds = snap.nodes[id].state?.holds ?? false;
      const current = open.get(id);
      if (holds && !current) {
        const b: Belief = { node: id, from: snap.time, to: null };
        open.set(id, b);
        beliefs.push(b);
      } else if (!holds && current) {
        current.to = snap.time;
        open.delete(id);
      }
    }
  }
  const end = c.time;
  const h = beliefs.find((b) => b.node === HOLDER);
  const n = beliefs.find((b) => b.node === NEXT);
  const from = h && n ? Math.max(h.from, n.from) : 0;
  const to = h && n ? Math.min(h.to ?? end, n.to ?? end) : 0;
  return { beliefs, overlap: h && n && to > from ? { from, to } : null, end };
}

/** A seeded scenario for `forSeeds`: the holder's clock offset is drawn from the seed, within `within` ms of true time either way. */
export const leaseScenario = (o: { marginMs: number; within: number; faults?: boolean }) => (seed: number): LeaseCluster =>
  leaseCluster({ seed, holderClock: { offsetMs: (mulberry32(seed ^ 0x9e3779b1)() * 2 - 1) * o.within, driftPpm: 0 }, marginMs: o.marginMs, faults: o.faults });

/** True time at which a holder with this clock stops believing: its clock reaches expiry minus the margin. */
export const believedUntil = (c: ClockSpec, marginMs: number): number => (LEASE_END_MS - marginMs - c.offsetMs) / (1 + c.driftPpm * 1e-6);
