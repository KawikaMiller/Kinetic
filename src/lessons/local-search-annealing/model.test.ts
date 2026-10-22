import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { distanceMatrix, heldKarp, tourLength, twoOpt } from '../../core/tsp';
import {
  CELLS, CONVERGE_SQUARINGS, DEFAULT_SCHEDULE, DEFAULT_SEED, DEFAULT_START, GLOBAL_CELL, LANDSCAPE, LOCAL_CELL, QUENCH_SCHEDULE, QUENCH_T0, acceptProbability,
  bestCell, boltzmann, distributionAfter, exactHillClimbing, finalCell, formatProbability, occupancy, runBatch, runChain, runChainWith, steepestDescent, wilsonInterval,
} from './landscape';
import { ANNEAL, CROSSED_SQUARE, CROSSED_TOUR, annealedTwoOpt, compareOnMaps, crossedSquareMap, reversalDelta, reverseSegment, seededMap } from './tour';

/** Values found by running the generators with an independent tally, then pinned here with the inequalities kept. */
const DEFAULT_SUCCESSES_OF_1000 = 906;
const QUENCH_SUCCESSES_OF_1000 = 660;
const QUENCH_FAILURES_OF_200 = 70;
/** The lowest seed in 1 to 200 on which the quench ends away from the global minimum (start cell 0, ends at cell 4). */
const QUENCH_SEED = 7;
const NINE_POINT_MAPS = { meanPlain: 1.0048194, meanAnnealed: 1.0008616, optimalPlain: 84, optimalAnnealed: 93 };

describe('the landscape, by hand', () => {
  it('cell 4 is a local minimum (both neighbours 3), cell 11 the global minimum (0), cell 6 the ridge (5)', () => {
    expect(LANDSCAPE).toHaveLength(20);
    expect([LANDSCAPE[3], LANDSCAPE[4], LANDSCAPE[5]]).toEqual([3, 2, 3]);
    expect(Math.min(...LANDSCAPE)).toBe(0);
    expect(LANDSCAPE.indexOf(0)).toBe(GLOBAL_CELL);
    expect(LANDSCAPE[6]).toBe(5);
  });

  it('steepest descent from starts 0 to 6 ends at cell 4 and from 7 to 19 ends at cell 11: 13 of 20 = 65%', () => {
    // from 6 (value 5) the neighbours are 5 (3) and 7 (4), so 5 then 4; from 7 (value 4) the neighbours are 6 (5) and 8 (3): 8, 9, 10, 11
    const descend = (c: number): number => {
      const better = [c - 1, c + 1].filter((n) => n >= 0 && n < 20 && LANDSCAPE[n] < LANDSCAPE[c]).sort((a, b) => LANDSCAPE[a] - LANDSCAPE[b] || a - b);
      return better.length === 0 ? c : descend(better[0]);
    };
    const ends = LANDSCAPE.map((_, c) => descend(c));
    expect(ends.slice(0, 7).every((e) => e === 4)).toBe(true);
    expect(ends.slice(7).every((e) => e === 11)).toBe(true);
    expect(ends.filter((e) => e === 11).length).toBe(13);
    expect(exactHillClimbing()).toMatchObject({ successes: 13, total: 20, ends });
    expect(steepestDescent(6)).toBe(4);
    expect(steepestDescent(7)).toBe(11);
  });

  it('acceptance probabilities: delta 2 at T 1 is 0.1353, delta 1 at T 2 is 0.6065, delta 1 at T 0.05 is 2.06e-9, delta 1 at T 50 is 0.9802', () => {
    expect(acceptProbability(2, 1)).toBeCloseTo(0.1353, 4);
    expect(acceptProbability(1, 2)).toBeCloseTo(0.6065, 4);
    expect(acceptProbability(1, 0.05)).toBeCloseTo(2.06e-9, 11);
    expect(acceptProbability(1, 50)).toBeCloseTo(0.9802, 4);
    expect(acceptProbability(-3, 0.1)).toBe(1);
    expect(formatProbability(acceptProbability(1, 0.05))).toBe('2.1e-9');
    expect(formatProbability(acceptProbability(1, 50))).toBe('98.0%');
    expect(formatProbability(acceptProbability(2, 1))).toBe('13.5%');
  });

  it('Boltzmann at T = 1: Z = 2.42229 from the value counts, so P(cell 11) = 0.4128; at T = 2 it is 0.1996', () => {
    // the 20 values hold 0 once, 1 twice, 2 three times, 3 four times, 4 three times, 5 three times, 6 twice, 7 once and 8 once
    const counts: Record<number, number> = {};
    for (const v of LANDSCAPE) counts[v] = (counts[v] ?? 0) + 1;
    expect(counts).toEqual({ 0: 1, 1: 2, 2: 3, 3: 4, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1 });
    const partition = (t: number) => Object.entries(counts).reduce((s, [v, n]) => s + n * Math.exp(-Number(v) / t), 0);
    expect(partition(1)).toBeCloseTo(2.42229, 4);
    expect(1 / partition(1)).toBeCloseTo(0.4128, 4);
    expect(boltzmann(1)[GLOBAL_CELL]).toBeCloseTo(0.4128, 4);
    expect(1 / partition(2)).toBeCloseTo(0.1996, 4);
    expect(boltzmann(2)[GLOBAL_CELL]).toBeCloseTo(0.1996, 4);
  });
});

