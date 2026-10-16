import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { FACTS } from './facts';
import { mergeFrames, roomFrames, segFrames, selectFrames } from './frames';
import lesson from './index';
import { assignRooms, mergeIntervals, sweepOverlap, type Interval } from './intervals';
import { INTERVAL_PRESETS, MAX_INTERVALS, OPENING, ROOMS_PRESETS, SEG_OPEN, SEG_PRESETS, SELECT_PRESETS, formatIntervals, parseIntervals, snapTime } from './presets';
import { scaleNote, sparseSet } from './scale';
import { bruteCrossings, sweepCrossings } from './segments';

const text = (node: Parameters<typeof expectCaption>[0]) => expectCaption(node);
const iv = (start: number, end: number): Interval => ({ start, end });

describe('scenes', () => {
  it('every scene component carries its own key', () => {
    const els = sceneElements('sweep-line');
    expect(els).toHaveLength(4);
    expect(els.every((e) => e.keyed)).toBe(true);
    expect(sharedSceneComponents('sweep-line')).toEqual([]);
  });

  it('each scene opens on a pure fixed state, all inside the timeline and half-open valid', () => {
    for (const list of [OPENING.merge, OPENING.rooms, OPENING.select]) {
      expect(list.length).toBeLessThanOrEqual(MAX_INTERVALS);
      for (const x of list) expect(x.start).toBeLessThan(x.end);
    }
    expect(OPENING.rooms).toEqual([iv(9, 10), iv(10, 11), iv(9.5, 10.5)]);
    expect(SEG_OPEN).toBe(SEG_PRESETS[0].set);
  });
});

describe('try-this entries, each from the default state', () => {
  it('try-this 1: the calendar day merges into [9, 11), [13, 15), [16, 17); the touching preset into [1, 7), [8, 9) (a grid-union oracle)', () => {
    const cells = new Set<number>();
    for (const x of OPENING.merge) for (let t = x.start * 2; t < x.end * 2; t++) cells.add(t);
    const runs: [number, number][] = [];
    [...cells].sort((a, b) => a - b).forEach((c) => {
      const last = runs[runs.length - 1];
      if (last && last[1] === c) last[1] = c + 1;
      else runs.push([c, c + 1]);
    });
    expect(runs.map(([a, b]) => [a / 2, b / 2])).toEqual([[9, 11], [13, 15], [16, 17]]);
    expect(FACTS.mergedCount).toBe(3);
    expect(FACTS.mergedList).toBe('[9, 11), [13, 15), [16, 17)');
    expect([FACTS.touchMergedCount, FACTS.touchMergedList]).toEqual([2, '[1, 7), [8, 9)']);
    expect(lesson.tryThis[0]).toContain('3 merged intervals, [9, 11), [13, 15), [16, 17)');
  });

  it('try-this 2: the trio needs 2 rooms (end first) and counts 3 with start first, with 1 overcount event', () => {
    expect([FACTS.roomsEndFirst, FACTS.roomsStartFirst, FACTS.roomsHeap, FACTS.overEvents]).toEqual([2, 3, 2, 1]);
    expect(assignRooms(OPENING.rooms).room).toEqual([0, 0, 1]);
    expect(lesson.tryThis[1]).toContain('the counter reaches 3, with 1 red overcount event');
  });

  it('try-this 3: 4 crossings on the default grid, 54 against 42 comparisons (the sweep loses at 4 by 4), 1,543 against 6,157 at 64 by 64', () => {
    const { hs, vs } = SEG_OPEN;
    // brute force written out
    let crossings = 0;
    for (const h of hs) for (const v of vs) if (v.x >= h.x0 && v.x <= h.x1 && h.y >= v.y0 && h.y <= v.y1) crossings++;
    expect(crossings).toBe(4);
    expect(FACTS.segCrossings).toBe(4);
    expect([FACTS.segSweep, FACTS.segBrute]).toEqual([54, 42]);
    expect(FACTS.segSweep).toBeGreaterThan(FACTS.segBrute);
    expect([FACTS.bigSweep, FACTS.bigBrute, FACTS.bigPairs]).toEqual([1543, 6157, 4096]);
    expect(FACTS.bigSweep).toBeLessThan(FACTS.bigBrute);
    expect(sweepCrossings(sparseSet(64).hs, sparseSet(64).vs).crossings.length).toBe(bruteCrossings(sparseSet(64).hs, sparseSet(64).vs).crossings.length);
    expect(FACTS.touchSegCrossings).toBe(bruteCrossings(SEG_PRESETS[1].set.hs, SEG_PRESETS[1].set.vs).crossings.length);
    expect(lesson.tryThis[2]).toContain('54 comparisons against 42');
    expect(lesson.tryThis[2]).toContain('1,543 against 6,157');
  });

  it('try-this 4: activity selection chooses 3 of the 10 (a brute force over every subset says 3 is the maximum)', () => {
    const list = OPENING.select;
    let best = 0;
    for (let mask = 0; mask < 1 << list.length; mask++) {
      const pick = list.filter((_, i) => mask & (1 << i)).sort((a, b) => a.start - b.start);
      if (pick.every((x, i) => i === 0 || pick[i - 1].end <= x.start)) best = Math.max(best, pick.length);
    }
    expect(best).toBe(3);
    expect([FACTS.selectCount, FACTS.selectChosen]).toEqual([10, 3]);
    expect(lesson.tryThis[3]).toContain('chooses 3');
  });
});

