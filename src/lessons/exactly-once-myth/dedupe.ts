/**
 * exactly-once-myth, scene 3: at-least-once plus an idempotent consumer, on distSim.
 *
 * The broker re-sends each message until it is acknowledged (at-least-once). The consumer applies "balance += 10" for message id m, once.
 * To tell a retry from a new message it keeps a set of ids it has handled. Two designs:
 * - `separate`: step 1 applies the effect, step 2 records the id, step 3 acknowledges. Three steps, STEP_MS apart.
 * - `atomic`:   step 1 applies the effect AND records the id in one indivisible step, step 2 acknowledges.
 * The consumer handles one message at a time (a delivery that arrives while it is busy is ignored and will be retried), and a crash
 * loses the steps still to come but keeps the balance and the recorded ids (they are durable).
 *
 * Safety: each message's effect is applied at most once.
 */
import { createCluster, type Cluster, type DistNode, type NodeCtx, type Safety } from '../../core/distSim';

export type DedupeDesign = 'separate' | 'atomic';
export const DESIGNS: readonly DedupeDesign[] = ['separate', 'atomic'];
export const DESIGN_LABEL: Record<DedupeDesign, string> = { separate: 'Record the id separately', atomic: 'Record the id in the same step' };

export type CrashPoint = 'before' | 'gap' | 'after';
export const CRASH_POINTS: readonly CrashPoint[] = ['before', 'gap', 'after'];
export const CRASH_LABEL: Record<CrashPoint, string> = {
  before: 'before the effect',
  gap: 'between the effect and recording the id',
  after: 'after recording, before the ack',
};

export type DedupeMsg = { type: 'publish'; id: number } | { type: 'deliver'; id: number } | { type: 'ack'; id: number };
export interface DedupeState {
  balance: number;
  /** How many times each message's effect was applied. */
  applied: Record<number, number>;
  seen: number[];
  /** Broker only: messages not yet acknowledged. */
  pending: number[];
}
export type DedupeCluster = Cluster<DedupeMsg, DedupeState>;

export const AMOUNT = 10;
export const STEP_MS = 20;
export const RETRY_MS = 100;
export const RESTART_AFTER_MS = 30;
export const LATENCY_MS = { min: 2, max: 15 } as const;
export const MESSAGES = 3;
export const PUBLISH_EVERY_MS = 150;
export const HORIZON_MS = 700;
export const BROKER = 'broker';
/** The lowest seed on which the separate design breaks `effectAtMostOnce` under the faults (a test searches for it). */
export const DEDUPE_BROKEN_SEED = 8;
export const CONSUMER = 'consumer';

function brokerNode(): DistNode<DedupeMsg, DedupeState> {
  const pending = new Set<number>();
  const send = (ctx: NodeCtx<DedupeMsg>, id: number) => {
    ctx.send(CONSUMER, { type: 'deliver', id });
    ctx.setTimer(`retry:${id}`, RETRY_MS);
  };
  return {
    init: (ctx) => {
      for (const id of pending) ctx.setTimer(`retry:${id}`, RETRY_MS);
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type === 'publish') {
        pending.add(m.id);
        send(ctx, m.id);
      } else if (m.type === 'ack') {
        pending.delete(m.id);
        ctx.cancelTimer(`retry:${m.id}`);
      }
    },
    onTimer: (ctx, timerId) => {
      const id = Number(timerId.split(':')[1]);
      if (pending.has(id)) send(ctx, id);
    },
    snapshot: () => ({ balance: 0, applied: {}, seen: [], pending: [...pending] }),
  };
}

function consumerNode(design: DedupeDesign): DistNode<DedupeMsg, DedupeState> {
  let balance = 0;
  const applied: Record<number, number> = {};
  const seen = new Set<number>();
  let busy = false;
  let current = 0;
  const effect = (id: number) => {
    balance += AMOUNT;
    applied[id] = (applied[id] ?? 0) + 1;
  };
  return {
    // A restart forgets what the consumer was in the middle of; the balance and the recorded ids are durable.
    init: () => {
      busy = false;
    },
    onMessage: (ctx, msg) => {
      const m = msg.payload;
      if (m.type !== 'deliver' || busy) return;
      if (seen.has(m.id)) {
        ctx.send(BROKER, { type: 'ack', id: m.id });
        return;
      }
      busy = true;
      current = m.id;
      ctx.setTimer('step1', STEP_MS);
    },
    onTimer: (ctx, timerId) => {
      if (timerId === 'step1') {
        effect(current);
        if (design === 'atomic') seen.add(current);
        ctx.setTimer(design === 'atomic' ? 'ack' : 'step2', STEP_MS);
      } else if (timerId === 'step2') {
        seen.add(current);
        ctx.setTimer('ack', STEP_MS);
      } else {
        ctx.send(BROKER, { type: 'ack', id: current });
        busy = false;
      }
    },
    snapshot: () => ({ balance, applied: { ...applied }, seen: [...seen], pending: [] }),
  };
}

