import { DEFAULT_K, DEFAULT_N } from './combos';
import type { Isolation } from './data';
import { CALM_RATE, CHEAP_COST_MS, DEFAULT_SEED, NOISY_CHEAP, NOISY_EXPENSIVE, NO_POLICY, TENANTS, type Policy, type Tenant } from './shardSim';

/** Each scene's opening state is a pure function: a test switches through all four and checks it against the try-this text. */

/** Two tenants on each of the four shards. */
export const SHARED_PLACEMENT: readonly number[] = [0, 0, 1, 1, 2, 2, 3, 3];
/** Tenant 1 alone on shard 1; the rest spread over the other three. */
export const SILO_PLACEMENT: readonly number[] = [0, 1, 1, 1, 2, 2, 3, 3];

export interface NoisyState {
  rates: number[];
  shardOf: number[];
  /** The tenant the rate slider and the move control edit: the actor of this scene. */
  selected: number;
  seed: number;
}

export const initialNoisy = (): NoisyState => ({ rates: Array.from({ length: TENANTS }, () => CALM_RATE), shardOf: [...SHARED_PLACEMENT], selected: 0, seed: DEFAULT_SEED });

export const tenantsOf = (rates: readonly number[]): Tenant[] => rates.map((rate) => ({ rate, costMs: CHEAP_COST_MS }));

export type NoisyMode = 'calm' | 'cheap' | 'expensive';
export const NOISY_MODES: { value: NoisyMode; label: string }[] = [
  { value: 'calm', label: 'sends normal traffic' },
  { value: 'cheap', label: 'many cheap requests' },
  { value: 'expensive', label: 'a few expensive requests' },
];

export interface IsolationState {
  /** What Tenant 1 sends. */
  mode: NoisyMode;
  policy: Policy;
  /** Tenant 1 has a shard to itself. */
  silo: boolean;
  seed: number;
}

export const initialIsolation = (): IsolationState => ({ mode: 'cheap', policy: { ...NO_POLICY }, silo: false, seed: DEFAULT_SEED });

/** The eight tenants of scene 2: Tenant 1 as `mode` says, the other seven calm. */
export function isolationTenants(mode: NoisyMode): Tenant[] {
  const first: Tenant = mode === 'cheap' ? NOISY_CHEAP : mode === 'expensive' ? NOISY_EXPENSIVE : { rate: CALM_RATE, costMs: CHEAP_COST_MS };
  return Array.from({ length: TENANTS }, (_, i) => (i === 0 ? { ...first } : { rate: CALM_RATE, costMs: CHEAP_COST_MS }));
}

export interface ShuffleState {
  n: number;
  k: number;
  seed: number;
}

export const initialShuffle = (): ShuffleState => ({ n: DEFAULT_N, k: DEFAULT_K, seed: 1 });

export interface DataState {
  model: Isolation;
  rowLevelSecurity: boolean;
  /** True once the learner has run the query that forgets the tenant filter. */
  ran: boolean;
}

export const initialData = (): DataState => ({ model: 'pooled', rowLevelSecurity: false, ran: false });

export const NOISY_RATE = NOISY_CHEAP.rate;
