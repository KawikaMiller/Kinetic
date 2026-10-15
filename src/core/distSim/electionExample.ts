/**
 * The worked example for distSim and its self-test: a three-node leader election in two
 * versions. `broken` lets every node declare itself leader after a stagger if it hasn't heard
 * an announcement yet, so two can win before the first message lands. `fixed` makes a node
 * vote once ever and demands a majority, so two leaders are impossible. The safety property
 * is `atMostOneLeader`; `forSeeds` finds the broken one's lowest failing seed and the fixed
 * one passes hundreds of faulted seeds. Copy this shape for a lesson's own protocol.
 */
import { createCluster, type Cluster, type DistNode } from './cluster';
import type { Safety } from './invariants';

export type ElectionMsg = { type: 'leader'; id: string } | { type: 'vote-request'; cand: string } | { type: 'vote'; voter: string; granted: boolean };

export interface ElectionState {
  leader: boolean;
}

export type ElectionKind = 'broken' | 'fixed';

export const ELECTION_IDS = ['a', 'b', 'c'] as const;
const ELECT_AFTER_MS = 10;
const ELECT_STAGGER_MS = 10;
const MAJORITY = Math.floor(ELECTION_IDS.length / 2) + 1;

/** After its turn, if nobody has announced, declare yourself leader and never step down. */
function brokenNode(index: number): DistNode<ElectionMsg, ElectionState> {
  let leader = false;
  let heard = false;
  return {
    init: (ctx) => ctx.setTimer('elect', ELECT_AFTER_MS + ELECT_STAGGER_MS * index),
    onTimer: (ctx) => {
      if (heard || leader) return;
      leader = true;
      for (const p of ctx.peers) if (p !== ctx.id) ctx.send(p, { type: 'leader', id: ctx.id });
    },
    onMessage: (_ctx, msg) => {
      if (msg.payload.type === 'leader') heard = true;
    },
    snapshot: () => ({ leader }),
  };
}

/**
 * Vote once, ever (the vote is durable: it survives a restart), win with votes from a
 * majority of distinct nodes. Any two majorities of three share a node, and that node voted
 * once. A duplicated vote is counted once.
 */
function fixedNode(index: number): DistNode<ElectionMsg, ElectionState> {
  let votedFor: string | null = null;
  let votes = new Set<string>();
  let leader = false;
  return {
    init: (ctx) => {
      leader = false;
      votes = new Set();
      ctx.setTimer('elect', ELECT_AFTER_MS + ELECT_STAGGER_MS * index);
    },
    onTimer: (ctx) => {
      if (votedFor !== null) return;
      votedFor = ctx.id;
      votes = new Set([ctx.id]);
      for (const p of ctx.peers) if (p !== ctx.id) ctx.send(p, { type: 'vote-request', cand: ctx.id });
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'vote-request') {
        if (votedFor === null) votedFor = m.cand;
        ctx.send(m.cand, { type: 'vote', voter: ctx.id, granted: votedFor === m.cand });
      } else if (m.type === 'vote' && m.granted && votedFor === ctx.id) {
        votes.add(m.voter);
        if (votes.size >= MAJORITY) leader = true;
      }
    },
    snapshot: () => ({ leader }),
  };
}

/** Safety: never two leaders at once. */
export const atMostOneLeader: Safety<ElectionState> = (snap) => {
  const leaders = Object.entries(snap.nodes).filter(([, n]) => n.state?.leader).map(([id]) => id);
  return leaders.length > 1 ? `two leaders at once: ${leaders.join(' and ')}` : null;
};

/** Horizon within which `randomFaults` places the election scenario's faults. */
const FAULT_HORIZON_MS = 80;

/**
 * A scenario for `forSeeds`: the election with 1 to 15 ms latency and, when `faults` is on,
 * 10% loss, 15% duplication, a skewed and a drifting clock, and a random partition, crash and pause.
 */
export const electionScenario = (kind: ElectionKind, faults: boolean) => (seed: number): Cluster<ElectionMsg, ElectionState> => {
  const make = kind === 'broken' ? brokenNode : fixedNode;
  const c = createCluster<ElectionMsg, ElectionState>({
    seed,
    nodes: Object.fromEntries(ELECTION_IDS.map((id, i) => [id, make(i)])),
    latency: { min: 1, max: 15 },
    ...(faults ? { loss: 0.1, duplicate: 0.15, clocks: [{ offsetMs: 40 }, { driftPpm: 5000 }, {}] } : {}),
  });
  if (faults) c.randomFaults({ horizonMs: FAULT_HORIZON_MS, partitions: 1, crashes: 1, pauses: 1 });
  return c;
};
