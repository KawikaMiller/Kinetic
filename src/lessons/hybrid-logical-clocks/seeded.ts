/**
 * hybrid-logical-clocks, scene 3 and the broken modes: three nodes on `core/distSim` with skewed clocks, timestamping every
 * event and every message. Four stamping rules share one node:
 * - 'hlc': the full rules.
 * - 'physical': plain physical timestamps (a stamp is the physical reading and nothing else).
 * - 'ignoreMessage': an HLC whose receive ignores the wall reading the message carries.
 * - 'backwards': an HLC that takes the physical reading even when it is behind l, so it follows a clock that steps back.
 * Safety is four rules asserted after every event; each node raises a flag the first time it breaks one.
 */
import { createCluster, type Cluster, type DistNode, type Safety } from '../../core/distSim';
import { mulberry32 } from '../../core/random';
import { compareHlc, hlcReceive, hlcSend, lamportReceive, lamportSend, ZERO, type Hlc } from './hlc';

export type Mode = 'hlc' | 'physical' | 'ignoreMessage' | 'backwards';
export const MODES: { value: Mode; label: string }[] = [
  { value: 'hlc', label: 'Hybrid logical clock' },
  { value: 'physical', label: 'Plain physical timestamps' },
  { value: 'ignoreMessage', label: 'HLC that ignores the message wall' },
  { value: 'backwards', label: 'HLC that follows a clock stepping back' },
];

export const NODE_IDS = ['A', 'B', 'C'] as const;
export const EPSILON_MS = { min: 0, max: 50, default: 20 } as const;
export const FAR_AHEAD_MS = { min: 0, max: 10_000 } as const;
export const LATENCY_MS = { min: 1, max: 10 } as const;
export const RUN_UNTIL_MS = 200;
/** Physical readings start here, so a node whose clock is behind still reads a positive time. */
export const EPOCH_MS = 1000;
/** Local events tick this often, ms. */
export const TICK_MS = { min: 30, max: 70 } as const;
/** Three messages are sent, 30 ms apart, from a random node to a random other one. */
export const MESSAGES = { count: 3, first: 20, spacing: 30, jitter: 5 } as const;
/** The share of seeds in which one clock steps back (when steps are on). */
const STEP_SHARE = 0.35;
/** A clock step back: the size of the jump, ms. */
export const STEP_BACK_MS = 30;
export const SEED_RANGE = { from: 1, to: 201 } as const;
export const SEEDS_TOTAL = SEED_RANGE.to - SEED_RANGE.from;

export interface SeedOptions {
  mode: Mode;
  /** Clock offsets are drawn uniformly within plus or minus this many ms. */
  epsilon: number;
  /** One clock (C) is this far ahead of the rest: the assumption broken on purpose. */
  farAheadMs: number;
  /** Clocks may step back by STEP_BACK_MS once (an NTP step). The 'backwards' mode always has steps. */
  clockSteps: boolean;
}

export const DEFAULT_OPTIONS: SeedOptions = { mode: 'hlc', epsilon: EPSILON_MS.default, farAheadMs: 0, clockSteps: false };

export interface LogEntry {
  node: string;
  /** True time of the event, ms. */
  t: number;
  /** The node's physical clock reading, ms. */
  pt: number;
  stamp: Hlc;
  lamport: number;
  kind: 'send' | 'receive' | 'local';
}

export interface Flags {
  /** A receive was stamped no later than its send. */
  receive: string | null;
  /** The node's stamps stopped strictly increasing. */
  increasing: string | null;
  /** l fell below the physical clock at the event. */
  belowClock: string | null;
  /** l - pt left the bound while every clock was within epsilon. */
  bound: string | null;
}

export interface NodeView {
  log: LogEntry[];
  flags: Flags;
}

/** The messages a seed plans: when, from which node, to which. */
export function plan(seed: number): { at: number; from: number; to: number }[] {
  const rnd = mulberry32(seed * 977 + 41);
  return Array.from({ length: MESSAGES.count }, (_, k) => {
    const from = Math.floor(rnd() * NODE_IDS.length);
    const to = (from + 1 + Math.floor(rnd() * (NODE_IDS.length - 1))) % NODE_IDS.length;
    return { at: MESSAGES.first + MESSAGES.spacing * k + Math.floor(rnd() * MESSAGES.jitter), from, to };
  });
}

export interface Payload {
  stamp: Hlc;
  lamport: number;
}

