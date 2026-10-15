import { describe, expect, it } from 'vitest';
import { barAt, barGeometry, barInDomain, barLabelPx, barsAt, calendarTicks, domainFraction, ganttTicks, INSTANT_GAP_PX, INSTANT_SIZE_PX, instantX, isInstant, placeInstantLabels, spreadLabels, type TimedBar } from './gantt';

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

describe('calendarTicks', () => {
  // 2026-03-02 is a Monday (checked against the calendar, not against the implementation).
  const MON = '2026-03-02T00:00:00Z';

  it('labels hour ticks "Mon 09:00" in UTC and places them as a share of the domain', () => {
    const t = calendarTicks([9, 13], { start: MON, unit: 'hour' }, 10);
    expect(t.map((x) => x.label)).toEqual(['Mon 09:00', 'Mon 10:00', 'Mon 11:00', 'Mon 12:00', 'Mon 13:00']);
    expect(t.map((x) => x.at)).toEqual([0, 25, 50, 75, 100]);
    expect(t.map((x) => x.value)).toEqual([9, 10, 11, 12, 13]);
  });

  it('puts day ticks on UTC midnight, not on the start time, and rolls the weekday over the date', () => {
    const t = calendarTicks([9, 9 + 72], { start: MON, unit: 'day' });
    expect(t.map((x) => x.label)).toEqual(['Tue 3 Mar', 'Wed 4 Mar', 'Thu 5 Mar']);
    expect(t.map((x) => x.value)).toEqual([24, 48, 72]);
  });

  it('puts week ticks on Monday 00:00 UTC, including across a month and a year end', () => {
    const t = calendarTicks([0, 24 * 21], { start: '2026-03-02T09:30:00Z', unit: 'week' });
    expect(t.map((x) => x.label)).toEqual(['Mon 9 Mar', 'Mon 16 Mar', 'Mon 23 Mar']);
    expect(t.map((x) => x.value)).toEqual([24 * 7 - 9.5, 24 * 14 - 9.5, 24 * 21 - 9.5]);
    const newYear = calendarTicks([0, 24 * 10], { start: '2026-12-28T00:00:00Z', unit: 'week' });
    expect(newYear.map((x) => x.label)).toEqual(['Mon 28 Dec', 'Mon 4 Jan']);
  });

  it('includes a boundary exactly on either end of the domain', () => {
    const t = calendarTicks([0, 24], { start: MON, unit: 'day' });
    expect(t.map((x) => x.at)).toEqual([0, 100]);
  });

  it('thins a crowded axis to a round stride counted from midnight, never to an odd one like every 13th hour', () => {
    const t = calendarTicks([0, 48], { start: MON, unit: 'hour' }, 6);
    expect(t.map((x) => x.label)).toEqual(['Mon 00:00', 'Mon 12:00', 'Tue 00:00', 'Tue 12:00', 'Wed 00:00']);
    const shifted = calendarTicks([5, 53], { start: MON, unit: 'hour' }, 6);
    expect(shifted.map((x) => x.label)).toEqual(['Mon 08:00', 'Mon 16:00', 'Tue 00:00', 'Tue 08:00', 'Tue 16:00', 'Wed 00:00']);
    for (const count of [2, 3, 4, 5, 6, 10]) expect(calendarTicks([0, 72], { start: MON, unit: 'hour' }, count).length).toBeLessThanOrEqual(count);
  });

  it('falls back to its widest stride rather than drawing every tick, and thins days and weeks the same way', () => {
    expect(calendarTicks([0, 24 * 40], { start: MON, unit: 'day' }, 4).length).toBeLessThanOrEqual(4);
    expect(calendarTicks([0, 24 * 7 * 60], { start: MON, unit: 'week' }, 6).length).toBeLessThanOrEqual(6);
    expect(calendarTicks([0, 24 * 7 * 400], { start: MON, unit: 'week' }, 2).length).toBeGreaterThan(0);
  });

  it('honours a zone offset in start, still ticking on UTC boundaries', () => {
    const t = calendarTicks([0, 24], { start: '2026-03-02T05:00:00+05:00', unit: 'day' });
    expect(t.map((x) => x.label)).toEqual(['Mon 2 Mar', 'Tue 3 Mar']);
  });

  it('refuses a start without a zone, which would be read in the browser\'s local time', () => {
    expect(() => calendarTicks([0, 24], { start: '2026-03-02T00:00:00', unit: 'day' })).toThrow(RangeError);
    expect(() => calendarTicks([0, 24], { start: 'next Monday', unit: 'day' })).toThrow(RangeError);
  });
});

describe('barInDomain', () => {
  it('counts a bar that overlaps the domain, one that touches an end, and an instant inside, but not one that lies wholly outside', () => {
    expect(barInDomain(2, 5, [0, 10])).toBe(true);
    expect(barInDomain(-5, 0, [0, 10])).toBe(true);
    expect(barInDomain(10, 12, [0, 10])).toBe(true);
    expect(barInDomain(4, 4, [0, 10])).toBe(true);
    expect(barInDomain(-5, -1, [0, 10])).toBe(false);
    expect(barInDomain(11, 11, [0, 10])).toBe(false);
  });
});

