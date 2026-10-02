import { describe, expect, it } from 'vitest';
import { barGeometry, domainFraction, ganttTicks } from './gantt';

describe('gantt geometry', () => {
  it('places bars as percentages of the domain', () => {
    expect(barGeometry(25, 75, [0, 100])).toEqual({ left: 25, full: 50, shown: 50 });
    expect(barGeometry(15, 20, [10, 30], 0.5)).toEqual({ left: 25, full: 25, shown: 12.5 });
    expect(barGeometry(5, 5, [0, 10]).full).toBe(0);
  });

  it('matches the ci-pipelines arithmetic exactly (so the migration is pixel-identical)', () => {
    // ci computed (start / span) * 100 and ((end − start) / span) * 100
    for (const [start, end, span] of [[0, 37, 211], [12, 99, 211], [3, 3, 7], [50, 173, 173]]) {
      const g = barGeometry(start, end, [0, span], 0.37);
      expect(g.left).toBe((start / span) * 100);
      expect(g.full).toBe(((end - start) / span) * 100);
      expect(g.shown).toBe((((end - start) / span) * 100) * 0.37);
    }
  });

  it('clamps the cursor fraction into the domain', () => {
    expect(domainFraction(37, [0, 211])).toBe(37 / 211);
    expect(domainFraction(-5, [0, 10])).toBe(0);
    expect(domainFraction(15, [0, 10])).toBe(1);
    expect(domainFraction(20, [10, 30])).toBe(0.5);
  });

  it('gives nice ticks with their track positions', () => {
    expect(ganttTicks([0, 100], 5)).toEqual([0, 20, 40, 60, 80, 100].map((v) => ({ value: v, at: v })));
    const t = ganttTicks([10, 30], 4);
    expect(t.map((x) => x.value)).toEqual([10, 15, 20, 25, 30]);
    expect(t[2].at).toBeCloseTo(50, 12);
  });
});
