/**
 * exactly-once-myth, scene 2: delivery guarantees on a lossy link, on distSim.
 *
 * A producer publishes messages to a broker (an outside request, so nothing is lost on that hop); the broker delivers each to a consumer
 * over a link that loses messages, and the consumer processes whatever it receives, with no deduplication (that is scene 3).
 * - `at-most-once`: the broker sends once and forgets.
 * - `at-least-once`: the broker re-sends every RETRY_MS until the consumer's ack arrives. An ack can be lost, so the same message can arrive twice.
 * - `exactly-once` (the hopeful one): at-least-once, plus the broker answers an ack with a confirm and the consumer re-sends its ack until
 *   the confirm arrives, "acks of acks". The last confirm can be lost too, so someone is always unsure: Two Generals again.
 * Network duplication is left out of this scene on purpose: a duplicated packet is a retransmission by another name, and scene 3 injects it.
 * Replicas keep their counts across a crash (durable); timers do not survive one.
 */
import { createCluster, type Cluster, type DistNode, type NodeCtx, type Safety } from '../../core/distSim';
import { mulberry32 } from '../../core/random';

export type DeliveryMode = 'at-most-once' | 'at-least-once' | 'exactly-once';
export const DELIVERY_MODES: readonly DeliveryMode[] = ['at-most-once', 'at-least-once', 'exactly-once'];
export const MODE_LABEL: Record<DeliveryMode, string> = { 'at-most-once': 'At most once', 'at-least-once': 'At least once', 'exactly-once': 'Exactly once (acks of acks)' };

export type DeliveryMsg = { type: 'deliver'; id: number } | { type: 'ack'; id: number } | { type: 'confirm'; id: number } | { type: 'publish'; id: number };

export interface DeliveryState {
  /** Consumer: how many times each message was processed. Broker: how many times it sent each message. */
  counts: Record<number, number>;
  /** Broker only: messages whose ack arrived (it considers them done). */
  done: number[];
  /** Consumer only: messages whose confirm arrived. */
  confirmed: number[];
}
export type DeliveryCluster = Cluster<DeliveryMsg, DeliveryState>;

export const MESSAGES = 5;
export const PUBLISH_EVERY_MS = 25;
export const RETRY_MS = 40;
export const LATENCY_MS = { min: 3, max: 12 } as const;
export const HORIZON_MS = 600;
export const BROKER = 'broker';
/** The lowest seed on which at-least-once at 30% loss processes a message twice (a test searches for it). */
export const DELIVERY_BROKEN_SEED = 0;
export const DEFAULT_LOSS = 0.3;
export const CONSUMER = 'consumer';

function brokerNode(mode: DeliveryMode): DistNode<DeliveryMsg, DeliveryState> {
  const pending = new Set<number>();
  const done = new Set<number>();
  const sentCount: Record<number, number> = {};
  const deliver = (ctx: NodeCtx<DeliveryMsg>, id: number) => {
    sentCount[id] = (sentCount[id] ?? 0) + 1;
    ctx.send(CONSUMER, { type: 'deliver', id });
    if (mode !== 'at-most-once') ctx.setTimer(`retry:${id}`, RETRY_MS);
  };
  return {
    init: (ctx) => {
      for (const id of pending) ctx.setTimer(`retry:${id}`, RETRY_MS);
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'publish') {
        if (mode !== 'at-most-once') pending.add(m.id);
        deliver(ctx, m.id);
      } else if (m.type === 'ack') {
        pending.delete(m.id);
        done.add(m.id);
        ctx.cancelTimer(`retry:${m.id}`);
        if (mode === 'exactly-once') ctx.send(CONSUMER, { type: 'confirm', id: m.id });
      }
    },
    onTimer: (ctx, timerId) => {
      const id = Number(timerId.split(':')[1]);
      if (pending.has(id)) deliver(ctx, id);
    },
    snapshot: () => ({ counts: { ...sentCount }, done: [...done], confirmed: [] }),
  };
}

