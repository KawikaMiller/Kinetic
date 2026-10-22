/**
 * A service registry on core/distSim: instances register and heartbeat, the registry evicts any
 * instance it has not heard from within its TTL, and a client (or a load balancer in front of it)
 * keeps a cached copy of the listing and routes requests round-robin over it. Faults are the
 * cluster's: message loss, and an instance that stops without deregistering.
 *
 * Every time and probability here is a named constant and illustrative. The safety claim the tests
 * check at every step, over 200 seeds: no request is routed to an instance later than
 * `staleBound` after it stopped.
 */
import { createCluster, type Cluster, type DistNode, type NodeCtx, type Safety } from '../../core/distSim';
import { mulberry32 } from '../../core/random';

export const SERVICES = ['orders', 'payments', 'search'] as const;
export type Service = (typeof SERVICES)[number];

export const HEARTBEAT_MS = 2000;
export const LATENCY_MS = 10;
export const SWEEP_MS = 500;
export const REQUEST_MS = 100;
/** The first cache refresh waits for the instances to register. */
const FIRST_REFRESH_MS = 500;
/** Instances start this far apart, so their heartbeats are spread over the interval. */
const START_STAGGER_MS = 37;
/** One run lasts this long; the scripted crash and readiness change fall inside it. */
export const HORIZON_MS = 40_000;
export const CRASH_AT_MS = 10_000;
/** Not on the 10 s boundary: a request to the victim must fall between this and the cache's next refresh, so a cached listing visibly lags. */
export const UNREADY_AT_MS = 10_700;
export const READY_AGAIN_MS = 25_000;
/** The pinned lowest failing seed of the broken modes (a registry that never evicts; one that ignores readiness): checked over 200 seeds in the tests. */
export const BROKEN_SEED = 0;
export const INSTANCE_MAX = 12;
export const DEFAULT_COUNT = 3;
export const TTL_BEATS = { min: 1, max: 6, default: 3 } as const;
export const REFRESH_RANGE = { min: 500, max: 30_000, step: 500, default: 2000 } as const;
export const LOSS_RANGE = { min: 0, max: 0.5, step: 0.05 } as const;
/** The instance that crashes, or goes not ready, in the scripted run. */
export const VICTIM = 'orders-1';

export type CacheOwner = 'client' | 'lb';

export interface RegistryConfig {
  seed: number;
  counts: Record<Service, number>;
  /** TTL in heartbeat intervals. */
  ttlBeats: number;
  /** How often the cache is refreshed, ms. */
  refreshMs: number;
  /** A resolver that holds on to an answer this many times longer than its refresh interval (1 = it obeys). */
  stubbornFactor: number;
  /** Probability that a heartbeat is lost on its way to the registry (the lookups and requests travel on a reliable path). */
  loss: number;
  /** Probability a delivered message is delivered twice. */
  duplicate: number;
  /** How far each message's delay may stray from the usual wire time, ms either way. */
  jitterMs: number;
  cacheOwner: CacheOwner;
  /** The scripted crash of VICTIM (it stops without deregistering), at this time. */
  crashAtMs: number;
  crash: boolean;
  /** The scripted readiness change of VICTIM: not ready from UNREADY_AT_MS to READY_AGAIN_MS. */
  unready: boolean;
  /** The registry leaves not-ready instances out of a listing. */
  honourReadiness: boolean;
  /** The client looks the registry up on every request instead of using a cache. */
  freshLookups: boolean;
  /** The bug: the registry never evicts; only an explicit deregistration removes an instance. */
  neverEvict: boolean;
}

export const baseConfig = (seed = 0): RegistryConfig => ({
  seed,
  counts: { orders: DEFAULT_COUNT, payments: DEFAULT_COUNT, search: DEFAULT_COUNT },
  ttlBeats: TTL_BEATS.default,
  refreshMs: REFRESH_RANGE.default,
  stubbornFactor: 1,
  loss: 0,
  duplicate: 0,
  jitterMs: 0,
  cacheOwner: 'client',
  crashAtMs: CRASH_AT_MS,
  crash: true,
  unready: false,
  honourReadiness: true,
  freshLookups: false,
  neverEvict: false,
});

export type Msg =
  | { type: 'register'; id: string; ready: boolean }
  | { type: 'heartbeat'; id: string; ready: boolean }
  | { type: 'list' }
  | { type: 'listing'; ids: string[] }
  | { type: 'req'; to?: string }
  | { type: 'resp'; ok: boolean };

