import { describe, expect, it } from 'vitest';
import { arrowStep, segmentHitsBox } from './geometry';
import { mulberry32 } from './random';

describe('arrowStep', () => {
  it('maps the arrow keys to screen-axis steps', () => {
    expect(arrowStep('ArrowLeft', 2)).toEqual([-2, 0]);
    expect(arrowStep('ArrowRight', 0.25)).toEqual([0.25, 0]);
    expect(arrowStep('ArrowUp', 1)).toEqual([0, -1]);
    expect(arrowStep('ArrowDown', 1)).toEqual([0, 1]);
  });

  it('is null for other keys', () => {
    expect(arrowStep('Enter', 1)).toBeNull();
    expect(arrowStep('a', 1)).toBeNull();
  });
});

describe('segmentHitsBox', () => {
  it('segmentHitsBox agrees with dense sampling along the segment (5,000 random cases)', () => {
    const rnd = mulberry32(11);
    let hits = 0;
    for (let t = 0; t < 5000; t++) {
      const a = { x: rnd() * 200, y: rnd() * 200 };
      const b = { x: rnd() * 200, y: rnd() * 200 };
      const c = { x: rnd() * 200, y: rnd() * 200 };
      const hw = 5 + rnd() * 40;
      const hh = 5 + rnd() * 20;
      let sampled = false;
      for (let k = 0; k <= 4000 && !sampled; k++) {
        const x = a.x + ((b.x - a.x) * k) / 4000;
        const y = a.y + ((b.y - a.y) * k) / 4000;
        if (Math.abs(x - c.x) <= hw - 0.05 && Math.abs(y - c.y) <= hh - 0.05) sampled = true;
      }
      const exact = segmentHitsBox(a, b, c, hw, hh);
      // Sampling inside a slightly shrunk box can only miss grazing hits, never invent one.
      if (sampled) expect(exact).toBe(true);
      if (exact) hits++;
    }
    expect(hits).toBeGreaterThan(200);
  });
});
