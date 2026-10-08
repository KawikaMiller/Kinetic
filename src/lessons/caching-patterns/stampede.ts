// A hot key expiring under load, and many keys expiring together. Seeded and pure.
import { expSample, mulberry32 } from '../../core/random';

/** How long one load from the database takes, seconds. */
export const LOAD_TIME = 0.5;

export interface ExpiryRun {
  /** Requests that arrived while the entry was missing and the first load was still running. */
  misses: number;
  /** Database loads they caused. */
  loads: number;
  /** Requests that had to wait for someone else's load (coalescing only). */
  waited: number;
  /** When each load started, seconds after the expiry. */
  loadStarts: number[];
}

/**
 * The moment a hot key's entry expires. Requests arrive at `rate` per second. The first one to find
 * the entry gone starts a load, and until it finishes (LOAD_TIME later) every other arrival also finds
 * the entry missing: each starts its own load, unless `coalesce` makes them wait for the first.
 */
export function expireHotKey(rate: number, coalesce: boolean, seed: number): ExpiryRun {
  const rnd = mulberry32(seed);
  const first = expSample(1 / rate, rnd);
  const arrivals = [first];
  for (let t = first + expSample(1 / rate, rnd); t < first + LOAD_TIME; t += expSample(1 / rate, rnd)) arrivals.push(t);
  return {
    misses: arrivals.length,
    loads: coalesce ? 1 : arrivals.length,
    waited: coalesce ? arrivals.length - 1 : 0,
    loadStarts: coalesce ? [arrivals[0]] : arrivals,
  };
}

export interface SpreadRun {
  /** Database loads in each whole second, from 0. */
  perSecond: number[];
  peak: number;
  loads: number;
}

/**
 * `keys` entries all stored at second 0 with the same TTL, each refilled the moment it expires.
 * With jitter every TTL is multiplied by a random factor within plus or minus `jitter`.
 */
export function expireMany(keys: number, ttl: number, jitter: number, seed: number): SpreadRun {
  const rnd = mulberry32(seed);
  const horizon = Math.ceil(ttl * (1 + jitter)) + 1;
  const perSecond = Array.from({ length: horizon + 1 }, () => 0);
  for (let k = 0; k < keys; k++) {
    const expiry = ttl * (1 + jitter * (2 * rnd() - 1));
    perSecond[Math.floor(expiry)] += 1;
  }
  return { perSecond, peak: Math.max(...perSecond), loads: perSecond.reduce((a, b) => a + b, 0) };
}
