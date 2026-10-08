import { describe, expect, it } from 'vitest';
import { buildLcpFrames, candidatesAt } from './lcpFrames';
import { lcpOf, pageElements, type LcpOptions } from './model';

const combos: LcpOptions[] = [false, true].flatMap((preload) =>
  [false, true].flatMap((lazy) => [false, true].flatMap((small) => [null, 2000].map((inputAt) => ({ preload, lazy, small, inputAt })))),
);

describe('the LCP frames, for every combination of the controls', () => {
  it('start at 0, never go back in time, and end at or after every painted element', () => {
    for (const o of combos) {
      const frames = buildLcpFrames(o);
      expect(frames[0].t).toBe(0);
      frames.forEach((f, i) => i && expect(f.t).toBeGreaterThanOrEqual(frames[i - 1].t));
      expect(frames[frames.length - 1].t).toBeGreaterThanOrEqual(Math.max(...pageElements(o).map((e) => e.at)));
    }
  });

  it('have one frame per painted element, plus the HTML, the tap when there is one, the intro and the verdict', () => {
    for (const o of combos) expect(buildLcpFrames(o)).toHaveLength(1 + 1 + 3 + (o.inputAt === null ? 0 : 1) + 1);
  });

  it('the candidate shown at the last frame is the model\'s LCP', () => {
    for (const o of combos) {
      const last = buildLcpFrames(o).at(-1)!;
      expect(candidatesAt(o, last.t).at(-1)).toEqual(lcpOf(o).element);
    }
  });

  it('no candidate is shown before the first element is painted', () => {
    expect(candidatesAt({ preload: false, lazy: true, small: false, inputAt: null }, 799)).toEqual([]);
  });
});
