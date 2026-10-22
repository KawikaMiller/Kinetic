import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GanttLanes, type GanttBar } from './GanttLanes';

const lanes = [{ id: 'a', label: 'lane a' }];
const html = (bars: GanttBar[]) => renderToStaticMarkup(createElement(GanttLanes, { lanes, bars, domain: [10, 30] }));

describe('GanttLanes bars that begin before the domain', () => {
  it('start at the left edge of the track instead of spilling over the lane labels', () => {
    const out = html([{ id: 'x', lane: 'a', start: 0, end: 20, tone: 'ok' }]);
    expect(out).toContain('left:0%');
    expect(out).toContain('width:50%');
    expect(out).not.toMatch(/left:-/);
  });

  it('draw nothing when they end before the domain starts', () => {
    expect(html([{ id: 'x', lane: 'a', start: 0, end: 5, tone: 'ok' }])).not.toContain('gantt-bar');
  });

  it('leave a bar inside the domain where it was', () => {
    const out = html([{ id: 'x', lane: 'a', start: 15, end: 20, tone: 'ok' }]);
    expect(out).toContain('left:25%');
    expect(out).toContain('width:25%');
  });
});
