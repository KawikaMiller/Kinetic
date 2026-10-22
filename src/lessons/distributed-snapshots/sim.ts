/**
 * distributed-snapshots, the seeded leg: three processes with random transfers on `core/distSim`, the snapshot taken
 * either by the marker algorithm or naively (everyone records at a chosen time), and two INDEPENDENT checks of the
 * result: conservation of tokens, and closure of the cut under happens-before computed from vector clocks over the trace.
 */
import { createCluster, type Cluster, type DistNode, type Message, type TraceRow } from '../../core/distSim';
import { mulberry32 } from '../../core/random';
import { complete, initProc, onMarker, onToken, recordSelf, recordedTotals, withdraw, TOKENS_EACH, TOTAL_TOKENS, type Proc } from './snapshot';

export const NAMES = ['A', 'B', 'C'] as const;
export type Name = (typeof NAMES)[number];
export type Method = 'naive' | 'markers';
export type Rate = 'calm' | 'busy' | 'veryBusy';
export const RATES: Record<Rate, { min: number; max: number; label: string }> = {
  calm: { min: 20, max: 40, label: 'calm (every 20 to 40 ms)' },
  busy: { min: 5, max: 15, label: 'busy (every 5 to 15 ms)' },
  veryBusy: { min: 2, max: 6, label: 'very busy (every 2 to 6 ms)' },
};
export const LATENCY_MS = { min: 1, max: 10 } as const;
export const TRANSFER_TOKENS = { min: 1, max: 10 } as const;
/** Transfers stop here so the channels can drain and every run ends. */
export const SEND_UNTIL_MS = 250;
export const TIME_MS = { min: 0, max: 200 } as const;
/** The bug of scene 3: C discards this share of the transfers it receives. */
export const DROP_SHARE = 0.05;
export const SEED_RANGE = { from: 1, to: 201 } as const;
export const SEEDS_TOTAL = SEED_RANGE.to - SEED_RANGE.from;

export type SnapMsg = { type: 'token'; amount: number } | { type: 'marker' };

export interface SimOptions {
  method: Method;
  /** Marker method: who starts and when. */
  initiator: Name;
  startMs: number;
  /** Naive method: each process records its balance at its own time. */
  recordMs: readonly [number, number, number];
  rate: Rate;
  fifo: boolean;
  /** C silently drops DROP_SHARE of the transfers it receives. */
  bug: boolean;
}

export const DEFAULT_OPTIONS: SimOptions = { method: 'markers', initiator: 'A', startMs: 100, recordMs: [100, 80, 120], rate: 'busy', fifo: true, bug: false };

export interface NodeView {
  proc: Proc;
  /** Events this process had performed when it recorded (the size of its part of the cut), or null. */
  cut: number | null;
  /** Events so far. */
  events: number;
  /** Transfers C dropped: the event index of the receive and the amount. */
  drops: { at: number; amount: number }[];
}

function buildNodes(seed: number, o: SimOptions): Record<string, DistNode<SnapMsg, NodeView>> {
  const nodes: Record<string, DistNode<SnapMsg, NodeView>> = {};
  NAMES.forEach((name, i) => {
    let proc = initProc(name, NAMES, TOKENS_EACH);
    let cut: number | null = null;
    let events = 0;
    const drops: { at: number; amount: number }[] = [];
    const rnd = mulberry32(seed * 1009 + i * 17 + 5);
    const rate = RATES[o.rate];
    const peers = NAMES.filter((p) => p !== name);
    const beginRecording = (ctx: { send: (to: string, p: SnapMsg) => void }, closed: readonly string[] = []) => {
      cut = events;
      proc = recordSelf(proc, closed);
      for (const to of peers) {
        ctx.send(to, { type: 'marker' });
        events++;
      }
    };
    nodes[name] = {
      init: (ctx) => {
        ctx.setTimer('xfer', rate.min + rnd() * (rate.max - rate.min));
        if (o.method === 'markers' && name === o.initiator) ctx.setTimer('record', o.startMs);
        if (o.method === 'naive') ctx.setTimer('record', o.recordMs[i]);
      },
      onTimer: (ctx, timer) => {
        if (timer === 'record') {
          if (proc.recorded !== null) return;
          if (o.method === 'markers') beginRecording(ctx);
          else {
            cut = events;
            proc = { ...proc, recorded: proc.tokens };
          }
          return;
        }
        if (ctx.now() >= SEND_UNTIL_MS) return;
        if (proc.tokens >= TRANSFER_TOKENS.min) {
          const amount = TRANSFER_TOKENS.min + Math.floor(rnd() * (Math.min(TRANSFER_TOKENS.max, proc.tokens) - TRANSFER_TOKENS.min + 1));
          const to = peers[Math.floor(rnd() * peers.length)];
          proc = withdraw(proc, amount);
          ctx.send(to, { type: 'token', amount });
          events++;
        }
        ctx.setTimer('xfer', rate.min + rnd() * (rate.max - rate.min));
      },
      onMessage: (ctx, msg: Message<SnapMsg>) => {
        if (msg.payload.type === 'token') {
          events++;
          proc = onToken(proc, msg.from, msg.payload.amount);
          if (o.bug && name === 'C' && rnd() < DROP_SHARE) {
            proc = { ...proc, tokens: proc.tokens - msg.payload.amount };
            drops.push({ at: events, amount: msg.payload.amount });
          }
          return;
        }
        const first = proc.recorded === null;
        if (first) {
          beginRecording(ctx, [msg.from]);
          events++;
          return;
        }
        events++;
        proc = onMarker(proc, msg.from).state;
      },
      snapshot: () => ({ proc, cut, events, drops: [...drops] }),
    };
  });
  return nodes;
}

