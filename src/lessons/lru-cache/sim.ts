import type { Rnd } from '../../core/random';

export type Policy = 'lru' | 'fifo' | 'lfu';
export const POLICIES: Policy[] = ['lru', 'fifo', 'lfu'];
export const POLICY_NAMES: Record<Policy, string> = { lru: 'LRU', fifo: 'FIFO', lfu: 'LFU' };
export const VICTIM: Record<Policy, string> = {
  lru: 'least recently used',
  fifo: 'oldest arrival, even if it is hot',
  lfu: 'least frequently used',
};

export const KEYS = [
  { id: 'A', emoji: '🍕' },
  { id: 'B', emoji: '🍔' },
  { id: 'C', emoji: '🌮' },
  { id: 'D', emoji: '🍣' },
  { id: 'E', emoji: '🍩' },
  { id: 'F', emoji: '🥑' },
  { id: 'G', emoji: '🍪' },
  { id: 'H', emoji: '🧀' },
  { id: 'I', emoji: '🍇' },
  { id: 'J', emoji: '🥨' },
];
export const emojiOf = (id: string) => KEYS.find((k) => k.id === id)?.emoji ?? id;

export const HIT_MS = 1;
export const MISS_MS = 101;
/** The database trip alone: what every request costs with no cache in front. */
export const DB_MS = MISS_MS - HIT_MS;

export interface Entry {
  key: string;
  freq: number;
  lastUsed: number;
  inserted: number;
}

/** Display order: front (left) = safest, back (right) = next to be evicted. */
export function ordered(cache: Entry[], policy: Policy): Entry[] {
  const c = cache.map((e) => ({ ...e }));
  if (policy === 'lru') return c.sort((a, b) => b.lastUsed - a.lastUsed);
  if (policy === 'fifo') return c.sort((a, b) => b.inserted - a.inserted);
  return c.sort((a, b) => b.freq - a.freq || b.lastUsed - a.lastUsed);
}

/** Zipf-ish traffic: skew 0 = uniform, skew 1 = a few very hot keys. */
export function makeTraffic(n: number, skew: number, rnd: Rnd = Math.random): string[] {
  const s = skew * 2;
  const weights = KEYS.map((_, k) => 1 / Math.pow(k + 1, s));
  const total = weights.reduce((a, b) => a + b, 0);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    let r = rnd() * total;
    let k = 0;
    while (r > weights[k] && k < KEYS.length - 1) r -= weights[k++];
    out.push(KEYS[k].id);
  }
  return out;
}

export type Phase = 'idle' | 'lookup' | 'hit' | 'fetch' | 'insert';

export interface Step {
  phase: Phase;
  n: number;
  key: string | null;
  cache: Entry[];
  evicted: string | null;
  victim: string | null;
  hits: number;
  misses: number;
  log: ('hit' | 'miss')[];
}

/** Run the whole request sequence and record every phase of every request. */
export function simulate(seq: string[], cap: number, policy: Policy): Step[] {
  let cache: Entry[] = [];
  let hits = 0;
  let misses = 0;
  const log: ('hit' | 'miss')[] = [];
  const steps: Step[] = [];
  const snap = (phase: Phase, n: number, key: string | null, extra: Partial<Step> = {}) =>
    steps.push({
      phase, n, key, cache: ordered(cache, policy), evicted: null, victim: null,
      hits, misses, log: log.slice(), ...extra,
    });

  snap('idle', -1, null);
  seq.forEach((key, n) => {
    const t = n + 1;
    snap('lookup', n, key);
    const entry = cache.find((e) => e.key === key);
    if (entry) {
      hits++;
      log.push('hit');
      entry.freq++;
      entry.lastUsed = t;
      snap('hit', n, key);
      return;
    }
    misses++;
    log.push('miss');
    const full = cache.length >= cap;
    const victim = full ? ordered(cache, policy)[cache.length - 1].key : null;
    snap('fetch', n, key, { victim });
    if (victim) cache = cache.filter((e) => e.key !== victim);
    cache.push({ key, freq: 1, lastUsed: t, inserted: t });
    snap('insert', n, key, { evicted: victim });
  });
  return steps;
}

export const hitRatio = (hits: number, misses: number) => (hits + misses ? hits / (hits + misses) : 0);
