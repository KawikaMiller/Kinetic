/**
 * Scene 1: the same change to a shared library, played out in a monorepo and in a polyrepo.
 * The system, the review times and the library's versions are all invented.
 */
import { affectedSet, cascade, cascadeDays, type Graph, type Slot } from './graph';

export const LIB = 'shared-lib';

/** Four services that depend on the library; `web` also depends on `api`. Invented. */
export const SYSTEM: Graph = {
  nodes: [LIB, 'api', 'web', 'billing', 'worker'],
  deps: { [LIB]: [], api: [LIB], web: [LIB, 'api'], billing: [LIB], worker: [LIB] },
};

/** Days one repo's own change takes to review, merge and release. Invented. */
export const REVIEW_DAYS: Readonly<Record<string, number>> = { api: 3, web: 4, billing: 2, worker: 5 };
/** Days one cross-package commit takes to review in the monorepo: one thread, several owners. Invented. */
export const MONOREPO_REVIEW_DAYS = 3;
/** The library's version before the change, and the range every consumer pins. */
export const LIB_VERSION = { major: 1, minor: 4, patch: 0 };
export const CONSUMER_RANGE = '^1.4.0';

export type ChangeId = 'optional-param' | 'rename' | 'return-type';

export interface Change {
  id: ChangeId;
  label: string;
  /** Existing callers keep working. */
  compatible: boolean;
  /** The repos whose code calls what changed: they need a code change if it breaks. */
  users: readonly string[];
}

export const CHANGES: readonly Change[] = [
  { id: 'optional-param', label: 'Add an optional parameter to formatMoney', compatible: true, users: ['billing', 'web'] },
  { id: 'rename', label: 'Rename formatMoney to formatCurrency', compatible: false, users: ['billing', 'web'] },
  { id: 'return-type', label: 'Change the return type of parseOrder', compatible: false, users: ['api', 'worker'] },
];

export const changeOf = (id: ChangeId): Change => CHANGES.find((c) => c.id === id)!;

/** Semantic versioning: a compatible addition is a minor release, a breaking change a major one. */
export function nextVersion(c: Change): string {
  const { major, minor } = LIB_VERSION;
  return c.compatible ? `${major}.${minor + 1}.0` : `${major + 1}.0.0`;
}

export const currentVersion = (): string => `${LIB_VERSION.major}.${LIB_VERSION.minor}.${LIB_VERSION.patch}`;

/** Does a caret range on the old version still accept the new one? (Caret keeps the major for 1.x and later.) */
export const rangeAccepts = (c: Change): boolean => Number(nextVersion(c).split('.')[0]) === LIB_VERSION.major;

export type Status = 'landed' | 'blocked' | 'pending';

export interface MonorepoOutcome {
  /** Packages the CI runs: the changed one and everything that can reach it. */
  affected: string[];
  prs: number;
  days: number;
  /** Mixed versions of the library in use at once: one tree, one version. */
  versionsInUse: number;
  status: Status;
  /** Packages whose build breaks when a breaking change lands without its callers. */
  failing: string[];
}

/** One commit changes the library and, when the change breaks callers, the callers too; it lands whole or not at all. */
export function monorepo(c: Change, callersUpdated: boolean): MonorepoOutcome {
  const affected = SYSTEM.nodes.filter((n) => affectedSet(SYSTEM, LIB).has(n));
  const failing = c.compatible || callersUpdated ? [] : c.users.filter((u) => affected.includes(u));
  return { affected, prs: 1, days: MONOREPO_REVIEW_DAYS, versionsInUse: 1, status: failing.length ? 'blocked' : 'landed', failing };
}

export interface PolyrepoRow {
  repo: string;
  slot: Slot;
  /** True when the repo's own code calls what changed. */
  codeChange: boolean;
}

export interface PolyrepoOutcome {
  /** The release the library publishes. */
  version: string;
  /** Changes needed in other repos to move every consumer to the new version; none when the range already accepts it. */
  rows: PolyrepoRow[];
  prs: number;
  days: number;
}

/** The library releases a new version; each consumer whose range rejects it needs its own change, in dependency order. */
export function polyrepo(c: Change): PolyrepoOutcome {
  const version = nextVersion(c);
  if (rangeAccepts(c)) return { version, rows: [], prs: 0, days: 0 };
  const slots = cascade(SYSTEM, LIB, REVIEW_DAYS);
  const rows = SYSTEM.nodes.filter((n) => slots[n]).map((repo) => ({ repo, slot: slots[repo], codeChange: c.users.includes(repo) }));
  return { version, rows, prs: rows.length, days: cascadeDays(slots) };
}

/** What a repo has pinned `day` days after the release. */
export interface Pin {
  repo: string;
  version: string;
  /** Moved to the new version, still on the old one, or the library itself. */
  state: 'library' | 'moved' | 'waiting' | 'unaffected';
}

export function pinsAt(c: Change, day: number): Pin[] {
  const out = polyrepo(c);
  return SYSTEM.nodes.map((repo): Pin => {
    if (repo === LIB) return { repo, version: out.version, state: 'library' };
    const row = out.rows.find((r) => r.repo === repo);
    if (!row) return { repo, version: currentVersion(), state: 'unaffected' };
    return row.slot.finish <= day ? { repo, version: out.version, state: 'moved' } : { repo, version: currentVersion(), state: 'waiting' };
  });
}

/** Distinct library versions in use among the repos at `day`: more than one is version skew. */
export const versionsInUse = (pins: readonly Pin[]): number => new Set(pins.filter((p) => p.state !== 'library').map((p) => p.version)).size;
