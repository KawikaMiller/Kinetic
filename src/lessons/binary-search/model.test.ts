import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import { buildFrames } from './frames';
import { binaryTrace, binaryWorstCase, linearChecks, makeArray, missingValue } from './model';

const RANDOM_ARRAYS = 300;

/** Every target worth trying: each value, each gap, and one past either end. */
function targetsFor(arr: number[]) {
  const out = new Set<number>([arr[0] - 1, arr[arr.length - 1] + 1]);
  for (let v = arr[0]; v <= arr[arr.length - 1]; v++) out.add(v);
  return [...out];
}

describe('makeArray / missingValue', () => {
  it('builds n distinct sorted values and a missing value inside the range', () => {
    const rnd = mulberry32(1);
    for (let k = 0; k < 100; k++) {
      const n = randInt(1, 40, rnd);
      const arr = makeArray(n, rnd);
      expect(arr).toHaveLength(n);
      expect(new Set(arr).size).toBe(n);
      expect(arr).toEqual([...arr].sort((a, b) => a - b));
      expect(arr).not.toContain(missingValue(arr, rnd));
    }
  });
});

describe('binary search', () => {
  it('finds exactly what linear search finds, for every target in and around 300 seeded arrays', () => {
    const rnd = mulberry32(2);
    for (let k = 0; k < RANDOM_ARRAYS; k++) {
      const arr = makeArray(randInt(1, 40, rnd), rnd);
      for (const target of targetsFor(arr)) {
        const steps = binaryTrace(arr, target);
        const last = steps[steps.length - 1];
        const found = last?.cmp === 0;
        expect(found).toBe(arr.includes(target));
        if (found) expect(arr[last.mid]).toBe(target);
        // every step keeps the target (if present) inside lo..hi
        const at = arr.indexOf(target);
        for (const s of steps) {
          if (at >= 0) {
            expect(s.lo).toBeLessThanOrEqual(at);
            expect(s.hi).toBeGreaterThanOrEqual(at);
          }
          expect(s.mid).toBe((s.lo + s.hi) >> 1);
        }
      }
    }
  });

  it('never needs more than ⌈log₂(n+1)⌉ checks, and some target needs exactly that many', () => {
    for (let n = 1; n <= 64; n++) {
      const arr = Array.from({ length: n }, (_, i) => i * 2 + 1);
      const counts = targetsFor(arr).map((t) => binaryTrace(arr, t).length);
      expect(Math.max(...counts)).toBe(binaryWorstCase(n));
    }
  });

  it('halves the range every step', () => {
    const arr = Array.from({ length: 1000 }, (_, i) => i);
    const steps = binaryTrace(arr, -1);
    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1].hi - steps[i - 1].lo + 1;
      const now = steps[i].hi - steps[i].lo + 1;
      expect(now).toBeLessThanOrEqual(Math.ceil(prev / 2));
    }
    expect(binaryWorstCase(1_000_000)).toBe(20);
  });
});

describe('linear search', () => {
  it('checks index+1 items when found and all n when missing', () => {
    const arr = [3, 7, 9, 12];
    expect(linearChecks(arr, 3)).toBe(1);
    expect(linearChecks(arr, 12)).toBe(4);
    expect(linearChecks(arr, 8)).toBe(4);
  });
});

describe('buildFrames', () => {
  it('ends with both counters at their true totals and one frame per comparison', () => {
    const rnd = mulberry32(3);
    for (let k = 0; k < 100; k++) {
      const arr = makeArray(randInt(1, 40, rnd), rnd);
      for (const target of [arr[randInt(0, arr.length - 1, rnd)], missingValue(arr, rnd)]) {
        const frames = buildFrames(arr, target);
        const bin = binaryTrace(arr, target).length;
        const lin = linearChecks(arr, target);
        expect(frames).toHaveLength(Math.max(bin, lin) + 1);
        expect(frames[0].bin.checks).toBe(0);
        expect(frames[0].lin.checks).toBe(0);
        const last = frames[frames.length - 1];
        expect(last.bin.checks).toBe(bin);
        expect(last.lin.checks).toBe(lin);
        expect(last.bin.found).toBe(arr.includes(target));
        expect(last.lin.found).toBe(arr.includes(target));
        expect(frames.every((f) => f.say !== undefined)).toBe(true);
      }
    }
  });
});