describe('the exact Metropolis chain', () => {
  it('iterating the transition matrix reaches the Boltzmann distribution to 1e-9 at T = 0.5, 1, 2 and 5', () => {
    for (const t of [0.5, 1, 2, 5]) {
      const stationary = distributionAfter(t, CONVERGE_SQUARINGS);
      const exact = boltzmann(t);
      for (let c = 0; c < CELLS; c++) expect(Math.abs(stationary[c] - exact[c]), `T=${t} cell ${c}`).toBeLessThan(1e-9);
    }
  });

  it('a long seeded run spends its time within 0.01 of the Boltzmann distribution at T = 2 and 5, and at T = 50 almost evenly', () => {
    for (const t of [2, 5]) {
      const seen = occupancy(11, t, 2_000_000);
      const exact = boltzmann(t);
      for (let c = 0; c < CELLS; c++) expect(Math.abs(seen[c] - exact[c]), `T=${t} cell ${c}`).toBeLessThan(0.01);
    }
    const flat = occupancy(3, 50, 200_000);
    expect(Math.max(...flat) - Math.min(...flat)).toBeLessThan(0.05);
  }, 180_000);
});

describe('one chain and the 1,000-seed batch', () => {
  it('at the default seed hill climbing from cell 2 ends at 4, annealing climbs the ridge to 11, and a quench is back at 4', () => {
    expect(DEFAULT_START).toBe(2);
    const hill = runChain(DEFAULT_SEED, DEFAULT_START, 'hill', DEFAULT_SCHEDULE);
    expect(finalCell(hill)).toBe(LOCAL_CELL);
    expect(hill.uphill).toBe(0);
    const anneal = runChain(DEFAULT_SEED, DEFAULT_START, 'anneal', DEFAULT_SCHEDULE);
    expect(finalCell(anneal)).toBe(GLOBAL_CELL);
    expect(anneal.uphill).toBeGreaterThan(0);
    expect(bestCell(anneal)).toBe(GLOBAL_CELL);
    const quench = runChain(DEFAULT_SEED, DEFAULT_START, 'anneal', { ...DEFAULT_SCHEDULE, t0: QUENCH_T0 });
    expect(finalCell(quench)).toBe(LOCAL_CELL);
  });

  it('hill climbing from cell 2 ends at cell 4 on every one of 200 seeds (the seed-free witness)', () => {
    for (let seed = 1; seed <= 200; seed++) expect(finalCell(runChain(seed, 2, 'hill', DEFAULT_SCHEDULE)), `seed ${seed}`).toBe(LOCAL_CELL);
  });

  it('a chain is a walk: each step moves by at most one cell, uphill steps are counted exactly, and the same seed repeats', () => {
    const c = runChain(9, 5, 'anneal', DEFAULT_SCHEDULE);
    let uphill = 0;
    for (let k = 1; k < c.cells.length; k++) {
      expect(Math.abs(c.cells[k] - c.cells[k - 1])).toBeLessThanOrEqual(1);
      if (LANDSCAPE[c.cells[k]] > LANDSCAPE[c.cells[k - 1]]) uphill++;
    }
    expect(c.uphill).toBe(uphill);
    expect(c.cells).toHaveLength(DEFAULT_SCHEDULE.steps + 1);
    expect(c.temps[0]).toBe(4);
    expect(c.temps[1]).toBeCloseTo(4 * 0.998, 12);
    expect(runChain(9, 5, 'anneal', DEFAULT_SCHEDULE)).toEqual(c);
  });

  it('over seeds 1 to 1,000 the default schedule reaches the global minimum at least 85% of the time and the quench at most 70%', () => {
    const d = runBatch(1, 1000, 'anneal', DEFAULT_SCHEDULE);
    const q = runBatch(1, 1000, 'anneal', QUENCH_SCHEDULE);
    expect(d.successes / 1000).toBeGreaterThanOrEqual(0.85);
    expect(q.successes / 1000).toBeLessThanOrEqual(0.7);
    expect(d.successes).toBe(DEFAULT_SUCCESSES_OF_1000);
    expect(q.successes).toBe(QUENCH_SUCCESSES_OF_1000);
    expect(d.ends.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('the quench fails for the stated reason (the starts in cell 4\'s basin; the ridge at 6 may go either way) and first at the pinned seed', () => {
    let failures = 0;
    let lowestFailing: number | null = null;
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = mulberry32(seed);
      const start = Math.floor(rnd() * CELLS);
      const end = finalCell(runChainWith(rnd, start, 'anneal', QUENCH_SCHEDULE));
      if (start <= 5) expect(end, `seed ${seed} start ${start}`).toBe(LOCAL_CELL);
      if (start >= 7) expect(end, `seed ${seed} start ${start}`).toBe(GLOBAL_CELL);
      if (end !== GLOBAL_CELL) {
        failures++;
        lowestFailing ??= seed;
      }
    }
    expect(failures).toBe(QUENCH_FAILURES_OF_200);
    expect(failures / 200).toBeLessThan(0.9);
    expect(lowestFailing).toBe(QUENCH_SEED);
    expect(QUENCH_SEED).toBeGreaterThan(0);
    expect(runBatch(1, 200, 'anneal', QUENCH_SCHEDULE).firstFailure).toMatchObject({ seed: QUENCH_SEED, start: 0, end: LOCAL_CELL });
  });

  it('the Wilson interval satisfies its own definition: each end sits z standard errors from the observed rate', () => {
    for (const [k, n] of [[906, 1000], [660, 1000], [50, 100]] as const) {
      const { low, high } = wilsonInterval(k, n);
      const p = k / n;
      expect(low).toBeLessThan(p);
      expect(high).toBeGreaterThan(p);
      for (const x of [low, high]) expect(Math.abs(p - x)).toBeCloseTo(1.96 * Math.sqrt((x * (1 - x)) / n), 6);
    }
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1 });
  });
});

