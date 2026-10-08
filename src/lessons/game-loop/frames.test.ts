import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { capCaption, catchUpCaption, costCaption, DT_LABEL, machinesCaption, modeCaption, spiralCaption, tunnelCaption } from './frames';
import lesson from './index';
import { DT, HIT_HALF, MAX_FRAME, SAFETY_STEPS, START, WORLD, advanceFrame, createLoop, type LoopMode } from './sim';

describe('captions', () => {
  it('every mode caption names its own loop, and fixed ones the real step', () => {
    expect(text(modeCaption('variable'))).toContain('velocity × that frame\'s time');
    for (const m of ['fixed', 'interpolated'] as LoopMode[]) expect(text(modeCaption(m))).toContain(DT_LABEL);
    expect(DT_LABEL).toBe(`1/60 s (${(DT * 1000).toFixed(1)} ms)`);
  });

  it('the fixed-step caption\'s "5 units" is |vx| × DT', () => {
    expect(Math.abs(START.vx) * DT).toBeCloseTo(5, 12);
    expect(text(modeCaption('fixed'))).toContain('(5 units across');
  });

  it('tunnel and catch-up captions print the measured numbers', () => {
    expect(text(tunnelCaption(0.25, 75))).toContain('One 250 ms frame moved the ball 75 units');
    expect(text(tunnelCaption(0.25, 75))).toContain(`the ${2 * HIT_HALF}-unit zone`);
    expect(text(catchUpCaption(0.266, 15, 0.016))).toContain('ran 15 updates');
    expect(text(catchUpCaption(0.266, 15, 0.016))).toContain(`The ${MAX_FRAME * 1000} ms cap dropped the other 16 ms`);
    expect(text(catchUpCaption(0.1, 6, 0))).not.toContain('cap dropped');
    expect(text(spiralCaption())).toContain(`stops at ${SAFETY_STEPS} per frame`);
  });

  it('the two-machines caption starts with a capital and promises equality only for fixed steps', () => {
    expect(text(machinesCaption('fixed'))).toMatch(/^Fixed step: .*match at every step/);
    expect(text(machinesCaption('interpolated'))).toMatch(/^Fixed step \+ interpolation: /);
    expect(text(machinesCaption('variable'))).not.toContain('match at every step');
  });
});

describe('the quiz\'s numbers come from the model', () => {
  it('Q2: 40 ms + 5 ms carried → 2 updates and 11.7 ms left', () => {
    const s = createLoop();
    s.acc = 0.005;
    const r = advanceFrame(s, 0.04, 'fixed', true);
    expect(r.steps).toBe(2);
    expect((s.acc * 1000).toFixed(1)).toBe('11.7');
  });

  it('Q5: a step moves 5 units, and the contact zone is 8 + 2 on each side = 20', () => {
    expect(Math.round(Math.abs(START.vx) * DT)).toBe(5);
    expect(WORLD.r).toBe(8);
    expect(WORLD.wallHalf).toBe(2);
    expect(2 * HIT_HALF).toBe(20);
    expect(Math.abs(START.vx)).toBe(300);
    const whys = lesson.quiz.map((q) => q.why).join(' ');
    expect(whys).toContain('300 units/s');
    expect(whys).toContain('250 ms');
    expect(MAX_FRAME).toBe(0.25);
  });
});

describe('setting captions replace the ones they make untrue', () => {
  it('the cap toggle and the cost slider say what the new setting does', () => {
    expect(text(capCaption(true))).toContain('slows down instead of spiralling');
    expect(text(capCaption(false))).toContain(`stops at ${SAFETY_STEPS} per frame`);
    expect(text(costCaption(0))).toContain('free again');
    expect(text(costCaption(16))).toContain('less than the');
    expect(text(costCaption(17))).toContain('more than the');
    expect(16).toBeLessThan(DT * 1000);
    expect(17).toBeGreaterThan(DT * 1000);
  });
});