export function snapshotScenario(options: SimOptions) {
  return (seed: number): Cluster<SnapMsg, NodeView> =>
    createCluster<SnapMsg, NodeView>({ seed, nodes: buildNodes(seed, options), latency: LATENCY_MS, fifo: options.fifo });
}

export const viewsOf = (cluster: Cluster<SnapMsg, NodeView>): NodeView[] => NAMES.map((n) => cluster.snapshot().nodes[n].state as NodeView);

// ---------- the checks ----------

export interface Offence {
  from: string;
  to: string;
  amount: number | null;
  kind: 'token' | 'marker';
  /** Event index (1-based) of the receive in the receiver's history, and of the send in the sender's. */
  receiveAt: number;
  sendAt: number;
}

export interface Closure {
  closed: boolean;
  /** The first message received inside the cut whose send is outside it. */
  offence: Offence | null;
}

/** Closure of a cut under happens-before, from vector clocks over the trace alone: it never reads what any process recorded. */
export function closureOf(trace: readonly TraceRow<SnapMsg>[], cut: readonly number[]): Closure {
  const index = (name: string) => NAMES.indexOf(name as Name);
  const clocks = NAMES.map(() => NAMES.map(() => 0));
  const count = NAMES.map(() => 0);
  const sent = new Map<number, { clock: number[]; at: number; from: string; payload: SnapMsg }>();
  const events: { p: number; k: number; clock: number[]; offence: Offence | null }[] = [];
  for (const row of trace) {
    if (row.kind === 'send' && row.from !== undefined && row.msgId !== undefined) {
      const p = index(row.from);
      clocks[p][p]++;
      count[p]++;
      sent.set(row.msgId, { clock: [...clocks[p]], at: count[p], from: row.from, payload: row.payload as SnapMsg });
      events.push({ p, k: count[p], clock: [...clocks[p]], offence: null });
    } else if (row.kind === 'deliver' && row.to !== undefined && row.msgId !== undefined) {
      const p = index(row.to);
      const msg = sent.get(row.msgId);
      if (!msg) continue;
      clocks[p] = clocks[p].map((v, q) => Math.max(v, msg.clock[q]));
      clocks[p][p]++;
      count[p]++;
      const payload = msg.payload;
      const offence: Offence = { from: msg.from, to: row.to, amount: payload.type === 'token' ? payload.amount : null, kind: payload.type, receiveAt: count[p], sendAt: msg.at };
      events.push({ p, k: count[p], clock: [...clocks[p]], offence });
    }
  }
  let first: Offence | null = null;
  for (const e of events) {
    if (e.k > cut[e.p]) continue;
    if (e.clock.some((v, q) => v > cut[q])) {
      first = first ?? e.offence;
      if (!first) first = { from: NAMES[e.p], to: NAMES[e.p], amount: null, kind: 'token', receiveAt: e.k, sendAt: 0 };
    }
  }
  return { closed: first === null, offence: first };
}

export interface ChannelAudit {
  from: string;
  to: string;
  /** Tokens that were in flight on the channel at the cut, counted from the trace alone. */
  inFlight: number;
  /** What the receiver recorded as that channel's contents. */
  recorded: number;
}

