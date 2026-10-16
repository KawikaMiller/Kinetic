import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { FACTS } from './facts';
import lesson from './index';
import { loopView, passView, ssaView } from './model';
import { DEFAULT_ORDER, INT_CHIPS, N_MAX, NO_LOOP_PASSES, OPENING, ORDER_PRESETS, xForType } from './opening';
import { loopCaption, passCaption } from './captions';
import { PASS_IDS, type LoopOptions, type PassId } from './passes';
import { aliasView, floatRow, reassocView } from './model';

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('compiler-optimisations');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('compiler-optimisations')).toEqual([]);
  });

  it('each scene opens on a fixed, pure state: the opening values are the documented defaults', () => {
    expect(OPENING.scene).toBe('ssa');
    expect(OPENING.ssa).toEqual({ branchTaken: true, selected: null });
    expect(OPENING.passes.order).toEqual(['fold', 'propagate', 'cse', 'dce', 'algebra']);
    expect([...OPENING.passes.enabled].sort()).toEqual([...PASS_IDS].sort());
    expect(OPENING.passes).toMatchObject({ fixedPoint: false, input: 5, step: 0 });
    expect(OPENING.loop).toMatchObject({ resultUsed: true, x: 3, n: 1000, options: NO_LOOP_PASSES });
    expect(OPENING.refusals.kind).toBe('alias');
    expect(OPENING.refusals.alias).toEqual({ same: false, promise: false });
    expect(OPENING.refusals.float).toEqual({ ty: 'f64', x: 5 });
    expect(OPENING.refusals.reassoc).toMatchObject({ a: 1e16, b: -1e16, c: 1, allow: false });
    expect(DEFAULT_ORDER).toEqual(OPENING.passes.order);
    expect(ORDER_PRESETS.every((p) => [...p.order].sort().join() === [...PASS_IDS].sort().join())).toBe(true);
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: the SSA snippet returns 3 with the branch taken, x3 is defined on line 8 and read on line 9, and not taken it returns 2', () => {
    const taken = ssaView(true);
    expect(taken.ssaResult).toBe(3);
    expect(taken.sourceResult).toBe(3);
    expect([FACTS.x3DefLine, FACTS.x3UseLine]).toEqual([8, 9]);
    expect(taken.listing.lines[7]).toBe('  x3 = phi [entry: x1], [then: x2]');
    expect(taken.listing.lines[8]).toBe('  y = add x3, 1');
    expect(ssaView(false).ssaResult).toBe(2);
    expect(lesson.tryThis[0]).toContain('both versions return 3');
  });

  it('try-this 2: fold changes 0 first, 2 after propagate; DCE first removes 1 and leaves 8; a good order to a fixed point leaves 4', () => {
    expect([FACTS.foldFirstFolds, FACTS.propagateFirstFolds, FACTS.dceFirstRemoved]).toEqual([0, 2, 1]);
    expect([FACTS.p1Static, FACTS.dceFirstStatic, FACTS.goodFixedStatic]).toEqual([9, 8, 4]);
    const good = passView(ORDER_PRESETS[3].order, OPENING.passes.enabled, true, 5);
    expect(good.pipeline.changedRounds).toBe(2);
    expect(lesson.tryThis[1]).toContain('fold changes 0 instructions in round 1');
  });

  it('try-this 3: 11, 9 and 7 instructions per iteration, 11,006 and 7,008 in all, 8 against 6 when the loop never runs, and the ignored result deletes the loop (2 left)', () => {
    expect([FACTS.loopBasePer, FACTS.loopInlinedPer, FACTS.loopHoistedPer]).toEqual([11, 9, 7]);
    expect([FACTS.loopBase, FACTS.loopHoisted]).toEqual([11006, 7008]);
    expect([FACTS.loopHoistedZeroTrip, FACTS.loopBaseZeroTrip]).toEqual([8, 6]);
    expect(FACTS.lieGoneExecuted).toBe(2);
    expect(lesson.tryThis[2]).toContain('11,006 instructions');
  });

  it('with the result printed, loop removal is refused (7,008 stay); with removal off, 5,005 stay', () => {
    expect(FACTS.usedBlocker).toContain('read after it');
    expect([FACTS.usedExecuted, FACTS.lieDceExecuted]).toEqual([7008, 5005]);
  });

  it('try-this 4: the compiler refuses without the promise, the promise cuts loads from 1 to 0, and a false promise returns 1 against 2', () => {
    expect(FACTS.aliasKeptRefusals).toBe(1);
    expect([FACTS.aliasBaseLoads, FACTS.aliasFastLoads, FACTS.aliasFastResult]).toEqual([1, 0, 1]);
    expect([FACTS.aliasWrongOriginal, FACTS.aliasWrongOptimised]).toEqual([2, 1]);
    expect(lesson.tryThis[3]).toContain('the optimised code 1');
  });

  it('try-this 5: Infinity * 0 is NaN, -3 * 0 is -0, ints fold, and the groupings give 1 and 0', () => {
    expect([FACTS.infinityTimesZero, FACTS.minusThreeTimesZero]).toEqual(['NaN', '-0']);
    expect(floatRow('i32', 5).agree).toBe(true);
    expect([FACTS.reassocLeft, FACTS.reassocRight]).toEqual(['1', '0']);
    expect(lesson.tryThis[4]).toContain('(a + b) + c is 1 while a + (b + c) is 0');
  });
});