export interface NodeState {
  /** Instance: whether it is ready. */
  ready?: boolean;
  /** Registry: instances currently marked not ready. */
  notReady?: string[];
  /** Registry: marked-not-ready instances that the last listing still contained. */
  leak?: string[];
  /** Client or load balancer: the latest request it routed. */
  route?: { t: number; target: string };
  /** Client or load balancer: requests that had no endpoint to go to. */
  noEndpoint?: number;
}

export const instanceIds = (counts: Record<Service, number>): string[] => SERVICES.flatMap((s) => Array.from({ length: counts[s] }, (_, i) => `${s}-${i + 1}`));

export const ttlMs = (c: RegistryConfig): number => c.ttlBeats * HEARTBEAT_MS;

/** The cache refresh a client really has: a stubborn resolver stretches it. */
export const effectiveRefreshMs = (c: RegistryConfig): number => c.refreshMs * c.stubbornFactor;

/** How long after an instance stops that a request may still be routed to it: TTL, then the cache, then the registry's sweep and the wire. */
export const staleBound = (c: RegistryConfig): number => ttlMs(c) + effectiveRefreshMs(c) + SWEEP_MS + 2 * (LATENCY_MS + c.jitterMs);

/**
 * How often a heartbeat starts an eviction: it is received (1 - p) and the next k are all lost (p^k),
 * where k is the TTL in heartbeat intervals. (A run of k losses after a lost beat is part of the same silence.)
 */
export const evictionRate = (loss: number, ttlBeats: number): number => (1 - loss) * loss ** ttlBeats;

export interface RegistryLog {
  /** Every eviction the registry made: when, and which instance. */
  evictions: { t: number; id: string }[];
  /** Every heartbeat an instance sent, in order, and whether it was lost on the way. */
  beats: { id: string; t: number; lost: boolean }[];
}

