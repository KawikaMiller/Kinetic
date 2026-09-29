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
