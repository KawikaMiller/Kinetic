import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { quickselect, quicksortComparisons, winner, type PivotRule } from './model';

export interface QsFrame extends Frame {
  arr: number[];
  /** The live range; everything outside it has been thrown away. */
  lo: number;
  hi: number;
  /** Lomuto's boundary (next slot for a small value) and scan pointer, during a partition. */
  i: number | null;
  j: number | null;
  /** Where the value just compared sits now: i − 1 once it moved to the small side, else j. */
  compared: number | null;
  /** Where the pivot sits: the end of the range while partitioning, its final slot after. */
  pivotAt: number | null;
  /** Median-of-three's sampled indices, on the frame that picks the pivot. */
  sample: number[] | null;
  /** Index k, once the answer is found. */
  found: number | null;
  cmps: number;
  rounds: number;
  done: boolean;
}

export const RULE_NAMES: Record<PivotRule, string> = { last: 'last element', random: 'random (seeded)', median3: 'median of three' };

const range = (lo: number, hi: number) => (lo === hi ? `index ${lo}` : `indices ${lo}-${hi}`);

export function selectFrames(values: readonly number[], k: number, rule: PivotRule, seed: number, kName: string): QsFrame[] {
  const n = values.length;
  const run = quickselect(values, k, rule, seed);
  const sortTotal = quicksortComparisons(values, rule, seed).comparisons;
  const r = createRecorder<QsFrame>(
    { arr: values.slice(), lo: 0, hi: n - 1, i: null, j: null, compared: null, pivotAt: null, sample: null, found: null, cmps: 0, rounds: 0, done: false },
    { transient: { sample: null, compared: null } },
  );
  r.snap(
    <>
      Find the value that would sit at index <b>k = {k}</b> ({kName}) if the array were sorted, without sorting it. Each round partitions
      the live range around a pivot and keeps only the side that holds index k.
    </>,
  );
  for (const s of run.steps) {
    const st = r.get();
    if (s.t === 'round') {
      r.set({ lo: s.lo, hi: s.hi, rounds: st.rounds + 1, i: null, j: null, pivotAt: null });
    } else if (s.t === 'pivot') {
      const v = s.arr[s.hi];
      const moved = s.chosen !== s.hi ? <> Swap it to the end of the range.</> : null;
      const why =
        rule === 'last' ? <>the last value in the range</>
          : rule === 'random' ? <>index {s.chosen}, picked at random</>
            : s.sample ? <>the median of a[{s.sample[0]}], a[{s.sample[1]}] and a[{s.sample[2]}] ({plural(s.cmps, 'comparison')})</>
              : <>the last value (too few values to sample three)</>;
      r.snap(
        <>
          Round {st.rounds}, {range(s.lo, s.hi)}. Pivot: {why}, <span className="hl">{v}</span>.{moved}
        </>,
        undefined,
        { arr: s.arr, pivotAt: s.hi, i: s.lo, j: null, sample: s.sample, cmps: st.cmps + s.cmps },
      );
    } else if (s.t === 'cmp') {
      const pivot = s.arr[s.hi];
      const compared = s.small ? s.i - 1 : s.j;
      const v = s.arr[compared];
      const say = s.small ? (
        <>
          {v} ≤ {pivot}: {s.swapped ? <>swap it into the small side</> : <>it is already on the small side</>}, and i moves to {s.i}.
        </>
      ) : (
        <>
          {v} &gt; {pivot}: it stays on the big side.
        </>
      );
      r.snap(say, undefined, { arr: s.arr, i: s.i, j: s.j, compared, cmps: st.cmps + 1 });
    } else if (s.t === 'place') {
      const v = s.arr[s.p];
      r.snap(
        <>
          Swap the pivot into slot i = {s.p}. Everything left of it is ≤ {v} and everything right is &gt; {v}, so {v} is exactly where
          sorting would put it: index {s.p}.
        </>,
        undefined,
        { arr: s.arr, pivotAt: s.p, i: null, j: null },
      );
    } else if (s.next === null) {
      r.snap(
        s.lo === s.hi && s.p === s.lo && st.pivotAt !== s.p ? (
          <>
            Only index {s.p} is left, so it must be the answer: <span className="hl ok">{st.arr[s.p]}</span>.
          </>
        ) : (
          <>
            The pivot landed on index {k}, which is k: found it, <span className="hl ok">{st.arr[s.p]}</span>.
          </>
        ),
        undefined,
        { found: k, lo: s.p, hi: s.p, pivotAt: null, i: null, j: null },
      );
    } else {
      const [lo, hi] = s.next;
      const side = lo < s.p ? 'left' : 'right';
      const gone = side === 'left' ? [s.p + 1, s.hi] : [s.lo, s.p - 1];
      const goneText = gone[0] > gone[1] ? <>nothing else</> : <>{range(gone[0], gone[1])}</>;
      r.snap(
        <>
          k = {k} is {side} of {s.p}, so only the {side} side, {range(lo, hi)}, lives on. The pivot and {goneText} are never touched again.
        </>,
        undefined,
        { lo, hi, pivotAt: null, i: null, j: null },
      );
    }
  }
  r.set({ done: true });
  r.close(verdict(run.value, k, run.comparisons, run.rounds, sortTotal, rule), 2);
  return r.frames;
}

/** The race result and the answer, from the counts. */
export function verdict(value: number, k: number, select: number, rounds: number, sort: number, rule: PivotRule): ReactNode {
  const w = winner(select, sort);
  const race =
    w === 'select' ? <>Quickselect wins: {select} against a full quick sort's {sort} with the same pivot rule.</>
      : w === 'tie' ? (
        <>
          A dead heat: {select} comparisons each.
          {rule === 'random' || select === 0 ? null : <> Every extra range quick sort recursed into held at most one value, so it cost nothing.</>}
        </>
      )
        : <>Quick sort wins this time, {sort} to {select}: its random pivots fell differently, since the two runs use the seed in a different order.</>;
  return (
    <>
      Answer: <span className="hl ok">{value}</span> at k = {k}, after {plural(select, 'comparison')} in {plural(rounds, 'round')}. {race}
    </>
  );
}