describe('the control cross product', () => {
  const subsets = Array.from({ length: 32 }, (_, bits) => new Set<PassId>(PASS_IDS.filter((_, k) => (bits >> k) & 1)));

  it('every order preset, every subset of passes and both round modes returns the original value and a clean caption', () => {
    for (const preset of ORDER_PRESETS) {
      for (const enabled of subsets) {
        for (const fixedPoint of [false, true]) {
          const view = passView(preset.order, enabled, fixedPoint, OPENING.passes.input);
          expect(view.same).toBe(true);
          expect(expectCaption(passCaption(view, OPENING.passes.input))).not.toMatch(/NaN|undefined|null|Infinity/);
        }
      }
    }
  });

  it('all 16 loop-step combinations with the result used or ignored give a clean caption and agree with the original', () => {
    for (let bits = 0; bits < 16; bits++) {
      const options: LoopOptions = { inlining: !!(bits & 1), hoisting: !!(bits & 2), dce: !!(bits & 4), deleteLoops: !!(bits & 8) };
      for (const resultUsed of [true, false]) {
        for (const n of [0, 1, 1000, N_MAX]) {
          const view = loopView(options, resultUsed, 3, n);
          expect(view.same, JSON.stringify({ options, resultUsed, n })).toBe(true);
          expect(expectCaption(loopCaption(view, options, resultUsed, n))).not.toMatch(/NaN|undefined|null/);
        }
      }
    }
  });

  it('the type of x keeps a valid x: an integer survives a switch to int, a float falls back to the opening value, and every chip is valid for its type', () => {
    expect(xForType(-3, 'i32')).toBe(-3);
    expect(xForType(2.5, 'i32')).toBe(OPENING.refusals.float.x);
    expect(xForType(Infinity, 'i32')).toBe(OPENING.refusals.float.x);
    expect(xForType(NaN, 'i32')).toBe(OPENING.refusals.float.x);
    expect(xForType(2 ** 40, 'i32')).toBe(OPENING.refusals.float.x);
    expect(xForType(NaN, 'f64')).toBeNaN();
    for (const x of INT_CHIPS) expect(xForType(x, 'i32')).toBe(x);
  });

  it('the alias and reassociation views depend only on their visible controls', () => {
    for (const same of [false, true]) {
      for (const promise of [false, true]) {
        const v = aliasView(same, promise);
        expect(v.compared.same).toBe(!(same && promise));
      }
    }
    expect(reassocView(1e16, -1e16, 1).differ).toBe(true);
    expect(reassocView(0.5, 0.25, 0.125).differ).toBe(false);
  });
});

describe('hostile input', () => {
  it('the loop counter is capped so the interpreter answers at once, and even the cap runs in a blink', () => {
    const t = Date.now();
    expect(loopView(NO_LOOP_PASSES, true, 3, N_MAX).beforeRun.executed).toBe(11 * N_MAX + 6);
    expect(Date.now() - t).toBeLessThan(2000);
  });
});