describe('instants (zero-length bars)', () => {
  it('only a bar with start equal to end is an instant', () => {
    expect(isInstant({ start: 5, end: 5 })).toBe(true);
    expect(isInstant({ start: 5, end: 5.001 })).toBe(false);
  });

  it('an instant at either end of the track keeps its whole diamond inside it', () => {
    expect(instantX(0, 400)).toBe(INSTANT_SIZE_PX / 2);
    expect(instantX(1, 400)).toBe(400 - INSTANT_SIZE_PX / 2);
    expect(instantX(0.5, 400)).toBe(200);
    expect(instantX(0.5, 0)).toBe(INSTANT_SIZE_PX / 2);
  });

  it('a lone label sits to the right of its marker, a fixed gap away, with no shift', () => {
    expect(placeInstantLabels([{ x: 100, w: 40 }], 400)).toEqual([{ side: 'right', dx: 0 }]);
  });

  it('a marker at the right edge of the track puts its label on the left, inside the track', () => {
    const [p] = placeInstantLabels([{ x: 400, w: 60 }], 400);
    expect(p.side).toBe('left');
    expect(400 - INSTANT_GAP_PX - 60 + p.dx).toBeGreaterThanOrEqual(0);
  });

  it('a marker at the left edge keeps its label inside the track on the right', () => {
    const [p] = placeInstantLabels([{ x: 0, w: 60 }], 400);
    expect(p.side).toBe('right');
    expect(INSTANT_GAP_PX + p.dx).toBeGreaterThanOrEqual(0);
  });

  it('a label does not sit on the next instant\'s diamond when the other side is clear, and stays on the right when both sides are blocked', () => {
    const [a, b] = placeInstantLabels([{ x: 200, w: 40 }, { x: 215, w: 40 }], 400);
    expect(a.side).toBe('left');
    expect(b.side).toBe('right');
    const boxed = placeInstantLabels([{ x: 20, w: 60 }, { x: 40, w: 10 }, { x: 105, w: 10 }], 400);
    expect(boxed[0].side).toBe('right');
  });

  it('two instants close together get labels that do not overlap, and every label stays inside the track', () => {
    const marks = [{ x: 100, w: 70 }, { x: 108, w: 70 }, { x: 392, w: 70 }];
    const places = placeInstantLabels(marks, 400, 4);
    const boxes = marks.map((m, i) => {
      const centre = m.x + (places[i].side === 'right' ? 1 : -1) * (INSTANT_GAP_PX + m.w / 2) + places[i].dx;
      return { left: centre - m.w / 2, right: centre + m.w / 2 };
    }).sort((a, b) => a.left - b.left);
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].left - boxes[i - 1].right).toBeGreaterThanOrEqual(4 - 1e-9);
    for (const b of boxes) {
      expect(b.left).toBeGreaterThanOrEqual(-1e-9);
      expect(b.right).toBeLessThanOrEqual(400 + 1e-9);
    }
describe('barAt / barsAt', () => {
  const bar: TimedBar & { id: string } = { id: 'a', start: 10, end: 20 };

  it('is null before the start', () => {
    expect(barAt(bar, 9.999)).toBeNull();
    expect(barAt(bar, -5)).toBeNull();
  });

  it('at the start the bar is running with no progress yet', () => {
    expect(barAt(bar, 10)).toEqual({ ...bar, progress: 0 });
  });

  it('inside it carries the elapsed share and keeps its other fields', () => {
    expect(barAt({ ...bar, tone: 'hi' }, 15)).toEqual({ id: 'a', start: 10, end: 20, tone: 'hi', progress: 0.5 });
    expect(barAt(bar, 12.5)?.progress).toBeCloseTo(0.25, 12);
  });

  it('at its end and after it the bar is returned whole, untouched', () => {
    expect(barAt(bar, 20)).toBe(bar);
    expect(barAt(bar, 99)).toBe(bar);
    const planned = { ...bar, progress: 0.4 };
    expect(barAt(planned, 25)).toBe(planned);
  });

  it('does not mutate its input and replaces a progress it carried while running', () => {
    const b = { ...bar, progress: 0.9 };
    expect(barAt(b, 15)?.progress).toBe(0.5);
    expect(b.progress).toBe(0.9);
  });

  it('a zero-length bar appears whole at its start', () => {
    const z = { start: 5, end: 5 };
    expect(barAt(z, 4.9)).toBeNull();
    expect(barAt(z, 5)).toBe(z);
  });

  it('barsAt keeps order and drops the bars not started', () => {
    const bars: (TimedBar & { id: string })[] = [{ id: 'x', start: 0, end: 4 }, { id: 'y', start: 6, end: 9 }, { id: 'z', start: 2, end: 8 }];
    expect(barsAt(bars, 3).map((b) => [b.id, b.progress])).toEqual([['x', 0.75], ['z', 1 / 6]]);
    expect(barsAt(bars, 100)).toEqual(bars);
    expect(barsAt(bars, -1)).toEqual([]);
  });
});
