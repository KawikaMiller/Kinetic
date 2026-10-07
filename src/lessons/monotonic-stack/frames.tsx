import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import {
  bruteNextComparisons, bruteRectRanges, bruteWindowComparisons, largestRectangle, nextGreater, opCounts, slidingMax, type Rect,
} from './model';

export type Scene = 'warmer' | 'window' | 'rect';

export interface MsFrame extends Frame {
  /** The scan cursor, or null before the scan starts and after it ends. */
  scan: number | null;
  /** Indices on the stack (bottom first) or in the deque (front first). */
  stack: number[];
  /** The index removed in this frame. */
  popped: number | null;
  /** Next warmer: each day's answering index; undefined = still waiting, null = none ever. */
  answers: (number | null | undefined)[];
  /** The index whose answer arrow was just drawn. */
  arrow: number | null;
  /** Sliding max: the current window, inclusive. */
  window: [number, number] | null;
  /** Sliding max: the max of the window ending at each index. */
  maxes: (number | undefined)[];
  /** Sliding max: where the current window's max sits (the deque's front). */
  maxAt: number | null;
  /** Largest rectangle: the one computed in this frame, and the best so far. */
  rect: Rect | null;
  best: Rect | null;
  pushes: number;
  pops: number;
  done: boolean;
}

type Rec = ReturnType<typeof createRecorder<MsFrame>>;

const blank = (n: number): Omit<MsFrame, 'say' | 'hold'> => ({
  scan: null, stack: [], popped: null, answers: new Array(n).fill(undefined), arrow: null, window: null,
  maxes: new Array(n).fill(undefined), maxAt: null, rect: null, best: null, pushes: 0, pops: 0, done: false,
});

const recorder = (n: number) => createRecorder<MsFrame>(blank(n), { transient: { popped: null, arrow: null, rect: null } });

