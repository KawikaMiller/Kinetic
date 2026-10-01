import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import { binaryTrace, linearChecks, type BinaryStep } from './model';

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

/** One frame per comparison, linear and binary search advancing side by side. */
export function buildFrames(arr: number[], target: number): BsFrame[] {
  const n = arr.length;
  const bin = binaryTrace(arr, target);
  const binFound = bin[bin.length - 1]?.cmp === 0;
  const linIdx = arr.indexOf(target);
  const linSteps = linearChecks(arr, target);
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
  last.say = linIdx >= 0 ? foundSummary(linSteps, bin.length) : missingSummary(target, n, bin.length);

  return frames;
}

/** Final caption when the target is in the array. Colours follow who actually needed fewer checks. */
function foundSummary(linear: number, binary: number) {
  const lin = <span className={`hl ${linear < binary ? 'ok' : linear > binary ? 'bad' : ''}`}>{plural(linear, 'check')}</span>;
  const bin = <span className={`hl ${binary < linear ? 'ok' : binary > linear ? 'bad' : ''}`}>{plural(binary, 'check')}</span>;
  if (linear < binary) {
    return (
      <>
        Linear: {lin}. Binary: {bin}. Linear got lucky: the target sat near the front. Binary's worst case stays tiny
        as the array grows; linear's doesn't.
      </>
    );
  }
  if (linear === binary) {
    return (
      <>
        A tie this time: {lin} each. On a million items linear could need up to 1,000,000 checks, binary at most 20.
      </>
    );
  }
  return (
    <>
      Linear: {lin}. Binary: {bin}. With a million items that gap becomes up to 1,000,000 vs 20.
    </>
  );
}

function missingSummary(target: number, n: number, binary: number) {
  return (
    <>
      {target} isn't in the array. Linear had to look at <span className="hl bad">all {n}</span>; binary proved it in{' '}
      <span className="hl ok">{binary}</span>.
    </>
  );
}

function binaryCaption(arr: number[], target: number, b: BinaryStep, k: number) {
  const v = arr[b.mid];
  if (b.cmp === 0) {
    return (
      <>
        Binary checks the middle: <span className="hl ok">{v}</span>. Found it in <b>{plural(k, 'check')}</b>.
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