describe('2-opt on the crossed square, by hand', () => {
  const dist = distanceMatrix(CROSSED_SQUARE);

  it('the crossed tour 0,2,1,3 is 2 sqrt 8 + 4 = 9.6569 and one move reversing the middle pair gives 8 with delta -1.6569', () => {
    expect(tourLength(dist, [...CROSSED_TOUR])).toBeCloseTo(2 * Math.sqrt(8) + 4, 9);
    expect(tourLength(dist, [...CROSSED_TOUR])).toBeCloseTo(9.6569, 4);
    const r = twoOpt(dist, CROSSED_TOUR);
    expect(r.moves).toHaveLength(1);
    expect(r.tour).toEqual([0, 1, 2, 3]);
    expect(r.length).toBe(8);
    expect(r.moves[0].delta).toBeCloseTo(4 - 2 * Math.sqrt(8), 9);
    expect(r.moves[0].delta).toBeCloseTo(-1.6569, 4);
    expect(reversalDelta(dist, [...CROSSED_TOUR], 0, 2)).toBeCloseTo(-1.6569, 4);
    expect(crossedSquareMap().start).toEqual([0, 2, 1, 3]);
  });

  it('on seeded maps the recomputed length equals the running total after every move, no improving move remains, and the tour is a permutation', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const n = 6 + (seed % 7);
      const map = seededMap(seed, n);
      const r = twoOpt(map.dist, map.start);
      let length = tourLength(map.dist, map.start);
      let tour = [...map.start];
      for (const move of r.moves) {
        length += move.delta;
        tour = reverseSegment(tour, move.i, move.j);
        expect(tourLength(map.dist, tour)).toBeCloseTo(length, 9);
      }
      expect(tour).toEqual(r.tour);
      for (let i = 0; i < n - 2; i++) {
        for (let j = i + 2; j < n; j++) {
          if (i === 0 && j === n - 1) continue;
          expect(reversalDelta(map.dist, r.tour, i, j)).toBeGreaterThanOrEqual(-1e-9);
        }
      }
      expect([...r.tour].sort((a, b) => a - b)).toEqual(map.start.map((_, k) => k));
    }
  });
});

