import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { assignRooms, mergeIntervals, selectActivities, sweepOverlap, type Interval } from './intervals';
import { bruteCrossings, crossingKey, sweepCrossings, type HSeg, type SegBug, type VSeg } from './segments';

const GRID = 24;

/** Random intervals on an integer grid (identical, nested and touching ones are common), or on half-integers. */
function randomIntervals(seed: number, half = false): Interval[] {
  const rnd = mulberry32(seed);
  const n = 1 + Math.floor(rnd() * 10);
  const unit = half ? 0.5 : 1;
  const span = Math.floor(rnd() * 12) + 3;
  return Array.from({ length: n }, () => {
    const s = Math.floor(rnd() * span);
    const len = 1 + Math.floor(rnd() * Math.max(1, span / 2));
    return { start: s * unit, end: (s + len) * unit };
  });
}

/** Brute force: count the intervals containing each endpoint (half-open), O(n^2). */
function bruteMaxOverlap(iv: readonly Interval[]): number {
  let best = 0;
  for (const t of iv.flatMap((x) => [x.start, x.end])) best = Math.max(best, iv.filter((x) => x.start <= t && t < x.end).length);
  return best;
}

/** The union on an integer grid: mark every unit cell, read off runs. */
function gridUnion(iv: readonly Interval[]): [number, number][] {
  const cells = new Array<boolean>(GRID + 1).fill(false);
  for (const x of iv) for (let c = x.start; c < x.end; c++) cells[c] = true;
  const runs: [number, number][] = [];
  for (let c = 0; c <= GRID; c++) {
    if (cells[c] && (c === 0 || !cells[c - 1])) runs.push([c, c]);
    if (cells[c]) runs[runs.length - 1][1] = c + 1;
  }
  return runs;
}

describe('intervals against brute force', () => {
  it('max overlap from the sweep equals a brute-force count at every endpoint, on 500 seeded sets (identical, nested, touching, single)', () => {
    for (let seed = 0; seed < 500; seed++) {
      const iv = randomIntervals(seed, seed % 2 === 1);
      expect(sweepOverlap(iv, 'end-first').max, `seed ${seed}`).toBe(bruteMaxOverlap(iv));
    }
  });

  it('rooms by the heap greedy equal the maximum overlap, and no two meetings in one room overlap', () => {
    for (let seed = 0; seed < 500; seed++) {
      const iv = randomIntervals(seed, seed % 2 === 1);
      const { room, rooms } = assignRooms(iv);
      expect(rooms, `seed ${seed}`).toBe(bruteMaxOverlap(iv));
      for (let a = 0; a < iv.length; a++) {
        for (let b = a + 1; b < iv.length; b++) {
          if (room[a] === room[b]) expect(iv[a].end <= iv[b].start || iv[b].end <= iv[a].start, `seed ${seed}`).toBe(true);
        }
      }
    }
  });

  it('merged intervals equal the union read off an integer grid, on 500 seeded sets; touching intervals join', () => {
    for (let seed = 0; seed < 500; seed++) {
      const iv = randomIntervals(seed);
      expect(mergeIntervals(iv).merged.map((m) => [m.start, m.end]), `seed ${seed}`).toEqual(gridUnion(iv));
    }
    expect(mergeIntervals([{ start: 1, end: 3 }, { start: 3, end: 5 }]).merged).toEqual([{ start: 1, end: 5 }]);
  });

  it('the tie rule: end-first gives 2 and start-first 3 on [9,10), [10,11), [9.5,10.5)', () => {
    const iv = [{ start: 9, end: 10 }, { start: 10, end: 11 }, { start: 9.5, end: 10.5 }];
    expect(sweepOverlap(iv, 'end-first').max).toBe(2);
    expect(sweepOverlap(iv, 'start-first').max).toBe(3);
    const bad = sweepOverlap(iv, 'start-first').events.filter((e) => e.over);
    expect(bad.length).toBeGreaterThan(0);
    expect(sweepOverlap(iv, 'end-first').events.some((e) => e.over)).toBe(false);
  });

  it('the two rules differ exactly when some time has (intervals containing it) + (intervals ending there) above the true maximum', () => {
    let differing = 0;
    for (let seed = 0; seed < 500; seed++) {
      const iv = randomIntervals(seed, seed % 2 === 1);
      const times = iv.flatMap((x) => [x.start, x.end]);
      const truth = (t: number) => iv.filter((x) => x.start <= t && t < x.end).length;
      const endsAt = (t: number) => iv.filter((x) => x.end === t).length;
      const predicate = Math.max(...times.map((t) => truth(t) + endsAt(t))) > bruteMaxOverlap(iv);
      const differ = sweepOverlap(iv, 'start-first').max !== sweepOverlap(iv, 'end-first').max;
      expect(differ, `seed ${seed}`).toBe(predicate);
      if (differ) differing++;
    }
    expect(differing).toBeGreaterThan(20);
  });

  it('the single-interval and identical-interval cases', () => {
    expect(sweepOverlap([{ start: 2, end: 5 }], 'end-first').max).toBe(1);
    const same = [0, 1, 2].map(() => ({ start: 2, end: 6 }));
    expect(sweepOverlap(same, 'end-first').max).toBe(3);
    expect(assignRooms(same).rooms).toBe(3);
    expect(mergeIntervals(same).merged).toEqual([{ start: 2, end: 6 }]);
  });

  it('activity selection by earliest end picks a maximum set: it matches a brute force over every subset, for 300 seeded sets of up to 8', () => {
    for (let seed = 0; seed < 300; seed++) {
      const iv = randomIntervals(seed).slice(0, 8);
      let best = 0;
      for (let mask = 0; mask < 1 << iv.length; mask++) {
        const pick = iv.filter((_, i) => mask & (1 << i)).sort((a, b) => a.start - b.start);
        if (pick.every((x, i) => i === 0 || pick[i - 1].end <= x.start)) best = Math.max(best, pick.length);
      }
      expect(selectActivities(iv).chosen.length, `seed ${seed}`).toBe(best);
    }
  });

  it('BROKEN: start-before-end ordering overcounts rooms on the lowest failing seed', () => {
    let lowest = -1;
    for (let seed = 0; seed < 500 && lowest < 0; seed++) {
      const iv = randomIntervals(seed);
      if (sweepOverlap(iv, 'start-first').max !== bruteMaxOverlap(iv)) lowest = seed;
    }
    expect(lowest).toBe(BROKEN_ROOMS_SEED);
  });
});

