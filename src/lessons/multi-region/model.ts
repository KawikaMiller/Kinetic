// Three regions, three user populations, realistic-ish round-trip times.

export type RegionId = 'us' | 'eu' | 'ap';
export type UserId = 'na' | 'euu' | 'apu';
export type Mode = 'single' | 'passive' | 'active';
export type Replication = 'async' | 'sync';

export const REGIONS: Record<RegionId, { name: string; city: string; x: number; y: number }> = {
  us: { name: 'us-east', city: 'Virginia', x: 270, y: 140 },
  eu: { name: 'eu-west', city: 'Ireland', x: 440, y: 100 },
  ap: { name: 'ap-southeast', city: 'Singapore', x: 715, y: 232 },
};

export const USERS: Record<UserId, { name: string; share: number; x: number; y: number }> = {
  na: { name: 'N. America', share: 0.4, x: 150, y: 150 },
  euu: { name: 'Europe', share: 0.35, x: 548, y: 140 },
  apu: { name: 'Asia-Pacific', share: 0.25, x: 800, y: 150 },
};

/** Round-trip time in ms from each user population to each region. */
export const RTT: Record<UserId, Record<RegionId, number>> = {
  na: { us: 20, eu: 85, ap: 230 },
  euu: { us: 85, eu: 15, ap: 170 },
  apu: { us: 220, eu: 170, ap: 35 },
};

/** Region-to-region RTT, what a synchronous cross-region write must wait for. */
export const REGION_RTT: Record<RegionId, Record<RegionId, number>> = {
  us: { us: 0, eu: 75, ap: 220 },
  eu: { us: 75, eu: 0, ap: 165 },
  ap: { us: 220, eu: 165, ap: 0 },
};

/** Failover timeline for active-passive, in simulated seconds after the primary dies. */
export const DETECT_S = 30;
export const PROMOTE_S = 120;
export const DNS_S = 300;
/** Active-active only needs health checks to steer traffic elsewhere. */
export const REROUTE_S = 30;

export const ASYNC_LAG_S = 1.2;
export const WRITES_PER_S = 30;

export const MODE_INFO: Record<Mode, { label: string; cost: string; rto: string; rpo: (r: Replication) => string }> = {
  single: { label: 'Single region', cost: '1×', rto: 'hours (until the region recovers)', rpo: () => 'up to last backup' },
  passive: { label: 'Active-passive', cost: '~2×', rto: `~${DNS_S / 60} min (failover)`, rpo: (r) => (r === 'sync' ? '0 (sync)' : `~${ASYNC_LAG_S} s of writes`) },
  active: { label: 'Active-active', cost: '~3×+', rto: `~${REROUTE_S} s (reroute)`, rpo: (r) => (r === 'sync' ? '0 (sync)' : `~${ASYNC_LAG_S} s of writes`) },
};

export const nearest = (u: UserId, alive: RegionId[]) =>
  alive.slice().sort((a, b) => RTT[u][a] - RTT[u][b])[0] ?? null;

export const ALL_REGIONS: RegionId[] = ['us', 'eu', 'ap'];
export const ALL_USERS: UserId[] = ['na', 'euu', 'apu'];
/** Stop the failover clock after a simulated hour even if nothing recovers. */
export const CLOCK_LIMIT_S = 3600;

export type RouteState = 'ok' | 'failing' | 'down';
export interface Route {
  region: RegionId | null;
  state: RouteState;
}
export interface Phase {
  text: string;
  done: boolean;
}

/** Where the failover stands, `clock` simulated seconds after the outage (null: nothing happening). */
export function phaseOf(mode: Mode, dead: RegionId[], clock: number | null): Phase | null {
  if (clock === null || dead.length === 0) return null;
  if (mode === 'single') return dead.includes('us') ? { text: 'Outage: there is no other region to fail over to', done: false } : null;
  if (mode === 'passive') {
    if (!dead.includes('us')) return null;
    if (dead.includes('eu')) return { text: 'Primary and standby both down: total outage', done: false };
    if (clock < DETECT_S) return { text: 'Detecting: health checks to us-east failing', done: false };
    if (clock < PROMOTE_S) return { text: 'Promoting the eu-west standby to primary', done: false };
    if (clock < DNS_S) return { text: 'DNS TTL expiring: clients reconnecting to eu-west', done: false };
    return { text: 'Recovered: eu-west is the new primary', done: true };
  }
  if (clock < REROUTE_S) return { text: 'Health checks failing: rerouting users to the next-nearest region', done: false };
  return { text: 'Rerouted: surviving regions absorb the traffic', done: true };
}

