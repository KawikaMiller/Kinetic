/**
 * Scene 2 of api-versioning: how a client says which version it wants, what that does to a shared
 * cache and to routing, and what keeping several versions alive costs.
 *
 * The request lines and the cache are real (a request is built as text, a cache keys on what the
 * strategy puts in the key); the per-version maintenance cost is an illustrative constant.
 */

import { rowFor, type ChangeClass, type Change } from './api';

export type StrategyId = 'path' | 'header' | 'query' | 'dated' | 'additive';
export type ClientVersion = 1 | 2;

export const STRATEGIES: { id: StrategyId; label: string; routing: string }[] = [
  { id: 'path', label: 'Version in the URL path', routing: 'A gateway can route on the path prefix before any code runs.' },
  { id: 'header', label: 'Version in a header', routing: 'Something must read the header: a gateway rule or the application.' },
  { id: 'query', label: 'Version in a query parameter', routing: 'The application reads it, or a gateway rule matches the query string.' },
  { id: 'dated', label: 'A dated version', routing: 'The application maps the date to the newest release on or before it, from a table of release dates.' },
  { id: 'additive', label: 'No versions, additive only', routing: 'Nothing to route: one handler serves every client.' },
];

export const VERSION_HEADER = 'Api-Version';
const RELEASE_DATES: Record<ClientVersion, string> = { 1: '2026-03-01', 2: '2026-09-01' };
const RESOURCE = '/users/42';

export interface Request {
  line: string;
  headers: string[];
}

/** The request a client on `version` sends. */
export function buildRequest(strategy: StrategyId, version: ClientVersion): Request {
  const host = 'Host: api.example.com';
  switch (strategy) {
    case 'path':
      return { line: `GET /v${version}${RESOURCE} HTTP/1.1`, headers: [host] };
    case 'header':
      return { line: `GET ${RESOURCE} HTTP/1.1`, headers: [host, `${VERSION_HEADER}: ${version}`] };
    case 'query':
      return { line: `GET ${RESOURCE}?version=${version} HTTP/1.1`, headers: [host] };
    case 'dated':
      return { line: `GET ${RESOURCE} HTTP/1.1`, headers: [host, `${VERSION_HEADER}: ${RELEASE_DATES[version]}`] };
    case 'additive':
      return { line: `GET ${RESOURCE} HTTP/1.1`, headers: [host] };
  }
}

export const requestLines = (r: Request): string[] => [r.line, ...r.headers];

/** True when the version rides in a header, so a shared cache needs `Vary` to tell versions apart. */
export const versionInHeader = (s: StrategyId) => s === 'header' || s === 'dated';

/** A shared cache's key: the request target, plus the values of the request headers the response lists in `Vary`. */
export function cacheKey(req: Request, vary: readonly string[]): string {
  const target = req.line.split(' ')[1];
  const varied = vary.map((name) => `${name}=${req.headers.find((h) => h.toLowerCase().startsWith(`${name.toLowerCase()}:`))?.split(': ')[1] ?? ''}`);
  return [target, ...varied].join('|');
}

/** The body the origin sends for a version: v2 renamed `name`, which is why a wrong cached copy is visible. */
export const bodyFor = (version: ClientVersion) => (version === 1 ? '{"id":42,"name":"Ada"}' : '{"id":42,"fullName":"Ada"}');

export interface CacheRun {
  /** The key each client's request maps to. */
  keys: [string, string];
  /** What the cache served to the second client. */
  served: string;
  /** The second client got a body of its own version. */
  correct: boolean;
}

/**
 * Client A (on v1) asks first and the origin's answer is stored; then client B (on v2) asks for the
 * same resource. `sendVary` is whether the origin lists the version header in `Vary`.
 */
export function cacheRun(strategy: StrategyId, sendVary: boolean): CacheRun {
  const vary = versionInHeader(strategy) && sendVary ? [VERSION_HEADER] : [];
  const [a, b] = ([1, 2] as const).map((v) => buildRequest(strategy, v));
  const keys: [string, string] = [cacheKey(a, vary), cacheKey(b, vary)];
  // Without versions there is one representation, so whatever the cache holds is the right one.
  const bodyOf = (v: ClientVersion) => bodyFor(strategy === 'additive' ? 1 : v);
  const store = new Map([[keys[0], bodyOf(1)]]);
  const served = store.get(keys[1]) ?? bodyOf(2);
  return { keys, served, correct: served === bodyOf(2) };
}

// ── Dated versions ───────────────────────────────────────────────────────

/** The newest release dated on or before `date` (ISO yyyy-mm-dd compares correctly as text), or null if the date predates them all. */
export function resolveDated(date: string, releases: readonly string[]): string | null {
  const earlier = releases.filter((r) => r <= date).sort();
  return earlier.at(-1) ?? null;
}

// ── What versions cost ───────────────────────────────────────────────────

/** Illustrative: engineer-days a year to keep one version alive (tests, fixes, docs, on-call). */
export const DAYS_PER_LIVE_VERSION = 60;
export const RELEASE_RANGE = { min: 1, max: 4 } as const;
export const MIGRATION_RANGE = { min: 3, max: 36 } as const;

/**
 * The most versions alive at once: the current one, plus every older one that clients may still be
 * on, which is each release within `migrationMonths` of the current one. Additive-only has one.
 */
export function liveVersions(strategy: StrategyId, releasesPerYear: number, migrationMonths: number): number {
  if (strategy === 'additive') return 1;
  const gap = 12 / releasesPerYear;
  return 1 + Math.ceil(migrationMonths / gap);
}

export const yearlyCost = (live: number) => live * DAYS_PER_LIVE_VERSION;

// ── What a change means under a strategy ─────────────────────────────────

export type Ships = 'in-place' | 'new-version' | 'refused';

export interface Fate {
  cls: ChangeClass;
  ships: Ships;
  text: string;
}

export function fateOf(strategy: StrategyId, change: Change, name: string): Fate {
  const { cls } = rowFor(change, name);
  const changesWhatClientsGet = cls === 'breaking' || cls === 'silent';
  if (strategy === 'additive') {
    if (changesWhatClientsGet) {
      return { cls, ships: 'refused', text: 'Refused: it changes what existing clients get. Ship the new shape beside the old one (a new field or endpoint) and keep the old one.' };
    }
    const text = cls === 'strict-only' ? 'Allowed: only a strict reader breaks, and additive-only is a promise that readers tolerate additions.' : 'Allowed: no client breaks.';
    return { cls, ships: 'in-place', text };
  }
  if (cls === 'safe') return { cls, ships: 'in-place', text: 'No client breaks, so it can ship inside the current version.' };
  const why = cls === 'silent' ? 'No client throws, but a result changes with no error to notice, which is a break for whoever relies on it' : 'It breaks at least one client';
  return { cls, ships: 'new-version', text: `${why}, so it ships as a new version and the old one stays up.` };
}
