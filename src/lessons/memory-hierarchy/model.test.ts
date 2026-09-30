import { describe, expect, it } from 'vitest';
import { LEVELS, effectiveNs, formatHuman, formatLatency, levelById, ratio } from './model';

describe('latency numbers', () => {
  it('every figure sits inside its documented range', () => {
    for (const l of LEVELS) {
      expect(l.ns, l.name).toBeGreaterThanOrEqual(l.range[0]);
      expect(l.ns, l.name).toBeLessThanOrEqual(l.range[1]);
    }
  });

  it('matches the ranges the lesson is held to', () => {
    const within = (id: string, lo: number, hi: number) => {
      const ns = levelById(id).ns;
      expect(ns, id).toBeGreaterThanOrEqual(lo);
      expect(ns, id).toBeLessThanOrEqual(hi);
    };
    within('l1', 0.5, 2);
    within('l2', 3, 5);
    within('l3', 10, 40);
    within('ram', 80, 120);
    within('nvme', 20_000, 100_000);
    within('hdd', 2_000_000, 10_000_000);
    within('dc', 250_000, 1_000_000);
    within('wan', 100_000_000, 150_000_000);
  });

  it('is sorted fastest first, and bigger storage is slower', () => {
    const ns = LEVELS.map((l) => l.ns);
    expect(ns).toEqual([...ns].sort((a, b) => a - b));
    const storage = LEVELS.filter((l) => l.capacity !== null);
    storage.slice(1).forEach((l, i) => expect(l.capacity!).toBeGreaterThan(storage[i].capacity!));
  });

  it('RAM is about 100 times slower than L1 (the misconception)', () => {
    expect(ratio(levelById('ram').ns, levelById('l1').ns)).toBeGreaterThanOrEqual(50);
    expect(ratio(levelById('ram').ns, levelById('l1').ns)).toBeLessThanOrEqual(200);
  });
});

describe('effective access time', () => {
  it('is hit·fast + (1 − hit)·slow', () => {
    expect(effectiveNs(1, 1, 100)).toBe(1);
    expect(effectiveNs(0, 1, 100)).toBe(100);
    expect(effectiveNs(0.95, 1, 100)).toBeCloseTo(5.95, 10);
    expect(effectiveNs(0.5, 10, 30)).toBe(20);
  });

  it('falls steadily as the hit rate rises', () => {
    let last = Infinity;
    for (let hit = 0; hit <= 1; hit += 0.05) {
      const t = effectiveNs(hit, 1, 100);
      expect(t).toBeLessThan(last);
      last = t;
    }
  });
});

describe('formatting', () => {
  it('prints real latencies in the right unit', () => {
    expect(formatLatency(0.3)).toBe('0.3 ns');
    expect(formatLatency(100)).toBe('100 ns');
    expect(formatLatency(50_000)).toBe('50 µs');
    expect(formatLatency(5_000_000)).toBe('5 ms');
    expect(formatLatency(150_000_000)).toBe('150 ms');
  });

  it('prints human time where 1 ns = 1 s', () => {
    expect(formatHuman(1)).toBe('1 s');
    expect(formatHuman(100)).toBe('1.7 min');
    expect(formatHuman(50_000)).toBe('14 hours');
    expect(formatHuman(150_000_000)).toBe('4.8 years');
  });
});