export interface DedupeSetup {
  seed: number;
  design: DedupeDesign;
  fixedLatencyMs?: number;
  messages?: number;
  /** A crash of the consumer at this true time, restarting RESTART_AFTER_MS later. */
  crashAt?: number;
  /** Loss and duplication and a random crash and pause instead of a chosen crash point. */
  faults?: boolean;
  /** How many random consumer crashes the faults include (default 1; 0 is the counterfactual). */
  crashes?: number;
}

export function dedupeCluster(s: DedupeSetup): DedupeCluster {
  const c = createCluster<DedupeMsg, DedupeState>({
    seed: s.seed,
    nodes: { [BROKER]: brokerNode(), [CONSUMER]: consumerNode(s.design) },
    latency: (rnd) => s.fixedLatencyMs ?? Math.round(LATENCY_MS.min + rnd() * (LATENCY_MS.max - LATENCY_MS.min)),
    ...(s.faults ? { loss: 0.1, duplicate: 0.15 } : {}),
  });
  for (let i = 0; i < (s.messages ?? MESSAGES); i++) c.inject(i * PUBLISH_EVERY_MS, BROKER, { type: 'publish', id: i + 1 });
  if (s.crashAt !== undefined) {
    c.crash(CONSUMER, s.crashAt);
    c.restart(CONSUMER, s.crashAt + RESTART_AFTER_MS);
  }
  if (s.faults) c.randomFaults({ horizonMs: PUBLISH_EVERY_MS * MESSAGES, crashes: s.crashes ?? 1, partitions: 1, pauses: 1 });
  return c;
}

/** The true time to crash the consumer for a crash point, when the first delivery of message 1 arrives at `arrivesAt`. */
export function crashTimeFor(point: CrashPoint, design: DedupeDesign, arrivesAt: number): number {
  // Steps run at arrivesAt + STEP_MS (the effect), then +2 STEP_MS (the id, or the ack when atomic), then +3 STEP_MS (the ack).
  if (point === 'before') return arrivesAt + STEP_MS / 2;
  if (point === 'gap') return design === 'separate' ? arrivesAt + 1.5 * STEP_MS : arrivesAt + STEP_MS;
  return design === 'separate' ? arrivesAt + 2.5 * STEP_MS : arrivesAt + 1.5 * STEP_MS;
}

/** Safety: each message's effect is applied at most once. */
export const effectAtMostOnce: Safety<DedupeState> = (snap) => {
  const twice = Object.entries(snap.nodes[CONSUMER].state!.applied).find(([, n]) => n > 1);
  return twice ? `message ${twice[0]}'s effect was applied ${twice[1]} times` : null;
};

export const dedupeScenario = (design: DedupeDesign, faults = true) => (seed: number): DedupeCluster => dedupeCluster({ seed, design, faults });

/** The lowest seed below `limit` on which this design breaks the safety property under faults, or null. */
export function lowestBreakingSeed(design: DedupeDesign, limit: number): number | null {
  for (let seed = 0; seed < limit; seed++) {
    const c = dedupeScenario(design)(seed);
    c.run({ until: HORIZON_MS });
    if (effectAtMostOnce(c.snapshot()) !== null) return seed;
  }
  return null;
}

export interface Outcome {
  balance: number;
  /** Times message 1's effect was applied. */
  applied: number;
}

/** Run the hand-built schedule for one crash point and one design and report what the balance ended as. */
export function runCrashPoint(design: DedupeDesign, point: CrashPoint, fixedLatencyMs = 5): { outcome: Outcome; cluster: DedupeCluster } {
  const arrives = fixedLatencyMs;
  const cluster = dedupeCluster({ seed: 0, design, fixedLatencyMs, messages: 1, crashAt: crashTimeFor(point, design, arrives) });
  cluster.run({ until: HORIZON_MS });
  const st = cluster.snapshot().nodes[CONSUMER].state!;
  return { outcome: { balance: st.balance, applied: st.applied[1] ?? 0 }, cluster };
}

/** The 3 x 2 table, computed by running each cell. */
export function crashTable(): Record<CrashPoint, Record<DedupeDesign, Outcome>> {
  const cell = (point: CrashPoint, design: DedupeDesign) => runCrashPoint(design, point).outcome;
  return Object.fromEntries(CRASH_POINTS.map((p) => [p, Object.fromEntries(DESIGNS.map((d) => [d, cell(p, d)]))])) as Record<CrashPoint, Record<DedupeDesign, Outcome>>;
}

