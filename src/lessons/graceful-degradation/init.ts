import {
  BROKEN_SEED, CACHE_DEFAULT, DEFAULT_LOAD, DEFAULT_POLICY, DEFAULT_TAG, DEFAULT_THRESHOLD, SERVICES, STALE_AGE_AT_FAILURE_MIN, allUp, withHealth,
  type CacheConfig, type CheckoutRule, type HealthMap, type Policies, type ServiceId, type Tag, type WidgetId,
} from './model';

/** Each scene's opening state is a pure function, so a test can switch through every scene and check it matches its try-this. */

export interface WidgetsState {
  health: HealthMap;
  policies: Policies;
  tags: Record<ServiceId, Tag>;
  /** The widget whose ladder and dependency tag the controls edit. */
  selected: WidgetId;
  /** Minutes the outage has lasted, which sets the age a stale widget shows. */
  outageMin: number;
  /** The coupling bug: the buy button also waits on recommendations. */
  buyWaitsForRecs: boolean;
}

export const initialWidgets = (): WidgetsState => ({
  health: allUp(),
  policies: { ...DEFAULT_POLICY },
  tags: { ...DEFAULT_TAG },
  selected: 'price',
  outageMin: STALE_AGE_AT_FAILURE_MIN,
  buyWaitsForRecs: false,
});

export type PresetId = 'reviews-down' | 'recs-slow' | 'pricing-down' | 'soft-down';

export const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'reviews-down', label: 'reviews down' },
  { id: 'recs-slow', label: 'recommendations slow' },
  { id: 'pricing-down', label: 'pricing down (hard)' },
  { id: 'soft-down', label: 'everything soft down' },
];

/** A preset replaces the failures (policies, tags and the bug switch stay as the learner set them). */
export function applyPreset(s: WidgetsState, preset: PresetId): WidgetsState {
  const patch: Partial<HealthMap> =
    preset === 'reviews-down' ? { reviews: 'down' }
    : preset === 'recs-slow' ? { recs: 'slow' }
    : preset === 'pricing-down' ? { pricing: 'down' }
    : Object.fromEntries(SERVICES.filter((x) => s.tags[x] === 'soft').map((x) => [x, 'down' as const]));
  return { ...s, health: withHealth(allUp(), patch) };
}

export interface BrownoutState {
  lambda: number;
  threshold: number;
  degrade: boolean;
  seed: number;
}

export const initialBrownout = (): BrownoutState => ({ lambda: DEFAULT_LOAD, threshold: DEFAULT_THRESHOLD, degrade: true, seed: BROKEN_SEED });

export interface StaleState {
  cache: CacheConfig;
  rule: CheckoutRule;
}

export const initialStale = (): StaleState => ({ cache: { ...CACHE_DEFAULT }, rule: 'fail-closed' });
