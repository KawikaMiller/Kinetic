import { plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import {
  allPairsCount, bruteForcePairSum, dedupeTrace, isSortedAscending, pairKey, pairsRuledOut, palindromeTrace, twoPointerPairSum,
} from './model';

export type PairStatus = 'start' | 'check' | 'found' | 'none';

export interface PairFrame extends Frame {
  l: number;
  r: number;
  sum: number | null;
  status: PairStatus;
  checks: number;
  /** Pairs proven impossible so far, as pairKey(i, j). */
  ruledOut: string[];
  /** On unsorted input: a real answer the elimination wrongly threw away. */
  missed: [number, number] | null;
}

/** One frame per comparison; each frame also carries the pairs that comparison eliminated. */
export function pairFrames(arr: number[], target: number): PairFrame[] {
  const n = arr.length;
  const sorted = isSortedAscending(arr);
  const { checks, pair } = twoPointerPairSum(arr, target);
  const brute = allPairsCount(n);
  const rec = createRecorder<PairFrame>({ l: 0, r: n - 1, sum: null, status: 'start', checks: 0, ruledOut: [], missed: null });

  rec.snap(
    sorted ? (
      <>
        Find two numbers that add up to <span className="hl">{target}</span>. L starts at the smallest, R at the
        biggest. Press play.
      </>
    ) : (
      <>
        This array <b>isn't sorted</b>. Two pointers still runs, but its "rule a whole row out" logic assumes sorted
        order. Watch what happens.
      </>
    ),
  );

  let ruledOut: string[] = [];
  checks.forEach((c, k) => {
    const count = k + 1;
    if (c.move === 'found') {
      rec.snap(
        <>
          <span className="hl ok">
            {arr[c.l]} + {arr[c.r]} = {target}
          </span>
          . Found in <b>{plural(count, 'check')}</b>; brute force could need up to <b>{brute}</b>.
        </>,
        2,
        { l: c.l, r: c.r, sum: c.sum, status: 'found', checks: count, ruledOut },
      );
      return;
    }
    const gone = pairsRuledOut(c);
    const bigger = c.move === 'move-r';
    rec.snap(
      <>
        {arr[c.l]} + {arr[c.r]} = <span className="hl">{c.sum}</span>, {bigger ? 'too big' : 'too small'}.{' '}
        {bigger ? (
          <>
            Anything paired with {arr[c.r]} is at least this big, so R's column is out ({plural(gone.length, 'pair')}).
            R moves left.
          </>
        ) : (
          <>
            Anything paired with {arr[c.l]} is at most this big, so L's row is out ({plural(gone.length, 'pair')}). L
            moves right.
          </>
        )}
      </>,
      undefined,
      { l: c.l, r: c.r, sum: c.sum, status: 'check', checks: count },
    );
    ruledOut = [...ruledOut, ...gone.map(([i, j]) => pairKey(i, j))];
    rec.set({ ruledOut, l: bigger ? c.l : c.l + 1, r: bigger ? c.r - 1 : c.r });
  });

  if (!pair) {
    const missed = bruteForcePairSum(arr, target);
    rec.snap(
      missed ? (
        <>
          L met R: two pointers says <span className="hl bad">no pair</span>, but{' '}
          <span className="hl bad">
            {arr[missed[0]]} + {arr[missed[1]]} = {target}
          </span>{' '}
          exists. On unsorted data the "ruled out" pairs weren't really impossible.
        </>
      ) : (
        <>
          L met R: <span className="hl bad">no pair</span> sums to {target}. Proved in{' '}
          {plural(checks.length, 'check')} (never more than n − 1 = {Math.max(0, n - 1)}) instead of {brute}.
        </>
      ),
      2,
      { status: 'none', sum: null, checks: checks.length, missed },
    );
  }
  return rec.frames;
}

export interface PalFrame extends Frame {
  l: number;
  r: number;
  matched: number[];
  mismatch: boolean;
  done: boolean;
}

export function palindromeFrames(text: string): PalFrame[] {
  const { checks, isPalindrome } = palindromeTrace(text);
  const rec = createRecorder<PalFrame>({ l: 0, r: text.length - 1, matched: [], mismatch: false, done: false });
  rec.snap(
    <>
      Is <span className="hl">{text}</span> the same backwards? L reads from the front, R from the back, both moving
      inwards.
    </>,
  );
  let matched: number[] = [];
  for (const c of checks) {
    if (c.match) {
      matched = [...matched, c.l, c.r];
      rec.snap(
        <>
          '{text[c.l]}' = '{text[c.r]}'. Both ends match, so step inwards.
        </>,
        undefined,
        { l: c.l, r: c.r, matched },
      );
    } else {
      rec.snap(
        <>
          '{text[c.l]}' ≠ '{text[c.r]}': <span className="hl bad">not a palindrome</span>. One mismatch is enough, no
          need to look further.
        </>,
        2,
        { l: c.l, r: c.r, mismatch: true, done: true },
      );
    }
  }
  if (isPalindrome) {
    rec.snap(
      <>
        The pointers met in the middle with every pair matching: <span className="hl ok">palindrome</span>, in{' '}
        {plural(checks.length, 'comparison')} for {text.length} letters.
      </>,
      2,
      { done: true },
    );
  }
  return rec.frames;
}

export interface DedupeFrame extends Frame {
  values: number[];
  slow: number;
  fast: number | null;
  wrote: boolean;
  length: number | null;
}

export function dedupeFrames(sorted: number[]): DedupeFrame[] {
  const { steps, length } = dedupeTrace(sorted);
  const rec = createRecorder<DedupeFrame>({ values: [...sorted], slow: 0, fast: null, wrote: false, length: null });
  rec.snap(
    <>
      Remove duplicates from a sorted array <b>in place</b>. <span className="hl info">slow</span> marks the end of
      the unique part; <span className="hl violet">fast</span> scans ahead. Both move the same direction.
    </>,
  );
  for (const s of steps) {
    rec.snap(
      s.wrote ? (
        <>
          {s.values[s.slow]} is new: slow steps forward and it's copied there. Unique so far:{' '}
          <b>{s.slow + 1}</b>.
        </>
      ) : (
        <>
          {s.values[s.fast]} repeats {s.values[s.slow]}: fast skips it, slow stays put.
        </>
      ),
      undefined,
      { values: s.values, slow: s.slow, fast: s.fast, wrote: s.wrote },
    );
  }
  rec.snap(
    <>
      Done: {length === 1 ? 'the first cell holds' : <>the first <span className="hl ok">{length}</span> cells hold</>} the unique values. The rest is leftover:
      in-place algorithms return the new length instead of shrinking the array.
    </>,
    2,
    { fast: null, wrote: false, length },
  );
  return rec.frames;
}