const list = (xs: readonly number[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const top = (stack: readonly number[]) => stack[stack.length - 1];

/** The work counters, as the closing captions state them. */
function tally(r: Rec, n: number): ReactNode {
  const { pushes, pops } = r.get();
  return (
    <>
      {plural(pushes, 'push', 'pushes')} + {plural(pops, 'pop')} = <b>{pushes + pops}</b>, within 2n = {2 * n}: each index is pushed once and popped at most once.
    </>
  );
}

const EMPTY = <>No values, so there's nothing to scan. Type up to 12 numbers, or pick a preset.</>;

export function frames(scene: Scene, values: readonly number[], k: number): MsFrame[] {
  if (scene === 'window') return windowFrames(values, k);
  if (scene === 'rect') return rectFrames(values);
  return warmerFrames(values);
}

// ── Next warmer day ───────────────────────────────────────────────────

export function warmerFrames(v: readonly number[]): MsFrame[] {
  const n = v.length;
  const r = recorder(n);
  if (!n) {
    r.snap(EMPTY);
    return r.frames;
  }
  r.snap(
    <>
      Scan left to right. The stack holds the days still waiting for a warmer one, and their temperatures never rise from bottom to top.
      Warmer means <b>strictly</b> greater: an equal day doesn't count.
    </>,
  );
  const { ops } = nextGreater(v);
  let poppedThisDay = false;
  for (const op of ops) {
    const s = r.get();
    if (op.t === 'pop') {
      const { i: j, by: i } = op;
      const answers = s.answers.slice();
      answers[j] = i;
      r.snap(
        <>
          Day {i} ({v[i]}) is warmer than day {j} ({v[j]}), so day {j}'s answer is <b>{plural(i - j, 'day')}</b>. Pop {j}.
        </>,
        undefined,
        { scan: i, stack: s.stack.slice(0, -1), answers, popped: j, arrow: j, pops: s.pops + 1 },
      );
      poppedThisDay = true;
    } else {
      const i = op.i;
      const t = top(s.stack);
      const why =
        t === undefined
          ? poppedThisDay ? <>nothing is left on the stack.</> : <>the stack is empty.</>
          : v[t] === v[i]
            ? <>day {t} is {v[t]} too, and equal isn't warmer, so it keeps waiting.</>
            : <>day {t} ({v[t]}) is warmer, so nothing {poppedThisDay ? 'more ' : ''}pops.</>;
      r.snap(
        <>
          Day {i} ({v[i]}): {why} Push {i}: it waits for a warmer day.
        </>,
        undefined,
        { scan: i, stack: [...s.stack, i], pushes: s.pushes + 1 },
      );
      poppedThisDay = false;
    }
  }
  const left = r.get().stack;
  const answers = r.get().answers.map((a) => (a === undefined ? null : a));
  r.set({ scan: null, answers, done: true });
  r.close(
    n === 1 ? (
      <>One day only: it's pushed once and never popped, because nothing comes after it. 1 push + 0 pops = 1, within 2n = 2.</>
    ) : (
      <>
        Done. {tally(r, n)} {left.length === n ? 'No day ever sees a warmer one.' : left.length ? <>{left.length === 1 ? 'Day' : 'Days'} {list(left)} never see a warmer day.</> : 'Every day found a warmer one.'}{' '}
        Brute force, looking right from every day: {plural(bruteNextComparisons(v), 'comparison')}.
      </>
    ),
    2,
  );
  return r.frames;
}

// ── Sliding-window maximum ────────────────────────────────────────────

export function windowFrames(v: readonly number[], kWanted: number): MsFrame[] {
  const n = v.length;
  /** The window can't be wider than the list. */
  const k = Math.max(1, Math.min(kWanted, n));
  const r = recorder(n);
  if (!n) {
    r.snap(EMPTY);
    return r.frames;
  }
  r.snap(
    <>
      Window of k = {k}. The deque holds indices whose values strictly fall from front to back, so its front is always the window's maximum.
    </>,
  );
  const { ops, maxes } = slidingMax(v, k);
  for (let o = 0; o < ops.length; o++) {
    const op = ops[o];
    const s = r.get();
    if (op.t === 'expire') {
      r.snap(
        <>
          Index {op.i} has slid out of the window {op.at - k + 1}–{op.at}, so it leaves at the <b>front</b>.
        </>,
        undefined,
        { scan: op.at, window: [Math.max(0, op.at - k + 1), op.at], stack: s.stack.slice(1), popped: op.i, maxAt: null, pops: s.pops + 1 },
      );
    } else if (op.t === 'drop') {
      r.snap(
        <>
          {v[op.by]} at index {op.by} is at least {v[op.i]} at index {op.i}, so {op.i} can never be a window max while {op.by} is in the window. It leaves at the <b>back</b>.
        </>,
        undefined,
        { scan: op.by, window: [Math.max(0, op.by - k + 1), op.by], stack: s.stack.slice(0, -1), popped: op.i, maxAt: null, pops: s.pops + 1 },
      );
    } else if (op.t === 'push') {
      const i = op.i;
      const stack = [...s.stack, i];
      const win: [number, number] = [Math.max(0, i - k + 1), i];
      const next = ops[o + 1];
      if (next?.t === 'max') {
        o++;
        const ms = s.maxes.slice();
        ms[i] = v[next.i];
        r.snap(
          <>
            Push index {i} ({v[i]}) at the back. The window {win[0]}–{i} is full: its max is <b>{v[next.i]}</b>, at the front (index {next.i}).
          </>,
          undefined,
          { scan: i, window: win, stack, maxes: ms, maxAt: next.i, pushes: s.pushes + 1 },
        );
      } else {
        r.snap(
          <>
            Push index {i} ({v[i]}) at the back. The window isn't full yet ({i + 1} of {k}).
          </>,
          undefined,
          { scan: i, window: win, stack, maxAt: null, pushes: s.pushes + 1 },
        );
      }
    }
  }
  r.set({ scan: null, window: null, maxAt: null, done: true });
  r.close(
    n === 1 ? (
      <>One value: one window, and its max is the value itself, {v[0]}. 1 push + 0 pops = 1, within 2n = 2.</>
    ) : (
      <>
        Done: the window maxima are {maxes.join(', ')}. {tally(r, n)} Brute force scans each of the {n - k + 1} windows on its own:{' '}
        {plural(bruteWindowComparisons(n, k), 'comparison')}.
      </>
    ),
    2,
  );
  return r.frames;
}

// ── Largest rectangle in a histogram ─────────────────────────────────

const span = (rc: Rect) => (rc.from === rc.to ? <>bar {rc.from} alone</> : <>bars {rc.from}–{rc.to}</>);

export function rectFrames(v: readonly number[]): MsFrame[] {
  const n = v.length;
  const r = recorder(n);
  if (!n) {
    r.snap(EMPTY);
    return r.frames;
  }
  r.snap(
    <>
      The stack holds bars whose heights strictly rise from bottom to top. When a bar no taller arrives, each taller bar is popped and its widest
      rectangle is worked out: right up to the bar that popped it, left to the bar now under it.
    </>,
  );
  const { ops, best } = largestRectangle(v);
  let poppedNow = false;
  for (const op of ops) {
    const s = r.get();
    if (op.t === 'pop') {
      const { i, at, rect } = op;
      const stack = s.stack.slice(0, -1);
      const isBest = !s.best || rect.area > s.best.area;
      const cause = at === n ? <>End of the bars: pop {i} ({v[i]}).</> : <>Bar {at} ({v[at]}) is no taller than bar {i} ({v[i]}), so pop {i}.</>;
      r.snap(
        <>
          {cause} Its rectangle: height {rect.height} across {span(rect)}, area <b>{rect.area}</b>.
          {at < n && v[at] === v[i] && <> Bar {at} is just as tall, so it carries this height further right.</>}
          {isBest && <> Best so far.</>}
        </>,
        undefined,
        { scan: at < n ? at : null, stack, popped: i, rect, best: isBest ? rect : s.best, pops: s.pops + 1 },
      );
      poppedNow = true;
    } else {
      const i = op.i;
      const t = top(s.stack);
      const why =
        t === undefined
          ? poppedNow ? <>nothing is left on the stack.</> : <>the stack is empty.</>
          : <>bar {t} ({v[t]}) is shorter, so nothing {poppedNow ? 'more ' : ''}pops.</>;
      r.snap(
        <>
          Bar {i} ({v[i]}): {why} Push {i}.
        </>,
        undefined,
        { scan: i, stack: [...s.stack, i], pushes: s.pushes + 1 },
      );
      poppedNow = false;
    }
  }
  r.set({ scan: null, done: true });
  const b = best!;
  r.close(
    n === 1 ? (
      <>One bar: the only rectangle is the bar itself, area {b.area}. 1 push + 1 pop = 2, within 2n = 2.</>
    ) : (
      <>
        Largest rectangle: area <b>{b.area}</b>, height {b.height} across {span(b)}. {tally(r, n)} Brute force tries all {bruteRectRanges(n)} ranges.
      </>
    ),
    2,
  );
  return r.frames;
}

/** The counters for the stats row, recomputed from the model. */
export function totalsFor(scene: Scene, v: readonly number[], kWanted: number): { work: number; brute: number; bruteUnit: string } {
  if (scene === 'window') {
    const k = Math.max(1, Math.min(kWanted, v.length));
    const c = opCounts(slidingMax(v, k).ops);
    return { work: c.pushes + c.pops, brute: bruteWindowComparisons(v.length, k), bruteUnit: 'comparisons' };
  }
  if (scene === 'rect') {
    const c = opCounts(largestRectangle(v).ops);
    return { work: c.pushes + c.pops, brute: bruteRectRanges(v.length), bruteUnit: 'ranges' };
  }
  const c = opCounts(nextGreater(v).ops);
  return { work: c.pushes + c.pops, brute: bruteNextComparisons(v), bruteUnit: 'comparisons' };
}
