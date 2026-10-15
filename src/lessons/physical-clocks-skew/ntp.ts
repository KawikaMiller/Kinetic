/**
 * physical-clocks-skew: NTP's four-timestamp exchange run on the distSim harness, so the timestamps are what real messages
 * carried (each stamped with its node's own, possibly skewed, clock) and the path delays can differ in each direction.
 */
import { createCluster, type Cluster, type DistNode } from '../../core/distSim';
import { ntpEstimate, type ClockSpec, type NtpSample } from './clocks';

export type NtpMsg = { type: 'request'; t0: number } | { type: 'reply'; t0: number; t1: number; t2: number };

export interface NtpState {
  /** The correction the client has applied to its own clock so far, ms. */
  adjust: number;
  /** Every exchange the client completed: its four timestamps and the estimate. */
  exchanges: Exchange[];
}

export interface Exchange extends NtpSample {
  t0: number;
  t1: number;
  t2: number;
  t3: number;
  /** True time the reply arrived, ms. */
  arrivedAt: number;
}

export const CLIENT = 'client';
export const SERVER = 'server';

export interface NtpSetup {
  seed?: number;
  clock: ClockSpec;
  forwardMs: number;
  returnMs: number;
  /** Poll every this many ms of the client's own time; omit for a single exchange at once. */
  pollMs?: number;
  /** Step the clock by each estimate (default: measure only). */
  step?: boolean;
}

function serverNode(): DistNode<NtpMsg, NtpState> {
  return {
    init: () => {},
    onTimer: () => {},
    onMessage: (ctx, msg) => {
      if (msg.payload.type !== 'request') return;
      const t1 = ctx.now();
      ctx.send(msg.from, { type: 'reply', t0: msg.payload.t0, t1, t2: ctx.now() });
    },
  };
}

function clientNode(setup: NtpSetup): DistNode<NtpMsg, NtpState> {
  const state: NtpState = { adjust: 0, exchanges: [] };
  const ask = (ctx: Parameters<DistNode<NtpMsg, NtpState>['init']>[0]) => ctx.send(SERVER, { type: 'request', t0: ctx.now() + state.adjust });
  return {
    init: (ctx) => {
      if (setup.pollMs === undefined) ask(ctx);
      else ctx.setTimer('poll', setup.pollMs);
    },
    onTimer: (ctx) => {
      ask(ctx);
      ctx.setTimer('poll', setup.pollMs!);
    },
    onMessage: (ctx, msg) => {
      if (msg.payload.type !== 'reply') return;
      const { t0, t1, t2 } = msg.payload;
      const t3 = ctx.now() + state.adjust;
      const sample = ntpEstimate(t0, t1, t2, t3);
      state.exchanges.push({ t0, t1, t2, t3, ...sample, arrivedAt: ctx.trueNow });
      if (setup.step) state.adjust += sample.theta;
    },
    snapshot: () => ({ adjust: state.adjust, exchanges: [...state.exchanges] }),
  };
}

/** A client with `clock` talking to a perfect server over a path with the given one-way delays. */
export function ntpCluster(setup: NtpSetup): Cluster<NtpMsg, NtpState> {
  return createCluster<NtpMsg, NtpState>({
    seed: setup.seed ?? 0,
    nodes: { [CLIENT]: clientNode(setup), [SERVER]: serverNode() },
    latency: (_rnd, from) => (from === CLIENT ? setup.forwardMs : setup.returnMs),
    clocks: [setup.clock, {}],
  });
}

/** Run one exchange to completion and return it with the trace. */
export function runExchange(setup: Omit<NtpSetup, 'pollMs'>) {
  const cluster = ntpCluster(setup);
  cluster.run();
  const state = cluster.snapshot().nodes[CLIENT].state!;
  return { exchange: state.exchanges[0], trace: cluster.trace };
}
