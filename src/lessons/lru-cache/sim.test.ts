import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { buildFrames } from './frames';
import { DB_MS, HIT_MS, KEYS, MISS_MS, POLICIES, hitRatio, makeTraffic, simulate, type Policy } from './sim';

/** Reference caches, written the textbook way, returning each request's outcome and eviction. */
function reference(seq: string[], cap: number, policy: Policy) {
  const out: { hit: boolean; evicted: string | null }[] = [];
  if (policy === 'lru') {
    const m = new Map<string, true>(); // insertion order = recency order
    for (const k of seq) {
      if (m.has(k)) {
        m.delete(k);
        m.set(k, true);
        out.push({ hit: true, evicted: null });
        continue;
      }
      let evicted: string | null = null;
      if (m.size >= cap) {
        evicted = m.keys().next().value!;
        m.delete(evicted);
      }
      m.set(k, true);
      out.push({ hit: false, evicted });
    }
    return { out, final: new Set(m.keys()) };
  }
  if (policy === 'fifo') {
    const q: string[] = [];
    for (const k of seq) {
      if (q.includes(k)) {
        out.push({ hit: true, evicted: null });
        continue;
      }
      const evicted = q.length >= cap ? q.shift()! : null;
      q.push(k);
      out.push({ hit: false, evicted });
    }
    return { out, final: new Set(q) };
  }
  // LFU: fewest uses goes; among equals, the one used longest ago.
  const uses = new Map<string, { n: number; last: number }>();
  seq.forEach((k, t) => {
    const e = uses.get(k);
    if (e) {
      e.n++;
      e.last = t;
      out.push({ hit: true, evicted: null });
      return;
    }
    let evicted: string | null = null;
    if (uses.size >= cap) {
      evicted = [...uses].sort(([, a], [, b]) => a.n - b.n || a.last - b.last)[0][0];
      uses.delete(evicted);
    }
    uses.set(k, { n: 1, last: t });
    out.push({ hit: false, evicted });
  });
  return { out, final: new Set(uses.keys()) };
}

/** simulate()'s outcome per request: the step after each lookup says hit or miss, and inserts name the evicted key. */
function outcomes(seq: string[], cap: number, policy: Policy) {
  const steps = simulate(seq, cap, policy);
  const out = seq.map((_, n) => {
    const hit = steps.some((s) => s.n === n && s.phase === 'hit');
    const insert = steps.find((s) => s.n === n && s.phase === 'insert');
    return { hit, evicted: insert?.evicted ?? null };
  });
  return { out, final: new Set(steps.at(-1)!.cache.map((e) => e.key)), steps };
}

const ratioOf = (seq: string[], cap: number, policy: Policy) => {
  const end = simulate(seq, cap, policy).at(-1)!;
  return hitRatio(end.hits, end.misses);
};

describe('eviction against reference caches', () => {
  it('LRU, FIFO and LFU match textbook versions on 300 seeded traffic runs, request by request', () => {
    const rand = mulberry32(5);
    for (let run = 0; run < 300; run++) {
      const seq = makeTraffic(30, rand(), rand);
      const cap = 2 + Math.floor(rand() * 7);
      for (const p of POLICIES) {
        const got = outcomes(seq, cap, p);
        const want = reference(seq, cap, p);
        expect(got.out, `${p} cap ${cap}`).toEqual(want.out);
        expect(got.final).toEqual(want.final);
      }
    }
  });

  it('the slot drawn at the back is the one evicted next', () => {
    const rand = mulberry32(6);
    for (const p of POLICIES) {
      const seq = makeTraffic(40, 0.5, rand);
      const steps = simulate(seq, 3, p);
      steps.forEach((s, i) => {
        if (s.phase === 'fetch' && s.victim) expect(steps[i - 1].cache.at(-1)!.key).toBe(s.victim);
      });
    }
  });

  it('FIFO evicts a hot key that LRU keeps', () => {
    const seq = ['A', 'B', 'C', 'A', 'A', 'A', 'D'];
    expect(outcomes(seq, 3, 'fifo').out.at(-1)!.evicted).toBe('A');
    expect(outcomes(seq, 3, 'lru').out.at(-1)!.evicted).toBe('B');
  });

  it('a loop one key bigger than the cache misses every time under LRU (the quiz)', () => {
    const seq = Array.from({ length: 25 }, (_, i) => 'ABCDE'[i % 5]);
    expect(ratioOf(seq, 4, 'lru')).toBe(0);
    expect(ratioOf(seq, 5, 'lru')).toBeGreaterThan(0.7); // one more slot and it all fits
  });
});

describe('the hit ratio goes up as traffic gets more skewed', () => {
  it('averaged over 300 seeded runs of the stage\'s 24 requests, for every policy', () => {
    for (const p of POLICIES) {
      const avg = (skew: number) => {
        const rand = mulberry32(42);
        let sum = 0;
        for (let i = 0; i < 300; i++) sum += ratioOf(makeTraffic(24, skew, rand), 4, p);
        return sum / 300;
      };
      const [uniform, some, hot] = [avg(0), avg(0.5), avg(1)];
      expect(some, p).toBeGreaterThan(uniform);
      expect(hot, p).toBeGreaterThan(some);
    }
  });

  it('usually, not always, on a single run (hence the disclosure that runs vary)', () => {
    const rand = mulberry32(9);
    let higher = 0;
    for (let i = 0; i < 300; i++) if (ratioOf(makeTraffic(24, 1, rand), 4, 'lru') > ratioOf(makeTraffic(24, 0, rand), 4, 'lru')) higher++;
    expect(higher / 300).toBeGreaterThan(0.9);
  });
});

describe('what the captions and stats claim', () => {
  it('a newcomer under LFU is last in line exactly when every other key has been used more', () => {
    const rand = mulberry32(12);
    const seq = makeTraffic(60, 0.7, rand);
    const steps = simulate(seq, 4, 'lfu');
    for (const s of steps) {
      if (s.phase !== 'insert' || s.cache.length < 2) continue;
      const last = s.cache.at(-1)!.key === s.key;
      const othersUsedMore = s.cache.filter((e) => e.key !== s.key).every((e) => e.freq > 1);
      expect(last).toBe(othersUsedMore);
    }
  });

  it('latencies: a miss is a hit plus the database trip, which is all a cache-less request pays', () => {
    expect(MISS_MS).toBe(HIT_MS + DB_MS);
    expect(DB_MS).toBe(100);
  });

  it('appending a request leaves every earlier frame in place', () => {
    const seq = makeTraffic(10, 0.6, mulberry32(3));
    const before = buildFrames(seq, 4, 'lru');
    const after = buildFrames([...seq, KEYS[0].id], 4, 'lru');
    before.slice(0, -1).forEach((f, i) => expect([after[i].phase, after[i].n, after[i].key]).toEqual([f.phase, f.n, f.key]));
  });

  it('traffic is reproducible with a seed and only uses the stage\'s keys', () => {
    expect(makeTraffic(20, 0.6, mulberry32(1))).toEqual(makeTraffic(20, 0.6, mulberry32(1)));
    const ids = new Set(KEYS.map((k) => k.id));
    expect(makeTraffic(200, 0.3, mulberry32(2)).every((k) => ids.has(k))).toBe(true);
  });
});
