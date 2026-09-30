import { mulberry32 } from '../../core/random';

/**
 * A simplified model of how branch lifetime turns into merge conflicts.
 *
 * - Every developer makes one change a day to one of REGIONS areas of the code (seeded,
 *   so the same team makes the same edits under every strategy).
 * - Work stays on a branch for `lifetime` days, then everyone integrates on the same day.
 *   Integration days split the week into windows: [0, L), [L, 2L), …
 * - Two changes by different people to the same area in the same window conflict: neither
 *   could see the other. When developers merge one after another, each merge conflicts
 *   with the overlapping changes of everyone who merged before it.
 *
 * Windows for lifetimes 1, 5 and 10 nest inside each other, so a longer lifetime can only
 * keep the same overlapping pairs together or add more: conflicts never go down.
 */

export const DAYS = 10;
export const REGIONS = 12;
/** How long a feature takes to finish. Without flags you can't merge it any sooner. */
export const FEATURE_DAYS = 3;
/** Illustrative size of a day's work, for PR size. */
export const LINES_PER_DAY = 60;

export type Side = 'long' | 'trunk';

export interface Strategy {
  /** Days a change waits on its branch before it's integrated. */
  lifetime: number;
  /** The shared branch work is integrated into. */
  integrateTo: 'develop' | 'main';
  /** Unfinished work merges behind a feature flag (trunk-based only). */
  flags: boolean;
  /** Production gets the code only at the end-of-week release (GitFlow), not on merge. */
  releaseAtEnd: boolean;
}

export function strategies(longLifetime: number, flags: boolean): Record<Side, Strategy> {
  return {
    long: { lifetime: longLifetime, integrateTo: 'develop', flags: false, releaseAtEnd: true },
    trunk: { lifetime: flags ? 1 : FEATURE_DAYS, integrateTo: 'main', flags, releaseAtEnd: false },
  };
}

/** regions[dev][day]: the area each developer changes each day. */
export function edits(team: number, seed: number): number[][] {
  return Array.from({ length: team }, (_, dev) => {
    const rnd = mulberry32(seed * 101 + dev);
    return Array.from({ length: DAYS }, () => Math.floor(rnd() * REGIONS));
  });
}

export const windowOf = (day: number, lifetime: number) => Math.floor(day / lifetime);

/** The day a window's work is integrated: its last day (the week's last day at most). */
export const integrationDay = (day: number, lifetime: number) => Math.min(DAYS - 1, (windowOf(day, lifetime) + 1) * lifetime - 1);

export interface Merge {
  day: number;
  dev: number;
  /** Conflicting change pairs this merge has to resolve. */
  conflicts: number;
}

/** One merge per developer per window, in developer order, with the conflicts each one hits. */
export function merges(e: number[][], lifetime: number): Merge[] {
  const out: Merge[] = [];
  const windows = Math.ceil(DAYS / lifetime);
  for (let w = 0; w < windows; w++) {
    const days = Array.from({ length: lifetime }, (_, k) => w * lifetime + k).filter((d) => d < DAYS);
    const count = e.map((regions) => {
      const c = new Array(REGIONS).fill(0);
      days.forEach((d) => c[regions[d]]++);
      return c;
    });
    const day = days[days.length - 1];
    for (let dev = 0; dev < e.length; dev++) {
      let conflicts = 0;
      for (let before = 0; before < dev; before++) {
        for (let r = 0; r < REGIONS; r++) conflicts += count[dev][r] * count[before][r];
      }
      out.push({ day, dev, conflicts });
    }
  }
  return out;
}

export interface Outcome {
  conflicts: number;
  /** Mean days from a change being written to it running in production. */
  leadTime: number;
  /** Days between integrations: how often CI sees everyone's code together. */
  integrateEvery: number;
  /** Illustrative lines in one pull request. */
  prLines: number;
  merges: Merge[];
}

export function outcome(e: number[][], s: Strategy): Outcome {
  const m = merges(e, s.lifetime);
  const leads = e.flatMap((regions) => regions.map((_, day) => (s.releaseAtEnd ? DAYS : integrationDay(day, s.lifetime) + 1) - day));
  return {
    conflicts: m.reduce((sum, x) => sum + x.conflicts, 0),
    leadTime: leads.reduce((a, b) => a + b, 0) / leads.length,
    integrateEvery: s.lifetime,
    prLines: s.lifetime * LINES_PER_DAY,
    merges: m,
  };
}

/** Is a trunk commit unfinished work hidden behind a flag? (Features finish every FEATURE_DAYS.) */
export const flaggedOff = (day: number) => day % FEATURE_DAYS !== FEATURE_DAYS - 1 && day !== DAYS - 1;