/** The offsets a seed draws within the bound (before any far-ahead clock), one per node. */
export function drawnOffsets(seed: number, epsilon: number): number[] {
  const rnd = mulberry32(seed * 7 + 3);
  return NODE_IDS.map(() => Math.round((rnd() * 2 - 1) * epsilon * 10) / 10);
}

/** The largest pairwise difference between the drawn offsets: the bound on l - pt, computed from this run's clocks. */
export function epsilonMax(offsets: readonly number[]): number {
  return Math.max(...offsets) - Math.min(...offsets);
}

function stamped(mode: Mode, h: Hlc, pt: number, received: Hlc | null): Hlc {
  if (mode === 'physical') return { l: pt, c: 0 };
  if (mode === 'backwards') {
    if (received === null) return { l: pt, c: pt === h.l ? h.c + 1 : 0 };
    const l = Math.max(received.l, pt);
    if (l === received.l && l === h.l) return { l, c: Math.max(received.c, h.c) + 1 };
    if (l === received.l) return { l, c: received.c + 1 };
    if (l === h.l) return { l, c: h.c + 1 };
    return { l, c: 0 };
  }
  if (received === null || mode === 'ignoreMessage') return hlcSend(h, pt).h;
  return hlcReceive(h, received, pt).h;
}

function buildNodes(seed: number, o: SeedOptions): Record<string, DistNode<Payload, NodeView>> {
  const offsets = drawnOffsets(seed, o.epsilon);
  const bound = epsilonMax(offsets);
  const assumptionHolds = o.farAheadMs === 0 && !o.clockSteps && o.mode !== 'backwards';
  const steps = o.clockSteps || o.mode === 'backwards';
  const stepRnd = mulberry32(seed * 13 + 9);
  const stepper = Math.floor(stepRnd() * NODE_IDS.length);
  const stepAt = NODE_IDS.map(() => 20 + Math.floor(stepRnd() * 80));
  const stepsBack = NODE_IDS.map((_, i) => i === stepper && stepRnd() < STEP_SHARE);
  const planned = plan(seed);
  const nodes: Record<string, DistNode<Payload, NodeView>> = {};
  NODE_IDS.forEach((id, i) => {
    let h: Hlc = ZERO;
    let L = 0;
    const log: LogEntry[] = [];
    const flags: Flags = { receive: null, increasing: null, belowClock: null, bound: null };
    const rnd = mulberry32(seed * 131 + i);
    const reading = (local: number, trueT: number) => EPOCH_MS + (steps && stepsBack[i] && trueT >= stepAt[i] ? local - STEP_BACK_MS : local);
    const record = (t: number, pt: number, kind: LogEntry['kind'], next: Hlc, received: Payload | null) => {
      const previous = log.at(-1);
      if (previous && compareHlc(next, previous.stamp) <= 0) flags.increasing = flags.increasing ?? `${id}'s stamp did not increase`;
      if (received && compareHlc(next, received.stamp) <= 0) flags.receive = flags.receive ?? 'receive stamped before its send';
      if (o.mode !== 'physical' && next.l < pt) flags.belowClock = flags.belowClock ?? `${id}'s l fell below its physical clock`;
      if (assumptionHolds && o.mode !== 'physical' && next.l - pt > bound + 1e-9) flags.bound = flags.bound ?? `l - pt left the bound ${bound}`;
      log.push({ node: id, t, pt, stamp: next, lamport: L, kind });
      h = next;
    };
    nodes[id] = {
      init: (ctx) => {
        ctx.setTimer('tick', TICK_MS.min + rnd() * (TICK_MS.max - TICK_MS.min));
        planned.forEach((p, k) => {
          if (p.from === i) ctx.setTimer(`m${k}`, p.at);
        });
      },
      onTimer: (ctx, timer) => {
        if (ctx.trueNow >= RUN_UNTIL_MS + MESSAGES.first) return;
        const pt = reading(ctx.now(), ctx.trueNow);
        const next = stamped(o.mode, h, pt, null);
        L = lamportSend(L);
        if (timer !== 'tick') {
          const p = planned[Number(timer.slice(1))];
          record(ctx.trueNow, pt, 'send', next, null);
          ctx.send(NODE_IDS[p.to], { stamp: next, lamport: L });
          return;
        }
        record(ctx.trueNow, pt, 'local', next, null);
        if (ctx.trueNow < RUN_UNTIL_MS) ctx.setTimer('tick', TICK_MS.min + rnd() * (TICK_MS.max - TICK_MS.min));
      },
      onMessage: (ctx, msg) => {
        const pt = reading(ctx.now(), ctx.trueNow);
        L = lamportReceive(L, msg.payload.lamport);
        record(ctx.trueNow, pt, 'receive', stamped(o.mode, h, pt, msg.payload.stamp), msg.payload);
      },
      snapshot: () => ({ log: [...log], flags: { ...flags } }),
    };
  });
  return nodes;
}

