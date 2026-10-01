// Randomness helpers. Every function takes an optional `rnd` so a lesson can pass a
// seeded generator (mulberry32) when the outcome must be reproducible.

/** A source of uniform floats in [0, 1): Math.random, or a seeded mulberry32(seed). */
export type Rnd = () => number;

/** Integer in [lo, hi], inclusive. */
export const randInt = (lo: number, hi: number, rnd: Rnd = Math.random) => lo + Math.floor(rnd() * (hi - lo + 1));

/** Float in [lo, hi). */
export const randRange = (lo: number, hi: number, rnd: Rnd = Math.random) => lo + rnd() * (hi - lo);

/** A random element. */
export const pick = <T>(xs: readonly T[], rnd: Rnd = Math.random): T => xs[Math.floor(rnd() * xs.length)];

/** A shuffled copy (Fisher–Yates). */
export function shuffle<T>(arr: readonly T[], rnd: Rnd = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Exponentially distributed sample with the given mean: inter-arrival times, service times. */
export const expSample = (mean: number, rnd: Rnd = Math.random) => -Math.log(1 - rnd()) * mean;

/** Pick an item with probability proportional to `weight(item)`. */
export function weightedPick<T>(items: readonly T[], weight: (t: T) => number, rnd: Rnd = Math.random): T {
  const total = items.reduce((sum, it) => sum + weight(it), 0);
  let r = rnd() * total;
  for (const it of items) {
    r -= weight(it);
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

/** Small, fast seeded PRNG. Same seed → same sequence. */
export function mulberry32(seed: number): Rnd {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random integer in [lo, hi] not already in `taken`, or null if every value is taken. */
export function freshInt(
  lo: number,
  hi: number,
  taken: ReadonlySet<number> | readonly number[],
  rnd: Rnd = Math.random,
): number | null {
  const used = taken instanceof Set ? taken : new Set(taken as readonly number[]);
  const free: number[] = [];
  for (let v = lo; v <= hi; v++) if (!used.has(v)) free.push(v);
  return free.length ? pick(free, rnd) : null;
}
