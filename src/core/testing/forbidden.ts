/**
 * "This lesson stays inside the page": a source-text check that no file makes a network call, evaluates
 * text, or (when asked) touches browser storage or the clock. Lessons used to carry the same regex each; they pass
 * their own raw sources (`import.meta.glob(..., { query: '?raw', import: 'default', eager: true })`).
 * Test-only: never import this from app code.
 */

/** Every call shape the check knows. The default set is the first six; the rest are opt-in through `also`. */
export const FORBIDDEN_PATTERNS = {
  fetch: /\bfetch\(/,
  xhr: /XMLHttpRequest/,
  webSocket: /WebSocket/,
  beacon: /sendBeacon/,
  eval: /\beval\s*\(/,
  newFunction: /new\s+Function/,
  /** A bare `Function(...)` call, which builds code from text without `new`. Opt-in. */
  functionCall: /\bFunction\s*\(/,
  /** Building a pattern at runtime (`new RegExp`, `RegExp(`): a lesson that teaches its own matcher must not lean on the real one. Opt-in. */
  regExp: /new\s+RegExp|RegExp\s*\(/,
  localStorage: /localStorage/,
  sessionStorage: /sessionStorage/,
  indexedDB: /indexedDB/,
  newUrl: /new URL\(/,
  /** Reading the wall clock: a model that does is not deterministic. */
  clock: /performance\.now|Date\.now|new Date/,
  /** Starting a timer or a frame loop: a model advances by its own steps, never by time passing. */
  timer: /setTimeout|setInterval|requestAnimationFrame/,
} as const;

export type ForbiddenCall = keyof typeof FORBIDDEN_PATTERNS;

/** No network, no code from text: what every simulated lesson promises. */
export const NETWORK_AND_EVAL: readonly ForbiddenCall[] = ['fetch', 'xhr', 'webSocket', 'beacon', 'eval', 'newFunction'];

/** The `also` set of a lesson that must be deterministic: no clock, no timer (on top of the default network and eval ban). */
export const NO_CLOCK_OR_TIMER: readonly ForbiddenCall[] = ['clock', 'timer'];

/** The `also` set of a lesson that implements its own matcher or evaluator: no `RegExp`, and no bare `Function(` on top of the default `eval` and `new Function` ban. */
export const NO_REGEXP_OR_FUNCTION: readonly ForbiddenCall[] = ['regExp', 'functionCall'];

export interface ForbiddenOptions {
  /** Further calls to forbid on top of the default set (browser storage, `new URL(`, `NO_CLOCK_OR_TIMER`). */
  also?: readonly ForbiddenCall[];
  /** Calls to permit although they are in the default set (a lesson that really does call `eval` on fixed text). */
  allow?: readonly ForbiddenCall[];
  /** Look only at code: block comments and whole-line `//` comments are dropped first, so prose may name a forbidden call. */
  ignoreComments?: boolean;
}

/** Source without block comments and whole-line `//` comments (a trailing `// note` after code stays). */
export const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((line) => !line.trimStart().startsWith('//')).join('\n');

/** One line per violation, `file: call`; an empty list means the sources are clean. */
export function forbiddenCalls(sources: Readonly<Record<string, string>>, { also = [], allow = [], ignoreComments = false }: ForbiddenOptions = {}): string[] {
  const kinds = [...NETWORK_AND_EVAL, ...also].filter((k) => !allow.includes(k));
  return Object.entries(sources).flatMap(([file, source]) => {
    const text = ignoreComments ? stripComments(source) : source;
    return kinds.filter((k) => FORBIDDEN_PATTERNS[k].test(text)).map((k) => `${file}: ${k}`);
  });
}
