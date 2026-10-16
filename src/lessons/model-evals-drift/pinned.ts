/**
 * Measured figures the lesson text quotes, pinned so that opening the lesson does not run hundreds of
 * simulated streams (about half a second on a laptop, seconds on a phone). `pinned.test.ts` recomputes
 * every one from the model and fails when they drift.
 */
import type { SeedStats } from './seedStats';

/** Clean days measured: 200 streams x 40 days. */
export const CLEAN_DAYS = 8000;
/** Clean days that alert, by monitor and threshold (the slider's own values). */
export const PINNED_ALERT_DAYS = { ks008: 2246, ks011: 419, psi010: 833, psi025: 2 } as const;
export const PINNED_SEEDS: SeedStats = { streams: 200, covariateDetected: 196, conceptInputAlert: 87, falseBeforeShift: 74 };

const rateOf = (days: number) => days / CLEAN_DAYS;

export const pinnedFalseRates = () => ({
  start: rateOf(PINNED_ALERT_DAYS.ks008),
  ksAt011: rateOf(PINNED_ALERT_DAYS.ks011),
  psiWatch: rateOf(PINNED_ALERT_DAYS.psi010),
  psiAlert: rateOf(PINNED_ALERT_DAYS.psi025),
  days: (40 * PINNED_ALERT_DAYS.ks008) / CLEAN_DAYS,
});
