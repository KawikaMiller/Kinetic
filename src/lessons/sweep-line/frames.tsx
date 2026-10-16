import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { assignRooms, mergeIntervals, selectActivities, sweepOverlap, type Interval, type TieRule } from './intervals';
import { bruteCrossings, sweepCrossings, type Crossing, type HSeg, type VSeg } from './segments';

const hl = (v: ReactNode, tone = '') => <span className={`hl ${tone}`.trim()}>{v}</span>;
export const span = (x: Interval) => `[${x.start}, ${x.end})`;
export const NAMES = 'abcdefghij';

// ── merge ─────────────────────────────────────────────────────────────────

export interface MergeFrame extends Frame {
  /** The sweep line: the start of the interval being processed. */
  now: number | null;
  /** Original indices processed so far. */
  done: number[];
  current: number | null;
  merged: Interval[];
}

export function mergeFrames(input: readonly Interval[]): { frames: MergeFrame[]; merged: Interval[] } {
  const run = mergeIntervals(input);
  const rec = createRecorder<MergeFrame>({ now: null, done: [], current: null, merged: [] });
  rec.snap(
    <>
      Intervals are half-open: [start, end) does not include its end. Sort by start, then sweep a line left to right; an interval that starts at or before the current output's end joins it.
    </>,
  );
  run.steps.forEach((s, k) => {
    const id = run.order[k];
    const prev = rec.get().merged[rec.get().merged.length - 1];
    const touching = s.action === 'extend' && prev && s.interval.start === prev.end;
    const name = NAMES[id];
    rec.snap(
      s.action === 'extend' ? (
        touching ? (
          <>{name} = {span(s.interval)} starts exactly where {span(prev)} ends: they touch, so they join into {hl(span(s.merged[s.merged.length - 1]), 'ok')}, which is exactly their union.</>
        ) : (
          <>{name} = {span(s.interval)} starts at {s.interval.start}, before the output's end {prev.end}: it overlaps, so the output grows to {hl(span(s.merged[s.merged.length - 1]), 'ok')}.</>
        )
      ) : (
        <>{name} = {span(s.interval)} {s.action === 'open' ? 'is the first interval: it opens' : `starts at ${s.interval.start}, after ${prev ? prev.end : ''}: a gap, so the output closes and a new one opens`} {hl(span(s.interval), 'ok')}.</>
      ),
      undefined,
      { now: s.interval.start, current: id, done: [...rec.get().done, id], merged: s.merged },
    );
  });
  rec.set({ current: null });
  rec.close(<>Done: {hl(plural(run.merged.length, 'merged interval'), 'ok')} from {input.length}: {run.merged.map(span).join(', ')}.</>, 2);
  return { frames: rec.frames, merged: run.merged };
}

// ── rooms ─────────────────────────────────────────────────────────────────

export interface RoomFrame extends Frame {
  now: number | null;
  /** Index of the event just processed (into `events`), or -1. */
  at: number;
  active: number;
  max: number;
  over: boolean;
  /** Original indices of intervals live now. */
  live: number[];
}

export function roomFrames(input: readonly Interval[], tie: TieRule) {
  const run = sweepOverlap(input, tie);
  const rooms = assignRooms(input);
  const rec = createRecorder<RoomFrame>({ now: null, at: -1, active: 0, max: 0, over: false, live: [] });
  rec.snap(
    <>
      Each interval becomes two events, a start (+1) and an end (-1). Sort them by time; when a start and an end share a time, {tie === 'end-first' ? hl('the end goes first', 'ok') : hl('the start goes first (the classic bug)', 'bad')}. The counter's maximum is the number of rooms.
    </>,
  );
  let max = 0;
  const live = new Set<number>();
  run.events.forEach((e, k) => {
    max = Math.max(max, e.active);
    if (e.kind === 'start') live.add(e.id);
    else live.delete(e.id);
    rec.snap(
      <>
        At {e.time}: {NAMES[e.id]} {e.kind === 'start' ? 'starts' : 'ends'}, so the counter becomes {hl(e.active, e.over ? 'bad' : 'info')}.
        {e.over ? <> {hl('Overcount', 'bad')}: only {e.truth} {e.truth === 1 ? 'interval really contains' : 'intervals really contain'} {e.time}, because the one that ends at {e.time} has not been taken off yet.</> : null}
        {e.active === max && e.active > 0 ? <> A new high: {max}.</> : null}
      </>,
      undefined,
      { now: e.time, at: k, active: e.active, max, over: e.over, live: [...live] },
    );
  });
  rec.set({ now: null });
  rec.close(
    <>
      The maximum is {hl(run.max, run.max === rooms.rooms ? 'ok' : 'bad')} with this tie rule. The heap greedy from greedy-algorithms needs {hl(rooms.rooms, 'ok')} {rooms.rooms === 1 ? 'room' : 'rooms'}{run.max === rooms.rooms ? <>: equal to the maximum overlap.</> : <>: the tie rule counted {run.max - rooms.rooms} too many.</>}
    </>,
    2,
  );
  return { frames: rec.frames, events: run.events, max: run.max, rooms };
}

