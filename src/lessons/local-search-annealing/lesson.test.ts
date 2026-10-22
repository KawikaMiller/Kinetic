import { describe, expect, it } from 'vitest';
import { heldKarp, tourLength, twoOptStep } from '../../core/tsp';
import lesson from './index';
import {
  DEFAULT_SCHEDULE, DEFAULT_SEED, DEFAULT_START, GLOBAL_CELL, LIMITS, LOCAL_CELL, QUENCH_SCHEDULE, SEED_WINDOW, exactHillClimbing, finalCell, runBatch, runChain,
} from './landscape';
import { acceptanceNote, batchCaption, chainCaption, tourCaption } from './text';
import { crossedSquareMap } from './tour';

describe('try-this entries, from the default state, as written', () => {
  const hill = runChain(DEFAULT_SEED, DEFAULT_START, 'hill', DEFAULT_SCHEDULE);
  const anneal = runChain(DEFAULT_SEED, DEFAULT_START, 'anneal', DEFAULT_SCHEDULE);

  it('try-this 1: Run with hill climbing from cell 2 ends at cell 4 (score 2), not cell 11 (score 0)', () => {
    expect(finalCell(hill)).toBe(4);
    const text = chainCaption(hill, DEFAULT_SCHEDULE.steps, 'hill', DEFAULT_SCHEDULE);
    expect(text).toContain('Ended at cell 4 (value 2); the global minimum is cell 11 (value 0)');
    expect(text).toContain('stuck in a local minimum');
    expect(lesson.tryThis[0]).toContain('cell 4 (score 2), not cell 11 (score 0)');
  });

  it('try-this 2: annealing with the default seed ends at cell 11 and the trail climbed over the ridge at cell 6', () => {
    expect(finalCell(anneal)).toBe(11);
    expect(anneal.cells.includes(6)).toBe(true);
    expect(chainCaption(anneal, DEFAULT_SCHEDULE.steps, 'anneal', DEFAULT_SCHEDULE)).toContain('It reached the global minimum.');
  });

  it('try-this 3: T0 = 0.05 ends back at cell 4 and the line under the plot shows e^-20 = 2.1e-9', () => {
    const quench = runChain(DEFAULT_SEED, DEFAULT_START, 'anneal', { ...DEFAULT_SCHEDULE, t0: LIMITS.t0.min });
    expect(finalCell(quench)).toBe(4);
    expect(LIMITS.t0.min).toBe(0.05);
    expect(acceptanceNote(0.05)).toBe('T = 0.05: a step that is 1 worse is accepted with probability e^-20 = 2.1e-9: this is hill climbing');
    expect(lesson.tryThis[2]).toContain('e^-20 = 2.1e-9');
  });

  it('try-this 4: 1,000 seeds give about 91% for the default schedule against the exact 65% for hill climbing', () => {
    const batch = runBatch(1, SEED_WINDOW, 'anneal', DEFAULT_SCHEDULE);
    const hillRate = exactHillClimbing();
    const text = batchCaption(batch, hillRate.successes, hillRate.total);
    expect(text).toContain(`${batch.successes} of 1000 runs ended at the global minimum: 90.6%`);
    expect(text).toContain('Exact hill climbing from the 20 starts: 13 of 20 (65.0%)');
    expect(text).toContain('holds here');
    expect(lesson.tryThis[3]).toContain('about 91% of the runs');
    expect(lesson.tryThis[3]).toContain('the exact 65% for hill climbing');
  });

  it('try-this 5: on the crossed square one Step takes the length from 9.66 to 8.00', () => {
    const map = crossedSquareMap();
    const move = twoOptStep(map.dist, map.start)!;
    expect(move.delta).toBeCloseTo(-1.6569, 4);
    const length = tourLength(map.dist, move.tour);
    expect(tourLength(map.dist, map.start).toFixed(2)).toBe('9.66');
    expect(length.toFixed(2)).toBe('8.00');
    const text = tourCaption({
      start: tourLength(map.dist, map.start), length, optimum: heldKarp(map.dist).length, lastMove: move, moves: 1,
      localOptimum: twoOptStep(map.dist, move.tour) === null, annealed: null,
    });
    expect(text).toBe('Move 1: reverse positions 1 to 2 (delta -1.66), so the length goes to 8.00 from a start of 9.66. No improving move remains: a 2-opt local optimum, which is the optimum.');
    expect(lesson.tryThis[4]).toContain('from 9.66 to 8.00');
  });
});

describe('manipulation: the page prints the cost of a bad temperature instead of refusing it', () => {
  it('manipulation 1: a temperature far too low says hill climbing, and one far too high says random walk', () => {
    expect(acceptanceNote(0.05)).toContain('this is hill climbing');
    expect(acceptanceNote(50)).toBe('T = 50: a step that is 1 worse is accepted with probability e^-0.02 = 98.0%: this is a random walk');
    expect(acceptanceNote(2)).toBe('T = 2: a step that is 1 worse is accepted with probability e^-0.5 = 60.7%');
  });

  it('manipulation 2: a quench from cell 2 is stuck at cell 4 on 200 seeds and the broken-mode batch names its lowest failing seed', () => {
    for (let seed = 1; seed <= 200; seed++) expect(finalCell(runChain(seed, 2, 'anneal', QUENCH_SCHEDULE))).toBe(LOCAL_CELL);
    const batch = runBatch(1, SEED_WINDOW, 'anneal', QUENCH_SCHEDULE);
    const text = batchCaption(batch, 13, 20);
    expect(text).toContain('fails here');
    expect(text).toContain(`the lowest failing seed is ${batch.firstFailure!.seed} (start cell 0, ends at cell 4)`);
    expect(text).toContain(`misses on ${SEED_WINDOW - batch.successes} of ${SEED_WINDOW} seeds`.replace('misses', 'It misses'));
    expect(GLOBAL_CELL).toBe(11);
  });
});

describe('controls at their extremes and one beyond', () => {
  it('every slider range gives a finite run at its minimum and maximum', () => {
    for (const steps of [LIMITS.steps.min, LIMITS.steps.max]) {
      for (const t0 of [LIMITS.t0.min, LIMITS.t0.max]) {
        for (const alpha of [LIMITS.alpha.min, LIMITS.alpha.max]) {
          for (const start of [LIMITS.start.min, LIMITS.start.max]) {
            const c = runChain(3, start, 'anneal', { t0, alpha, steps });
            expect(c.cells).toHaveLength(steps + 1);
            expect(c.cells.every((cell) => cell >= 0 && cell <= 19)).toBe(true);
          }
        }
      }
    }
  });
});
