import { describe, expect, it } from 'vitest';
import { expectCaption as text } from '../../core/testing/captions';
import { changeVerdict, moveCaption } from './frames';
import {
  KATA_START, STEPS, applyMove, changeCode, changeTests, coverage, runTests, shownCode, shownTests, undoMove, type ChangeKind, type KataState,
} from './model';

const good = (s: KataState) => applyMove(s, STEPS[s.step].moves.find((m) => m.good)!);
const playAll = () => {
  let s = KATA_START;
  while (s.step < STEPS.length) s = good(s);
  return s;
};

describe('the try-this prompts, from the default state', () => {
  it('good moves only: five red-to-green cycles of 2 moves each', () => {
    expect(playAll().cycles).toEqual([2, 2, 2, 2, 2]);
  });
  it('writing it all at once on step 1 flags four untested behaviours', () => {
    const s = applyMove(KATA_START, STEPS[0].moves.find((m) => m.kind === 'all-at-once')!);
    expect(coverage(shownCode(s), shownTests(s)).untested).toEqual(['number', 'Fizz', 'Buzz', 'FizzBuzz']);
  });
  it('tidying while red at the 3 → Fizz step turns the 1 test red', () => {
    let s = KATA_START;
    while (STEPS[s.step].tests.length < 2) s = good(s);
    const tidy = STEPS[s.step].moves.find((m) => m.kind === 'refactor-red')!;
    const after = applyMove(s, tidy);
    expect(runTests(shownCode(after), shownTests(after)).filter((r) => !r.passed).map((r) => r.id)).toEqual(['one']);
    expect(undoMove(after).bad).toBeNull();
    expect(shownCode(undoMove(after))).toBe(shownCode(s));
  });
  it('a bad move adds to the cycle in progress, and undo keeps the count', () => {
    const red = good(KATA_START);
    const wasted = applyMove(red, STEPS[1].moves.find((m) => !m.good)!);
    expect(wasted.inCycle).toBe(2);
    expect(good(undoMove(wasted)).cycles).toEqual([3]);
  });
});

describe('captions', () => {
  it('quote the live test tally and untested behaviours for every move', () => {
    for (const st of STEPS) {
      for (const m of st.moves) {
        const r = runTests(m.code, m.tests);
        const t = text(moveCaption(m, r, coverage(m.code, m.tests).untested));
        expect(t).toContain(r.length ? `${r.filter((x) => x.passed).length} of ${r.length} test` : 'no tests yet');
        expect(t.startsWith(m.good ? 'Good move.' : 'Costly move.')).toBe(true);
        for (const x of r.filter((y) => !y.passed)) expect(t).toContain(x.id);
        for (const b of coverage(m.code, m.tests).untested) expect(t).toContain(b);
      }
    }
  });
  it.each(['none', 'careless', 'careful'] as ChangeKind[])('change request verdicts follow the runs (%s)', (c) => {
    for (const side of ['tdd', 'after'] as const) {
      const v = changeCode(side, c);
      const t = text(changeVerdict(side, v, runTests(v, changeTests(side, c)), c));
      const caught = c === 'careless' && side === 'tdd';
      const slipped = c === 'careless' && side === 'after';
      expect(t.includes('caught')).toBe(caught);
      expect(t.includes('slipped by')).toBe(slipped);
    }
  });
});
