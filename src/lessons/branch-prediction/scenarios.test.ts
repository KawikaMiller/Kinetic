import { describe, expect, it } from 'vitest';
import { missCount, run, twoBitStationaryAccuracy, type PredictorConfig } from './predictor';
import {
  BRANCHLESS_INSTRUCTIONS, DATA_COUNT, DEPTH_RANGE, ITER_INSTRUCTIONS, LAB_LENGTH, PATTERN_PRESETS, THRESHOLD, accuracyCurves, branchOutcomes,
  dataValues, labOutcomes, loopCost, speculation, stripAt, transitions,
} from './scenarios';

const two: PredictorConfig = { kind: 'two-bit', initialCounter: 2, historyBits: 2 };

describe('the sorted and unsorted data', () => {
  it('both orders hold the same 256 values in 0-255', () => {
    const s = dataValues('sorted');
    const u = dataValues('unsorted');
    expect(s).toHaveLength(DATA_COUNT);
    expect([...u].sort((a, b) => a - b)).toEqual(s);
    expect(Math.min(...u)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...u)).toBeLessThanOrEqual(255);
  });

  it('the sorted outcome stream has one transition; the unsorted one is near a coin flip', () => {
    const s = branchOutcomes(dataValues('sorted'));
    const u = branchOutcomes(dataValues('unsorted'));
    expect(transitions(s)).toBe(1);
    // independent count of the same thing, straight from the values
    expect(s.filter(Boolean).length).toBe(dataValues('sorted').filter((x) => x >= THRESHOLD).length);
    expect(u.filter(Boolean).length / u.length).toBeGreaterThan(0.4);
    expect(u.filter(Boolean).length / u.length).toBeLessThan(0.6);
  });

  it('the 2-bit counter misses at most 3 branches on 256 sorted values and about half on unsorted', () => {
    const sorted = missCount(run(two, branchOutcomes(dataValues('sorted'))));
    const unsorted = missCount(run(two, branchOutcomes(dataValues('unsorted'))));
    expect(sorted).toBeLessThanOrEqual(3);
    expect(unsorted).toBeGreaterThan(80);
    expect(unsorted).toBeLessThan(180);
  });

  it('cycles are instructions + misses x penalty from the recorded miss list', () => {
    for (const order of ['sorted', 'unsorted'] as const) {
      const steps = run(two, branchOutcomes(dataValues(order)));
      const misses = steps.filter((s) => s.guess !== s.taken).length;
      for (const penalty of [5, 15, 25]) {
        expect(loopCost(order, two, penalty, false).cycles).toBe(DATA_COUNT * ITER_INSTRUCTIONS + misses * penalty);
      }
    }
  });

  it('the branchless loop has no misses and costs the same for both orders and every predictor', () => {
    const costs = (['sorted', 'unsorted'] as const).flatMap((order) =>
      (['static-taken', 'one-bit', 'two-bit', 'two-level'] as const).map((kind) => loopCost(order, { ...two, kind }, 25, true)),
    );
    expect(new Set(costs.map((c) => c.cycles))).toEqual(new Set([DATA_COUNT * BRANCHLESS_INSTRUCTIONS]));
    expect(costs.every((c) => c.misses === 0)).toBe(true);
  });

  it('branchless beats branchy on unsorted data at the default penalty and loses on sorted data', () => {
    expect(loopCost('unsorted', two, 15, false).cycles).toBeGreaterThan(loopCost('unsorted', two, 15, true).cycles);
    expect(loopCost('sorted', two, 15, false).cycles).toBeLessThan(loopCost('sorted', two, 15, true).cycles);
  });
});

