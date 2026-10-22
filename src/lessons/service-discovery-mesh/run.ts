/** Reading a registry run: the numbers the scenes show, counted from the trace and the registry's log. */
import type { Cluster } from '../../core/distSim';
import { HORIZON_MS, READY_AGAIN_MS, SERVICES, UNREADY_AT_MS, VICTIM, buildCluster, instanceIds, type Msg, type NodeState, type RegistryConfig, type RegistryLog } from './registry';

export interface RegistryRun {
  config: RegistryConfig;
  cluster: Cluster<Msg, NodeState>;
  log: RegistryLog;
  /** Requests sent on to an instance (by the client, or by the load balancer). */
  requests: number;
  /** Requests that had no endpoint to go to, in all. */
  noEndpoint: number;
  /** Requests sent to VICTIM after it crashed. */
  sentToDead: number;
  /** How long after the crash the last request still went to VICTIM, or null if none did. */
  stopAfterMs: number | null;
  /** How long after the crash the registry evicted VICTIM, or null if it did not. */
  evictedAfterMs: number | null;
  /** Evictions of an instance that was running at the time. */
  falseEvictions: number;
  /** Error answers (an instance that is not ready says no). */
  errors: number;
  /** Requests sent to VICTIM while it was not ready, and how long after it went not ready the last one was. */
  sentWhileUnready: number;
  unreadyStopAfterMs: number | null;
}

const senderOf = (c: RegistryConfig): string => (c.cacheOwner === 'lb' ? 'lb' : 'client');

export function runRegistry(c: RegistryConfig, until = HORIZON_MS): RegistryRun {
  const { cluster, log } = buildCluster(c);
  cluster.run({ until });
  const ids = new Set(instanceIds(c.counts));
  const sends = cluster.trace.filter((r) => r.kind === 'send' && r.from === senderOf(c) && r.to !== undefined && ids.has(r.to) && r.payload?.type === 'req');
  const hasVictim = c.crash && ids.has(VICTIM);
  const toDead = hasVictim ? sends.filter((r) => r.to === VICTIM && r.t >= c.crashAtMs) : [];
  const evictedVictim = hasVictim ? log.evictions.find((e) => e.id === VICTIM && e.t >= c.crashAtMs) : undefined;
  const wasRunning = (e: { t: number; id: string }) => !(hasVictim && e.id === VICTIM && e.t >= c.crashAtMs);
  const unreadyWindow = c.unready ? sends.filter((r) => r.to === VICTIM && r.t >= UNREADY_AT_MS && r.t < READY_AGAIN_MS) : [];
  const nodes = cluster.snapshot().nodes;
  return {
    config: c,
    cluster,
    log,
    requests: sends.length,
    noEndpoint: Object.values(nodes).reduce((a, n) => a + (n.state?.noEndpoint ?? 0), 0),
    sentToDead: toDead.length,
    stopAfterMs: toDead.length ? toDead[toDead.length - 1].t - c.crashAtMs : null,
    evictedAfterMs: evictedVictim ? evictedVictim.t - c.crashAtMs : null,
    falseEvictions: log.evictions.filter(wasRunning).length,
    errors: cluster.trace.filter((r) => r.kind === 'send' && r.payload?.type === 'resp' && r.payload.ok === false).length,
    sentWhileUnready: unreadyWindow.length,
    unreadyStopAfterMs: unreadyWindow.length ? unreadyWindow[unreadyWindow.length - 1].t - UNREADY_AT_MS : null,
  };
}

/** The services that have no instance at all: a request to one of them fails visibly. */
export const emptyServices = (c: RegistryConfig) => SERVICES.filter((s) => c.counts[s] === 0);
