import { describe, expect, it } from 'vitest';
import { timeFrames } from './frames';

const base = { end: 100, steps: 4, intro: 'intro', summary: 'summary', hold: 2.5 };

describe('timeFrames', () => {
  it('opens with the intro at 0, closes with the held summary at the end, and has no hold on the plain steps', () => {
    const frames = timeFrames({ ...base, milestones: [] });
    expect(frames).toEqual([
      { now: 0, say: 'intro' },
      { now: 25 },
      { now: 50 },
      { now: 75 },
      { now: 100 },
      { now: 100, say: 'summary', hold: 2.5 },
    ]);
  });

  it('puts a captioned, held frame at each milestone, in time order, after a plain frame at the same time', () => {
    const frames = timeFrames({ ...base, milestones: [{ t: 60, say: 'b' }, { t: 50, say: 'a' }] });
    expect(frames.map((f) => f.now)).toEqual([0, 25, 50, 50, 60, 75, 100, 100]);
    expect(frames[3]).toEqual({ now: 50, say: 'a', hold: 2.5 });
    expect(frames[4]).toEqual({ now: 60, say: 'b', hold: 2.5 });
    expect(frames[2]).toEqual({ now: 50 });
  });

  it('clamps a milestone past the end to the end and never runs backwards', () => {
    const frames = timeFrames({ ...base, milestones: [{ t: 130, say: 'late' }] });
    expect(frames.at(-2)).toEqual({ now: 100, say: 'late', hold: 2.5 });
    for (let i = 1; i < frames.length; i++) expect(frames[i].now).toBeGreaterThanOrEqual(frames[i - 1].now);
  });

  it('steps are evenly spaced whatever the unit: one per second on a 10 s axis', () => {
    const frames = timeFrames({ end: 10, steps: 10, milestones: [], intro: 'i', summary: 's', hold: 3 });
    expect(frames.slice(1, -1).map((f) => f.now)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
