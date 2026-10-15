import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../../core/random';
import { mean } from '../../core/sim';
import { HEAD, LEVEL_CAP, SkipList, buildList, checkSkipList, expectedPointers, flipHeight, measureList, monteCarlo, pughCost, type Pos } from './model';

/** The oracle: a sorted array and binary search. */
function lowerBound(sorted: readonly number[], target: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

describe('against a sorted array with binary search', () => {
  it('200 seeds x 200 mixed inserts, deletes and searches: membership, predecessor, successor, sorted level 0, nested levels', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = mulberry32(seed);
      const coins = mulberry32(seed + 5000);
      const list = new SkipList();
      const ref: number[] = [];
      for (let op = 0; op < 200; op++) {
        const key = randInt(1, 80, rnd);
        const roll = rnd();
        const at = lowerBound(ref, key);
        const present = ref[at] === key;
        if (roll < 0.4) {
          if (!present) {
            list.insert(key, flipHeight(coins, 0.5).height);
            ref.splice(at, 0, key);
          }
        } else if (roll < 0.7) {
          expect(list.remove(key), `seed ${seed} op ${op}`).toBe(present);
          if (present) ref.splice(at, 1);
        } else {
          const s = list.search(key);
          expect(s.found, `seed ${seed} op ${op}`).toBe(present);
          expect(s.pred, `predecessor of ${key}`).toBe(at === 0 ? HEAD : ref[at - 1]);
          expect(s.candidate, `successor-or-self of ${key}`).toBe(at < ref.length ? ref[at] : null);
        }
        expect(list.keys()).toEqual(ref);
        expect(checkSkipList(list), `seed ${seed} op ${op}`).toEqual([]);
        expect(list.size).toBe(ref.length);
      }
    }
  });

  it('the recorded events replay to the same stopping node, and steps are moves plus drops with one drop per level below the top', () => {
    const rnd = mulberry32(11);
    const list = new SkipList();
    for (let k = 1; k <= 300; k++) list.insert(k * 3, flipHeight(rnd, 0.5).height);
    for (const target of [1, 3, 4, 450, 900, 901, 1000]) {
      const s = list.search(target);
      let cur: Pos = HEAD;
      let level = list.levels - 1;
      for (const e of s.events) {
        if (e.kind === 'move') {
          expect(e.from).toBe(cur);
          expect(e.level).toBe(level);
          expect(list.nextOf(cur, level)).toBe(e.to);
          cur = e.to;
        } else {
          expect(e.at).toBe(cur);
          expect(e.level).toBe(level);
          level--;
        }
      }
      expect(level).toBe(0);
      expect(cur).toBe(s.pred);
      expect(s.steps).toBe(s.moves + s.drops);
      expect(s.drops).toBe(list.levels - 1);
      expect(s.events).toHaveLength(s.steps);
      const keys = list.keys();
      expect(s.pred).toBe(lowerBound(keys, target) === 0 ? HEAD : keys[lowerBound(keys, target) - 1]);
    }
  });

  it('update[l] is the last node at level l below the target, by brute force over each level', () => {
    const rnd = mulberry32(21);
    const list = new SkipList();
    for (let k = 1; k <= 120; k++) list.insert(k * 2, flipHeight(rnd, 0.5).height);
    for (const target of [1, 2, 7, 100, 241, 500]) {
      const s = list.search(target);
      s.update.forEach((u, level) => {
        const below = list.levelKeys(level).filter((k) => k < target);
        expect(u).toBe(below.length ? below[below.length - 1] : HEAD);
      });
    }
  });
});

describe('heights from coin flips', () => {
  it('stay in 1..cap, and a rigged coin gives the extremes', () => {
    const tails = flipHeight(mulberry32(1), 0.5, 'tails');
    expect(tails).toEqual({ height: 1, flips: [false] });
    const heads = flipHeight(mulberry32(1), 0.5, 'heads');
    expect(heads.height).toBe(LEVEL_CAP);
    expect(heads.flips).toHaveLength(LEVEL_CAP - 1);
    expect(heads.flips.every(Boolean)).toBe(true);
    const rnd = mulberry32(3);
    for (let i = 0; i < 5000; i++) {
      const f = flipHeight(rnd, 0.5);
      expect(f.height).toBeGreaterThanOrEqual(1);
      expect(f.height).toBeLessThanOrEqual(LEVEL_CAP);
      expect(f.height).toBe(1 + f.flips.filter(Boolean).length);
    }
  });

  it.each([
    [0.5, 2],
    [0.25, 4 / 3],
  ])('over 20 seeds the mean tower height at p = %f is within 10%% of %f', (p, expected) => {
    expect(expectedPointers(p)).toBeCloseTo(expected, 10);
    const means = Array.from({ length: 20 }, (_, i) => measureList(1024, p, i + 1).pointersPerNode);
    expect(Math.abs(mean(means) - expected) / expected).toBeLessThan(0.1);
  });

  it('the level populations halve: about n / 2^l keys reach level l at p = 1/2 (n = 4096, five seeds)', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const rnd = mulberry32(seed);
      const list = new SkipList();
      for (let k = 1; k <= 4096; k++) list.insert(k, flipHeight(rnd, 0.5).height);
      for (let level = 0; level <= 5; level++) {
        const expected = 4096 / 2 ** level;
        expect(Math.abs(list.levelKeys(level).length - expected) / expected, `level ${level}`).toBeLessThan(0.15);
      }
    }
  });
});

