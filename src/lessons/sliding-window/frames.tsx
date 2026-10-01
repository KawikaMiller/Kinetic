import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import {
  allWindows, longestUnique, maxSumOfK, shortestAtLeast, spanLength, type Span, type WindowEvent, type WindowStep,
} from './model';

export interface SwFrame extends Frame {
  l: number;
  r: number;
  event: WindowEvent | null;
  index: number | null;
  value: number;
  best: Span | null;
  counts?: Record<string, number>;
  moves: number;
}

const toFrame = (s: WindowStep, moves: number, say: ReactNode): SwFrame => ({
  l: s.l, r: s.r, event: s.event, index: s.index, value: s.value, best: s.best, counts: s.counts, moves, say,
});

const blank = (say: ReactNode): SwFrame => ({ l: 0, r: -1, event: null, index: null, value: 0, best: null, counts: {}, moves: 0, say });

/** What checking every candidate would cost, for the counters and the closing caption. */
export interface BruteCost {
  value: number;
  /** Singular: "window", "addition". */
  unit: string;
}
export const everyWindow = (n: number): BruteCost => ({ value: allWindows(n), unit: 'window' });
/** Fixed size k: only n − k + 1 windows, but each is re-added from scratch. */
export const everyWindowOfK = (n: number, k: number): BruteCost => ({ value: Math.max(0, n - k + 1) * k, unit: 'addition' });

/** The closing frame: the answer, plus the proof that it took at most 2n moves. */
function closing(last: SwFrame, n: number, brute: BruteCost, answer: ReactNode): SwFrame {
  return {
    ...last, event: null, index: null, hold: 2,
    say: (
      <>
        {answer} {plural(last.moves, 'move')} in total, never more than 2n = {2 * n}; brute force needs{' '}
        {plural(brute.value, brute.unit)}.
      </>
    ),
  };
}

export function uniqueFrames(s: string): SwFrame[] {
  const { steps, best } = longestUnique(s);
  const frames = [blank(<>Longest stretch of <span className="hl">{s}</span> with no repeated letter. The window grows right one letter at a time.</>)];
  steps.forEach((st, k) => {
    const c = s[st.index];
    const repeat = (st.counts?.[s[st.r]] ?? 0) > 1;
    let say: ReactNode;
    if (st.event === 'enter') {
      say = repeat ? (
        <>
          '{c}' enters, but '{c}' is already inside: <span className="hl bad">repeat</span>. Shrink from the left.
        </>
      ) : (
        <>
          '{c}' enters. No repeats: window length <b>{st.value}</b>, best so far <b>{spanLength(st.best)}</b>.
        </>
      );
    } else {
      say = (
        <>
          '{c}' leaves from the left. l moves up by one and r stays put: <b>no restart</b>.{' '}
          {repeat ? 'Still a repeat, keep shrinking.' : `Repeat gone, window length ${st.value}.`}
        </>
      );
    }
    frames.push(toFrame(st, k + 1, say));
  });
  frames.push(
    closing(frames[frames.length - 1], s.length, everyWindow(s.length), best ? (
      <>
        Longest without a repeat: <span className="hl violet">{s.slice(best[0], best[1] + 1)}</span> ({spanLength(best)}).
      </>
    ) : (
      <>Nothing to scan.</>
    )),
  );
  return frames;
}

export function fixedKFrames(a: number[], k: number): SwFrame[] {
  const { steps, best } = maxSumOfK(a, k);
  const frames = [blank(<>Biggest sum of any <b>{k}</b> neighbours. Fill a window of {k}, then slide it: one number in, one out.</>)];
  steps.forEach((st, i) => {
    const size = st.r - st.l + 1;
    const say =
      st.event === 'enter' ? (
        size < k ? (
          <>
            {a[st.index]} enters: sum <b>{st.value}</b> ({size} of {k}).
          </>
        ) : (
          <>
            {a[st.index]} enters: the window is full, sum <span className="hl">{st.value}</span>. Best so far{' '}
            <b>{st.best ? a.slice(st.best[0], st.best[1] + 1).reduce((x, y) => x + y, 0) : 0}</b>.
          </>
        )
      ) : (
        <>
          {a[st.index]} leaves as the window slides: sum <b>{st.value}</b>. Subtract one, add one; never re-add the whole
          window.
        </>
      );
    frames.push(toFrame(st, i + 1, say));
  });
  const bestSum = best ? a.slice(best[0], best[1] + 1).reduce((x, y) => x + y, 0) : 0;
  frames.push(
    closing(frames[frames.length - 1], a.length, everyWindowOfK(a.length, k), <>Best window of {k}: <span className="hl violet">sum {bestSum}</span>.</>),
  );
  return frames;
}

export function shortestFrames(a: number[], target: number): SwFrame[] {
  const { steps, best } = shortestAtLeast(a, target);
  const frames = [
    blank(
      <>
        Shortest stretch adding up to at least <span className="hl">{target}</span>. Grow until it's enough, then shrink
        while it still is.
      </>,
    ),
  ];
  steps.forEach((st, i) => {
    const enough = st.value >= target;
    const say =
      st.event === 'enter' ? (
        <>
          {a[st.index]} enters: sum <b>{st.value}</b>.{' '}
          {enough ? <>That's enough ({st.r - st.l + 1} long). Try shrinking.</> : <>Still under {target}, keep growing.</>}
        </>
      ) : (
        <>
          {a[st.index]} leaves: sum <b>{st.value}</b>.{' '}
          {enough ? (
            <>Still enough, and shorter. Shrink again.</>
          ) : st.r === a.length - 1 ? (
            <>Under {target} now, and r is already at the end: nothing is left to grow into.</>
          ) : (
            <>Under {target} now, so grow r again.</>
          )}
        </>
      );
    frames.push(toFrame(st, i + 1, say));
  });
  frames.push(
    closing(frames[frames.length - 1], a.length, everyWindow(a.length), best ? (
      <>
        Shortest: <span className="hl violet">length {spanLength(best)}</span> (
        {a.slice(best[0], best[1] + 1).join(' + ')}).
      </>
    ) : (
      <>
        <span className="hl bad">No stretch</span> reaches {target}.
      </>
    )),
  );
  return frames;
}
