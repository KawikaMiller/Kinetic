// Shared number and text formatting. Lesson-specific formats (money, burn rates,
// op counts) stay in their lesson.

/** The one "no value yet" placeholder. */
export const NA = '–';

/** Seconds as '1.2s' at one second and above, '340ms' below. */
export function duration(seconds: number): string {
  return seconds >= 1 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds * 1000)}ms`;
}

/** Milliseconds, rounded: '42 ms'. */
export const ms = (v: number) => `${Math.round(v)} ms`;

/** A rate: '12/s'. */
export const perSec = (v: number, dp = 0) => `${v.toFixed(dp)}/s`;

/** A ratio as a percentage: 0.123 → '12%'. With dp ≥ 1, tiny non-zero values show as '<0.1%'. */
export function pct(ratio: number, dp = 0): string {
  const v = ratio * 100;
  const floor = 10 ** -dp;
  if (dp > 0 && v > 0 && v < floor) return `<${floor}%`;
  return `${v.toFixed(dp)}%`;
}

/**
 * Byte counts: '512 B', '1.5 KB', '8.0 MB', '2.1 GB'. Binary (1 KB = 1,024 B) by default;
 * `base: 1000` for decimal units, `dp` for decimals shown above bytes.
 */
export function bytes(n: number, o: { base?: 1000 | 1024; dp?: number } = {}): string {
  const { base = 1024, dp = 1 } = o;
  if (n < base) return `${Math.round(n)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / base;
  let u = 0;
  while (v >= base && u < units.length - 1) {
    v /= base;
    u++;
  }
  return `${v.toFixed(dp)} ${units[u]}`;
}

/** A multiplier: '3×'. */
export const times = (v: number | string) => `${v}×`;

/** '1 step', '3 steps', or a custom plural: plural(2, 'entry', 'entries'). */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Two-digit zero padding: 7 → '07'. */
export const pad2 = (n: number) => String(n).padStart(2, '0');

/** Minutes since midnight as 'HH:MM' (wraps at 24h). */
export function clock(totalMinutes: number): string {
  const m = ((Math.floor(totalMinutes) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}