export function hlcScenario(options: SeedOptions) {
  return (seed: number): Cluster<Payload, NodeView> => {
    const offsets = drawnOffsets(seed, options.epsilon).map((offset, i) => (i === NODE_IDS.length - 1 ? offset + options.farAheadMs : offset));
    return createCluster<Payload, NodeView>({ seed, nodes: buildNodes(seed, options), latency: LATENCY_MS, clocks: offsets.map((offsetMs) => ({ offsetMs })) });
  };
}

const flag = (pick: (f: Flags) => string | null): Safety<NodeView> => (snap) => {
  for (const id of NODE_IDS) {
    const m = pick(snap.nodes[id].state!.flags);
    if (m !== null) return m;
  }
  return null;
};
/** The four safety rules in order: receive after send (0), strictly increasing (1), l at least the clock (2), l - pt inside the bound (3). */
export const RULES: readonly Safety<NodeView>[] = [flag((f) => f.receive), flag((f) => f.increasing), flag((f) => f.belowClock), flag((f) => f.bound)];

export interface SeedRun {
  logs: LogEntry[];
  /** The first rule broken, its index and message, or null. */
  violation: { rule: number; message: string } | null;
  /** The bound drawn for this seed. */
  bound: number;
  offsets: number[];
  /** The largest l - pt over the run, ms. */
  maxLead: number;
}

export function runHlcSeed(options: SeedOptions, seed: number): SeedRun {
  const cluster = hlcScenario(options)(seed);
  cluster.run();
  const snap = cluster.snapshot();
  const logs = NODE_IDS.flatMap((id) => snap.nodes[id].state!.log).sort((a, b) => a.t - b.t);
  let violation: SeedRun['violation'] = null;
  RULES.forEach((rule, k) => {
    const message = rule(snap);
    if (violation === null && message !== null) violation = { rule: k, message };
  });
  const offsets = drawnOffsets(seed, options.epsilon);
  return { logs, violation, bound: epsilonMax(offsets), offsets, maxLead: logs.reduce((m, e) => (options.mode === 'physical' ? m : Math.max(m, e.stamp.l - e.pt)), 0) };
}

/** What each rule index means, for the screen. */
export const RULES_TEXT = ['receive stamped after its send', 'stamps strictly increasing', 'l at least the physical clock', 'l - pt inside the bound'] as const;

/** The lowest failing seeds from 1 at the default options (pinned in hlc.test.ts against forSeeds): plain physical and the message-ignoring HLC fail rule 0 first at seed 1, the backwards HLC fails rule 1 at seed 5. */
export const BROKEN_SEED = 1;
export const BROKEN_SEED_BACKWARDS = 5;
export const seedFor = (mode: Mode): number => (mode === 'backwards' ? BROKEN_SEED_BACKWARDS : mode === 'hlc' ? SEED_RANGE.from : BROKEN_SEED);

export interface Sweep {
  failing: number[];
  lowestFailing: number | null;
  rule: number | null;
  message: string | null;
  /** Largest l - pt seen over every seed, ms. */
  maxLead: number;
}

const sweepCache = new Map<string, Sweep>();
/** `sweepSeeds` remembered per option set, so dragging a slider back over a value is instant. */
export function cachedSweep(options: SeedOptions): Sweep {
  const key = JSON.stringify(options);
  const hit = sweepCache.get(key);
  if (hit) return hit;
  const fresh = sweepSeeds(options);
  sweepCache.set(key, fresh);
  return fresh;
}

export function sweepSeeds(options: SeedOptions): Sweep {
  const failing: number[] = [];
  let rule: number | null = null;
  let message: string | null = null;
  let maxLead = 0;
  for (let seed = SEED_RANGE.from; seed < SEED_RANGE.to; seed++) {
    const run = runHlcSeed(options, seed);
    maxLead = Math.max(maxLead, run.maxLead);
    if (run.violation) {
      failing.push(seed);
      rule = rule ?? run.violation.rule;
      message = message ?? run.violation.message;
    }
  }
  return { failing, lowestFailing: failing[0] ?? null, rule, message, maxLead };
}
