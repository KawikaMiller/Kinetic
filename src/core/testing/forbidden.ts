/**
 * "This lesson stays inside the page": a source-text check that no file makes a network call, evaluates
 * text, or (when asked) touches browser storage. Lessons used to carry the same regex each; they pass
 * their own raw sources (`import.meta.glob(..., { query: '?raw', import: 'default', eager: true })`).
 * Test-only: never import this from app code.
 */

/** Every call shape the check knows. The default set is the first six; the rest are opt-in through `also`. */
export const FORBIDDEN_PATTERNS = {
  fetch: /\bfetch\(/,
  xhr: /XMLHttpRequest/,
  webSocket: /WebSocket/,
  beacon: /sendBeacon/,
  eval: /\beval\(/,
  newFunction: /new Function/,
  localStorage: /localStorage/,
  sessionStorage: /sessionStorage/,
  indexedDB: /indexedDB/,
  newUrl: /new URL\(/,
} as const;

export type ForbiddenCall = keyof typeof FORBIDDEN_PATTERNS;

/** No network, no code from text: what every simulated lesson promises. */
export const NETWORK_AND_EVAL: readonly ForbiddenCall[] = ['fetch', 'xhr', 'webSocket', 'beacon', 'eval', 'newFunction'];

export interface ForbiddenOptions {
  /** Further calls to forbid on top of the default set (browser storage, `new URL(`). */
  also?: readonly ForbiddenCall[];
  /** Calls to permit although they are in the default set (a lesson that really does call `eval` on fixed text). */
  allow?: readonly ForbiddenCall[];
}

/** One line per violation, `file: call`; an empty list means the sources are clean. */
export function forbiddenCalls(sources: Readonly<Record<string, string>>, { also = [], allow = [] }: ForbiddenOptions = {}): string[] {
  const kinds = [...NETWORK_AND_EVAL, ...also].filter((k) => !allow.includes(k));
  return Object.entries(sources).flatMap(([file, text]) => kinds.filter((k) => FORBIDDEN_PATTERNS[k].test(text)).map((k) => `${file}: ${k}`));
}
