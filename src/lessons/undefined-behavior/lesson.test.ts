import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { classifyCaption, defenceCaption, nullCaption, overflowCaption, stepText } from './captions';
import { FACTS } from './facts';
import lesson from './index';
import { OPENING } from './opening';
import { DEFENCES, POINTERS, rangeOf, WIDTHS, type IntType } from './ub';

describe('scenes', () => {
  it('every scene component carries its own key and none is shared', () => {
    const els = sceneElements('undefined-behavior');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('undefined-behavior')).toEqual([]);
  });

  it('each scene opens on a fixed, pure state', () => {
    expect(OPENING.scene).toBe('overflow');
    expect(OPENING.overflow).toEqual({ type: { width: 32, signed: true }, x: 2147483647, step: 1, note: null });
    expect(OPENING.pointer.address).toBe(0x1000);
    expect(OPENING.defence).toEqual({ id: 'none', x: 2147483647 });
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: at signed 32-bit MAX the columns read 1 and 0; the 8-bit strip has 256 cells, one differs (127), unsigned none; 32-bit wraps to -1 at width 8', () => {
    expect([FACTS.writtenAtMax, FACTS.assumedAtMax]).toEqual([1, 0]);
    expect([FACTS.wrapped32To8, FACTS.space8, FACTS.max8, FACTS.differing8, FACTS.differing8Unsigned]).toEqual([-1, 256, 127, 1, 0]);
    expect(lesson.tryThis[0]).toContain('the note says the value wraps to -1');
  });

  it('try-this 2: with p = 0x1000 both versions return 7', () => {
    expect(FACTS.nullAgree).toBe(7);
    expect(lesson.tryThis[1]).toContain('both versions return 7');
  });

  it('try-this 3: sorting only the first snippet scores 1 of 8', () => {
    expect([FACTS.firstOnlyRight, FACTS.total]).toEqual([1, 8]);
    expect(lesson.tryThis[2]).toContain('reads 1 of 8');
  });

  it('try-this 4: nothing returns 0, -fwrapv returns 1, and the sanitizer message names 2,147,483,647', () => {
    expect([FACTS.noneResult, FACTS.wrapvResult]).toEqual([0, 1]);
    expect(FACTS.sanitizer).toContain('2147483647 + 1');
    expect(lesson.tryThis[3]).toContain('"Nothing" returns 0');
  });
});

describe('the control cross product', () => {
  it('every width, type and boundary value gives a clean caption and a step text', () => {
    for (const width of WIDTHS) {
      for (const signed of [true, false]) {
        const t: IntType = { width, signed };
        for (const x of [rangeOf(t).min, rangeOf(t).max - 1, rangeOf(t).max]) {
          expect(expectCaption(overflowCaption(t, x, null))).not.toMatch(/NaN|\bnull\b|\[object/);
        }
        for (let s = 1; s <= 4; s++) expect(stepText(s, t)).toContain(' ');
      }
    }
  });

  it('every pointer, defence and board state gives a clean caption', () => {
    for (const p of POINTERS) expect(expectCaption(nullCaption(p.address))).not.toMatch(/NaN|\[object/);
    for (const d of DEFENCES) expect(expectCaption(defenceCaption(d.id))).not.toMatch(/NaN|\[object/);
    for (const state of [{ sorted: 0, checked: false, correct: 0 }, { sorted: 8, checked: true, correct: 8 }]) expect(expectCaption(classifyCaption(state, 8))).not.toMatch(/NaN|\[object/);
  });
});
