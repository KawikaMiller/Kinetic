import { CANARY_RANGE, FAIL_RATE_RANGE, LIFETIME_RANGE, OUTAGE_RANGE, RETRY_RANGE } from './mesh';
import { DEFAULT_COUNT, REFRESH_RANGE, TTL_BEATS, baseConfig, type RegistryConfig, type Service } from './registry';

/** Each scene's opening state is a pure function: a test switches through all four and checks it against the try-this text. */

export type Style = 'client' | 'lb' | 'dns';
export const STYLES: { value: Style; label: string }[] = [
  { value: 'client', label: 'client-side, with a registry' },
  { value: 'lb', label: 'server-side, through a load balancer' },
  { value: 'dns', label: 'DNS records with a TTL' },
];
/** How often each style refreshes what it knows, ms: the load balancer is tight, a DNS record's TTL is long. */
export const STYLE_REFRESH: Record<Style, number> = { client: REFRESH_RANGE.default, lb: 1000, dns: 30_000 };

export interface RegistryUi {
  style: Style;
  counts: Record<Service, number>;
  ttlBeats: number;
  refreshMs: number;
  loss: number;
  crash: boolean;
  /** A DNS resolver that caches twice as long as the record says. */
  stubborn: boolean;
  seed: number;
}

export const initialRegistry = (): RegistryUi => ({
  style: 'client',
  counts: { orders: DEFAULT_COUNT, payments: DEFAULT_COUNT, search: DEFAULT_COUNT },
  ttlBeats: TTL_BEATS.default,
  refreshMs: REFRESH_RANGE.default,
  loss: 0,
  crash: true,
  stubborn: false,
  seed: 0,
});

export const registryConfig = (u: RegistryUi): RegistryConfig => ({
  ...baseConfig(u.seed),
  counts: u.counts,
  ttlBeats: u.ttlBeats,
  refreshMs: u.refreshMs,
  loss: u.loss,
  crash: u.crash,
  cacheOwner: u.style === 'lb' ? 'lb' : 'client',
  stubbornFactor: u.style === 'dns' && u.stubborn ? 2 : 1,
});

export interface HealthUi {
  honourReadiness: boolean;
  freshLookups: boolean;
  seed: number;
}

export const initialHealth = (): HealthUi => ({ honourReadiness: true, freshLookups: false, seed: 0 });

export const healthConfig = (u: HealthUi): RegistryConfig => ({ ...baseConfig(u.seed), crash: false, unready: true, honourReadiness: u.honourReadiness, freshLookups: u.freshLookups });

export interface MeshUi {
  mesh: boolean;
  mtls: boolean;
  split: boolean;
  retries: boolean;
  lifetimeMin: number;
  canaryPct: number;
  appRetries: number;
  meshRetries: number;
  failProb: number;
  seed: number;
}

export const initialMesh = (): MeshUi => ({
  mesh: false,
  mtls: true,
  split: true,
  retries: true,
  lifetimeMin: LIFETIME_RANGE.default,
  canaryPct: CANARY_RANGE.default,
  appRetries: RETRY_RANGE.default,
  meshRetries: RETRY_RANGE.default,
  failProb: FAIL_RATE_RANGE.default,
  seed: 0,
});

/** The mesh features the learner sees: without a mesh there is no sidecar to terminate TLS, split traffic or retry. */
export const meshActive = (u: MeshUi) => ({ mtls: u.mesh && u.mtls, split: u.mesh && u.split, meshRetries: u.mesh && u.retries ? u.meshRetries : 0 });

export interface ControlUi {
  startMin: number;
  lengthMin: number;
  lifetimeMin: number;
  nowMin: number;
}

export const initialControl = (): ControlUi => ({ startMin: OUTAGE_RANGE.startDefault, lengthMin: OUTAGE_RANGE.lenDefault, lifetimeMin: LIFETIME_RANGE.default, nowMin: 150 });