// ── select ────────────────────────────────────────────────────────────────

export interface SelectFrame extends Frame {
  current: number | null;
  chosen: number[];
  skipped: number[];
}

export function selectFrames(input: readonly Interval[]) {
  const run = selectActivities(input);
  const rec = createRecorder<SelectFrame>({ current: null, chosen: [], skipped: [] });
  rec.snap(<>Activity selection is a sweep too, with a different key: sort by END, then take an interval whenever it starts at or after the end of the last one taken.</>);
  run.steps.forEach((s, k) => {
    const id = run.order[k];
    const cur = rec.get();
    rec.snap(
      s.picked ? (
        <>{NAMES[id]} = {span(s.interval)} {s.lastEnd === null ? 'is the earliest to finish: take it' : `starts at ${s.interval.start}, at or after ${s.lastEnd}: take it`}.</>
      ) : (
        <>{NAMES[id]} = {span(s.interval)} starts at {s.interval.start}, before {s.lastEnd}: it overlaps the last one taken, so {hl('skip', 'dim')} it.</>
      ),
      undefined,
      { current: id, chosen: s.picked ? [...cur.chosen, id] : cur.chosen, skipped: s.picked ? cur.skipped : [...cur.skipped, id] },
    );
  });
  rec.set({ current: null });
  rec.close(<>Done: {hl(plural(run.chosen.length, 'activity', 'activities'), 'ok')} chosen out of {input.length}: {run.chosen.map(span).join(', ')}.</>, 2);
  return { frames: rec.frames, chosen: run.chosen };
}

// ── segments ──────────────────────────────────────────────────────────────

export interface SegFrame extends Frame {
  /** The sweep line's x, or null before the first event. */
  x: number | null;
  active: number[];
  found: Crossing[];
  /** Horizontal being inserted or removed, or vertical being queried. */
  h: number | null;
  v: number | null;
}

export function segFrames(hs: readonly HSeg[], vs: readonly VSeg[]) {
  const run = sweepCrossings(hs, vs);
  const brute = bruteCrossings(hs, vs);
  const rec = createRecorder<SegFrame>({ x: null, active: [], found: [], h: null, v: null }, { transient: { h: null, v: null } });
  rec.snap(
    <>
      Segments here are closed: touching counts as a crossing (unlike the half-open intervals before, because these are geometric segments and a touch is a point they share). Sweep a line over x; at one x: insert the horizontals that start, query the verticals, then remove the horizontals that end.
    </>,
  );
  const found: Crossing[] = [];
  for (const e of run.events) {
    if (e.kind === 'insert') {
      rec.snap(<>x = {e.x}: horizontal {hl(e.h + 1, 'ok')} (y = {hs[e.h].y}) starts: insert it into the active set, sorted by y.</>, undefined, { x: e.x, active: e.active, h: e.h });
    } else if (e.kind === 'remove') {
      rec.snap(<>x = {e.x}: horizontal {e.h + 1} ends here: remove it from the active set.</>, undefined, { x: e.x, active: e.active, h: e.h });
    } else {
      for (const h of e.hits) found.push({ h, v: e.v });
      rec.snap(
        <>
          x = {e.x}: vertical {e.v + 1} spans y from {vs[e.v].y0} to {vs[e.v].y1}. Binary-search the active set for that range: {e.hits.length ? <>{hl(plural(e.hits.length, 'hit'), 'ok')} (horizontals {e.hits.map((h) => h + 1).join(', ')})</> : 'no hits'}.
        </>,
        undefined,
        { x: e.x, active: e.active, found: [...found], v: e.v },
      );
    }
  }
  rec.set({ x: null });
  rec.close(
    <>
      Done: {hl(plural(run.crossings.length, 'crossing'), 'ok')}. The sweep made {run.comparisons} coordinate comparisons; checking every one of the {brute.pairs} pairs makes {brute.comparisons}.
    </>,
    2,
  );
  return { frames: rec.frames, crossings: run.crossings, sweepComparisons: run.comparisons, brute };
}