function consumerNode(mode: DeliveryMode): DistNode<DeliveryMsg, DeliveryState> {
  const processed: Record<number, number> = {};
  const confirmed = new Set<number>();
  const awaiting = new Set<number>();
  return {
    init: (ctx) => {
      for (const id of awaiting) ctx.setTimer(`ack:${id}`, RETRY_MS);
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'deliver') {
        processed[m.id] = (processed[m.id] ?? 0) + 1;
        if (mode === 'at-most-once') return;
        ctx.send(BROKER, { type: 'ack', id: m.id });
        if (mode === 'exactly-once' && !confirmed.has(m.id)) {
          awaiting.add(m.id);
          ctx.setTimer(`ack:${m.id}`, RETRY_MS);
        }
      } else if (m.type === 'confirm') {
        confirmed.add(m.id);
        awaiting.delete(m.id);
        ctx.cancelTimer(`ack:${m.id}`);
      }
    },
    onTimer: (ctx, timerId) => {
      const id = Number(timerId.split(':')[1]);
      if (awaiting.has(id)) {
        ctx.send(BROKER, { type: 'ack', id });
        ctx.setTimer(`ack:${id}`, RETRY_MS);
      }
    },
    snapshot: () => ({ counts: { ...processed }, done: [], confirmed: [...confirmed] }),
  };
}

export interface DeliverySetup {
  seed: number;
  mode: DeliveryMode;
  loss: number;
  /** Add a seeded crash of the consumer (and its restart) to the run. */
  crash?: boolean;
  fixedLatencyMs?: number;
  messages?: number;
}

export function deliveryCluster(s: DeliverySetup): DeliveryCluster {
  const c = createCluster<DeliveryMsg, DeliveryState>({
    seed: s.seed,
    nodes: { [BROKER]: brokerNode(s.mode), [CONSUMER]: consumerNode(s.mode) },
    latency: (rnd) => s.fixedLatencyMs ?? Math.round(LATENCY_MS.min + rnd() * (LATENCY_MS.max - LATENCY_MS.min)),
    loss: s.loss,
  });
  for (let i = 0; i < (s.messages ?? MESSAGES); i++) c.inject(i * PUBLISH_EVERY_MS, BROKER, { type: 'publish', id: i + 1 });
  if (s.crash) {
    const rnd = mulberry32(s.seed ^ 0x2f6a1c5d);
    const at = Math.round(rnd() * (PUBLISH_EVERY_MS * MESSAGES));
    c.crash(CONSUMER, at);
    c.restart(CONSUMER, at + 2 * RETRY_MS);
  }
  return c;
}

export const deliveryScenario = (mode: DeliveryMode, loss: number, crash = false) => (seed: number): DeliveryCluster => deliveryCluster({ seed, mode, loss, crash });

const consumerOf = (snap: { nodes: Record<string, { state?: DeliveryState }> }): DeliveryState => snap.nodes[CONSUMER].state!;
const brokerOf = (snap: { nodes: Record<string, { state?: DeliveryState }> }): DeliveryState => snap.nodes[BROKER].state!;

/** Safety for at-most-once: no message is processed twice. */
export const neverProcessedTwice: Safety<DeliveryState> = (snap) => {
  const twice = Object.entries(consumerOf(snap).counts).find(([, n]) => n > 1);
  return twice ? `message ${twice[0]} was processed ${twice[1]} times` : null;
};

/** Safety for the retrying modes: a message the broker considers done was processed at least once. */
export const doneMeansProcessed: Safety<DeliveryState> = (snap) => {
  const c = consumerOf(snap);
  const lost = brokerOf(snap).done.find((id) => (c.counts[id] ?? 0) === 0);
  return lost === undefined ? null : `the broker considers message ${lost} done but the consumer never processed it`;
};

export interface Counters {
  /** deliver messages the broker sent, counting retries. */
  sent: number;
  /** deliver messages that reached the consumer. */
  delivered: number;
  /** Extra processings: the sum over messages of (times processed - 1). */
  duplicates: number;
  /** Messages the consumer never processed. */
  lost: number;
}

export function countersOf(cluster: DeliveryCluster, messages = MESSAGES): Counters {
  const trace = cluster.trace;
  const processed = consumerOf(cluster.snapshot()).counts;
  return {
    sent: trace.filter((r) => r.kind === 'send' && r.payload?.type === 'deliver').length,
    delivered: trace.filter((r) => r.kind === 'deliver' && r.payload?.type === 'deliver').length,
    duplicates: Object.values(processed).reduce((s, n) => s + Math.max(0, n - 1), 0),
    lost: Array.from({ length: messages }, (_, i) => i + 1).filter((id) => (processed[id] ?? 0) === 0).length,
  };
}

/** The lowest seed below `limit` on which `safety` breaks for this setup, or null. */
export function lowestSeedBreaking(mode: DeliveryMode, loss: number, crash: boolean, limit: number): number | null {
  for (let seed = 0; seed < limit; seed++) {
    const c = deliveryCluster({ seed, mode, loss, crash });
    c.run({ until: HORIZON_MS });
    if (neverProcessedTwice(c.snapshot()) !== null) return seed;
  }
  return null;
}