describe('annealed 2-opt', () => {
  it('keeps its running length equal to a recomputation after every accepted reversal, ends in a valid tour, and repeats for a seed', () => {
    const map = seededMap(4, 10);
    const a = annealedTwoOpt(map.dist, map.start, 4);
    expect(a.running).toHaveLength(a.accepted);
    expect(a.accepted).toBeGreaterThan(0);
    expect(a.uphill).toBeGreaterThan(0);
    expect(a.uphill).toBeLessThanOrEqual(a.accepted);
    expect([...a.tour].sort((x, y) => x - y)).toEqual(map.start.map((_, k) => k));
    expect(a.length).toBeCloseTo(tourLength(map.dist, a.tour), 9);
    expect(a.length).toBeLessThanOrEqual(tourLength(map.dist, a.annealed) + 1e-9);
    expect(twoOpt(map.dist, a.annealed).length).toBeCloseTo(a.length, 9);
    expect(annealedTwoOpt(map.dist, map.start, 4)).toEqual(a);
    expect(ANNEAL.steps).toBe(3000);
  });

  it('recomputing the tour after each accepted reversal reproduces the running length', () => {
    const map = seededMap(8, 9);
    const a = annealedTwoOpt(map.dist, map.start, 8);
    expect(a.running[a.running.length - 1]).toBeCloseTo(tourLength(map.dist, a.annealed), 9);
  });

  it('over 100 seeded maps of 9 points both stay at or above the optimum, and annealing reaches it more often; Held-Karp matches all orders', () => {
    const b = compareOnMaps(9);
    expect(b.maps).toBe(100);
    expect(b.meanRatioPlain).toBeGreaterThanOrEqual(1);
    expect(b.meanRatioAnnealed).toBeGreaterThanOrEqual(1);
    expect(b.meanRatioPlain).toBeCloseTo(NINE_POINT_MAPS.meanPlain, 6);
    expect(b.meanRatioAnnealed).toBeCloseTo(NINE_POINT_MAPS.meanAnnealed, 6);
    expect(b.optimalPlain).toBe(NINE_POINT_MAPS.optimalPlain);
    expect(b.optimalAnnealed).toBe(NINE_POINT_MAPS.optimalAnnealed);
    expect(b.optimalAnnealed).toBeGreaterThanOrEqual(b.optimalPlain);
    const small = seededMap(2, 7);
    let best = Infinity;
    const permute = (prefix: number[], left: number[]) => {
      if (left.length === 0) best = Math.min(best, tourLength(small.dist, [0, ...prefix]));
      else left.forEach((v, i) => permute([...prefix, v], [...left.slice(0, i), ...left.slice(i + 1)]));
    };
    permute([], [1, 2, 3, 4, 5, 6]);
    expect(heldKarp(small.dist).length).toBeCloseTo(best, 9);
  });
});
