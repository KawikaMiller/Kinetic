import { describe, expect, it } from 'vitest';
import { LEVELS, levelById } from './latencyLadder';

describe('the steps between levels', () => {
  it('is 3 to 5× per step inside the chip, then about 500× from RAM to an SSD', () => {
    const chip = ['reg', 'l1', 'l2', 'l3', 'ram'];
    for (let i = 1; i < chip.length; i++) {
      const step = levelById(chip[i]).ns / levelById(chip[i - 1]).ns;
      expect(step).toBeGreaterThanOrEqual(3);
      expect(step).toBeLessThanOrEqual(5);
    }
    expect(levelById('nvme').ns / levelById('ram').ns).toBe(500);
  });
});

describe('latency numbers', () => {
  it('every figure sits inside its documented range', () => {
    for (const l of LEVELS) {
      expect(l.ns, l.name).toBeGreaterThanOrEqual(l.range[0]);
      expect(l.ns, l.name).toBeLessThanOrEqual(l.range[1]);
    }
  });

  it('matches the ranges the lessons are held to', () => {
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

  it('every id is unique and looks up to its own level', () => {
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
    for (const l of LEVELS) expect(levelById(l.id)).toBe(l);
  });
});
