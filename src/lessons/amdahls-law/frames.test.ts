import { describe, expect, it } from 'vitest';
import { pct } from '../../core/format';
import { captionText } from '../../core/testing/captions';
import { fmtSpeed, viewCaption, type Law } from './frames';
import lesson from './index';
import { CORE_STEPS, MAX_CORES, amdahl, bestWholeCores, ceiling, doublingCut, gustafson, withOverhead } from './model';

const S = [0, 0.01, 0.05, 0.1, 0.2, 0.5, 0.95];
const C = [0, 0.0001, 0.001, 0.002];

describe('viewCaption over law × s × cores × overhead', () => {
  it('quotes the model for every combination', () => {
    for (const law of ['amdahl', 'gustafson'] as Law[])
      for (const s of S)
        for (const n of CORE_STEPS)
          for (const c of law === 'amdahl' ? C : [0]) {
            const t = captionText(viewCaption({ law, s, n, c }));
            if (law === 'gustafson') expect(t).toContain(`${fmtSpeed(gustafson(s, n))} the work`);
            else if (c > 0) {
              const best = bestWholeCores(s, c, MAX_CORES);
              expect(t).toContain(`peaks at ${best} core`);
              expect(t).toContain(fmtSpeed(withOverhead(s, n, c)));
            } else if (s === 0) expect(t).toContain('doubling the cores halves the time');
            else {
              expect(t).toContain(`give${n === 1 ? 's' : ''} ${fmtSpeed(amdahl(s, n))}`);
              expect(t).toContain(`gets past ${fmtSpeed(ceiling(s))}`);
              const cut = pct(doublingCut(s, n), 1);
              expect(t).toContain(`by ${cut}, not 50%`);
              expect(cut).not.toBe('50.0%');
            }
            expect(t).not.toMatch(/\b1 cores\b|\b1 core give\b/);
          }
  });
});

describe('quiz and try-this numbers come from the model', () => {
  it('10% serial, 8 → 16 cores cuts the time by about 26%', () => {
    expect(Math.round(doublingCut(0.1, 8) * 100)).toBe(26);
    expect(lesson.quiz[0].options[lesson.quiz[0].answer]).toBe('It drops by about 26%');
  });
  it('20% serial: 5× ceiling; 1% reaches about 72× at 256; Gustafson 5% passes 240×; 50% tops out at 2×', () => {
    expect(ceiling(0.2)).toBeCloseTo(5);
    expect(Math.round(amdahl(0.01, 256))).toBe(72);
    expect(gustafson(0.05, 256)).toBeGreaterThan(240);
    expect(amdahl(0.5, 256)).toBeLessThan(2);
    expect(ceiling(0.5)).toBe(2);
  });
});
