/**
 * physical-clocks-skew, scene 2: the effect before the cause. Node `a` sends a request, `b` handles it and replies, `a` gets the
 * reply; each writes a log line stamped with its OWN clock. Merge the logs by stamp and, when b's clock is behind, the
 * handling line sorts before the request that caused it.
 */
import { createCluster, type Cluster, type DistNode, type Safety } from '../../core/distSim';
import { mulberry32 } from '../../core/random';
import type { ClockSpec } from './clocks';

export type LogMsg = { type: 'request' } | { type: 'reply' };
export interface LogLine {
  node: string;
  text: string;
  /** The writer's own clock reading, ms. */
  stamp: number;
  /** True ms (for checking, never for sorting). */
  trueAt: number;
}
export interface LogState {
  lines: LogLine[];
}
export type LogCluster = Cluster<LogMsg, LogState>;

export const REQUESTER = 'a';
export const REPLIER = 'b';
/** The request is sent at this true time, ms. */
export const REQUEST_AT = 1000;
export const LOG_LATENCY = { min: 1, max: 15 } as const;
export const SKEW_B_MAX = 3000;
/** The lowest seed on which b's skew puts an effect before its cause in the merged log (a test searches for it). */
export const LOG_BROKEN_SEED = 0;

/** The causal chain of the three lines, in order of cause. */
export const CAUSAL_CHAIN = ['request sent', 'request handled', 'reply received'] as const;

function logNode(): DistNode<LogMsg, LogState> {
  const lines: LogLine[] = [];
  const write = (ctx: { id: string; now: () => number; trueNow: number }, text: string) => lines.push({ node: ctx.id, text, stamp: ctx.now(), trueAt: ctx.trueNow });
  return {
    init: (ctx) => {
      if (ctx.id === REQUESTER) ctx.setTimer('go', REQUEST_AT);
    },
    onTimer: (ctx) => {
      write(ctx, CAUSAL_CHAIN[0]);
      ctx.send(REPLIER, { type: 'request' });
    },
    onMessage: (ctx, msg) => {
      if (msg.payload.type === 'request') {
        write(ctx, CAUSAL_CHAIN[1]);
        ctx.send(REQUESTER, { type: 'reply' });
      } else write(ctx, CAUSAL_CHAIN[2]);
    },
    snapshot: () => ({ lines: [...lines] }),
  };
}

export interface LogSetup {
  seed: number;
  clockB: ClockSpec;
  fixedLatencyMs?: number;
}

export function logCluster(s: LogSetup): LogCluster {
  return createCluster<LogMsg, LogState>({
    seed: s.seed,
    nodes: { [REQUESTER]: logNode(), [REPLIER]: logNode() },
    latency: (rnd) => s.fixedLatencyMs ?? Math.round(LOG_LATENCY.min + rnd() * (LOG_LATENCY.max - LOG_LATENCY.min)),
    clocks: [{}, s.clockB],
  });
}

/** Both nodes' lines merged by stamp (ties: the requester first), which is what a log aggregator does. */
export function mergedByStamp(lines: readonly LogLine[]): LogLine[] {
  return [...lines].sort((x, y) => x.stamp - y.stamp || (x.node === REQUESTER ? -1 : 1));
}

const allLines = (nodes: Record<string, { state?: LogState }>): LogLine[] => Object.values(nodes).flatMap((n) => n.state?.lines ?? []);

/** Safety: whenever a line and the line that caused it both exist, the cause has the smaller stamp (so a merge keeps cause before effect). */
export const causeBeforeEffect: Safety<LogState> = (snap) => {
  const lines = allLines(snap.nodes);
  for (let i = 1; i < CAUSAL_CHAIN.length; i++) {
    const cause = lines.find((l) => l.text === CAUSAL_CHAIN[i - 1]);
    const effect = lines.find((l) => l.text === CAUSAL_CHAIN[i]);
    if (cause && effect && effect.stamp <= cause.stamp) return `"${effect.text}" is stamped ${effect.stamp} ms, not after "${cause.text}" at ${cause.stamp} ms`;
  }
  return null;
};

/** A seeded scenario for `forSeeds`: b's clock offset is drawn from the seed, within SKEW_B_MAX ms either way. */
export const logScenario = (seed: number): LogCluster => logCluster({ seed, clockB: { offsetMs: (mulberry32(seed ^ 0x85ebca6b)() * 2 - 1) * SKEW_B_MAX, driftPpm: 0 } });

export function runLog(s: LogSetup): { lines: LogLine[]; merged: LogLine[] } {
  const c = logCluster(s);
  c.run();
  const lines = allLines(c.snapshot().nodes);
  return { lines, merged: mergedByStamp(lines) };
}