describe('search cost against Pugh', () => {
  it.each([0.5, 0.25])('at n = 1,024 and p = %f the measured mean over 20 seeds is 0.7 to 1.05 times the formula', (p) => {
    const mc = monteCarlo(1024, p, 20);
    const ratio = mc.mean / pughCost(1024, p);
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(1.05);
    expect(mc.worst).toBeGreaterThanOrEqual(mc.mean);
  });

  it('the formula is log_{1/p}(n)/p + 1/(1-p): 22 at p = 1/2 and 21.33 at p = 1/4 for n = 1,024', () => {
    expect(pughCost(1024, 0.5)).toBeCloseTo(22, 10);
    expect(pughCost(1024, 0.25)).toBeCloseTo(5 / 0.25 + 1 / 0.75, 10);
  });

  it('cost grows slowly with n: doubling n adds a roughly constant amount, far from doubling the cost', () => {
    const costs = [64, 128, 256, 512, 1024, 2048].map((n) => monteCarlo(n, 0.5, 10).mean);
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i]).toBeGreaterThan(costs[i - 1] - 1);
      expect(costs[i] / costs[i - 1]).toBeLessThan(1.4);
    }
  });
});

describe('the broken variant: rigged all-tails coins', () => {
  it('make every tower height 1, so the structure is a linked list and a search costs the linked-list walk (1,024 keys)', () => {
    const entries = Array.from({ length: 1024 }, (_, i) => ({ key: i + 1, height: flipHeight(mulberry32(i), 0.5, 'tails').height }));
    const list = buildList(entries);
    expect(list.levels).toBe(1);
    expect(checkSkipList(list)).toEqual([]);
    const keys = list.keys();
    for (const target of [1, 2, 100, 512, 1024, 1025]) {
      const s = list.search(target);
      const linear = keys.filter((k) => k < target).length;
      expect(s.steps).toBe(linear);
      expect(s.drops).toBe(0);
    }
    const rnd = mulberry32(8);
    const sample = Array.from({ length: 200 }, () => list.search(1 + Math.floor(rnd() * 1024)).steps);
    expect(mean(sample)).toBeGreaterThan(400);
    const fair = measureList(1024, 0.5, 1).meanSteps;
    expect(mean(sample) / fair).toBeGreaterThan(15);
  });

  it('rigged all-heads makes one cap-tall tower per key: every key on every level', () => {
    const list = buildList(Array.from({ length: 8 }, (_, i) => ({ key: i + 1, height: flipHeight(mulberry32(i), 0.5, 'heads').height })));
    expect(list.levels).toBe(LEVEL_CAP);
    for (let l = 0; l < LEVEL_CAP; l++) expect(list.levelKeys(l)).toHaveLength(8);
  });

  it('the checker rejects a corrupted list: a level holding a key level 0 lacks, and an out-of-order level', () => {
    const list = buildList([{ key: 1, height: 2 }, { key: 2, height: 1 }, { key: 3, height: 2 }]);
    expect(checkSkipList(list)).toEqual([]);
    list['head'][1] = 99;
    expect(checkSkipList(list).join(' ')).toContain('holds a key that level 0 lacks');
    const swapped = buildList([{ key: 1, height: 1 }, { key: 2, height: 1 }]);
    swapped['head'][0] = 2;
    swapped['towers'].get(2)!.next[0] = 1;
    swapped['towers'].get(1)!.next[0] = null;
    expect(checkSkipList(swapped).join(' ')).toContain('not in ascending order');
  });
});

describe('replays and refusals', () => {
  it('the same seed builds the same towers and another seed builds different ones', () => {
    const build = (seed: number) => {
      const rnd = mulberry32(seed);
      const l = new SkipList();
      for (let k = 1; k <= 64; k++) l.insert(k, flipHeight(rnd, 0.5).height);
      return JSON.stringify(l.snapshot());
    };
    expect(build(5)).toBe(build(5));
    expect(build(5)).not.toBe(build(6));
  });

  it('a duplicate insert throws and a missing delete returns false', () => {
    const l = buildList([{ key: 4, height: 1 }]);
    expect(() => l.insert(4, 1)).toThrow('already in the list');
    expect(l.remove(9)).toBe(false);
    expect(l.size).toBe(1);
  });

  it('an insert changes only the pointers on its search path: the other towers are untouched', () => {
    const rnd = mulberry32(17);
    const l = new SkipList();
    for (let k = 1; k <= 64; k++) l.insert(k * 2, flipHeight(rnd, 0.5).height);
    const before = l.snapshot();
    const s = l.search(65);
    const height = 3;
    l.insert(65, height);
    const after = l.snapshot();
    const changed = after.towers.filter((t) => {
      const old = before.towers.find((b) => b.key === t.key);
      return old && old.next.join() !== t.next.join();
    });
    const preds = new Set(s.update.slice(0, height).filter((u): u is number => u !== HEAD));
    for (const t of changed) expect(preds.has(t.key), `${t.key} changed but is not a predecessor`).toBe(true);
    expect(changed.length).toBeLessThanOrEqual(height);
  });
});
