import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { curveFrames, deg, easingCaption, f2, lerpCaption, pt, raceCaption, T_STEPS } from './frames';
import { PRESETS, cssValue, ease, pointAt, solveT, xGaps, type Cubic } from './model';

const ARCH: Cubic = [[1, 1.5], [2.5, 8.5], [7.5, 8.5], [9, 1.5]];

describe('curve frames', () => {
  it('sweep t from 0 to 1 in even steps, each caption naming the real point', () => {
    const frames = curveFrames(ARCH);
    expect(frames).toHaveLength(T_STEPS + 1);
    frames.forEach((f, i) => {
      expect(f.t).toBe(i / T_STEPS);
      expect(text(f.say)).toContain(pt(pointAt(ARCH, f.t)));
    });
    expect(text(frames[0].say)).toContain(`starts exactly at P0 ${pt(ARCH[0])}`);
    expect(text(frames[T_STEPS].say)).toContain(`ends exactly at P3 ${pt(ARCH[3])}`);
  });
});

describe('easingCaption, every preset', () => {
  it('reports the solver\'s own t, method and progress at half time, and the real x gaps', () => {
    for (const p of PRESETS) {
      const c = text(easingCaption(p.e));
      const s = solveT(p.e, 0.5);
      const g = xGaps(p.e);
      expect(c).toContain(cssValue(p.e));
      expect(c).toContain(`t = ${f2(s.t)}`);
      expect(c).toContain(s.method === 'newton' ? "Newton's method" : 'bisection');
      expect(c).toContain(`${Math.round(ease(p.e, 0.5) * 100)}% of the way`);
      expect(c).toContain(`${f2(g.min)} to ${f2(g.max)} apart`);
    }
  });
});

describe('raceCaption', () => {
  const e = PRESETS[0].e;
  it('only says "same easing" when the measured gap is under a pixel', () => {
    expect(text(raceCaption(e, { started: true, frames: 80, maxGap: 0.04 }))).toContain('same easing');
    expect(text(raceCaption(e, { started: true, frames: 80, maxGap: 0.04 }))).toContain('at most 0.04 px apart');
    expect(text(raceCaption(e, { started: true, frames: 80, maxGap: 3.5 }))).not.toContain('same easing');
    expect(text(raceCaption(e, { started: false, frames: 0, maxGap: 0 }))).toContain("didn't start a CSS transition");
    expect(text(raceCaption(e, { started: true, frames: 0, maxGap: 0 }))).toContain('before a single frame');
  });
});

describe('lerpCaption', () => {
  it('350° → 10°: naive goes 340° the long way and reads 180° halfway; shortest turns 20° and reads 0°', () => {
    const c = text(lerpCaption(350, 10, 0.5));
    expect(c).toContain('340° the long way');
    expect(c).toContain('reads 180°');
    expect(c).toContain('turns only 20° and reads 0°');
  });
  it('10° → 350° is the long way too, in the other direction', () => {
    const c = text(lerpCaption(10, 350, 0.5));
    expect(c).toContain('340° the long way');
    expect(c).toContain('reads 0°');
  });
  it('agrees when plain numbers already take the short way', () => {
    expect(text(lerpCaption(0, 90, 0.5))).toContain('both lerps agree: 45°');
    expect(text(lerpCaption(90, 270, 0.5))).toContain('both lerps agree: 180°');
  });
  it('half a circle the other way: same 180°, opposite directions', () => {
    const c = text(lerpCaption(270, 90, 0.5));
    expect(c).toContain('exactly half a circle apart');
    expect(c).toContain('180° and 0°');
  });
  it('never prints 360°', () => {
    expect(deg(359.6)).toBe('0°');
    expect(deg(-0.2)).toBe('0°');
    for (let a = 0; a < 360; a += 7) for (const t of [0, 0.33, 0.5, 0.99, 1]) expect(text(lerpCaption(a, (a + 200) % 360, t))).not.toContain('360°');
  });
});