/** For each channel, the tokens in flight at the cut (sent inside the sender's part, received outside the receiver's) against what was recorded. */
export function auditChannels(trace: readonly TraceRow<SnapMsg>[], cut: readonly number[], views: readonly NodeView[]): ChannelAudit[] {
  const count = NAMES.map(() => 0);
  const sent = new Map<number, { from: number; at: number; amount: number | null }>();
  const flight = new Map<string, number>();
  for (const row of trace) {
    if (row.kind === 'send' && row.from !== undefined && row.msgId !== undefined) {
      const p = NAMES.indexOf(row.from as Name);
      count[p]++;
      const payload = row.payload as SnapMsg;
      sent.set(row.msgId, { from: p, at: count[p], amount: payload.type === 'token' ? payload.amount : null });
    } else if (row.kind === 'deliver' && row.to !== undefined && row.msgId !== undefined) {
      const p = NAMES.indexOf(row.to as Name);
      count[p]++;
      const m = sent.get(row.msgId);
      if (m && m.amount !== null && m.at <= cut[m.from] && count[p] > cut[p]) {
        const key = `${m.from}>${p}`;
        flight.set(key, (flight.get(key) ?? 0) + m.amount);
      }
    }
  }
  return NAMES.flatMap((from, f) => NAMES.map((to, t) => ({ from, to, inFlight: flight.get(`${f}>${t}`) ?? 0, recorded: views[t].proc.channels[from]?.sum ?? 0 })).filter((c) => c.from !== c.to));
}

export interface Result {
  /** The snapshot finished: every process recorded (and, for markers, every channel closed). */
  finished: boolean;
  states: number;
  channels: number;
  total: number;
  /** Total minus 300: negative is a shortfall, positive a double count. */
  difference: number;
  conservation: boolean;
  closure: Closure;
  /** Tokens C dropped inside the cut (the real losses a correct snapshot must show). */
  lostInCut: number;
  /** Marker method: the channels whose recorded contents differ from what was in flight at the cut. */
  mismatched: ChannelAudit[];
}

export function resultOf(views: readonly NodeView[], trace: readonly TraceRow<SnapMsg>[], method: Method): Result {
  const procs = views.map((v) => v.proc);
  const finished = method === 'markers' ? complete(procs) : procs.every((p) => p.recorded !== null);
  const totals = recordedTotals(procs);
  const total = method === 'markers' ? totals.total : totals.states;
  const cut = views.map((v) => v.cut ?? v.events);
  const cView = views[NAMES.indexOf('C')];
  return {
    finished,
    states: totals.states,
    channels: method === 'markers' ? totals.channels : 0,
    total,
    difference: total - TOTAL_TOKENS,
    conservation: total === TOTAL_TOKENS,
    closure: closureOf(trace, cut),
    lostInCut: cView.drops.filter((d) => cView.cut !== null && d.at <= cView.cut).reduce((s, d) => s + d.amount, 0),
    mismatched: method === 'markers' && finished ? auditChannels(trace, cut, views).filter((c) => c.inFlight !== c.recorded) : [],
  };
}

/** Run a seed to the end. */
export function runSeed(options: SimOptions, seed: number): { views: NodeView[]; result: Result; trace: readonly TraceRow<SnapMsg>[]; time: number } {
  const cluster = snapshotScenario(options)(seed);
  cluster.run();
  const views = viewsOf(cluster);
  return { views, result: resultOf(views, cluster.trace, options.method), trace: cluster.trace, time: cluster.time };
}

export interface Sweep {
  /** Seeds that broke conservation (rule 0) or closure (rule 1). */
  rule0: number[];
  rule1: number[];
  failing: number[];
  shortfalls: number;
  doubleCounts: number;
  lowestFailing: number | null;
  lowestRule0: number | null;
  lowestRule1: number | null;
}

export function sweepSeeds(options: SimOptions): Sweep {
  const rule0: number[] = [];
  const rule1: number[] = [];
  const failing: number[] = [];
  let shortfalls = 0;
  let doubleCounts = 0;
  for (let seed = SEED_RANGE.from; seed < SEED_RANGE.to; seed++) {
    const { result } = runSeed(options, seed);
    if (!result.conservation) {
      rule0.push(seed);
      if (result.difference < 0) shortfalls++;
      else doubleCounts++;
    }
    if (!result.closure.closed) rule1.push(seed);
    if (!result.conservation || !result.closure.closed) failing.push(seed);
  }
  return { rule0, rule1, failing, shortfalls, doubleCounts, lowestFailing: failing[0] ?? null, lowestRule0: rule0[0] ?? null, lowestRule1: rule1[0] ?? null };
}