describe('the lab streams', () => {
  it('every stream is 64 branches; a pattern repeats its 16 cells four times', () => {
    for (const source of [
      { kind: 'pattern', pattern: PATTERN_PRESETS[1].pattern },
      { kind: 'random', p: 0.7 },
      { kind: 'sorted' },
      { kind: 'unsorted' },
    ] as const) {
      expect(labOutcomes(source)).toHaveLength(LAB_LENGTH);
    }
    const loop = labOutcomes({ kind: 'pattern', pattern: PATTERN_PRESETS[2].pattern });
    expect(loop.slice(0, 4)).toEqual([true, true, true, false]);
    expect(loop.slice(16, 20)).toEqual(loop.slice(0, 4));
  });

  it('the sorted lab stream keeps its single transition and the unsorted one does not', () => {
    expect(transitions(labOutcomes({ kind: 'sorted' }))).toBe(1);
    expect(transitions(labOutcomes({ kind: 'unsorted' }))).toBeGreaterThan(10);
  });

  it('the random stream is reproducible and its taken share follows p', () => {
    expect(labOutcomes({ kind: 'random', p: 0.7 })).toEqual(labOutcomes({ kind: 'random', p: 0.7 }));
    expect(labOutcomes({ kind: 'random', p: 0 }).some(Boolean)).toBe(false);
    expect(labOutcomes({ kind: 'random', p: 1 }).every(Boolean)).toBe(true);
  });
});

describe('the accuracy curves', () => {
  const curves = accuracyCurves(2, 2);
  const at = (kind: string, p: number) => curves.find((c) => c.kind === kind)!.points.find(([x]) => Math.abs(x - p) < 1e-9)![1];

  it('every curve covers p from 0 to 1 and stays between 0 and 1', () => {
    for (const c of curves) {
      expect(c.points[0][0]).toBe(0);
      expect(c.points[c.points.length - 1][0]).toBe(1);
      expect(c.points.every(([, y]) => y >= 0 && y <= 1)).toBe(true);
    }
  });

  it('the static predictors are exact at the ends and the 2-bit curve follows the birth-death chain', () => {
    expect(at('static-taken', 1)).toBe(1);
    expect(at('static-not-taken', 0)).toBe(1);
    expect(at('static-taken', 0)).toBe(0);
    for (const p of [0.3, 0.5, 0.7, 0.9]) {
      expect(Math.abs(at('two-bit', p) - twoBitStationaryAccuracy(p))).toBeLessThan(0.04);
    }
  });

  it('on independent outcomes the 2-bit counter is at least as good as the 1-bit predictor at p = 0.9 and 0.1', () => {
    expect(at('two-bit', 0.9)).toBeGreaterThan(at('one-bit', 0.9));
    expect(at('two-bit', 0.1)).toBeGreaterThan(at('one-bit', 0.1));
  });

  it('the curve is reproducible', () => {
    expect(accuracyCurves(2, 2)).toEqual(curves);
  });
});

describe('the speculation strip', () => {
  it('a right guess loses nothing; a wrong one flushes depth - 1 instructions and loses as many cycles', () => {
    for (let depth = DEPTH_RANGE.min; depth <= DEPTH_RANGE.max; depth++) {
      expect(speculation(depth, true)).toMatchObject({ flushed: 0, lostCycles: 0, inFlightYounger: depth - 1 });
      expect(speculation(depth, false)).toMatchObject({ flushed: depth - 1, lostCycles: depth - 1 });
    }
    // the Tier 2 pipeline: a branch resolved in EX (stage 3) throws away 2 instructions
    expect(speculation(3, false).flushed).toBe(2);
  });

  it('the strip at resolution holds the branch in the last stage and depth - 1 younger instructions behind it', () => {
    for (const depth of [2, 3, 8, 16]) {
      const f = stripAt(depth, false, depth);
      expect(f.slots[depth - 1]).toEqual({ age: 0, kind: 'branch' });
      expect(f.slots.filter((s) => s.kind === 'speculative')).toHaveLength(depth - 1);
      expect(stripAt(depth, false, depth + 1).slots.filter((s) => s.kind === 'flushed')).toHaveLength(depth - 1);
      expect(stripAt(depth, true, depth + 1).slots.filter((s) => s.kind === 'kept')).toHaveLength(depth - 1);
    }
  });

  it('the first cycle holds the branch alone', () => {
    const f = stripAt(5, false, 1);
    expect(f.slots.map((s) => s.kind)).toEqual(['branch', 'empty', 'empty', 'empty', 'empty']);
  });
});
