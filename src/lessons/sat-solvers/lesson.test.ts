import { describe, expect, it } from 'vitest';
import { startDpll, type DpllState } from '../../core/sat';
import lesson from './index';
import { DEFAULT_WINDOW_START, F2, H, backtrackWith, finishWith, pickBranch, runWindow, summariseWindow, tryDecide, tryStep, type Move } from './model';
import { searchCaption, statsLine, windowCaption } from './text';

const must = (m: Move): DpllState => {
  if (!m.ok) throw new Error(m.text);
  return m.state;
};

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: decide a = true and Step four times: b, c, d forced and clause 4 falsified', () => {
    let s = must(tryDecide(startDpll(F2), 1, true));
    for (let i = 0; i < 3; i++) s = must(tryStep(s));
    expect(s.trail.map((t) => t.var)).toEqual([1, 2, 3, 4]);
    expect(s.conflict).toBeNull();
    s = must(tryStep(s));
    expect(s.conflict).toBe(3);
    expect(searchCaption(s, 'correct')).toContain('Clause 4 (not d or not a) is falsified');
  });

  it('try-this 2: Backtrack, then Step twice: a is false, e forced true and b forced false', () => {
    let s = must(tryDecide(startDpll(F2), 1, true));
    for (let i = 0; i < 4; i++) s = must(tryStep(s));
    s = backtrackWith(s, 'correct');
    expect(s.values[1]).toBe(false);
    s = must(tryStep(must(tryStep(s))));
    expect(s.values[5]).toBe(true);
    expect(s.values[2]).toBe(false);
  });

  it('try-this 3: deciding b is refused because b is already forced', () => {
    let s = must(tryDecide(startDpll(F2), 1, true));
    for (let i = 0; i < 4; i++) s = must(tryStep(s));
    s = must(tryStep(must(tryStep(backtrackWith(s, 'correct')))));
    const r = tryDecide(s, 2, true);
    expect(r).toEqual({
      ok: false,
      text: 'b is already forced false by clause 6 (not e or not b), so a decision on it would repeat or contradict a forced value. Pick an unassigned variable.',
    });
  });

  it('try-this 4: decide c = true and Step: d is forced and the caption reports the model', () => {
    let s = must(tryDecide(startDpll(F2), 1, true));
    for (let i = 0; i < 4; i++) s = must(tryStep(s));
    s = must(tryStep(must(tryStep(backtrackWith(s, 'correct')))));
    s = must(tryStep(must(tryDecide(s, 3, true))));
    expect(s.outcome).toBe('sat');
    expect(searchCaption(s, 'correct')).toBe('SAT: a = F, b = F, c = T, d = T, e = T. 3 branches, 6 propagations, 1 conflict.');
    expect(lesson.tryThis[3]).toContain('a = F, b = F, c = T, d = T, e = T');
  });

  it('try-this 5: branching on y1 first ends with 2 branches against 106 for first-unassigned', () => {
    const mine = must(pickBranch(startDpll(H), 7));
    const first = finishWith(startDpll(H), 'first');
    expect(statsLine(mine.stats)).toBe('2 branches, 2 propagations, 2 conflicts');
    expect(first.stats.branches).toBe(106);
    expect(lesson.tryThis[4]).toContain('2 branches, against 106');
  });
});

describe('what the stage prints', () => {
  it('a broken run says what rule it broke and shows the model brute force found', () => {
    let s = must(tryDecide(startDpll(F2), 1, true));
    for (let i = 0; i < 4; i++) s = must(tryStep(s));
    const gave = backtrackWith(s, 'broken');
    expect(gave.outcome).toBe('unsat');
    const text = searchCaption(gave, 'broken');
    expect(text).toContain('brute force finds 3 models');
    expect(text).toContain('reports UNSAT but a model exists');
  });

  it('the window caption states the wrong count and the lowest seed in the broken mode', () => {
    const s = summariseWindow(runWindow(DEFAULT_WINDOW_START));
    expect(windowCaption(s, 'broken', DEFAULT_WINDOW_START)).toContain(`on ${s.brokenWrong} of 200 formulas (first at seed ${s.lowestBrokenSeed}`);
    expect(windowCaption(s, 'correct', DEFAULT_WINDOW_START)).toContain('right verdict on 200 of 200 formulas');
  });
});
