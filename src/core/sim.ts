// Small maths helpers shared by the live simulations.
import type { Pt } from './geometry';
import { clamp01, lerp } from './math';

/** Value at quantile p (0..1) of an ascending-sorted array; 0 when empty. p99 = percentile(xs, 0.99). */
export function percentile(sorted: readonly number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

export const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Samples a value every `every` seconds of sim time, keeping the latest `cap` (for charts). */
export function createSampler<T>(o: { every: number; cap: number }) {
  let last = 0;
  const values: T[] = [];
  return {
    /** Call every step; takes a sample when `every` seconds have passed since the last one. */
    tick(now: number, sample: () => T) {
      if (now - last < o.every) return;
      last = now;
      values.push(sample());
      if (values.length > o.cap) values.shift();
    },
    values: values as readonly T[],
    clear() {
      values.length = 0;
      last = 0;
    },
  };
}

/** Drop items older than `span` seconds (by `at(item)`) from the front of a time-ordered array, in place. */
export function trimWindow<T>(xs: T[], now: number, span: number, at: (x: T) => number): void {
  let n = 0;
  while (n < xs.length && at(xs[n]) <= now - span) n++;
  if (n) xs.splice(0, n);
}

/** Events per second over a window. */
export const windowRate = (count: number, span: number) => count / span;

/**
 * Where a particle is on its trip from `from` to `to`, which started at t0 and lasts
 * `dur`. `t` is its progress (0..1). Linear unless you pass an easing (e.g. math.ease).
 */
export function travel(from: Pt, to: Pt, t0: number, dur: number, now: number, easing = (t: number) => t): Pt & { t: number } {
  const t = clamp01((now - t0) / dur);
  const e = easing(t);
  return { x: lerp(from.x, to.x, e), y: lerp(from.y, to.y, e), t };
}

/**
 * A cooldown for "insight" captions: ready() is true once `seconds` have passed since
 * the last fire(). Only firing re-arms it, so a condition that's false doesn't reset it.
 * By default it's first ready `seconds` into the run; `armed: true` makes it ready at once.
 */
export function createCooldown(seconds: number, opts: { armed?: boolean } = {}) {
  let last = opts.armed ? -Infinity : 0;
  return {
    ready: (now: number) => now - last > seconds,
    fire: (now: number) => {
      last = now;
    },
  };
}
