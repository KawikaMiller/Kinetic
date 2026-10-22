import { maxSatisfying, satisfies } from '../../core/semver';

/** A version as published to the registry, with the month it appeared (1 = January). */
export interface Release {
  version: string;
  month: number;
  note: string;
  /** This release shipped a regression (the lockfile scenario). */
  broken?: boolean;
}

// ── Range tester ─────────────────────────────────────────────────────────────────

/** Every version of "tiny-date" the range tester lists, oldest first (pre-releases included). */
export const PUBLISHED = [
  '0.3.0', '0.3.1', '0.3.5', '0.4.0', '1.0.0', '1.2.0', '1.4.0', '1.4.2', '1.4.9',
  '1.5.0-beta.1', '1.5.0', '1.6.3', '2.0.0-rc.1', '2.0.0', '2.1.0',
];

// ── Lockfile scenario ────────────────────────────────────────────────────────────

export const APP_RANGE = '^1.4.2';
export const DEV_MONTH = 4;
export const CI_MONTH = 6;

/** "tiny-date": the direct dependency in the lockfile scenario. */
export const TINY_DATE: Release[] = [
  { version: '1.3.0', month: 1, note: 'adds formatRelative()' },
  { version: '1.4.0', month: 2, note: 'adds time zones' },
  { version: '1.4.2', month: 3, note: 'fixes a DST bug' },
  { version: '1.5.0', month: 6, note: 'refactor: formatDate(null) now throws', broken: true },
];

export const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface Install {
  version: string;
  /** Where the version came from: the lockfile, or "newest match on the registry today". */
  source: 'lockfile' | 'registry';
  broken: boolean;
}

/** What's on the registry in a given month. */
export function publishedBy(releases: readonly Release[], month: number): Release[] {
  return releases.filter((r) => r.month <= month);
}

/**
 * Install a dependency in `month`. With a lockfile that satisfies the range, npm installs
 * exactly the locked version; without one it takes the highest match published so far.
 */
export function install(range: string, month: number, locked: string | null, releases: readonly Release[] = TINY_DATE): Install {
  const version =
    locked && satisfies(locked, range) ? locked : maxSatisfying(publishedBy(releases, month).map((r) => r.version), range);
  if (!version) throw new Error(`nothing satisfies ${range} in month ${month}`);
  return {
    version,
    source: locked && version === locked ? 'lockfile' : 'registry',
    broken: releases.find((r) => r.version === version)?.broken ?? false,
  };
}

// ── Transitive dependency tree ───────────────────────────────────────────────────

/** Which fixed versions of "c-utils" exist: none yet, a fix on both lines, or 2.x only. */
export type FixMode = 'none' | 'both' | 'latest-only';

/** Versions of B: 3.2.0 only accepts c-utils 1.x; 3.3.0 also accepts 2.x. */
export type BVersion = '3.2.0' | '3.3.0';

export const A_RANGE_ON_C = '^2.1.0';
export const B_RANGE_ON_C: Record<BVersion, string> = { '3.2.0': '^1.4.0', '3.3.0': '^1.4.0 || ^2.1.0' };

const C_BASE = ['1.4.0', '1.4.5', '1.5.2', '2.1.0', '2.2.0'];
const C_FIXES: Record<FixMode, string[]> = { none: [], both: ['1.5.3', '2.2.1'], 'latest-only': ['2.2.1'] };

/** The advisory: versions below these (on each line) have the security bug. */
export const ADVISORY = '<1.5.3 || >=2.0.0 <2.2.1';

export function cVersions(fix: FixMode): string[] {
  return [...C_BASE, ...C_FIXES[fix]];
}

export interface CCopy {
  version: string;
  /** Who asked for this copy: the package names on the path from the app. */
  neededBy: ('A' | 'B')[];
  /** true for the copy at the top of node_modules; false = nested under its dependent. */
  hoisted: boolean;
  vulnerable: boolean;
}

export interface TreeResult {
  copies: CCopy[];
  /**
   * Who has to release something before a reinstall can fix it: c-utils itself while no fixed
   * version exists, otherwise each dependent whose range can't reach a fixed version.
   */
  stuck: ('A' | 'B' | 'c-utils')[];
}

/**
 * A simplified npm install for c-utils: each dependent gets the newest version its range
 * allows; if one version satisfies both, it's installed once (deduped) at the top;
 * otherwise A's copy is hoisted and B's is nested under B.
 */
export function resolveTree(fix: FixMode, bVersion: BVersion): TreeResult {
  const available = cVersions(fix);
  const bRange = B_RANGE_ON_C[bVersion];
  const aPick = maxSatisfying(available, A_RANGE_ON_C)!;
  // npm reuses the copy already at the top when it satisfies B too (dedupe).
  const bPick = satisfies(aPick, bRange) ? aPick : maxSatisfying(available, bRange)!;
  const vuln = (v: string) => satisfies(v, ADVISORY);

  const copies: CCopy[] =
    aPick === bPick
      ? [{ version: aPick, neededBy: ['A', 'B'], hoisted: true, vulnerable: vuln(aPick) }]
      : [
          { version: aPick, neededBy: ['A'], hoisted: true, vulnerable: vuln(aPick) },
          { version: bPick, neededBy: ['B'], hoisted: false, vulnerable: vuln(bPick) },
        ];

  const reachesFix = (range: string) => available.some((v) => satisfies(v, range) && !vuln(v));
  if (!available.some((v) => !vuln(v))) return { copies, stuck: ['c-utils'] };
  const stuck = (['A', 'B'] as const).filter((who) => !reachesFix(who === 'A' ? A_RANGE_ON_C : bRange));
  return { copies, stuck };
}
