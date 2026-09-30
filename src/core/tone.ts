/** Semantic colour roles. Each maps to a CSS token and a `.tone-*` class in kit.css. */
export type Tone = 'hi' | 'ok' | 'bad' | 'info' | 'violet' | 'dim' | 'orange';

/** 'var(--ok)' etc. */
export const toneVar = (t: Tone) => `var(--${t})`;

/**
 * Traffic-light tone by thresholds: ok below `warn`, hi from `warn`, bad from `bad`.
 * With `invert`, higher is better (ok at/above `warn`, bad below `bad`).
 */
export function toneFor(value: number, t: { warn: number; bad: number; invert?: boolean }): 'ok' | 'hi' | 'bad' {
  if (t.invert) return value >= t.warn ? 'ok' : value >= t.bad ? 'hi' : 'bad';
  return value >= t.bad ? 'bad' : value >= t.warn ? 'hi' : 'ok';
}
