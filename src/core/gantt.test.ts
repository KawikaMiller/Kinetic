import { describe, expect, it } from 'vitest';
import { barGeometry, barLabelPx, domainFraction, ganttTicks, spreadLabels } from './gantt';

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

describe('spreadLabels', () => {
  it('leaves labels that already fit where they are', () => {
    expect(spreadLabels([{ x: 10, w: 10 }, { x: 100, w: 20 }])).toEqual([0, 0]);
  });

  it('pushes two overlapping labels apart symmetrically, gap between them', () => {
    const [a, b] = spreadLabels([{ x: 100, w: 20 }, { x: 110, w: 20 }], 4);
    expect(a).toBeCloseTo(-7, 9);
    expect(b).toBeCloseTo(7, 9);
    // after shifting: a ends at 93 + 10 = 103, b starts at 117 - 10 = 107
    expect(117 - 10 - (93 + 10)).toBeCloseTo(4, 9);
  });

  it('keeps input order in the result and resolves chains of overlaps', () => {
    const labels = [{ x: 210, w: 20 }, { x: 200, w: 20 }, { x: 205, w: 20 }];
    const shift = spreadLabels(labels, 2);
    const placed = labels.map((l, i) => ({ left: l.x + shift[i] - l.w / 2, right: l.x + shift[i] + l.w / 2 })).sort((p, q) => p.left - q.left);
    for (let i = 1; i < placed.length; i++) expect(placed[i].left - placed[i - 1].right).toBeGreaterThanOrEqual(2 - 1e-9);
    // the run stays centred on the wanted centres
    const centre = (placed[0].left + placed.at(-1)!.right) / 2;
    expect(centre).toBeCloseTo(205, 9);
  });
});

describe('barLabelPx', () => {
  it('grows with the text and includes the padding', () => {
    expect(barLabelPx('')).toBe(10);
    expect(barLabelPx('Big')).toBe(Math.ceil(3 * 6.3 + 10));
    expect(barLabelPx('P10')).toBeGreaterThan(barLabelPx('P1'));
  });
});