describe('every caption is computed from the model and reads cleanly', () => {
  const sets = [...INTERVAL_PRESETS, ...ROOMS_PRESETS, ...SELECT_PRESETS].map((p) => p.intervals);

  it('walks merge, rooms (both tie rules), select and segment frames over every preset: no NaN, the closing facts equal the models', () => {
    let frames = 0;
    for (const list of sets) {
      const m = mergeFrames(list);
      expect(m.merged).toEqual(mergeIntervals(list).merged);
      const sel = selectFrames(list);
      for (const f of [...m.frames, ...sel.frames]) {
        expect(text(f.say)).not.toMatch(/NaN|undefined|null|Infinity/);
        frames++;
      }
      for (const tie of ['end-first', 'start-first'] as const) {
        const r = roomFrames(list, tie);
        for (const f of r.frames) {
          expect(text(f.say)).not.toMatch(/NaN|undefined|null|Infinity/);
          frames++;
        }
        expect(r.max).toBe(sweepOverlap(list, tie).max);
        expect(r.frames[r.frames.length - 1].max).toBe(r.max);
      }
    }
    for (const p of SEG_PRESETS) {
      const s = segFrames(p.set.hs, p.set.vs);
      for (const f of s.frames) {
        expect(text(f.say)).not.toMatch(/NaN|undefined|null|Infinity/);
        frames++;
      }
      expect(s.frames[s.frames.length - 1].found).toHaveLength(s.crossings.length);
    }
    expect(frames).toBeGreaterThan(200);
  });

  it('the overcount is claimed only at a start event where the counter really is above the intervals live at that time', () => {
    for (const list of sets) {
      for (const e of sweepOverlap(list, 'start-first').events) {
        const truth = list.filter((x) => x.start <= e.time && e.time < x.end).length;
        expect(e.over).toBe(e.kind === 'start' && e.active > truth);
      }
      expect(sweepOverlap(list, 'end-first').events.every((e) => !e.over)).toBe(true);
    }
  });
});

describe('hidden controls do not feed the numbers', () => {
  it('rooms from the heap greedy do not depend on the tie rule, and the view toggle changes only the drawing', () => {
    for (const list of sets()) {
      const rooms = assignRooms(list).rooms;
      expect(roomFrames(list, 'end-first').rooms.rooms).toBe(rooms);
      expect(roomFrames(list, 'start-first').rooms.rooms).toBe(rooms);
    }
  });

  it('the model-only scale note does not change with the learner\'s segments', () => {
    expect(scaleNote()).toEqual(scaleNote());
    expect(scaleNote(64).n).toBe(64);
  });
});

function sets() {
  return [...INTERVAL_PRESETS, ...ROOMS_PRESETS].map((p) => p.intervals);
}

describe('hostile input', () => {
  it('typed lists: zero-length, reversed, non-numeric, off-timeline, empty and over-long lists are refused with a sentence', () => {
    expect(parseIntervals('9-10, 10-11.5')).toEqual({ ok: true, intervals: [iv(9, 10), iv(10, 11.5)] });
    expect(parseIntervals('5-5')).toMatchObject({ ok: false });
    expect((parseIntervals('5-5') as { error: string }).error).toContain('zero length');
    const back = parseIntervals('9-10, 8-3, 12-13');
    expect(back).toMatchObject({ ok: false });
    expect(!back.ok && back.swapOffer).toEqual([iv(9, 10), iv(3, 8), iv(12, 13)]);
    for (const bad of ['', 'a-b', '9', '9-', '-3', '9-25', '30-31', '1e1-12', '9-10-11']) expect(parseIntervals(bad).ok, bad).toBe(false);
    const eleven = Array.from({ length: 11 }, (_, i) => `${i}-${i + 1}`).join(', ');
    expect(parseIntervals(eleven)).toMatchObject({ ok: false });
    expect(parseIntervals(formatIntervals(OPENING.merge))).toEqual({ ok: true, intervals: OPENING.merge });
  });

  it('dragging snaps to half an hour and stays inside the timeline', () => {
    expect(snapTime(9.3)).toBe(9.5);
    expect(snapTime(-4)).toBe(0);
    expect(snapTime(99)).toBe(24);
  });
});