/** Which region serves user population `u`, given the topology, the outages and whether failover finished. */
export function route(u: UserId, mode: Mode, dead: RegionId[], failedOver: boolean): Route {
  if (mode === 'single') return dead.includes('us') ? { region: null, state: 'down' } : { region: 'us', state: 'ok' };
  if (mode === 'passive') {
    if (!dead.includes('us')) return { region: 'us', state: 'ok' };
    if (dead.includes('eu')) return { region: null, state: 'down' };
    return failedOver ? { region: 'eu', state: 'ok' } : { region: null, state: 'failing' };
  }
  const alive = ALL_REGIONS.filter((r) => !dead.includes(r));
  const home = nearest(u, ALL_REGIONS)!;
  if (dead.includes(home) && !failedOver) return { region: null, state: alive.length ? 'failing' : 'down' };
  const r = nearest(u, alive);
  return r ? { region: r, state: 'ok' } : { region: null, state: 'down' };
}

export const routesFor = (mode: Mode, dead: RegionId[], failedOver: boolean) =>
  Object.fromEntries(ALL_USERS.map((u) => [u, route(u, mode, dead, failedOver)])) as Record<UserId, Route>;

/** The active-passive primary (null while promoting, or outside active-passive). */
export function primaryRegion(mode: Mode, dead: RegionId[], failedOver: boolean): RegionId | null {
  if (mode !== 'passive') return null;
  if (!dead.includes('us')) return 'us';
  return failedOver ? 'eu' : null;
}

/** Directed replication links between live regions. */
export function replicaPairs(mode: Mode, dead: RegionId[]): [RegionId, RegionId][] {
  if (mode === 'passive') return !dead.includes('us') && !dead.includes('eu') ? [['us', 'eu']] : [];
  if (mode !== 'active') return [];
  const alive = ALL_REGIONS.filter((r) => !dead.includes(r));
  const pairs: [RegionId, RegionId][] = [];
  for (const a of alive) for (const b of alive) if (a !== b) pairs.push([a, b]);
  return pairs;
}

export const regionsInUse = (mode: Mode): RegionId[] => (mode === 'single' ? ['us'] : mode === 'passive' ? ['us', 'eu'] : ALL_REGIONS);

/** Extra wait a synchronous write in region `r` pays for its slowest replica. */
function syncPenalty(r: RegionId, mode: Mode, replication: Replication, dead: RegionId[]): number {
  if (replication !== 'sync' || mode === 'single') return 0;
  const alive = ALL_REGIONS.filter((x) => !dead.includes(x));
  const peers = mode === 'passive' ? (r === 'us' && !dead.includes('eu') ? ['eu' as RegionId] : []) : alive.filter((x) => x !== r);
  return peers.length ? Math.max(...peers.map((p) => REGION_RTT[r][p])) : 0;
}

export interface LatencyStats {
  /** Share-weighted average round trip over users who are being served (ms). */
  avgRead: number;
  /** Slowest served user's round trip (ms), null if nobody is served. */
  worst: number | null;
  /** Share-weighted average write latency including sync waits (ms), null if nobody is served. */
  avgWrite: number | null;
  /** Share of users currently down (0..1). */
  downShare: number;
  anyServed: boolean;
}

export function latencyStats(routes: Record<UserId, Route>, mode: Mode, replication: Replication, dead: RegionId[]): LatencyStats {
  const served = ALL_USERS.filter((u) => routes[u].state === 'ok');
  const servedShare = served.reduce((s, u) => s + USERS[u].share, 0);
  const rtt = (u: UserId) => RTT[u][routes[u].region!];
  return {
    avgRead: served.reduce((s, u) => s + USERS[u].share * rtt(u), 0) / Math.max(1e-9, servedShare),
    worst: served.length ? Math.max(...served.map(rtt)) : null,
    avgWrite: served.length
      ? served.reduce((s, u) => s + USERS[u].share * (rtt(u) + syncPenalty(routes[u].region!, mode, replication, dead)), 0) / servedShare
      : null,
    downShare: ALL_USERS.filter((u) => routes[u].state !== 'ok').reduce((s, u) => s + USERS[u].share, 0),
    anyServed: served.length > 0,
  };
}
