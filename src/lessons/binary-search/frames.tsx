import { pick, randInt } from '../../core/random';
import type { Frame } from '../../core/types';

export interface BinState {
  lo: number;
  hi: number;
  mid: number | null;
  checks: number;
  found: boolean;
  done: boolean;
}

export interface LinState {
  idx: number | null;
  checks: number;
  found: boolean;
  done: boolean;
}

export interface BsFrame extends Frame {
  bin: BinState;
  lin: LinState;
}

/** Values are drawn from 1..n×VALUE_SPREAD so a size-n array has room for missing values. */
const VALUE_SPREAD = 3;

/** `n` distinct values, sorted ascending. */
export function makeArray(n: number) {
  const set = new Set<number>();
  while (set.size < n) set.add(randInt(1, n * VALUE_SPREAD));
  return [...set].sort((a, b) => a - b);
}

/** A value inside the array's range that isn't in it (or one past the end if there are no gaps). */
export function missingValue(arr: number[]) {
  const have = new Set(arr);
  const gaps: number[] = [];
  for (let v = arr[0] + 1; v < arr[arr.length - 1]; v++) if (!have.has(v)) gaps.push(v);
  return gaps.length ? pick(gaps) : arr[arr.length - 1] + 1;
}

/** One frame per comparison, linear and binary search advancing side by side. */
export function buildFrames(arr: number[], target: number): BsFrame[] {
  const n = arr.length;

  // Binary search trace: one entry per comparison.
  const bin: { lo: number; hi: number; mid: number; cmp: number }[] = [];
  let lo = 0;
  let hi = n - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cmp = Math.sign(arr[mid] - target);
    bin.push({ lo, hi, mid, cmp });
    if (cmp === 0) break;
    if (cmp < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  const binFound = bin[bin.length - 1]?.cmp === 0;

  const linIdx = arr.indexOf(target);
  const linSteps = linIdx >= 0 ? linIdx + 1 : n;
  const total = Math.max(bin.length, linSteps);

  const frames: BsFrame[] = [
    {
      bin: { lo: 0, hi: n - 1, mid: null, checks: 0, found: false, done: false },
      lin: { idx: null, checks: 0, found: false, done: false },
      say: (
        <>
          Find <span className="hl">{target}</span> in {n} sorted numbers. Top row checks one by one; bottom row
          checks the middle and throws away half. Press play.
        </>
      ),
    },
  ];

  for (let k = 1; k <= total; k++) {
    const b = bin[k - 1];
    const binState: BinState = b
      ? { lo: b.lo, hi: b.hi, mid: b.mid, checks: k, found: b.cmp === 0, done: b.cmp === 0 || k === bin.length }
      : { ...frames[k - 1].bin, done: true };
    if (!b && !binFound) binState.mid = null;

    const linDone = k >= linSteps;
    const linState: LinState = {
      idx: Math.min(k, linSteps) - 1,
      checks: Math.min(k, linSteps),
      found: linDone && linIdx >= 0,
      done: linDone,
    };

    frames.push({ bin: binState, lin: linState, say: b ? binaryCaption(arr, target, b, k) : linearOnlyCaption(bin.length, linState.checks) });
  }

  const last = frames[frames.length - 1];
  last.hold = 2;
  last.say =
    linIdx >= 0 ? (
      <>
        Linear: <span className="hl bad">{linSteps} checks</span>. Binary:{' '}
        <span className="hl ok">{bin.length}</span>. With a million items that gap becomes up to 1,000,000 vs 20.
      </>
    ) : (
      <>
        {target} isn't in the array. Linear had to look at <span className="hl bad">all {n}</span>; binary proved it
        in <span className="hl ok">{bin.length}</span>.
      </>
    );

  return frames;
}

function binaryCaption(arr: number[], target: number, b: { lo: number; hi: number; mid: number; cmp: number }, k: number) {
  const v = arr[b.mid];
  if (b.cmp === 0) {
    return (
      <>
        Binary checks the middle: <span className="hl ok">{v}</span>. Found it in <b>{k}</b>{' '}
        {k === 1 ? 'check' : 'checks'}.
      </>
    );
  }
  const left = b.cmp < 0 ? b.hi - b.mid : b.mid - b.lo;
  return (
    <>
      Middle is <span className="hl">{v}</span>, {b.cmp < 0 ? 'smaller' : 'bigger'} than {target}. So everything to
      the <b>{b.cmp < 0 ? 'left' : 'right'}</b> is out.{' '}
      {left > 0 ? (
        <>
          <b>{left}</b> left to search.
        </>
      ) : (
        <>Nothing left: {target} isn't here.</>
      )}
    </>
  );
}

function linearOnlyCaption(binaryChecks: number, linearChecks: number) {
  return (
    <>
      Binary finished after <b>{binaryChecks}</b>. Linear is still plodding along: check <b>#{linearChecks}</b>…
    </>
  );
}
