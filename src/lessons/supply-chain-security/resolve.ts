/**
 * Resolution with the shared npm-rules semver (core/semver): for each service, every package it can reach is
 * given the highest release that satisfies every range asked of it, among the releases the registry offers on
 * the install day (published, not withdrawn, old enough for the cooldown). Pre-releases are left out unless a
 * range names one, as node-semver does.
 */
import { compare, parseVersion, satisfies } from '../../core/semver';
import { ancestorsOf, reachableFrom, type Adjacency } from './graph';
import {
  COMPROMISED_PACKAGE, COMPROMISED_VERSION, DEPENDENCIES, PACKAGE_NAMES, RELEASES, SERVICES, SERVICE_NAMES, type Dependency, type Release,
} from './registry';

export type Policy = 'ranges' | 'lockfile' | 'exact';
/** When the lockfile was written: before the bad release existed, or on the install day, after it. */
export type LockWhen = 'before' | 'after';

export type Resolution = ReadonlyMap<string, string>;

/** The day before the bad release: what a clean install saw. */
export const CLEAN_DAY = -1;

export const dependenciesOf = (name: string): readonly Dependency[] => SERVICES[name] ?? DEPENDENCIES[name] ?? [];

/** The whole graph as an adjacency map, services included. */
export function adjacency(): Adjacency {
  return new Map([...SERVICE_NAMES, ...PACKAGE_NAMES].map((n) => [n, dependenciesOf(n).map((d) => d.name)]));
}

/** Is a release on offer on `day`, with a cooldown of `cooldown` days? */
export function available(r: Release, day: number, cooldown: number): boolean {
  if (r.day > day) return false;
  if (r.withdrawnDay !== undefined && day >= r.withdrawnDay) return false;
  return day - r.day >= cooldown;
}

export interface InstallOptions {
  day: number;
  cooldown: number;
}

/** Resolve one service from its declared ranges, or from exact pins when `pins` is given. */
export function resolveService(service: string, { day, cooldown }: InstallOptions, pins?: Resolution): Resolution {
  const adj = adjacency();
  const reach = reachableFrom(adj, [service]);
  const asked = new Map<string, string[]>();
  for (const dependent of [service, ...reach]) {
    for (const dep of dependenciesOf(dependent)) asked.set(dep.name, [...(asked.get(dep.name) ?? []), pins?.get(dep.name) ?? dep.range]);
  }
  const out = new Map<string, string>();
  for (const name of reach) {
    const ranges = asked.get(name) ?? [];
    const candidates = RELEASES[name]
      .filter((r) => available(r, day, cooldown))
      .map((r) => r.version)
      .sort((a, b) => compare(parseVersion(b)!, parseVersion(a)!));
    const pick = candidates.find((v) => ranges.every((r) => satisfies(v, r)));
    if (pick) out.set(name, pick);
  }
  return out;
}

/** What a clean install (before the bad release) resolved: the versions an exact pin or an early lockfile holds. */
export const cleanResolution = (service: string): Resolution => resolveService(service, { day: CLEAN_DAY, cooldown: 0 });

/** What each service installs under a policy on the install day. */
export function installAll(policy: Policy, lockWhen: LockWhen, o: InstallOptions): Map<string, Resolution> {
  return new Map(
    SERVICE_NAMES.map((service) => {
      if (policy === 'exact') return [service, resolveService(service, o, cleanResolution(service))] as const;
      if (policy === 'lockfile') return [service, lockWhen === 'before' ? cleanResolution(service) : resolveService(service, o)] as const;
      return [service, resolveService(service, o)] as const;
    }),
  );
}

export interface Affected {
  /** Services whose install includes the compromised release. */
  services: string[];
  /** Packages in those installs that depend on the compromised package, and the compromised package itself. */
  packages: string[];
}

/** Who ends up running the compromised release: reverse reachability from it, within the installs that picked it up. */
export function affectedBy(installs: ReadonlyMap<string, Resolution>): Affected {
  const adj = adjacency();
  const chain = new Set([COMPROMISED_PACKAGE, ...ancestorsOf(adj, COMPROMISED_PACKAGE)]);
  const services = SERVICE_NAMES.filter((s) => installs.get(s)?.get(COMPROMISED_PACKAGE) === COMPROMISED_VERSION);
  const packages = new Set<string>();
  for (const s of services) for (const p of reachableFrom(adj, [s])) if (chain.has(p)) packages.add(p);
  return { services, packages: PACKAGE_NAMES.filter((p) => packages.has(p)) };
}

export type ReleaseStatus = 'picked-up' | 'held-back' | 'withdrawn';

/** What happens to the bad release for an install on `day` with a cooldown: pulled by the registry, too young, or installed. */
export function releaseStatus({ day, cooldown }: InstallOptions): ReleaseStatus {
  const r = RELEASES[COMPROMISED_PACKAGE].find((x) => x.compromised)!;
  if (r.withdrawnDay !== undefined && day >= r.withdrawnDay) return 'withdrawn';
  return day - r.day >= cooldown ? 'picked-up' : 'held-back';
}
