/**
 * Colour roles. Each maps to a CSS token and a `.tone-*` class in kit.css. The first six are
 * the semantic roles (CLAUDE.md's colour table), `muted` is a plain readable grey for
 * something deliberately uncoloured (an overall parity bit that belongs to no group); `orange`, `amber`, `pink` and `sky` are the
 * categorical hues for plain categories (a parity group, a field, a lane), and `orange` is
 * also the second kind of failure.
 */
export type Tone = 'hi' | 'ok' | 'bad' | 'info' | 'violet' | 'dim' | 'muted' | 'orange' | 'amber' | 'pink' | 'sky';

/** Every tone, for code that needs one of something per tone (arrowhead markers). */
export const TONES: readonly Tone[] = ['hi', 'ok', 'bad', 'info', 'violet', 'dim', 'muted', 'orange', 'amber', 'pink', 'sky'];

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