export function buildCluster(c: RegistryConfig): { cluster: Cluster<Msg, NodeState>; log: RegistryLog } {
  const ids = instanceIds(c.counts);
  const log: RegistryLog = { evictions: [], beats: [] };
  const ttl = ttlMs(c);

  const registry = (): DistNode<Msg, NodeState> => {
    const entries = new Map<string, { lastSeen: number; ready: boolean }>();
    let leak: string[] = [];
    return {
      init: (ctx) => ctx.setTimer('sweep', SWEEP_MS),
      onMessage: (ctx, m) => {
        const p = m.payload;
        if (p.type === 'register' || p.type === 'heartbeat') entries.set(p.id, { lastSeen: ctx.now(), ready: p.ready });
        else if (p.type === 'list') {
          const marked = [...entries].filter(([, e]) => !e.ready).map(([id]) => id);
          const listed = [...entries].filter(([, e]) => e.ready || !c.honourReadiness).map(([id]) => id).sort();
          leak = listed.filter((id) => marked.includes(id));
          ctx.send(m.from, { type: 'listing', ids: listed });
        }
      },
      onTimer: (ctx) => {
        if (!c.neverEvict) {
          for (const [id, e] of entries) {
            if (ctx.now() - e.lastSeen > ttl) {
              entries.delete(id);
              log.evictions.push({ t: ctx.trueNow, id });
            }
          }
        }
        ctx.setTimer('sweep', SWEEP_MS);
      },
      snapshot: () => ({ notReady: [...entries].filter(([, e]) => !e.ready).map(([id]) => id), leak }),
    };
  };

  const instance = (id: string, index: number): DistNode<Msg, NodeState> => {
    let ready = true;
    const lossRnd = mulberry32(c.seed * 1009 + index + 1);
    const beat = (ctx: NodeCtx<Msg>) => {
      const lost = lossRnd() < c.loss;
      log.beats.push({ id, t: ctx.trueNow, lost });
      if (!lost) ctx.send('registry', { type: 'heartbeat', id, ready });
    };
    return {
      init: (ctx) => {
        ready = true;
        ctx.setTimer('start', index * START_STAGGER_MS);
        if (c.unready && id === VICTIM) {
          ctx.setTimer('unready', UNREADY_AT_MS);
          ctx.setTimer('ready', READY_AGAIN_MS);
        }
      },
      onTimer: (ctx, timerId) => {
        if (timerId === 'start') {
          ctx.send('registry', { type: 'register', id, ready });
          ctx.setTimer('beat', HEARTBEAT_MS);
        } else if (timerId === 'beat') {
          beat(ctx);
          ctx.setTimer('beat', HEARTBEAT_MS);
        } else {
          ready = timerId === 'ready';
          beat(ctx);
        }
      },
      onMessage: (ctx, m) => {
        if (m.payload.type === 'req') ctx.send(m.from, { type: 'resp', ok: ready });
      },
      snapshot: () => ({ ready }),
    };
  };

  /** The client, or the load balancer in front of it: the one that holds the cached listing and picks an instance. */
  const router = (role: 'client' | 'lb'): DistNode<Msg, NodeState> => {
    let cache: string[] = [];
    let turn = 0;
    const next: Partial<Record<Service, number>> = {};
    let lookingFor: Service = SERVICES[0];
    let route: NodeState['route'];
    let none = 0;
    const send = (ctx: { send: (to: string, p: Msg) => void; trueNow: number }, svc: Service, listing: string[]) => {
      const pool = listing.filter((id) => id.startsWith(`${svc}-`));
      if (pool.length === 0) {
        none++;
        return;
      }
      next[svc] = (next[svc] ?? 0) + 1;
      const target = pool[(next[svc] - 1) % pool.length];
      route = { t: ctx.trueNow, target };
      ctx.send(target, { type: 'req' });
    };
    const owner = role === c.cacheOwner;
    return {
      init: (ctx) => {
        if (owner && !c.freshLookups) ctx.setTimer('refresh', FIRST_REFRESH_MS);
        if (role === 'client') ctx.setTimer('request', REQUEST_MS);
      },
      onTimer: (ctx, timerId) => {
        if (timerId === 'refresh') {
          ctx.send('registry', { type: 'list' });
          ctx.setTimer('refresh', effectiveRefreshMs(c));
        } else if (role === 'client') {
          const svc = SERVICES[turn++ % SERVICES.length];
          if (c.cacheOwner === 'lb') ctx.send('lb', { type: 'req', to: svc });
          else if (c.freshLookups) {
            lookingFor = svc;
            ctx.send('registry', { type: 'list' });
          } else send(ctx, svc, cache);
          ctx.setTimer('request', REQUEST_MS);
        }
      },
      onMessage: (ctx, m) => {
        const p = m.payload;
        if (p.type === 'listing') {
          cache = p.ids;
          if (c.freshLookups && role === 'client') send(ctx, lookingFor, cache);
        } else if (p.type === 'req' && role === 'lb') send(ctx, (p.to as Service | undefined) ?? SERVICES[0], cache);
      },
      snapshot: () => ({ route, noEndpoint: none }),
    };
  };

  const nodes: Record<string, DistNode<Msg, NodeState>> = { client: router('client') };
  if (c.cacheOwner === 'lb') nodes.lb = router('lb');
  nodes.registry = registry();
  ids.forEach((id, i) => (nodes[id] = instance(id, i)));

  const cluster = createCluster<Msg, NodeState>({ seed: c.seed, nodes, latency: { min: LATENCY_MS - c.jitterMs, max: LATENCY_MS + c.jitterMs }, duplicate: c.duplicate });
  if (c.crash && ids.includes(VICTIM)) cluster.crash(VICTIM, c.crashAtMs);
  return { cluster, log };
}

/** The safety property: no request is routed to an instance that stopped more than `staleBound` ago. */
export function noStaleRoute(c: RegistryConfig): Safety<NodeState> {
  const bound = staleBound(c);
  return (snap) => {
    if (!c.crash) return null;
    for (const node of Object.values(snap.nodes)) {
      const r = node.state?.route;
      if (r && r.target === VICTIM && r.t > c.crashAtMs + bound) {
        return `a request went to ${VICTIM} at ${Math.round(r.t)} ms, ${Math.round(r.t - c.crashAtMs)} ms after it stopped (the bound is ${Math.round(bound)} ms)`;
      }
    }
    return null;
  };
}

/** The safety property for fresh lookups: no listing contains an instance the registry had marked not ready. */
export const noNotReadyListed: Safety<NodeState> = (snap) => {
  const leak = snap.nodes.registry?.state?.leak ?? [];
  return leak.length ? `the registry listed ${leak.join(', ')} while it was marked not ready` : null;
};
