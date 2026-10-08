// What belongs in a cache key. A page's content depends on some inputs; the key has to name every one
// of them (or the cache serves the wrong page) and nothing else (or the cache fragments).
import { mulberry32 } from '../../core/random';

export type PageKind = 'catalog' | 'account';
export type KeyPart = 'user' | 'locale' | 'version';
export const KEY_PARTS: readonly KeyPart[] = ['user', 'locale', 'version'];
export type KeyChoice = Record<KeyPart, boolean>;

/** The inputs each kind of page really depends on. */
export const DEPENDS_ON: Record<PageKind, KeyChoice> = {
  catalog: { user: false, locale: true, version: true },
  account: { user: true, locale: true, version: true },
};

export const LOCALES = ['en', 'fr', 'de'] as const;
export type Locale = (typeof LOCALES)[number];

export interface Request {
  user: number;
  locale: Locale;
  /** The deployed version of the site when the request arrives. */
  version: number;
}

export const USERS = 12;
export const REQUESTS = 400;
/** The request at which version 4 is deployed. */
export const DEPLOY_AT = 200;
export const KEYS_SEED = 5;

/** Share of a user's requests made in their usual language; the rest pick any (a visitor switching language). */
const USUAL_LOCALE = 0.7;

/**
 * Users arrive at random, each with a usual language they sometimes switch away from (so the user
 * does not decide the locale), and the site is redeployed half-way.
 */
export function makeRequests(seed = KEYS_SEED): Request[] {
  const rnd = mulberry32(seed);
  const usual = Array.from({ length: USERS }, () => LOCALES[Math.floor(rnd() * LOCALES.length)]);
  return Array.from({ length: REQUESTS }, (_, i) => {
    const user = Math.floor(rnd() * USERS);
    const locale = rnd() < USUAL_LOCALE ? usual[user] : LOCALES[Math.floor(rnd() * LOCALES.length)];
    return { user, locale, version: i < DEPLOY_AT ? 3 : 4 };
  });
}

/** What the page must say for this request: the content, which depends only on what the page depends on. */
export const contentFor = (kind: PageKind, r: Request): string => {
  const needs = DEPENDS_ON[kind];
  return [needs.user ? `user ${r.user}` : null, needs.locale ? r.locale : null, needs.version ? `v${r.version}` : null].filter(Boolean).join(' · ');
};

export const cacheKey = (kind: PageKind, choice: KeyChoice, r: Request): string =>
  [kind, choice.user ? `u${r.user}` : null, choice.locale ? r.locale : null, choice.version ? `v${r.version}` : null].filter(Boolean).join(':');

export interface KeyRun {
  hits: number;
  misses: number;
  /** Requests served content that was not theirs. */
  wrong: number;
  /** Distinct entries the cache ended up holding. */
  entries: number;
  hitRate: number;
  /** For the table: the first requests, plus the first wrong page if it came later. */
  sample: SampleRow[];
}

export interface SampleRow {
  /** Position in the stream, from 1. */
  n: number;
  request: Request;
  key: string;
  hit: boolean;
  wrong: boolean;
  served: string;
}

const SAMPLE = 6;

/** Replay the requests against a cache keyed by `choice` (no TTL: the point is the key). */
export function simulateKeys(kind: PageKind, choice: KeyChoice, requests: readonly Request[]): KeyRun {
  const store = new Map<string, string>();
  let hits = 0;
  let wrong = 0;
  const sample: SampleRow[] = [];
  let firstWrong: SampleRow | null = null;
  for (const [i, r] of requests.entries()) {
    const key = cacheKey(kind, choice, r);
    const correct = contentFor(kind, r);
    const had = store.get(key);
    const hit = had !== undefined;
    if (!hit) store.set(key, correct);
    const served = had ?? correct;
    if (hit) hits += 1;
    if (served !== correct) wrong += 1;
    const row: SampleRow = { n: i + 1, request: r, key, hit, wrong: served !== correct, served };
    if (sample.length < SAMPLE) sample.push(row);
    if (row.wrong && !firstWrong) firstWrong = row;
  }
  if (firstWrong && !sample.some((row) => row.wrong)) sample[SAMPLE - 1] = firstWrong;
  return { hits, misses: requests.length - hits, wrong, entries: store.size, hitRate: hits / requests.length, sample };
}

/** Parts of the key the page does not depend on, and parts it depends on but the key lacks. */
export function keyProblems(kind: PageKind, choice: KeyChoice): { missing: KeyPart[]; extra: KeyPart[] } {
  const needs = DEPENDS_ON[kind];
  return {
    missing: KEY_PARTS.filter((p) => needs[p] && !choice[p]),
    extra: KEY_PARTS.filter((p) => !needs[p] && choice[p]),
  };
}
