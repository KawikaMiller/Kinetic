import { describe, expect, it } from 'vitest';
import { mean, percentile } from '../../core/sim';
import { COLLISION_EXACT_LIMIT, choose, collisionProbability } from '../../core/stats';
import {
  DAYS, MONTH_DAYS, birthdayChance, cellDay, certainAt, chance, count, dayName, firstCollision, guaranteed, halfPoint, idCollision,
  pairs, runSizes, spread,
} from './model';

describe('pigeonhole', () => {
  it('is guaranteed exactly when n > m, and the fairest spread proves it', () => {
    for (let m = 1; m <= 24; m++) {
      for (let n = 1; n <= 30; n++) {
        const holes = spread(n, m);
        expect(holes.reduce((a, b) => a + b, 0)).toBe(n);
        // Even the spread that tries hardest to avoid sharing doubles up exactly when n > m.
        expect(holes.some((h) => h >= 2)).toBe(guaranteed(n, m));
      }
    }
    expect(certainAt(365)).toBe(366);
    expect(certainAt(366)).toBe(367);
  });
});

describe('birthdays', () => {
  it('matches the classic numbers: 50.73% at 23 and 99.92% at 70', () => {
    expect(birthdayChance(23)).toBeCloseTo(0.5073, 4);
    expect(birthdayChance(70)).toBeCloseTo(0.9992, 4);
    expect(birthdayChance(22)).toBeLessThan(0.5);
    expect(birthdayChance(366)).toBe(1);
    expect(pairs(23)).toBe(Number(choose(23, 2)));
    expect(pairs(23)).toBe(253);
  });

  it('a seeded run stops at the first repeat, and the mean over 10,000 runs is within 1 of 24.62', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { days, match } = firstCollision(seed);
      expect(new Set(days.slice(0, -1)).size).toBe(days.length - 1);
      expect(days[match]).toBe(days.at(-1));
      expect(days.every((d) => d >= 0 && d < DAYS)).toBe(true);
    }
    expect(Math.abs(mean(runSizes(1, 10_000)) - 24.62)).toBeLessThan(1);
    expect(firstCollision(7)).toEqual(firstCollision(7));
    const sorted = runSizes(1, 10_000).sort((a, b) => a - b);
    expect(percentile(sorted, 0.5)).toBeGreaterThanOrEqual(22);
    expect(percentile(sorted, 0.5)).toBeLessThanOrEqual(24);
  });

  it('maps calendar cells to the 365 days and back', () => {
    const days: number[] = [];
    MONTH_DAYS.forEach((_, m) => {
      for (let d = 0; d < 31; d++) {
        const day = cellDay(m, d);
        if (day !== null) days.push(day);
      }
    });
    expect(days).toEqual(Array.from({ length: DAYS }, (_, i) => i));
    expect(cellDay(1, 28)).toBeNull();
    expect(dayName(0)).toBe('Jan 1');
    expect(dayName(59)).toBe('Mar 1');
    expect(dayName(364)).toBe('Dec 31');
  });
});

describe('IDs', () => {
  it('puts the 32-bit coin flip within 1% of 77,163, and it really is 50% there', () => {
    expect(Math.abs(halfPoint(32) - 77_163) / 77_163).toBeLessThan(0.01);
    expect(idCollision(Math.round(halfPoint(32)), 32)).toBeCloseTo(0.5, 3);
    expect(Math.round(halfPoint(28))).toBe(19_291);
  });

  it('agrees with the exact product within 10⁻³ wherever the exact one is accurate', () => {
    for (const bits of [16, 20, 24, 32, 40]) {
      for (const n of [10, 100, 1_000, 10_000, 50_000, COLLISION_EXACT_LIMIT]) {
        const exact = collisionProbability(n, 2 ** bits);
        expect(Math.abs(idCollision(n, bits) - exact.p), `${bits} bits, n = ${n}`).toBeLessThan(1e-3);
      }
    }
  });

  it("core collisionProbability's exact/approx switch jumps by less than 10⁻³", () => {
    for (const space of [2 ** 32, 2 ** 36, 2 ** 40, 2 ** 48]) {
      const before = collisionProbability(COLLISION_EXACT_LIMIT, space);
      const after = collisionProbability(COLLISION_EXACT_LIMIT + 1, space);
      expect([before.method, after.method]).toEqual(['exact', 'approx']);
      expect(Math.abs(after.p - before.p)).toBeLessThan(1e-3);
    }
  });

  it('keeps tiny UUID chances instead of rounding them to 0', () => {
    const p = idCollision(1e9, 122);
    expect(p).toBeGreaterThan(0);
    expect(Math.abs(p / ((1e9 * (1e9 - 1)) / 2 / 2 ** 122) - 1)).toBeLessThan(1e-9);
    expect(chance(p)).toMatch(/^≈ 9\.4 × 10⁻²⁰$/);
  });

  it('backs the quiz numbers: 99% at 57 people, UUIDv4 coin flip near 2.7 × 10¹⁸', () => {
    expect(birthdayChance(57)).toBeGreaterThan(0.99);
    expect(birthdayChance(56)).toBeLessThan(0.99);
    expect(count(halfPoint(122))).toBe('2.7 × 10¹⁸');
    expect(idCollision(2 ** 31, 32)).toBeGreaterThan(0.99);
  });

  it('formats chances and counts', () => {
    expect(chance(birthdayChance(23))).toBe('50.73%');
    expect(chance(0.5)).toBe('50%');
    expect(chance(0.999999)).toBe('> 99.99%');
    expect(count(77_163)).toBe('77,163');
    expect(count(2.7e18)).toBe('2.7 × 10¹⁸');
  });
});