const BROKEN_ROOMS_SEED = 0;

/** Integer segments on a small grid, with touching endpoints and T-junctions common. */
function randomSegments(seed: number, big = false): { hs: HSeg[]; vs: VSeg[] } {
  const rnd = mulberry32(seed);
  const size = big ? 200 : 8;
  const nh = 1 + Math.floor(rnd() * (big ? 64 : 8));
  const nv = 1 + Math.floor(rnd() * (big ? 64 : 8));
  const span = big ? 12 : 4;
  const hs = Array.from({ length: nh }, () => {
    const x0 = Math.floor(rnd() * size);
    return { y: Math.floor(rnd() * size), x0, x1: x0 + Math.floor(rnd() * span) };
  });
  const vs = Array.from({ length: nv }, () => {
    const y0 = Math.floor(rnd() * size);
    return { x: Math.floor(rnd() * size), y0, y1: y0 + Math.floor(rnd() * span) };
  });
  return { hs, vs };
}

const keys = (cs: { h: number; v: number }[]) => cs.map(crossingKey).sort();

describe('segments against brute force', () => {
  it('the sweep finds exactly the (horizontal, vertical) crossings a brute-force check finds, on 500 seeded sets (closed: touching counts)', () => {
    for (let seed = 0; seed < 500; seed++) {
      const { hs, vs } = randomSegments(seed);
      expect(keys(sweepCrossings(hs, vs).crossings), `seed ${seed}`).toEqual(keys(bruteCrossings(hs, vs).crossings));
    }
  });

  it('a T-junction and an end-to-end touch both count', () => {
    expect(sweepCrossings([{ y: 2, x0: 0, x1: 4 }], [{ x: 4, y0: 2, y1: 5 }]).crossings).toHaveLength(1);
    expect(sweepCrossings([{ y: 2, x0: 0, x1: 4 }], [{ x: 2, y0: 2, y1: 2 }]).crossings).toHaveLength(1);
    expect(sweepCrossings([{ y: 2, x0: 0, x1: 4 }], [{ x: 5, y0: 0, y1: 5 }]).crossings).toHaveLength(0);
  });

  it('comparisons recorded for both on small and large inputs: the sweep loses on 8 by 8 and wins when the inputs are big and sparse', () => {
    let smallSweep = 0;
    let smallBrute = 0;
    for (let seed = 0; seed < 50; seed++) {
      const { hs, vs } = randomSegments(seed);
      smallSweep += sweepCrossings(hs, vs).comparisons;
      smallBrute += bruteCrossings(hs, vs).comparisons;
    }
    expect(smallSweep).toBeGreaterThan(0);
    expect(smallBrute).toBeGreaterThan(0);
    let bigSweep = 0;
    let bigBrute = 0;
    for (let seed = 0; seed < 20; seed++) {
      const { hs, vs } = randomSegments(seed, true);
      bigSweep += sweepCrossings(hs, vs).comparisons;
      bigBrute += bruteCrossings(hs, vs).comparisons;
    }
    expect(bigSweep).toBeLessThan(bigBrute);
  });

  const lowestFailing = (bug: SegBug) => {
    for (let seed = 0; seed < 500; seed++) {
      const { hs, vs } = randomSegments(seed);
      if (keys(sweepCrossings(hs, vs, bug).crossings).join() !== keys(bruteCrossings(hs, vs).crossings).join()) return seed;
    }
    return -1;
  };

  it('BROKEN: never removing an ended horizontal reports false crossings on the lowest failing seed', () => {
    expect(lowestFailing('no-remove')).toBe(BROKEN_SEG_SEEDS['no-remove']);
  });

  it('BROKEN: querying before inserting at the same x misses crossings on the lowest failing seed', () => {
    expect(lowestFailing('query-first')).toBe(BROKEN_SEG_SEEDS['query-first']);
  });
});

const BROKEN_SEG_SEEDS = { 'no-remove': 0, 'query-first': 2 };
